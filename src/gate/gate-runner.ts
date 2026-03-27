import { randomUUID } from "node:crypto";
import type { Proposal } from "../types/proposal.js";
import type { SupportRef } from "../types/support.js";
import type { HarnessPolicy } from "../types/policy.js";
import type { AdmissionResult } from "../types/admission.js";
import type { AuditWriter } from "../types/audit.js";
import {
  hasStructureErrors,
  buildAdmittedUnit,
  partitionUnits,
} from "./gate-utils.js";
import { buildAuditEntry } from "../audit/audit-entry.js";

export class GateRunner<TUnit> {
  constructor(
    private readonly policy: HarnessPolicy<TUnit>,
    private readonly auditWriter?: AuditWriter
  ) {}

  async run(
    proposal: Proposal<TUnit>,
    supportPool: SupportRef[]
  ): Promise<AdmissionResult<TUnit>> {
    const auditId = randomUUID();
    const proposalContext = {
      proposalId: proposal.id,
      proposalKind: proposal.kind,
    };

    // Step 1: Structure validation (proposal-level)
    const structureResult = this.policy.validateStructure(proposal);
    if (hasStructureErrors(structureResult.errors)) {
      // Structure failure = reject entire proposal as empty result
      const auditEntry = buildAuditEntry({
        auditId,
        proposal,
        allUnits: [],
        gateResults: [structureResult],
        unitSupportMap: {},
      });
      await this.auditWriter?.append(auditEntry);
      return {
        proposalId: proposal.id,
        admittedUnits: [],
        rejectedUnits: [],
        hasConflicts: false,
        auditId,
      };
    }

    // Step 2: Bind support + evaluate each unit
    const unitSupportMap: Record<string, string[]> = {};
    const evaluationResults = proposal.units.map((unit) => {
      const bound = this.policy.bindSupport(unit, supportPool);
      const supportIds = bound.supportIds;
      const evalResult = this.policy.evaluateUnit(bound, proposalContext);
      unitSupportMap[evalResult.unitId] = supportIds;
      return { unit, evalResult, supportIds };
    });

    // Step 3: Conflict detection (cross-unit)
    const conflictAnnotations = this.policy.detectConflicts(
      proposal.units,
      supportPool
    );

    // Step 4: Build AdmittedUnit[] for all units
    const allAdmittedUnits = evaluationResults.map(
      ({ unit, evalResult, supportIds }) =>
        buildAdmittedUnit(
          unit,
          evalResult.unitId,
          evalResult,
          conflictAnnotations,
          supportIds
        )
    );

    const { admitted, rejected } = partitionUnits(allAdmittedUnits);

    // Step 5: Write audit
    const allGateResults = [
      structureResult,
      ...evaluationResults.map((e) => e.evalResult),
      { kind: "conflict" as const, conflictAnnotations },
    ];
    const auditEntry = buildAuditEntry({
      auditId,
      proposal,
      allUnits: allAdmittedUnits,
      gateResults: allGateResults,
      unitSupportMap,
    });
    await this.auditWriter?.append(auditEntry);

    return {
      proposalId: proposal.id,
      admittedUnits: admitted,
      rejectedUnits: rejected,
      hasConflicts: conflictAnnotations.length > 0,
      auditId,
    };
  }
}
