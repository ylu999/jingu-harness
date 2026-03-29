import type { RPPRecord, RPPFailure } from "@jingu/policy-core"
import { validateRPP } from "@jingu/policy-core"

export type RPPGateResult = {
  allow: boolean
  rpp_status: "valid" | "weakly_supported" | "invalid" | "missing"
  failures: RPPFailure[]
  warnings: RPPFailure[]
}

export function runRPPGate(record: RPPRecord | null | undefined): RPPGateResult {
  if (record == null) {
    return {
      allow: false,
      rpp_status: "missing",
      failures: [{
        code: "MISSING_STAGE",
        detail: "No RPP record provided — output must include a ```json rpp block"
      }],
      warnings: [],
    }
  }
  const result = validateRPP(record)
  return {
    allow: result.overall_status !== "invalid",
    rpp_status: result.overall_status,
    failures: result.failures,
    warnings: result.warnings,
  }
}
