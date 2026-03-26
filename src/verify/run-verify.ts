import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { VerifySpec } from "./verify-spec.js";
import type { VerifyResult } from "../types.js";

export function runVerify(spec: VerifySpec, workspaceDir: string): VerifyResult {
  switch (spec.type) {
    case "command": {
      const [cmd, ...args] = spec.command.split(" ");
      let logs = "";
      let exitCode = 0;
      try {
        logs = execFileSync(cmd!, args, { cwd: workspaceDir, encoding: "utf8", timeout: 30_000 });
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        logs = (err.stdout ?? "") + (err.stderr ?? "");
        exitCode = err.status ?? 1;
      }
      const pass = exitCode === (spec.pass.exitCode ?? 0);
      return { pass, logs, exitCode };
    }

    case "file_exists": {
      const fullPath = path.isAbsolute(spec.path) ? spec.path : path.join(workspaceDir, spec.path);
      const pass = fs.existsSync(fullPath);
      return { pass, logs: `file_exists: ${spec.path} = ${pass}`, exitCode: pass ? 0 : 1 };
    }

    case "text_match": {
      const fullPath = path.isAbsolute(spec.path) ? spec.path : path.join(workspaceDir, spec.path);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const pass = content.includes(spec.contains);
        return { pass, logs: `text_match in ${spec.path}: ${pass}`, exitCode: pass ? 0 : 1 };
      } catch {
        return { pass: false, logs: `text_match: file not found: ${spec.path}`, exitCode: 1 };
      }
    }

    case "json_schema": {
      const fullPath = path.isAbsolute(spec.path) ? spec.path : path.join(workspaceDir, spec.path);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as unknown;
        const pass = typeof data === "object" && data !== null;
        return { pass, logs: `json_schema: ${spec.path} valid=${pass}`, exitCode: pass ? 0 : 1 };
      } catch (e) {
        return { pass: false, logs: `json_schema: parse error: ${(e as Error).message}`, exitCode: 1 };
      }
    }

    case "all": {
      for (const check of spec.checks) {
        const result = runVerify(check, workspaceDir);
        if (!result.pass) return result;
      }
      return { pass: true, logs: "all checks passed", exitCode: 0 };
    }

    case "any": {
      const results: VerifyResult[] = [];
      for (const check of spec.checks) {
        const result = runVerify(check, workspaceDir);
        if (result.pass) return result;
        results.push(result);
      }
      return { pass: false, logs: results.map(r => r.logs).join("; "), exitCode: 1 };
    }

    default:
      throw new Error(`Unknown verify type: ${(spec as { type: string }).type}`);
  }
}
