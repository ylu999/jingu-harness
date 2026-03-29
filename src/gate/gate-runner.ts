import { randomUUID } from "node:crypto";
import type { Proposal } from "../types/proposal.js";
import type { SupportRef, UnitWithSupport } from "../types/support.js";
import type { GatePolicy } from "../types/policy.js";
import type { AdmissionResult } from "../types/admission.js";
import type { AuditWriter } from "../types/audit.js";
import {
  hasStructureErrors,
  buildAdmittedUnit,
  partitionUnits,
} from "./gate-utils.js";
import { buildAuditEntry } from "../audit/audit-entry.js";
import type { RPPRecord } from "@jingu/policy-core";
import { runRPPGate } from "../rpp/rpp-gate.js";

/**
 * Extract an RPPRecord from an unknown input object.
 * Checks top-level `rpp_record` field first, then `metadata.rpp_record`.
 * Returns null if neither is present.
 */
export function extractRPPRecord(input: unknown): RPPRecord | null {
  if (input == null || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (obj["rpp_record"] != null) return obj["rpp_record"] as RPPRecord;
  const metadata = obj["metadata"];
  if (metadata != null && typeof metadata === "object") {
    const meta = metadata as Record<string, unknown>;
    if (meta["rpp_record"] != null) return meta["rpp_record"] as RPPRecord;
  }
  return null;
}

export class GateRunner<TUnit> {
  constructor(
    private readonly policy: GatePolicy<TUnit>,
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
      // Structure failure = all units are structure-rejected (not silently lost)
      const structureRejected = proposal.units.map((unit, i) =>
        buildAdmittedUnit(
          unit,
          (unit as Record<string, unknown>)["id"] as string ?? `unit-${i}`,
          {
            kind: "unit",
            unitId: (unit as Record<string, unknown>)["id"] as string ?? `unit-${i}`,
            decision: "reject",
            reasonCode: "STRUCTURE_INVALID",
          },
          [],
          []
        )
      );
      const auditEntry = buildAuditEntry({
        auditId,
        proposal,
        allUnits: structureRejected,
        gateResults: [structureResult],
        unitSupportMap: {},
      });
      await this.auditWriter?.append(auditEntry);
      return {
        proposalId: proposal.id,
        admittedUnits: [],
        rejectedUnits: structureRejected,
        hasConflicts: false,
        auditId,
        retryAttempts: 1,
      };
    }

    // Step 2: Bind support + evaluate each unit
    const unitSupportMap: Record<string, string[]> = {};
    const evaluationResults = proposal.units.map((unit) => {
      const bound = this.policy.bindSupport(unit, supportPool);
      // Runtime safety: populate supportRefs from the pool if the policy omitted it.
      // UnitWithSupport requires supportRefs, but JS callers without type enforcement
      // may return only supportIds. Reconstruct from the pool to satisfy downstream steps.
      if (!bound.supportRefs) {
        (bound as { supportRefs: SupportRef[] }).supportRefs =
          supportPool.filter((s) => bound.supportIds.includes(s.id));
      }
      const supportIds = bound.supportIds;
      const evalResult = this.policy.evaluateUnit(bound, proposalContext);
      unitSupportMap[evalResult.unitId] = supportIds;
      return { unit, evalResult, supportIds };
    });

    // Step 3: Conflict detection (cross-unit)
    // Reconstruct UnitWithSupport[] from evaluationResults so policy can inspect bound evidence
    const unitsWithSupport: UnitWithSupport<TUnit>[] = evaluationResults.map(({ unit, supportIds }) => ({
      unit,
      supportIds,
      supportRefs: supportPool.filter((s) => supportIds.includes(s.id)),
    }));
    const conflictAnnotations = this.policy.detectConflicts(
      unitsWithSupport,
      supportPool
    );

    // Step 4: Build AdmittedUnit[] for all units
    // Units involved in a blocking conflict are force-rejected
    const blockingConflictUnitIds = new Set<string>(
      conflictAnnotations
        .filter((a) => a.severity === "blocking")
        .flatMap((a) => a.unitIds)
    );

    const allAdmittedUnits = evaluationResults.map(
      ({ unit, evalResult, supportIds }) => {
        const overriddenResult =
          blockingConflictUnitIds.has(evalResult.unitId) &&
          evalResult.decision !== "reject"
            ? {
                ...evalResult,
                decision: "reject" as const,
                reasonCode: "BLOCKING_CONFLICT",
              }
            : evalResult;
        return buildAdmittedUnit(
          unit,
          overriddenResult.unitId,
          overriddenResult,
          conflictAnnotations,
          supportIds
        );
      }
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

    // Step 6: RPP gate — additive AND condition
    // Only applied when an rpp_record is present in the proposal (or its metadata).
    // If present and invalid, all currently admitted units are force-rejected.
    // If absent, this step is skipped (pass-through) — RPP is opt-in per proposal.
    const rppRecord = extractRPPRecord(proposal);
    const rppResult = rppRecord != null ? runRPPGate(rppRecord) : null;
    if (rppResult != null && !rppResult.allow) {
      const rppReasonCode = rppResult.failures[0]?.code ?? "RPP_BLOCKED";
      const rppRejected = admitted.map((admittedUnit) => ({
        ...admittedUnit,
        status: "rejected" as const,
        evaluationResults: [
          ...admittedUnit.evaluationResults,
          {
            kind: "unit" as const,
            unitId: admittedUnit.unitId,
            decision: "reject" as const,
            reasonCode: rppReasonCode,
          },
        ],
      }));
      return {
        proposalId: proposal.id,
        admittedUnits: [],
        rejectedUnits: [...rejected, ...rppRejected],
        hasConflicts: conflictAnnotations.length > 0,
        auditId,
        retryAttempts: 1,
      };
    }

    return {
      proposalId: proposal.id,
      admittedUnits: admitted,
      rejectedUnits: rejected,
      hasConflicts: conflictAnnotations.length > 0,
      auditId,
      retryAttempts: 1,
    };
  }
}
