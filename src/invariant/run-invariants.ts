import type { ExecutionResult, TaskSpec } from "../types.js";
import { checkScope } from "./scope.js";
import { checkNoOp } from "./no-op.js";

export function runInvariants(result: ExecutionResult, task: TaskSpec): void {
  checkScope(result, task);
  checkNoOp(result);
}
