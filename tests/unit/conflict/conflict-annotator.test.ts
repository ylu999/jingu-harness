import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  surfaceConflicts,
  groupConflictsByCode,
  hasConflicts,
} from "../../../src/conflict/conflict-annotator.js";
import type { AdmittedUnit } from "../../../src/types/admission.js";
import type { ConflictAnnotation } from "../../../src/types/gate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnit(
  unitId: string,
  status: AdmittedUnit<string>["status"]
): AdmittedUnit<string> {
  return {
    unit: unitId,
    unitId,
    status,
    appliedGrades: [],
    evaluationResults: [],
    supportIds: [],
  };
}

function makeAnnotation(
  unitIds: string[],
  conflictCode: string,
  sources: string[],
  description?: string,
  severity: ConflictAnnotation["severity"] = "informational"
): ConflictAnnotation {
  return { unitIds, conflictCode, sources, severity, description };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("surfaceConflicts", () => {
  it("no conflict units → returns empty array", () => {
    const units = [makeUnit("u1", "approved"), makeUnit("u2", "rejected")];
    const annotations: ConflictAnnotation[] = [];
    const result = surfaceConflicts(units, annotations);
    assert.deepEqual(result, []);
  });

  it("one approved_with_conflict unit → returns one ConflictSurface", () => {
    const units = [makeUnit("u1", "approved_with_conflict")];
    const annotations = [
      makeAnnotation(["u1"], "TEMPORAL_CONFLICT", ["s1", "s2"], "time overlap"),
    ];
    const result = surfaceConflicts(units, annotations);
    assert.equal(result.length, 1);
    assert.equal(result[0].unitId, "u1");
    assert.equal(result[0].status, "approved_with_conflict");
    assert.equal(result[0].conflictCode, "TEMPORAL_CONFLICT");
    assert.deepEqual(result[0].conflictingSupportIds, ["s1", "s2"]);
    assert.equal(result[0].description, "time overlap");
  });

  it("approved and rejected units are excluded from result", () => {
    const units = [
      makeUnit("u1", "approved"),
      makeUnit("u2", "rejected"),
      makeUnit("u3", "downgraded"),
    ];
    const annotations = [
      makeAnnotation(["u1", "u2", "u3"], "ATTR_CONFLICT", ["s1"]),
    ];
    const result = surfaceConflicts(units, annotations);
    assert.deepEqual(result, []);
  });

  it("multiple units with conflicts → all appear in result", () => {
    const units = [
      makeUnit("u1", "approved_with_conflict"),
      makeUnit("u2", "approved_with_conflict"),
      makeUnit("u3", "approved"),
    ];
    const annotations = [
      makeAnnotation(["u1", "u2"], "TEMPORAL_CONFLICT", ["s1"]),
    ];
    const result = surfaceConflicts(units, annotations);
    assert.equal(result.length, 2);
    const ids = result.map((r) => r.unitId);
    assert.ok(ids.includes("u1"));
    assert.ok(ids.includes("u2"));
  });

  it("unit with approved_with_conflict but not in any annotation → excluded (edge case)", () => {
    const units = [makeUnit("u99", "approved_with_conflict")];
    const annotations = [
      makeAnnotation(["u1", "u2"], "TEMPORAL_CONFLICT", ["s1"]),
    ];
    const result = surfaceConflicts(units, annotations);
    assert.deepEqual(result, []);
  });
});

describe("groupConflictsByCode", () => {
  it("groups annotations correctly by conflictCode", () => {
    const annotations = [
      makeAnnotation(["u1"], "TEMPORAL_CONFLICT", ["s1"]),
      makeAnnotation(["u2"], "ATTR_CONFLICT", ["s2"]),
      makeAnnotation(["u3"], "TEMPORAL_CONFLICT", ["s3"]),
    ];
    const groups = groupConflictsByCode(annotations);
    assert.equal(groups["TEMPORAL_CONFLICT"].length, 2);
    assert.equal(groups["ATTR_CONFLICT"].length, 1);
  });

  it("empty annotations → returns empty object", () => {
    const groups = groupConflictsByCode([]);
    assert.deepEqual(groups, {});
  });
});

describe("hasConflicts", () => {
  it("empty array → false", () => {
    assert.equal(hasConflicts([]), false);
  });

  it("non-empty array → true", () => {
    const annotations = [
      makeAnnotation(["u1"], "TEMPORAL_CONFLICT", ["s1"]),
    ];
    assert.equal(hasConflicts(annotations), true);
  });
});

describe("ConflictAnnotation.description propagation", () => {
  it("description field is passed through to ConflictSurface", () => {
    const units = [makeUnit("u1", "approved_with_conflict")];
    const annotations = [
      makeAnnotation(["u1"], "ATTR_CONFLICT", ["s1"], "attribute mismatch on field X"),
    ];
    const result = surfaceConflicts(units, annotations);
    assert.equal(result[0].description, "attribute mismatch on field X");
  });

  it("undefined description is preserved as undefined", () => {
    const units = [makeUnit("u1", "approved_with_conflict")];
    const annotations = [makeAnnotation(["u1"], "ATTR_CONFLICT", ["s1"])];
    const result = surfaceConflicts(units, annotations);
    assert.equal(result[0].description, undefined);
  });
});
