import type { Strategy } from "../../strategy/types.js";

export type ClaudeAdapterOptions = {
  timeoutMs?: number;
  strategyHint?: string;
  feedback?: string;       // keep for backward compat
  strategy?: Strategy;     // new: preferred over feedback
  /** Set true to use the real Claude CLI instead of the mock. */
  real?: boolean;
};
