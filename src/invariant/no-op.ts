import type { ExecutionResult } from "../types.js";

export function checkNoOp(result: ExecutionResult): void {
  if (result.changedFiles.length === 0) {
    throw new Error("NO_OP: agent made no changes");
  }
}
