import type { VerifyResult, Decision } from "../types.js";

export function decide(verify: VerifyResult): Decision {
  return verify.pass ? "accept" : "retry";
}
