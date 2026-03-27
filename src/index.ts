// Public API — implemented in later phases
// Types are re-exported here for consumer convenience
export type {
  Proposal,
  ProposalKind,
  SupportRef,
  UnitWithSupport,
  StructureValidationResult,
  UnitEvaluationResult,
  ConflictDetectionResult,
  ConflictAnnotation,
  GateResultLog,
  UnitStatus,
  AdmittedUnit,
  AdmissionResult,
  GradeOrdering,
  HarnessPolicy,
  RetryFeedback,
  RetryConfig,
  RetryContext,
  LLMInvoker,
  AuditEntry,
  AuditWriter,
  VerifiedBlock,
  VerifiedContext,
  RenderContext,
  HarnessExplanation,
} from "./types/index.js";

export { FileAuditWriter, createDefaultAuditWriter } from "./audit/audit-log.js";
export { buildAuditEntry } from "./audit/audit-entry.js";

export {
  surfaceConflicts,
  groupConflictsByCode,
  hasConflicts,
} from "./conflict/conflict-annotator.js";
export type { ConflictSurface } from "./conflict/conflict-annotator.js";

// Gate Engine
export { GateRunner } from "./gate/gate-runner.js";

// Renderer
export { BaseRenderer } from "./renderer/base-renderer.js";

// Public API
export { createHarness, explainResult } from "./harness.js";
export type { HarnessConfig, Harness } from "./harness.js";

// Retry Loop
export { runWithRetry } from "./retry/retry-loop.js";
export type { RetryLoopResult } from "./retry/retry-loop.js";
export {
  collectRetryableResults,
  needsRetry,
  buildDefaultRetryFeedback,
} from "./retry/retry-feedback.js";
