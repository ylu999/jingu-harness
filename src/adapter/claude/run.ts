import type { TaskSpec, ExecutionResult } from "../../types.js";
import type { ClaudeAdapterOptions } from "./types.js";

/**
 * Mock agent — always "fixes" by reporting a changed file.
 * Replace with real ClaudeCliExecutor in p146.
 */
export async function runClaudeAgent(
  task: TaskSpec,
  _workspaceDir: string,
  _opts: ClaudeAdapterOptions = {},
): Promise<ExecutionResult> {
  console.log(`[mock-agent] task: ${task.goal}`);
  return {
    patch: "--- a/src/placeholder.js\n+++ b/src/placeholder.js\n@@ -1 +1 @@\n-old\n+new",
    changedFiles: ["src/placeholder.js"],
    logs: "mock agent ran",
    exitCode: 0,
  };
}
