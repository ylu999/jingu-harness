import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  regimeToUnitResult,
  regimeToGateLog,
} from "../../../src/regime-adapter/index.js"
import type { RegimeEvaluation } from "../../../src/regime-adapter/index.js"

const acceptEval: RegimeEvaluation = {
  decision: "accept",
  score: 100,
  violations: [],
  summary: "Agent is operating within a healthy engineering regime.",
}

const rejectEval: RegimeEvaluation = {
  decision: "reject",
  score: 60,
  violations: [
    { policyId: "P2", severity: "reject", message: "Missing precondition check" },
  ],
  summary: "Agent behavior degraded.",
}

const blockEval: RegimeEvaluation = {
  decision: "block",
  score: 0,
  violations: [
    { policyId: "P1", severity: "block", message: "Constraint bypass detected" },
    { policyId: "P3", severity: "block", message: "Blind retry detected" },
  ],
  summary: "Agent behavior degraded. Score: 0",
}

const downgradeEval: RegimeEvaluation = {
  decision: "downgrade_claim",
  score: 80,
  violations: [
    { policyId: "P8", severity: "reject", message: "Claim exceeds evidence" },
  ],
  summary: "Claim downgraded.",
}

describe("regimeToUnitResult", () => {
  it("accept → approve decision with REGIME_OK", () => {
    const result = regimeToUnitResult("unit-1", acceptEval)
    assert.equal(result.kind, "unit")
    assert.equal(result.unitId, "unit-1")
    assert.equal(result.decision, "approve")
    assert.equal(result.reasonCode, "REGIME_OK")
  })

  it("reject → reject decision with REGIME_<policyId>", () => {
    const result = regimeToUnitResult("unit-2", rejectEval)
    assert.equal(result.decision, "reject")
    assert.equal(result.reasonCode, "REGIME_P2")
  })

  it("block → reject decision with top block violation policyId", () => {
    const result = regimeToUnitResult("unit-3", blockEval)
    assert.equal(result.decision, "reject")
    assert.equal(result.reasonCode, "REGIME_P1")
    // annotations contain all violations as objects
    const annotations = result.annotations as { violations: { policyId: string }[] }
    assert.ok(annotations.violations.some(v => v.policyId === "P1"))
    assert.ok(annotations.violations.some(v => v.policyId === "P3"))
  })

  it("downgrade_claim → downgrade decision with REGIME_P8", () => {
    const result = regimeToUnitResult("unit-4", downgradeEval)
    assert.equal(result.decision, "downgrade")
    assert.equal(result.reasonCode, "REGIME_P8")
  })

  it("preserves score in annotations", () => {
    const result = regimeToUnitResult("unit-5", acceptEval)
    const annotations = result.annotations as { score: number }
    assert.equal(annotations.score, 100)
  })
})

describe("regimeToGateLog", () => {
  it("returns a GateResultLog with kind=unit", () => {
    const log = regimeToGateLog("unit-6", acceptEval)
    assert.equal(log.kind, "unit")
  })

  it("block evaluation produces reject in gate log", () => {
    const log = regimeToGateLog("unit-7", blockEval)
    assert.ok("decision" in log)
    if ("decision" in log) {
      assert.equal(log.decision, "reject")
    }
  })
})
