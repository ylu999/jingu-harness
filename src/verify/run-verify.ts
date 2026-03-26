import { execFileSync } from "node:child_process";
import type { TaskSpec, VerifyResult } from "../types.js";

export function runVerify(task: TaskSpec, workspaceDir: string): VerifyResult {
  const [cmd, ...args] = task.verify.command.split(" ");
  let logs = "";
  let exitCode = 0;

  try {
    const out = execFileSync(cmd!, args, {
      cwd: workspaceDir,
      encoding: "utf8",
      timeout: 30_000,
    });
    logs = out;
    exitCode = 0;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    logs = (err.stdout ?? "") + (err.stderr ?? "");
    exitCode = err.status ?? 1;
  }

  const pass =
    task.verify.passCondition.type === "exit_code"
      ? exitCode === task.verify.passCondition.equals
      : false;

  return { pass, logs, exitCode };
}
