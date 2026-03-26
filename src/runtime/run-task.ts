import os from "node:os";
import type { TaskSpec } from "../types.js";
import type { RunTaskOptions } from "./types.js";
import { runClaudeAgent } from "../adapter/claude/run.js";
import { runVerify } from "../verify/run-verify.js";
import { runInvariants } from "../invariant/run-invariants.js";
import { parseTestSummary, checkRegression } from "../invariant/regression.js";
import type { TestSummary } from "../invariant/regression.js";
import { mapFailureToStrategy } from "../strategy/map.js";
import type { Strategy } from "../strategy/types.js";
import { writeEvidence } from "../evidence/write.js";

export async function runTask(
  task: TaskSpec,
  opts: RunTaskOptions,
): Promise<void> {
  const maxRetries = opts.maxRetries ?? task.maxRetries ?? 3;
  // The agent works inside agentWorkspaceDir; verification runs in workspaceDir.
  const agentDir = opts.agentWorkspaceDir ?? opts.workspaceDir ?? os.tmpdir();
  let strategy: Strategy | undefined;
  let prevTestSummary: TestSummary | null = null;

  for (let i = 0; i < maxRetries; i++) {
    console.log(`\n--- Iteration ${i + 1} / ${maxRetries} ---`);

    const result = await runClaudeAgent(task, agentDir, { strategy });

    const invariantFailures = runInvariants(result, task);
    if (invariantFailures.length > 0) {
      const failure = invariantFailures[0]!;
      console.error("Invariant failed:", failure.type);
      strategy = mapFailureToStrategy(failure);
      console.log(`failure: ${failure.type} → strategy: ${strategy.action}`);

      if (strategy.action === "escalate") {
        writeEvidence(
          {
            taskId: task.id,
            iteration: i + 1,
            verifyPass: false,
            verifyExitCode: -1,
            decision: "escalate",
            changedFiles: result.changedFiles,
            timestamp: Date.now(),
            failureType: failure.type,
            strategyAction: strategy.action,
          },
          opts.evidenceDir,
        );
        throw new Error(`Task ${task.id} escalated: ${strategy.reason}`);
      }

      if (strategy.action === "rollback_and_retry") {
        console.log("rollback not yet implemented, retrying");
      }

      writeEvidence(
        {
          taskId: task.id,
          iteration: i + 1,
          verifyPass: false,
          verifyExitCode: -1,
          decision: "reject",
          changedFiles: result.changedFiles,
          timestamp: Date.now(),
          failureType: failure.type,
          strategyAction: strategy.action,
        },
        opts.evidenceDir,
      );
      continue;
    }

    const vf = await runVerify(task.verify, opts.workspaceDir);

    if (vf !== null) {
      const summary = parseTestSummary(vf.logs);
      const regFailure = checkRegression(prevTestSummary, summary);
      prevTestSummary = summary;

      if (regFailure) {
        console.error("Regression detected:", regFailure.message);
        strategy = mapFailureToStrategy(regFailure);
        console.log(`failure: ${regFailure.type} → strategy: ${strategy.action}`);

        if (strategy.action === "escalate") {
          writeEvidence(
            {
              taskId: task.id,
              iteration: i + 1,
              verifyPass: false,
              verifyExitCode: -1,
              decision: "escalate",
              changedFiles: result.changedFiles,
              timestamp: Date.now(),
              failureType: "REGRESSION",
              strategyAction: strategy.action,
            },
            opts.evidenceDir,
          );
          throw new Error(`Task ${task.id} escalated: ${strategy.reason}`);
        }

        if (strategy.action === "rollback_and_retry") {
          console.log("rollback not yet implemented, retrying");
        }

        writeEvidence(
          {
            taskId: task.id,
            iteration: i + 1,
            verifyPass: false,
            verifyExitCode: -1,
            decision: "reject",
            changedFiles: result.changedFiles,
            timestamp: Date.now(),
            failureType: "REGRESSION",
            strategyAction: strategy.action,
          },
          opts.evidenceDir,
        );
        continue;
      }

      strategy = mapFailureToStrategy(vf);
      console.log(`failure: ${vf.type} → strategy: ${strategy.action}`);
    } else {
      strategy = undefined;
      prevTestSummary = null;
    }

    writeEvidence(
      {
        taskId: task.id,
        iteration: i + 1,
        verifyPass: vf === null,
        verifyExitCode: vf?.exitCode ?? 0,
        decision: vf === null ? "accept" : "retry",
        changedFiles: result.changedFiles,
        timestamp: Date.now(),
        failureType: vf?.type,
        strategyAction: strategy?.action,
      },
      opts.evidenceDir,
    );

    console.log(`verify: ${vf === null ? "PASS" : "FAIL"} (exit ${vf?.exitCode ?? 0})`);
    console.log(`decision: ${vf === null ? "accept" : "retry"}`);

    if (vf === null) {
      console.log("Task accepted.");
      return;
    }
  }

  throw new Error(`Task ${task.id} failed after ${maxRetries} retries`);
}
