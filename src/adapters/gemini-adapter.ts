import type { ContextAdapter } from "./context-adapter.js";
import type { VerifiedContext, VerifiedBlock } from "../types/renderer.js";

/**
 * Gemini API content part — text part within a Content object.
 * Ref: https://ai.google.dev/api/generate-content#v1beta.Content
 */
export type GeminiTextPart = {
  text: string;
};

/**
 * Gemini API Content object (one turn in the conversation).
 */
export type GeminiContent = {
  role: "user" | "model" | "function";
  parts: GeminiTextPart[];
};

export type GeminiAdapterOptions = {
  /**
   * Role to assign to the injected content message.
   * "user"     — inject as a user turn before the actual query (most common).
   * "function" — inject as a function response (when RAG is a function call).
   *
   * Default: "user"
   */
  role?: "user" | "function";

  /**
   * Separator between blocks. Default: "\n\n---\n\n"
   */
  blockSeparator?: string;
};

/**
 * Converts VerifiedContext → Gemini API Content object.
 *
 * Gemini uses Content[] for conversation history. Inject the returned
 * Content into the contents array before the user's actual question.
 *
 * Usage:
 *   const adapter = new GeminiContextAdapter();
 *   const content = adapter.adapt(verifiedCtx);
 *
 *   const result = await model.generateContent({
 *     contents: [
 *       content,           // verified context injected here
 *       { role: "user", parts: [{ text: userQuery }] },
 *     ],
 *   });
 */
export class GeminiContextAdapter implements ContextAdapter<GeminiContent> {
  private readonly role: "user" | "function";
  private readonly blockSeparator: string;

  constructor(options: GeminiAdapterOptions = {}) {
    this.role = options.role ?? "user";
    this.blockSeparator = options.blockSeparator ?? "\n\n---\n\n";
  }

  adapt(context: VerifiedContext): GeminiContent {
    const parts = context.admittedBlocks.map((block) => ({
      text: this.blockToText(block),
    }));

    // If no blocks, emit a minimal placeholder so Gemini doesn't receive empty parts
    if (parts.length === 0) {
      return {
        role: this.role,
        parts: [{ text: "[No verified context available]" }],
      };
    }

    // One part per block keeps Gemini's grounding granular
    return { role: this.role, parts };
  }

  private blockToText(block: VerifiedBlock): string {
    const lines: string[] = [`[${block.sourceId}] ${block.content}`];

    if (block.grade) {
      lines.push(`Evidence grade: ${block.grade}`);
    }
    if (block.unsupportedAttributes && block.unsupportedAttributes.length > 0) {
      lines.push(`Not supported by evidence: ${block.unsupportedAttributes.join(", ")}`);
    }
    if (block.conflictNote) {
      lines.push(`Conflict: ${block.conflictNote}`);
    }

    return lines.join("\n");
  }
}
