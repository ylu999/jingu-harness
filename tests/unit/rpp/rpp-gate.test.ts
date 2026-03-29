import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runRPPGate } from "../../../src/rpp/rpp-gate.js";
import type { RPPRecord } from "@jingu/policy-core";
import { GateRunner } from "../../../src/gate/gate-runner.js";
import type { GatePolicy } from "../../../src/types/policy.js";
import type { Proposal } from "../../../src/types/proposal.js";
import type { SupportRef } from "../../../src/types/support.js";

// ---------------------------------------------------------------------------
// Helpers: build minimal valid RPP fixtures
// ---------------------------------------------------------------------------

function makeValidRPPRecord(): RPPRecord {
  return {
    call_id: "call-test-001",
    steps: [
      {
        stage: "interpretation",
        content: ["interpretation content that is real"],
        references: [
          {
            type: "evidence",
            source: "doc-1",
            locator: "section-1",
            supports: "interpretation content that is real",
          },
        ],
      },
      {
        stage: "reasoning",
        content: ["reasoning content that is real"],
        references: [
          {
            type: "evidence",
            source: "doc-1",
            locator: "section-2",
            supports: "reasoning content that is real",
          },
        ],
      },
      {
        stage: "decision",
        content: ["decision content that is real"],
        references: [
          {
            type: "rule",
            rule_id: "RULE-1",
            supports: "decision content that is real",
          },
        ],
      },
      {
        stage: "action",
        content: ["action content that is real"],
        references: [
          {
            type: "rule",
            rule_id: "RULE-2",
            supports: "action content that is real",
          },
        ],
      },
    ],
    response: {
      content: ["interpretation content that is real"],
      references: [
        {
          type: "evidence",
          source: "doc-1",
          locator: "section-1",
          supports: "interpretation content that is real",
        },
      ],
    },
  };
}

/**
 * A weakly_supported record: all 4 required stages are present and valid, but
 * every reference has a 'supports' field shorter than 10 chars (SUPPORTS_TOO_VAGUE).
 * SUPPORTS_TOO_VAGUE is a soft/warning failure only, so overall_status = "weakly_supported"
 * and allow = true.
 */
function makeWeaklySupportedRPPRecord(): RPPRecord {
  return {
    call_id: "call-test-weak",
    steps: [
      {
        stage: "interpretation",
        content: ["interpretation content that is real"],
        references: [
          {
            type: "evidence",
            source: "doc-1",
            locator: "section-1",
            supports: "short", // < 10 chars → SUPPORTS_TOO_VAGUE (warning)
          },
        ],
      },
      {
        stage: "reasoning",
        content: ["reasoning content that is real"],
        references: [
          {
            type: "evidence",
            source: "doc-1",
            locator: "section-2",
            supports: "short", // < 10 chars → SUPPORTS_TOO_VAGUE (warning)
          },
        ],
      },
      {
        stage: "decision",
        content: ["decision content that is real"],
        references: [
          {
            type: "rule",
            rule_id: "RULE-1",
            supports: "short", // < 10 chars → SUPPORTS_TOO_VAGUE (warning)
          },
        ],
      },
      {
        stage: "action",
        content: ["action content that is real"],
        references: [
          {
            type: "rule",
            rule_id: "RULE-2",
            supports: "short", // < 10 chars → SUPPORTS_TOO_VAGUE (warning)
          },
        ],
      },
    ],
    response: {
      content: ["interpretation content that is real"],
      references: [
        {
          type: "evidence",
          source: "doc-1",
          locator: "section-1",
          supports: "short",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Mock helpers for gate-runner integration tests
// ---------------------------------------------------------------------------

type TestUnit = { id: string; content: string };

function makeProposal(
  units: TestUnit[],
  rppRecord?: RPPRecord | null
): Proposal<TestUnit> & { rpp_record?: RPPRecord } {
  const p: Proposal<TestUnit> & { rpp_record?: RPPRecord } = {
    id: "prop-rpp-1",
    kind: "response",
    units,
  };
  if (rppRecord !== undefined && rppRecord !== null) {
    p.rpp_record = rppRecord;
  }
  return p;
}

const noSupport: SupportRef[] = [];

function makePassingPolicy(): GatePolicy<TestUnit> {
  return {
    validateStructure: () => ({ kind: "structure", valid: true, errors: [] }),
    bindSupport: (unit, pool) => ({
      unit,
      supportIds: pool.map((s) => s.id),
      supportRefs: pool,
    }),
    evaluateUnit: ({ unit }) => ({
      kind: "unit",
      unitId: (unit as TestUnit).id,
      decision: "approve",
      reasonCode: "OK",
    }),
    detectConflicts: () => [],
    render: (units, _pool, _ctx) => ({
      admittedBlocks: units.map((u) => ({
        sourceId: (u.unit as TestUnit).id,
        content: "",
      })),
      summary: { admitted: units.length, rejected: 0, conflicts: 0 },
    }),
    buildRetryFeedback: () => ({ summary: "test", errors: [] }),
  };
}

function makeFailingPolicy(): GatePolicy<TestUnit> {
  return {
    ...makePassingPolicy(),
    evaluateUnit: ({ unit }) => ({
      kind: "unit",
      unitId: (unit as TestUnit).id,
      decision: "reject",
      reasonCode: "POLICY_REJECT",
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests: runRPPGate (unit)
// ---------------------------------------------------------------------------

describe("runRPPGate", () => {
  it("Test 1: null record → allow:false, rpp_status:missing", () => {
    const result = runRPPGate(null);

    assert.equal(result.allow, false);
    assert.equal(result.rpp_status, "missing");
    assert.ok(result.failures.length > 0);
    assert.equal(result.failures[0].code, "MISSING_STAGE");
  });

  it("Test 2: undefined record → allow:false, rpp_status:missing", () => {
    const result = runRPPGate(undefined);

    assert.equal(result.allow, false);
    assert.equal(result.rpp_status, "missing");
    assert.ok(result.failures.length > 0);
    assert.equal(result.failures[0].code, "MISSING_STAGE");
  });

  it("Test 3: valid RPP record → allow:true, rpp_status:valid", () => {
    const record = makeValidRPPRecord();
    const result = runRPPGate(record);

    assert.equal(result.allow, true);
    assert.equal(result.rpp_status, "valid");
    assert.equal(result.failures.length, 0);
  });

  it("Test 4: invalid RPP record (missing a stage) → allow:false, rpp_status:invalid", () => {
    const record = makeValidRPPRecord();
    // Remove the 'action' stage to trigger MISSING_STAGE
    record.steps = record.steps.filter((s) => s.stage !== "action");
    const result = runRPPGate(record);

    assert.equal(result.allow, false);
    assert.equal(result.rpp_status, "invalid");
    assert.ok(result.failures.some((f) => f.code === "MISSING_STAGE"));
  });

  it("Test 5: weakly_supported RPP (only soft failures) → allow:true, rpp_status:weakly_supported", () => {
    const record = makeWeaklySupportedRPPRecord();
    const result = runRPPGate(record);

    assert.equal(result.allow, true);
    assert.equal(result.rpp_status, "weakly_supported");
    assert.equal(result.failures.length, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.every((w) => w.code === "SUPPORTS_TOO_VAGUE"));
  });
});

// ---------------------------------------------------------------------------
// Tests: GateRunner integration with RPP gate
// ---------------------------------------------------------------------------

describe("GateRunner + RPP gate", () => {
  it("Test 6: valid RPP + mock passing policy → allow:true, admittedUnits non-empty", async () => {
    const rpp = makeValidRPPRecord();
    const policy = makePassingPolicy();
    const runner = new GateRunner(policy);

    const result = await runner.run(
      makeProposal([{ id: "u1", content: "hello" }], rpp),
      noSupport
    );

    assert.equal(result.admittedUnits.length, 1);
    assert.equal(result.rejectedUnits.length, 0);
    assert.equal(result.admittedUnits[0].status, "approved");
  });

  it("Test 7: valid RPP + mock failing policy → allow:false, rejectedUnits non-empty", async () => {
    const rpp = makeValidRPPRecord();
    const policy = makeFailingPolicy();
    const runner = new GateRunner(policy);

    const result = await runner.run(
      makeProposal([{ id: "u1", content: "hello" }], rpp),
      noSupport
    );

    assert.equal(result.admittedUnits.length, 0);
    assert.equal(result.rejectedUnits.length, 1);
    assert.equal(result.rejectedUnits[0].status, "rejected");
  });
});
