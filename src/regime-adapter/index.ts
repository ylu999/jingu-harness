/**
 * regime-adapter: thin type bridge between external regime evaluation results
 * and the trust-gate GateResultLog system.
 *
 * This adapter is optional. It converts a RegimeEvaluation (produced by
 * jingu-policy-core agents) into trust-gate-compatible audit log entries
 * so regime decisions can appear in the unified GateResultLog audit trail.
 *
 * No P1-P16 logic lives here — this is purely a type bridge.
 */

import type { UnitEvaluationResult, GateResultLog } from "../types/gate.js"

/**
 * Minimal regime evaluation result shape.
 * Kept intentionally narrow — only what trust-gate needs to bridge.
 */
export type RegimeDecision = "accept" | "reject" | "block" | "downgrade_claim"

export type RegimeViolation = {
  policyId: string
  severity: "warning" | "reject" | "block"
  message: string
}

export type RegimeEvaluation = {
  decision: RegimeDecision
  score: number
  violations: RegimeViolation[]
  summary: string
}

/**
 * Converts a regime evaluation result to a trust-gate UnitEvaluationResult
 * so it can be included in the GateResultLog audit trail.
 *
 * Maps:
 *   "accept"           → decision: "approve",   reasonCode: "REGIME_OK"
 *   "downgrade_claim"  → decision: "downgrade",  reasonCode: "REGIME_CLAIM_INFLATED"
 *   "reject" | "block" → decision: "reject",     reasonCode: "REGIME_<policyId>"
 */
export function regimeToUnitResult(
  unitId: string,
  evaluation: RegimeEvaluation
): UnitEvaluationResult {
  if (evaluation.decision === "accept") {
    return {
      kind: "unit",
      unitId,
      decision: "approve",
      reasonCode: "REGIME_OK",
      annotations: { score: evaluation.score },
    }
  }

  if (evaluation.decision === "downgrade_claim") {
    const topViolation = evaluation.violations.find(v => v.policyId === "P8")
    return {
      kind: "unit",
      unitId,
      decision: "downgrade",
      reasonCode: topViolation ? `REGIME_${topViolation.policyId}` : "REGIME_CLAIM_INFLATED",
      annotations: {
        score: evaluation.score,
        violations: evaluation.violations.map(v => v.policyId),
      },
    }
  }

  // "reject" | "block"
  const topViolation = evaluation.violations.find(v => v.severity === "block")
    ?? evaluation.violations.find(v => v.severity === "reject")
    ?? evaluation.violations[0]

  return {
    kind: "unit",
    unitId,
    decision: "reject",
    reasonCode: topViolation ? `REGIME_${topViolation.policyId}` : "REGIME_REJECTED",
    annotations: {
      score: evaluation.score,
      regimeDecision: evaluation.decision,
      violations: evaluation.violations.map(v => ({
        policyId: v.policyId,
        severity: v.severity,
        message: v.message,
      })),
    },
  }
}

/**
 * Wraps the regime unit result in a GateResultLog for inclusion in audit.
 */
export function regimeToGateLog(
  unitId: string,
  evaluation: RegimeEvaluation
): GateResultLog {
  return regimeToUnitResult(unitId, evaluation)
}
