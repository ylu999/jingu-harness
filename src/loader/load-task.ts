import fs from "node:fs";
import type { TaskSpec } from "../types.js";

export function loadTask(filePath: string): TaskSpec {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as TaskSpec;
}
