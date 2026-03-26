export type Strategy =
  | { action: "retry"; feedback: string }
  | { action: "retry_with_constraints"; feedback: string }
  | { action: "rollback_and_retry"; feedback: string }
  | { action: "escalate"; reason: string };
