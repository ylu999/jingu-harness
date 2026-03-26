import fs from "node:fs";
import type { Run } from "../src/runtime/state.js";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node dist/cli/replay.js <path-to-run.json>");
    process.exit(1);
  }

  const run = JSON.parse(fs.readFileSync(file, "utf-8")) as Run;

  console.log(`Run ID: ${run.id}`);
  console.log(`Final state: ${run.state}`);
  console.log(`Iterations: ${run.history.length}\n`);

  for (const step of run.history) {
    console.log(`--- Iteration ${step.iteration} ---`);
    console.log(`  decision : ${step.decision}`);
    if (step.failure) {
      console.log(`  failure  : ${step.failure.type}`);
    }
    if (step.strategy) {
      console.log(`  strategy : ${step.strategy.action}`);
    }
    console.log(`  logs     : ${step.result.logs.slice(0, 200)}`);
    console.log();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
