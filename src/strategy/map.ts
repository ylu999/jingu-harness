import type { Failure } from "../failure/types.js";
import type { Strategy } from "./types.js";

export function mapFailureToStrategy(failure: Failure): Strategy {
  switch (failure.type) {
    case "VERIFY_FAIL":
      return {
        action: "retry",
        feedback: `Verification failed (exit ${failure.exitCode}):\n\n${failure.logs}\n\nFix the issue and try again.`,
      };
    case "SCOPE_VIOLATION":
      return {
        action: "retry_with_constraints",
        feedback: `You modified a forbidden file: ${failure.file}\n\nOnly modify files matching the allowedFiles patterns.\nUndo changes to that file and fix correctly.`,
      };
    case "NO_OP":
      return {
        action: "retry",
        feedback: `You did not make any changes.\n\nYou must modify the code to solve the problem.`,
      };
    case "REGRESSION":
      return {
        action: "rollback_and_retry",
        feedback: `Your changes introduced regressions.\n\n${failure.message}\n\nFix without breaking existing tests.`,
      };
    case "SEMANTIC_FAIL" as string:
      return {
        action: "retry",
        feedback: `Semantic validation failed.\n\nFix the output so it meets the requirements.`,
      };
    default:
      return {
        action: "escalate",
        reason: `Unknown failure type: ${(failure as { type: string }).type}`,
      };
  }
}
