import type { Failure } from "../failure/types.js";
import type { Strategy } from "../strategy/types.js";
import type { ExecutionResult } from "../types.js";

export type RunState = "INIT" | "RUNNING" | "RETRYING" | "ACCEPTED" | "ESCALATED";

export type Step = {
  iteration: number;
  result: ExecutionResult;
  failure?: Failure;
  strategy?: Strategy;
  decision: "accept" | "retry" | "reject" | "escalate";
  timestamp: number;
};

export type Run = {
  id: string;
  state: RunState;
  iteration: number;
  lastFailure?: Failure;
  history: Step[];
};
