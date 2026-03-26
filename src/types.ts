export type VerifyPassCondition =
  | { type: "exit_code"; equals: number };

export type VerifySpec = {
  type: "command";
  command: string;
  passCondition: VerifyPassCondition;
};

export type TaskSpec = {
  id: string;
  goal: string;
  allowedFiles: string[];
  verify: VerifySpec;
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
