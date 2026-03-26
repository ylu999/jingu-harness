import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runVerify } from "../../src/verify/run-verify.js";
import type { JsonSchemaVerify } from "../../src/verify/verify-spec.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jingu-harness-test-"));
}

describe("runVerify – json_schema", () => {
  const schema: JsonSchemaVerify["schema"] = {
    type: "object",
    required: ["name", "status"],
    properties: {
      name: { type: "string" },
      status: { type: "string", enum: ["active", "inactive"] },
      score: { type: "number", minimum: 0, maximum: 100 },
    },
    additionalProperties: false,
  };

  it("test A: valid object → returns null", async () => {
    const dir = makeTmpDir();
    try {
      const filePath = path.join(dir, "data.json");
      fs.writeFileSync(filePath, JSON.stringify({ name: "alice", status: "active", score: 42 }));
      const spec: JsonSchemaVerify = { type: "json_schema", path: "data.json", schema };
      const result = await runVerify(spec, dir);
      assert.strictEqual(result, null);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("test B: missing required field → VERIFY_FAIL", async () => {
    const dir = makeTmpDir();
    try {
      const filePath = path.join(dir, "data.json");
      // missing "status"
      fs.writeFileSync(filePath, JSON.stringify({ name: "alice" }));
      const spec: JsonSchemaVerify = { type: "json_schema", path: "data.json", schema };
      const result = await runVerify(spec, dir);
      assert.ok(result !== null, "expected VERIFY_FAIL");
      assert.strictEqual(result.type, "VERIFY_FAIL");
      assert.ok(result.logs.includes("status"), `expected 'status' in error message, got: ${result.logs}`);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("test C: wrong enum value → VERIFY_FAIL", async () => {
    const dir = makeTmpDir();
    try {
      const filePath = path.join(dir, "data.json");
      fs.writeFileSync(filePath, JSON.stringify({ name: "alice", status: "unknown" }));
      const spec: JsonSchemaVerify = { type: "json_schema", path: "data.json", schema };
      const result = await runVerify(spec, dir);
      assert.ok(result !== null, "expected VERIFY_FAIL");
      assert.strictEqual(result.type, "VERIFY_FAIL");
      assert.strictEqual(result.exitCode, 1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("test D: number out of range → VERIFY_FAIL", async () => {
    const dir = makeTmpDir();
    try {
      const filePath = path.join(dir, "data.json");
      fs.writeFileSync(filePath, JSON.stringify({ name: "alice", status: "active", score: 150 }));
      const spec: JsonSchemaVerify = { type: "json_schema", path: "data.json", schema };
      const result = await runVerify(spec, dir);
      assert.ok(result !== null, "expected VERIFY_FAIL");
      assert.strictEqual(result.type, "VERIFY_FAIL");
      assert.strictEqual(result.exitCode, 1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
