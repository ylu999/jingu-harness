/**
 * Research agent — next-step proposal policy for jingu-trust-gate.
 *
 * Use case: a multi-step research agent proposes what to do next in a task.
 * Each proposed step must justify itself against already-available context.
 * The gate enforces that steps citing required context actually have that
 * context available, that synthesis/writing steps are grounded in findings,
 * and that weak justifications are flagged before being executed.
 *
 * Domain types
 *   AgentStepProposal — one proposed next step in a research task
 *   StepContextAttrs  — shape of SupportRef.attributes for available context items
 *
 * Gate rules (evaluateUnit)
 *   R1  grade=required + requiredContext cites IDs not in pool                → MISSING_CONTEXT         → reject
 *   R2  stepType=synthesize|write but no evidence with type="finding"         → INSUFFICIENT_FINDINGS  → reject
 *   R3  justification is empty or < 10 chars                                  → WEAK_JUSTIFICATION     → downgrade to "optional"
 *   R4  everything else                                                        → approve
 *
 * Conflict patterns (detectConflicts)
 *   REDUNDANT_STEP  informational — two steps have identical stepType + overlapping requiredContext
 *
 * Run:
 *   npm run build && node dist/examples/agent-step-policy.js
 */

import assert from "node:assert/strict";
import { createTrustGate } from "../src/trust-gate.js";
import type { GatePolicy } from "../src/types/policy.js";
import type { Proposal } from "../src/types/proposal.js";
import type { SupportRef, UnitWithSupport } from "../src/types/support.js";
import type {
  StructureValidationResult,
  UnitEvaluationResult,
  ConflictAnnotation,
} from "../src/types/gate.js";
import type { AdmittedUnit } from "../src/types/admission.js";
import type { VerifiedContext, RenderContext } from "../src/types/renderer.js";
import type { RetryFeedback, RetryContext } from "../src/types/retry.js";
import type { AuditEntry, AuditWriter } from "../src/types/audit.js";
import { approve, reject, downgrade, firstFailing } from "../src/helpers/index.js";

// ── Domain types ──────────────────────────────────────────────────────────────

type StepGrade = "required" | "optional";
type StepType = "search" | "read" | "synthesize" | "write";

type AgentStepProposal = {
  id: string;
  description: string;
  stepType: StepType;
  justification: string;          // why this step is needed now
  requiredContext: string[];       // context IDs (SupportRef.sourceId) this step depends on
  grade: StepGrade;
};

// Shape of SupportRef.attributes for research context items
type StepContextAttrs = {
  contextId: string;
  type: "search_result" | "document" | "finding";
  available: boolean;
  summary?: string;
};

// ── Policy ────────────────────────────────────────────────────────────────────

class AgentStepPolicy implements GatePolicy<AgentStepProposal> {

  validateStructure(proposal: Proposal<AgentStepProposal>): StructureValidationResult {
    const errors: StructureValidationResult["errors"] = [];

    if (proposal.units.length === 0) {
      errors.push({ field: "units", reasonCode: "EMPTY_PROPOSAL" });
      return { kind: "structure", valid: false, errors };
    }

    for (const unit of proposal.units) {
      if (!unit.id?.trim()) {
        errors.push({ field: "id", reasonCode: "MISSING_UNIT_ID" });
      }
      if (!unit.description?.trim()) {
        errors.push({ field: "description", reasonCode: "EMPTY_DESCRIPTION", message: `unit ${unit.id}: empty description` });
      }
      if (!unit.stepType) {
        errors.push({ field: "stepType", reasonCode: "MISSING_STEP_TYPE", message: `unit ${unit.id}: missing stepType` });
      }
      if (!unit.grade) {
        errors.push({ field: "grade", reasonCode: "MISSING_GRADE", message: `unit ${unit.id}: missing grade` });
      }
      if (!Array.isArray(unit.requiredContext)) {
        errors.push({ field: "requiredContext", reasonCode: "MISSING_REQUIRED_CONTEXT", message: `unit ${unit.id}` });
      }
    }

    return { kind: "structure", valid: errors.length === 0, errors };
  }

  // Bind by SupportRef.sourceId matching requiredContext entries
  bindSupport(unit: AgentStepProposal, pool: SupportRef[]): UnitWithSupport<AgentStepProposal> {
    const matched = pool.filter(s => unit.requiredContext.includes(s.sourceId));
    return {
      unit,
      supportIds: matched.map(s => s.id),
      supportRefs: matched,
    };
  }

  evaluateUnit(
    uws: UnitWithSupport<AgentStepProposal>,
    _ctx: { proposalId: string; proposalKind: string }
  ): UnitEvaluationResult {
    return firstFailing([
      this.#checkContext(uws),
      this.#checkFindings(uws),
      this.#checkJustification(uws),
    ]) ?? approve(uws.unit.id);
  }

  // R1: required step cites context IDs that are not in the pool.
  // The agent cannot execute a step that depends on context it doesn't have yet.
  #checkContext({ unit, supportRefs }: UnitWithSupport<AgentStepProposal>) {
    if (unit.grade === "required" && unit.requiredContext.length > 0) {
      const availableSourceIds = new Set(supportRefs.map(s => s.sourceId));
      const missing = unit.requiredContext.filter(id => !availableSourceIds.has(id));
      if (missing.length > 0) {
        return reject(unit.id, "MISSING_CONTEXT", {
          missingContextIds: missing,
          note: `Step requires context [${missing.join(", ")}] which is not yet available`,
        });
      }
    }
    return undefined;
  }

  // R2: synthesize/write steps must be grounded in at least one "finding" type context.
  // Synthesis without findings is speculation; the gate prevents premature conclusions.
  #checkFindings({ unit, supportRefs }: UnitWithSupport<AgentStepProposal>) {
    if (unit.stepType === "synthesize" || unit.stepType === "write") {
      const hasFindings = supportRefs.some(s => {
        const attrs = s.attributes as StepContextAttrs | undefined;
        return attrs?.type === "finding" && attrs.available;
      });
      if (!hasFindings) {
        return reject(unit.id, "INSUFFICIENT_FINDINGS", {
          note: `${unit.stepType} step requires at least one available "finding" type context; none found`,
        });
      }
    }
    return undefined;
  }

  // R3: justification too weak — downgrade from required to optional.
  // A step with no real justification should not be treated as mandatory.
  #checkJustification({ unit }: UnitWithSupport<AgentStepProposal>) {
    if (!unit.justification || unit.justification.trim().length < 10) {
      return downgrade(unit.id, "WEAK_JUSTIFICATION", "optional", {
        note: "Justification is absent or too short to treat step as required; downgraded to optional",
      });
    }
    return undefined;
  }

  detectConflicts(
    units: UnitWithSupport<AgentStepProposal>[],
    _pool: SupportRef[]
  ): ConflictAnnotation[] {
    const conflicts: ConflictAnnotation[] = [];

    // REDUNDANT_STEP (informational):
    // Two steps share the same stepType and have overlapping requiredContext.
    // Running both would duplicate work; surface this so the orchestrator can prune.
    const unitArr = units;
    for (let i = 0; i < unitArr.length; i++) {
      for (let j = i + 1; j < unitArr.length; j++) {
        const a = unitArr[i];
        const b = unitArr[j];
        if (a.unit.stepType !== b.unit.stepType) continue;
        const aCtx = new Set(a.unit.requiredContext);
        const overlap = b.unit.requiredContext.filter(id => aCtx.has(id));
        if (overlap.length > 0) {
          conflicts.push({
            unitIds: [a.unit.id, b.unit.id],
            conflictCode: "REDUNDANT_STEP",
            sources: [...a.supportIds, ...b.supportIds],
            severity: "informational",
            description:
              `Steps "${a.unit.id}" and "${b.unit.id}" both have stepType="${a.unit.stepType}" ` +
              `and share context [${overlap.join(", ")}] — likely redundant`,
          });
        }
      }
    }

    return conflicts;
  }

  render(
    admittedUnits: AdmittedUnit<AgentStepProposal>[],
    _pool: SupportRef[],
    _ctx: RenderContext
  ): VerifiedContext {
    const admittedBlocks = admittedUnits.map(u => {
      const step = u.unit as AgentStepProposal;
      const currentGrade = u.appliedGrades[u.appliedGrades.length - 1] ?? step.grade;
      const conflict = u.conflictAnnotations?.[0];
      return {
        sourceId: u.unitId,
        content: `[${step.stepType.toUpperCase()}] ${step.description}`,
        grade: currentGrade,
        ...(u.status === "downgraded" && {
          unsupportedAttributes: ["justification"],
        }),
        ...(conflict && {
          conflictNote: `${conflict.conflictCode}: ${conflict.description ?? ""}`,
        }),
      };
    });

    return {
      admittedBlocks,
      summary: {
        admitted: admittedUnits.length,
        rejected: 0, // patched by gate.render()
        conflicts: admittedUnits.filter(u => u.status === "approved_with_conflict").length,
      },
      instructions:
        "Execute the research steps below in order of priority. " +
        "Required steps must be completed before downstream steps that depend on them. " +
        "Optional steps (downgraded) may be skipped if time is limited. " +
        "Do not execute steps that were rejected — their required context is not yet available.",
    };
  }

  buildRetryFeedback(
    unitResults: UnitEvaluationResult[],
    ctx: RetryContext
  ): RetryFeedback {
    const failed = unitResults.filter(r => r.decision === "reject");
    return {
      summary:
        `${failed.length} step(s) rejected on attempt ${ctx.attempt}/${ctx.maxRetries}. ` +
        `Fix by adding available context to requiredContext, or add findings before synthesizing.`,
      errors: failed.map(r => ({
        unitId: r.unitId,
        reasonCode: r.reasonCode,
        details: {
          hint: r.reasonCode === "MISSING_CONTEXT"
            ? "Cite only context IDs that are already available in the support pool, or lower grade to 'optional'"
            : "Add a finding-type context to evidence before proposing a synthesize/write step",
          missingContextIds: (r.annotations as any)?.missingContextIds,
        },
      })),
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function noopAuditWriter(): AuditWriter {
  return { append: async (_e: AuditEntry) => {} };
}

function pass(msg: string): void {
  console.log(`    [PASS] ${msg}`);
}

function sep(title: string): void {
  console.log("\n" + "═".repeat(70));
  console.log(`  ${title}`);
  console.log("═".repeat(70));
}

function subsep(title: string): void {
  console.log(`\n  ── ${title}`);
}

function label(key: string, value: unknown): void {
  console.log(`    ${key.padEnd(28)}: ${JSON.stringify(value)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const gate = createTrustGate({
    policy: new AgentStepPolicy(),
    auditWriter: noopAuditWriter(),
  });

  // ── INPUT: available research context pool ──────────────────────────────────
  //
  // The agent has already run some searches and read one document.
  // There are no "findings" yet — no synthesis has been done.
  // context-c3 (which step-2 requires) is NOT in the pool.

  sep("Scenario — Research agent proposes 4 next steps");
  subsep("INPUT: available context pool");

  const supportPool: SupportRef[] = [
    {
      id: "ref-1",
      sourceId: "context-c1",
      sourceType: "observation",
      attributes: {
        contextId: "context-c1",
        type: "search_result",
        available: true,
        summary: "Web search results for 'climate change economic impacts 2024'",
      } satisfies StepContextAttrs,
    },
    {
      id: "ref-2",
      sourceId: "context-c2",
      sourceType: "observation",
      attributes: {
        contextId: "context-c2",
        type: "document",
        available: true,
        summary: "IPCC Sixth Assessment Report — Chapter 3",
      } satisfies StepContextAttrs,
    },
    // NOTE: context-c3 is NOT in the pool — step-2 will be rejected for citing it
    // NOTE: no "finding" type contexts exist yet — step-4 will be rejected
  ];

  console.log("\n  Available context:");
  for (const ref of supportPool) {
    const attrs = ref.attributes as StepContextAttrs;
    label(`  ${ref.sourceId} [${attrs.type}]`, attrs.summary);
  }

  // ── INPUT: agent proposes 4 steps ──────────────────────────────────────────

  subsep("INPUT: agent-proposed steps");

  const proposal: Proposal<AgentStepProposal> = {
    id: "prop-research-001",
    kind: "plan",
    units: [
      // step-1: SEARCH — grade=required, cites c1 which exists, good justification → APPROVE
      {
        id: "step-1",
        description: "Search for GDP projections under 2°C and 4°C warming scenarios",
        stepType: "search",
        justification: "Initial search found broad impacts; need sector-specific GDP data to quantify economic cost",
        requiredContext: ["context-c1"],
        grade: "required",
      },
      // step-2: READ — grade=required, cites context-c3 which is MISSING from pool → REJECT (R1)
      {
        id: "step-2",
        description: "Read the World Bank Climate Change report linked in search results",
        stepType: "read",
        justification: "The World Bank report contains primary data on developing-nation exposure",
        requiredContext: ["context-c1", "context-c3"],  // context-c3 doesn't exist yet
        grade: "required",
      },
      // step-3: READ — grade=optional, justification is too short (< 10 chars) → DOWNGRADE (R3)
      {
        id: "step-3",
        description: "Read IPCC report chapter on economic models",
        stepType: "read",
        justification: "more info",   // < 10 chars
        requiredContext: ["context-c2"],
        grade: "required",            // will be downgraded to "optional"
      },
      // step-4: SYNTHESIZE — no findings in pool → REJECT (R2)
      {
        id: "step-4",
        description: "Synthesize economic impact findings into a draft summary table",
        stepType: "synthesize",
        justification: "The research team needs a consolidated view of GDP impact ranges across regions",
        requiredContext: [],           // no findings needed according to agent, but R2 requires them
        grade: "required",
      },
    ],
  };

  for (const u of proposal.units) {
    label(`  ${u.id} [${u.stepType}, ${u.grade}]`, u.description);
  }

  // ── GATE EXECUTION ─────────────────────────────────────────────────────────

  subsep("GATE EXECUTION");

  const result = await gate.admit(proposal, supportPool);
  const context = gate.render(result, supportPool);
  const expl = gate.explain(result);

  // ── OUTPUT ─────────────────────────────────────────────────────────────────

  subsep("OUTPUT: gate results");

  console.log("\n  Admitted:");
  for (const u of result.admittedUnits) {
    label(`  ${u.unitId} [${u.status}]`, u.unit.description);
    if (u.status === "downgraded") {
      const ann = u.evaluationResults[0]?.annotations as any;
      label("    downgrade note", ann?.note);
    }
    if (u.status === "approved_with_conflict") {
      label("    conflict", u.conflictAnnotations?.[0]?.conflictCode);
    }
  }

  console.log("\n  Rejected:");
  for (const u of result.rejectedUnits) {
    const ann = u.evaluationResults[0]?.annotations as any;
    label(`  ${u.unitId} [${u.evaluationResults[0]?.reasonCode}]`, u.unit.description);
    if (ann?.missingContextIds) label("    missing context", ann.missingContextIds);
    if (ann?.note) label("    note", ann.note);
  }

  console.log();
  label("totalUnits", expl.totalUnits);
  label("approved", expl.approved);
  label("downgraded", expl.downgraded);
  label("rejected", expl.rejected);
  label("reasonCodes", expl.gateReasonCodes);

  // ── ASSERTIONS ─────────────────────────────────────────────────────────────

  subsep("ASSERTIONS");

  // step-1: good search step with valid context → approved
  const step1 = result.admittedUnits.find(u => u.unitId === "step-1");
  assert.ok(step1, "step-1 should be admitted");
  assert.equal(step1.status, "approved");
  pass("step-1 approved (search with valid required context)");

  // step-2: cites missing context-c3 → rejected with MISSING_CONTEXT
  const step2 = result.rejectedUnits.find(u => u.unitId === "step-2");
  assert.ok(step2, "step-2 should be rejected");
  assert.equal(step2.evaluationResults[0]?.reasonCode, "MISSING_CONTEXT");
  pass("step-2 rejected (MISSING_CONTEXT — context-c3 not in pool)");

  // step-3: weak justification ("more info") → downgraded to optional
  const step3 = result.admittedUnits.find(u => u.unitId === "step-3");
  assert.ok(step3, "step-3 should be admitted");
  assert.equal(step3.status, "downgraded");
  assert.equal(step3.appliedGrades[step3.appliedGrades.length - 1], "optional");
  pass("step-3 downgraded to optional (WEAK_JUSTIFICATION)");

  // step-4: synthesize with no findings → rejected with INSUFFICIENT_FINDINGS
  const step4 = result.rejectedUnits.find(u => u.unitId === "step-4");
  assert.ok(step4, "step-4 should be rejected");
  assert.equal(step4.evaluationResults[0]?.reasonCode, "INSUFFICIENT_FINDINGS");
  pass("step-4 rejected (INSUFFICIENT_FINDINGS — no finding-type context available)");

  // summary counts
  assert.equal(expl.approved, 1);
  assert.equal(expl.downgraded, 1);
  assert.equal(expl.rejected, 2);
  pass("summary counts correct: 1 approved, 1 downgraded, 2 rejected");

  // VerifiedContext instructions exist
  assert.ok(context.instructions?.includes("Execute"), "instructions should guide step execution");
  pass("VerifiedContext.instructions present");

  // ── RETRY SCENARIO ─────────────────────────────────────────────────────────
  //
  // After seeing the rejection feedback, the LLM fixes step-2 by:
  //   - removing context-c3 from requiredContext (it will be acquired after step-1 runs)
  //   - lowering grade to "optional"
  // And step-4 remains rejected — findings don't exist yet.
  // The LLM also adds a proper finding by adding a "finding" context to support,
  // but in this retry only step-2 is fixed.

  sep("Retry — LLM fixes step-2 by removing unavailable context ref");

  const retryProposal: Proposal<AgentStepProposal> = {
    id: "prop-research-001-retry",
    kind: "plan",
    units: [
      // step-1: unchanged → approved
      {
        id: "step-1",
        description: "Search for GDP projections under 2°C and 4°C warming scenarios",
        stepType: "search",
        justification: "Initial search found broad impacts; need sector-specific GDP data to quantify economic cost",
        requiredContext: ["context-c1"],
        grade: "required",
      },
      // step-2 fixed: remove context-c3, lower grade to optional
      {
        id: "step-2",
        description: "Read the World Bank Climate Change report linked in search results",
        stepType: "read",
        justification: "The World Bank report contains primary data on developing-nation exposure",
        requiredContext: ["context-c1"],  // fixed: only cite available context
        grade: "optional",               // fixed: lowered from required to optional
      },
      // step-3: unchanged → still downgraded (justification still weak)
      {
        id: "step-3",
        description: "Read IPCC report chapter on economic models",
        stepType: "read",
        justification: "more info",
        requiredContext: ["context-c2"],
        grade: "required",
      },
      // step-4: still has no findings — still rejected
      {
        id: "step-4",
        description: "Synthesize economic impact findings into a draft summary table",
        stepType: "synthesize",
        justification: "The research team needs a consolidated view of GDP impact ranges across regions",
        requiredContext: [],
        grade: "required",
      },
    ],
  };

  const retryResult = await gate.admit(retryProposal, supportPool);
  const retryExpl = gate.explain(retryResult);

  subsep("OUTPUT: retry gate results");

  console.log("\n  Admitted:");
  for (const u of retryResult.admittedUnits) {
    label(`  ${u.unitId} [${u.status}]`, u.unit.description);
  }
  console.log("\n  Rejected:");
  for (const u of retryResult.rejectedUnits) {
    label(`  ${u.unitId} [${u.evaluationResults[0]?.reasonCode}]`, u.unit.description);
  }
  console.log();
  label("approved", retryExpl.approved);
  label("downgraded", retryExpl.downgraded);
  label("rejected", retryExpl.rejected);

  subsep("ASSERTIONS");

  const retryStep2 = retryResult.admittedUnits.find(u => u.unitId === "step-2");
  assert.ok(retryStep2, "step-2 should now be admitted after fix");
  assert.equal(retryStep2.status, "approved");
  pass("step-2 now approved after removing missing context-c3");

  // step-4 still rejected — no findings in the pool
  const retryStep4 = retryResult.rejectedUnits.find(u => u.unitId === "step-4");
  assert.ok(retryStep4, "step-4 should still be rejected");
  assert.equal(retryStep4.evaluationResults[0]?.reasonCode, "INSUFFICIENT_FINDINGS");
  pass("step-4 still rejected (no findings context added to pool)");

  assert.equal(retryExpl.approved, 2);  // step-1, step-2
  assert.equal(retryExpl.downgraded, 1); // step-3
  assert.equal(retryExpl.rejected, 1);   // step-4
  pass("retry summary: 2 approved, 1 downgraded, 1 rejected");

  console.log("\n  Done.\n");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
