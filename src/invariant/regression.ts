import type { InvariantFailure } from "../failure/types.js";

export type TestSummary = {
  passed: number;
  failed: number;
};

export function parseTestSummary(logs: string): TestSummary {
  const passedMatch = logs.match(/# pass\s+(\d+)/i) ?? logs.match(/(\d+) passed/i);
  const failedMatch = logs.match(/# fail\s+(\d+)/i) ?? logs.match(/(\d+) failed/i);
  return {
    passed: passedMatch ? parseInt(passedMatch[1]!, 10) : 0,
    failed: failedMatch ? parseInt(failedMatch[1]!, 10) : 0,
  };
}

export function checkRegression(
  prev: TestSummary | null,
  current: TestSummary,
): { type: "REGRESSION"; message: string } | null {
  if (!prev) return null;
  if (current.failed > prev.failed) {
    return {
      type: "REGRESSION",
      message: `Test failures increased: ${prev.failed} → ${current.failed}`,
    };
  }
  return null;
}
