export type { VerifySpec } from "./verify/verify-spec.js";

export type TaskSpec = {
  id: string;
  goal: string;
  allowedFiles: string[];
  verify: import("./verify/verify-spec.js").VerifySpec;
  maxRetries?: number;
};

export type ExecutionResult = {
  patch: string;
  changedFiles: string[];
  logs: string;
  exitCode: number;
};

export type VerifyResult = {
  pass: boolean;
  logs: string;
  exitCode: number;
};

export type Decision = "accept" | "reject" | "retry";
