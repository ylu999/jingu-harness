import fs from "node:fs";
import path from "node:path";
import type { Run } from "../runtime/state.js";

export function persistRun(run: Run, outputDir: string = ".jingu"): void {
  const runsDir = path.join(outputDir, "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(
    path.join(runsDir, `${run.id}.json`),
    JSON.stringify(run, null, 2),
    "utf-8",
  );
}
