import fs from "node:fs";
import path from "node:path";
import type { EvidenceEntry } from "./types.js";

export function writeEvidence(entry: EvidenceEntry, outputDir: string = ".jingu"): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(path.join(outputDir, "evidence.jsonl"), line, "utf-8");
}
