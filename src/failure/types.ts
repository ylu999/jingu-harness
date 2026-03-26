export type VerifyFailure = {
  type: "VERIFY_FAIL";
  logs: string;
  exitCode: number;
};

export type InvariantFailure =
  | { type: "SCOPE_VIOLATION"; file: string }
  | { type: "NO_OP" }
  | { type: "REGRESSION"; message: string };

export type Failure = VerifyFailure | InvariantFailure;
