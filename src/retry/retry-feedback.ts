import type { UnitEvaluationResult } from "../types/gate.js";
import type { RetryFeedback } from "../types/retry.js";

/**
 * Extract all rejection/downgrade results that need retry feedback.
 */
export function collectRetryableResults(
  results: UnitEvaluationResult[],
  retryOnDecisions: Array<"reject" | "downgrade">
): UnitEvaluationResult[] {
  return results.filter((r) => retryOnDecisions.includes(r.decision as "reject" | "downgrade"));
}

/**
 * Check if an AdmissionResult needs retry based on config.
 */
export function needsRetry(
  unitResults: UnitEvaluationResult[],
  retryOnDecisions: Array<"reject" | "downgrade">
): boolean {
  return collectRetryableResults(unitResults, retryOnDecisions).length > 0;
}

/**
 * Build a default RetryFeedback from gate results.
 * Policy can override this via buildRetryFeedback().
 */
export function buildDefaultRetryFeedback(
  results: UnitEvaluationResult[]
): RetryFeedback {
  return {
    summary: `${results.length} unit(s) failed governance gates.`,
    errors: results.map((r) => ({
      unitId: r.unitId,
      reasonCode: r.reasonCode,
      details: r.annotations,
    })),
  };
}
