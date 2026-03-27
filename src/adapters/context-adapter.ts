import type { VerifiedContext } from "../types/renderer.js";

/**
 * ContextAdapter — converts VerifiedContext into the wire format
 * expected by a specific LLM API.
 *
 * harness.render() always outputs VerifiedContext (abstract semantic structure).
 * Adapter serializes that into whatever the target API needs.
 *
 * TOutput is the type accepted by the target LLM API client.
 */
export interface ContextAdapter<TOutput> {
  adapt(context: VerifiedContext): TOutput;
}
