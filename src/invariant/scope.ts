import type { ExecutionResult, TaskSpec } from "../types.js";

export function checkScope(result: ExecutionResult, task: TaskSpec): void {
  for (const file of result.changedFiles) {
    const allowed = task.allowedFiles.some((pattern) => {
      const base = pattern.replace(/\/\*\*$/, "").replace(/\/\*$/, "");
      return file.startsWith(base);
    });
    if (!allowed) {
      throw new Error(`Scope violation: ${file} is not in allowedFiles`);
    }
  }
}
