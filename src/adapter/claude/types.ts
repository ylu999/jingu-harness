export type ClaudeAdapterOptions = {
  timeoutMs?: number;
  strategyHint?: string;
  /** Verify failure logs from the previous iteration, fed back to the agent. */
  feedback?: string;
  /** Set true to use the real Claude CLI instead of the mock. */
  real?: boolean;
};
