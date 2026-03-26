import type { Failure } from "../failure/types.js";

export function buildFeedback(failure: Failure): string {
  switch (failure.type) {
    case "VERIFY_FAIL":
      return `Tests/verification failed (exit ${failure.exitCode}):\n\n${failure.logs}\n\nFix the issue and try again.`;
    case "SCOPE_VIOLATION":
      return `You modified a forbidden file: ${failure.file}\n\nOnly modify files matching the allowedFiles patterns.\nFix your changes.`;
    case "NO_OP":
      return `You did not make any changes.\n\nYou must modify the code to solve the problem.`;
    case "REGRESSION":
      return `Your changes introduced regressions.\n\n${failure.message}\n\nFix without breaking existing tests.`;
    default:
      return "Fix the issue and try again.";
  }
}
