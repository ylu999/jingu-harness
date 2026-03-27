/**
 * aha-moment-demo — two scenarios that show why jingu-trust-gate exists
 *
 * Run: npm run build && node dist/demo/aha-moment-demo.js
 *
 * These are not API demos. They are arguments.
 * Each scenario first shows what goes wrong without a gate,
 * then shows what the gate does about it.
 *
 * ──────────────────────────────────────────────────
 *  Scenario A: Agent does things you never asked for
 *  Scenario B: System remembers things you never said
 * ──────────────────────────────────────────────────
 *
 * Scenario A is about one wrong action.
 * Scenario B is about permanent corruption.
 * Scenario B is the one that should make you uncomfortable.
 */

import assert from "node:assert/strict";
import { createTrustGate } from "../src/trust-gate.js";
import { approve, reject, downgrade } from "../src/helpers/index.js";
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function noopAudit(): AuditWriter {
  return { append: async (_e: AuditEntry) => {} };
}

function line(s = "") { console.log(s); }
function head(s: string) {
  const bar = "─".repeat(70);
  line(); line(bar); line(`  ${s}`); line(bar); line();
}
function sub(s: string) { line(); line(`  ── ${s}`); line(); }
function ok(s: string)  { line(`  ✓  ${s}`); }
function bad(s: string) { line(`  ✗  ${s}`); }
function kv(k: string, v: unknown) {
  line(`  ${k.padEnd(38)} ${String(v)}`);
}

// ---------------------------------------------------------------------------
// Scenario A: Agent does things you never asked for
// ---------------------------------------------------------------------------
//
// User says: "Order more milk."
// Agent proposes 3 actions:
//   order_milk              ← user asked for this      → should run
//   delete_old_list         ← agent decided on its own → should NOT run
//   send_notification_email ← agent decided on its own → should NOT run
//
// Without a gate: all three execute.
// With the gate: only order_milk is authorized.

type ActionUnit = {
  id: string;
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  isReversible: boolean;
  evidenceRefs: string[];
};

class ActionGatePolicy implements GatePolicy<ActionUnit> {
  validateStructure(p: Proposal<ActionUnit>): StructureValidationResult {
    return { kind: "structure", valid: p.units.length > 0, errors: [] };
  }

  bindSupport(unit: ActionUnit, pool: SupportRef[]): UnitWithSupport<ActionUnit> {
    const matched = pool.filter(s => unit.evidenceRefs.includes(s.sourceId));
    return { unit, supportIds: matched.map(s => s.id), supportRefs: matched };
  }

  evaluateUnit({ unit, supportRefs }: UnitWithSupport<ActionUnit>): UnitEvaluationResult {
    const hasRequest = supportRefs.some(
      s => (s.attributes as { type: string })?.type === "explicit_request"
    );
    if (!hasRequest) {
      return reject(unit.id, "INTENT_NOT_ESTABLISHED", {
        note: `"${unit.name}" has no explicit_request evidence — the user never asked for this`,
      });
    }
    if (unit.riskLevel === "high" && !unit.isReversible) {
      const hasConfirm = supportRefs.some(
        s => (s.attributes as { type: string })?.type === "user_confirmation"
      );
      if (!hasConfirm) {
        return reject(unit.id, "CONFIRM_REQUIRED", {
          note: "high-risk irreversible action requires user_confirmation beyond the initial request",
        });
      }
    }
    return approve(unit.id);
  }

  detectConflicts(): ConflictAnnotation[] { return []; }

  render(admitted: AdmittedUnit<ActionUnit>[]): VerifiedContext {
    return {
      admittedBlocks: admitted.map(u => ({
        sourceId: u.unitId,
        content: `[${(u.unit as ActionUnit).riskLevel.toUpperCase()}] ${(u.unit as ActionUnit).name}`,
      })),
      summary: { admitted: admitted.length, rejected: 0, conflicts: 0 },
      instructions: "Execute only the admitted actions. Do not run anything that was rejected.",
    };
  }

  buildRetryFeedback(results: UnitEvaluationResult[], ctx: RetryContext): RetryFeedback {
    const failed = results.filter(r => r.decision === "reject");
    return {
      summary: `${failed.length} action(s) blocked on attempt ${ctx.attempt}`,
      errors: failed.map(r => ({ unitId: r.unitId, reasonCode: r.reasonCode })),
    };
  }
}

async function scenarioA(): Promise<void> {
  head("Scenario A — Agent does things you never asked for");

  line("  User says:  \"Order more milk.\"");
  line();
  line("  Agent proposes 3 actions:");
  line("    order_milk              — user asked for this");
  line("    delete_old_list         — agent decided on its own");
  line("    send_notification_email — agent decided on its own");

  sub("Without a gate");
  line("  All three actions execute.");
  line("  The user asked to order milk.");
  line("  The agent also deleted a list and sent an email.");
  line("  The user has no idea why.");
  line();
  bad("delete_old_list executed — no one asked for this");
  bad("send_notification_email executed — no one asked for this");

  sub("Evidence pool (what the user actually said)");
  const pool: SupportRef[] = [
    {
      id: "ref-req-1",
      sourceId: "req-001",
      sourceType: "observation",
      attributes: { type: "explicit_request", content: "Order more milk" },
    },
  ];
  kv("req-001", "explicit_request — \"Order more milk\"");
  line("  (nothing about lists, nothing about emails)");

  sub("Agent's proposal");
  const proposal: Proposal<ActionUnit> = {
    id: "prop-a",
    kind: "plan",
    units: [
      { id: "a1", name: "order_milk",              description: "Place grocery order for milk",               riskLevel: "low",    isReversible: true,  evidenceRefs: ["req-001"] },
      { id: "a2", name: "delete_old_list",          description: "Delete the shopping list from last week",    riskLevel: "medium", isReversible: false, evidenceRefs: [] },
      { id: "a3", name: "send_notification_email",  description: "Email household that milk was ordered",      riskLevel: "low",    isReversible: false, evidenceRefs: [] },
    ],
  };
  kv("a1  order_milk",              "evidenceRefs=[req-001]  → has request");
  kv("a2  delete_old_list",         "evidenceRefs=[]         → no evidence");
  kv("a3  send_notification_email", "evidenceRefs=[]         → no evidence");

  sub("Gate decision");
  const gate = createTrustGate({ policy: new ActionGatePolicy(), auditWriter: noopAudit() });
  const result = await gate.admit(proposal, pool);

  line("  Admitted (authorized to execute):");
  for (const u of result.admittedUnits) {
    ok(`${u.unitId}  ${(u.unit as ActionUnit).name}`);
  }
  line();
  line("  Rejected (blocked before execution):");
  for (const u of result.rejectedUnits) {
    const ann = u.evaluationResults[0]?.annotations as { note?: string };
    bad(`${u.unitId}  ${(u.unit as ActionUnit).name}  [${u.evaluationResults[0]?.reasonCode}]`);
    if (ann?.note) line(`       ${ann.note}`);
  }

  assert.equal(result.admittedUnits.length,  1);
  assert.equal(result.rejectedUnits.length,  2);
  assert.ok(result.admittedUnits.find(u => u.unitId === "a1"));
  assert.ok(result.rejectedUnits.find(u => u.unitId === "a2"));
  assert.ok(result.rejectedUnits.find(u => u.unitId === "a3"));
  assert.equal(result.rejectedUnits[0].evaluationResults[0].reasonCode, "INTENT_NOT_ESTABLISHED");
  assert.equal(result.rejectedUnits[1].evaluationResults[0].reasonCode, "INTENT_NOT_ESTABLISHED");

  line();
  line("  The gate checked one rule: did the user ask for this?");
  line("  No evidence → no execution. No understanding of intent required.");
  line("  Deterministic. Audited. Reproducible.");
}

// ---------------------------------------------------------------------------
// Scenario B: System remembers things you never said
// ---------------------------------------------------------------------------
//
// This is the one that should make you uncomfortable.
//
// User says: "We're running low on milk."
//
// LLM proposes 3 memory writes:
//   milk_stock = "low"          ← user said this     → should be stored
//   user_prefers_brand = "Oatly" ← LLM inferred this → should NOT be stored
//   weekly_budget = "$50"        ← LLM inferred this → should NOT be stored
//
// Without a gate: all three are written to the database.
// The system now "knows" the user prefers Oatly and has a $50 budget.
// Neither was ever said.
// These become ground truth. They affect every future recommendation,
// every shopping list, every budget calculation.
// There is no automatic correction.
//
// With the gate: only milk_stock = "low" reaches storage.
// The two hallucinated facts are blocked at the boundary.
// The system's memory stays honest.

type MemoryWrite = {
  id: string;
  key: string;
  value: string;
  evidenceRefs: string[];
};

class MemoryGatePolicy implements GatePolicy<MemoryWrite> {
  validateStructure(p: Proposal<MemoryWrite>): StructureValidationResult {
    return { kind: "structure", valid: p.units.length > 0, errors: [] };
  }

  bindSupport(unit: MemoryWrite, pool: SupportRef[]): UnitWithSupport<MemoryWrite> {
    const matched = pool.filter(s => unit.evidenceRefs.includes(s.sourceId));
    return { unit, supportIds: matched.map(s => s.id), supportRefs: matched };
  }

  evaluateUnit({ unit, supportRefs }: UnitWithSupport<MemoryWrite>): UnitEvaluationResult {
    const hasStatement = supportRefs.some(s => s.sourceType === "user_statement");
    if (!hasStatement) {
      return reject(unit.id, "INFERRED_NOT_STATED", {
        note: `"${unit.key}" was inferred by the model — the user never said this`,
      });
    }
    const verbatim = supportRefs.some(
      s => s.sourceType === "user_statement" &&
           typeof s.attributes?.content === "string" &&
           (s.attributes.content as string).toLowerCase().includes(unit.value.toLowerCase())
    );
    if (!verbatim) {
      return downgrade(unit.id, "VALUE_NOT_VERBATIM", "inferred", {
        note: `"${unit.value}" does not appear verbatim in any user statement — stored as inferred`,
      });
    }
    return approve(unit.id);
  }

  detectConflicts(): ConflictAnnotation[] { return []; }

  render(admitted: AdmittedUnit<MemoryWrite>[]): VerifiedContext {
    return {
      admittedBlocks: admitted.map(u => ({
        sourceId: u.unitId,
        content: `${(u.unit as MemoryWrite).key} = "${(u.unit as MemoryWrite).value}"`,
      })),
      summary: { admitted: admitted.length, rejected: 0, conflicts: 0 },
      instructions: "Write only the verified facts below to system state. Do not store rejected writes.",
    };
  }

  buildRetryFeedback(results: UnitEvaluationResult[], ctx: RetryContext): RetryFeedback {
    const failed = results.filter(r => r.decision === "reject");
    return {
      summary: `${failed.length} write(s) blocked — not grounded in user statements`,
      errors: failed.map(r => ({ unitId: r.unitId, reasonCode: r.reasonCode })),
    };
  }
}

async function scenarioB(): Promise<void> {
  head("Scenario B — System remembers things you never said");

  line("  User says:  \"We're running low on milk.\"");
  line();
  line("  LLM proposes 3 memory writes:");
  line("    milk_stock = \"low\"             — the user said this");
  line("    user_prefers_brand = \"Oatly\"   — the LLM guessed this");
  line("    weekly_budget = \"$50\"          — the LLM guessed this");

  sub("Without a gate");
  line("  All three writes reach the database.");
  line();
  line("  The system now 'knows':");
  bad("user_prefers_brand = \"Oatly\"   (never said)");
  bad("weekly_budget = \"$50\"          (never said)");
  line();
  line("  These become ground truth used in:");
  line("    — future shopping recommendations  → always suggests Oatly");
  line("    — auto-generated shopping lists    → filtered by $50 budget");
  line("    — every future RAG retrieval       → wrong facts, wrong answers");
  line();
  line("  The model guessed twice. Both guesses became permanent facts.");
  line("  The system is now drifting from the user's actual reality.");
  line("  There is no automatic correction.");

  sub("Evidence pool (what the user actually said)");
  const pool: SupportRef[] = [
    {
      id: "ref-stmt-1",
      sourceId: "stmt-1",
      sourceType: "user_statement",
      attributes: { content: "We're running low on milk" },
    },
  ];
  kv("stmt-1", "user_statement — \"We're running low on milk\"");
  line("  (nothing about brand preferences, nothing about budget)");

  sub("LLM's proposed writes");
  const proposal: Proposal<MemoryWrite> = {
    id: "prop-b",
    kind: "mutation",
    units: [
      { id: "w1", key: "milk_stock",          value: "low",   evidenceRefs: ["stmt-1"] },
      { id: "w2", key: "user_prefers_brand",   value: "Oatly", evidenceRefs: [] },
      { id: "w3", key: "weekly_budget",        value: "$50",   evidenceRefs: [] },
    ],
  };
  kv("w1  milk_stock = \"low\"",          "evidenceRefs=[stmt-1]  → grounded");
  kv("w2  user_prefers_brand = \"Oatly\"", "evidenceRefs=[]        → no evidence");
  kv("w3  weekly_budget = \"$50\"",        "evidenceRefs=[]        → no evidence");

  sub("Gate decision");
  const gate = createTrustGate({ policy: new MemoryGatePolicy(), auditWriter: noopAudit() });
  const result = await gate.admit(proposal, pool);
  const context = gate.render(result);

  line("  Written to state:");
  for (const b of context.admittedBlocks) {
    ok(b.content);
  }
  line();
  line("  Blocked (never reach storage):");
  for (const u of result.rejectedUnits) {
    const ann = u.evaluationResults[0]?.annotations as { note?: string };
    bad(`${(u.unit as MemoryWrite).key}  [${u.evaluationResults[0]?.reasonCode}]`);
    if (ann?.note) line(`       ${ann.note}`);
  }

  assert.equal(result.admittedUnits.length, 1);
  assert.equal(result.rejectedUnits.length, 2);
  assert.ok(result.admittedUnits.find(u => u.unitId === "w1"));
  assert.equal(result.rejectedUnits.find(u => u.unitId === "w2")?.evaluationResults[0].reasonCode, "INFERRED_NOT_STATED");
  assert.equal(result.rejectedUnits.find(u => u.unitId === "w3")?.evaluationResults[0].reasonCode, "INFERRED_NOT_STATED");

  line();
  line("  State after gate:");
  kv("    milk_stock", "\"low\"");
  line();
  line("  The two hallucinated facts do not exist.");
  line("  They were never stored. They cannot corrupt future queries.");
  line("  The system's memory reflects only what the user actually said.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const BAR = "═".repeat(70);
  line();
  line(BAR);
  line("  jingu-trust-gate — aha-moment-demo");
  line();
  line("  Two scenarios. Two failure modes. One fix.");
  line();
  line("  Scenario A: agent does things you never asked for");
  line("  Scenario B: system remembers things you never said");
  line();
  line("  Scenario B is the one that should make you uncomfortable.");
  line(BAR);

  await scenarioA();
  await scenarioB();

  line();
  line(BAR);
  line("  The shift");
  line();
  line("  Without jingu-trust-gate:");
  line("    LLM output → system state");
  line();
  line("  With jingu-trust-gate:");
  line("    LLM output → gate (deterministic check) → system state");
  line();
  line("  The gate does not make the model smarter.");
  line("  It makes the system honest about what it actually knows.");
  line();
  line("  AI can propose anything.");
  line("  Only verified results are accepted.");
  line(BAR);
  line();
}

main().catch(err => {
  console.error("\nDemo failed:", err);
  process.exit(1);
});
