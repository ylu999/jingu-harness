export type CommandVerify = {
  type: "command";
  command: string;
  pass: { exitCode: number };
};

export type FileExistsVerify = {
  type: "file_exists";
  path: string;
};

export type TextMatchVerify = {
  type: "text_match";
  path: string;
  contains: string;
};

export type JsonSchemaVerify = {
  type: "json_schema";
  path: string;
  schema: Record<string, unknown>;
};

export type CompositeVerify = {
  type: "all" | "any";
  checks: VerifySpec[];
};

export type SemanticVerify = {
  type: "semantic";
  prompt: string;
  model?: string;
};

export type VerifySpec =
  | CommandVerify
  | FileExistsVerify
  | TextMatchVerify
  | JsonSchemaVerify
  | CompositeVerify
  | SemanticVerify;
