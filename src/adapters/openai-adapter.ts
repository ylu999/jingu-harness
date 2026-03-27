import type { ContextAdapter } from "./context-adapter.js";
import type { VerifiedContext, VerifiedBlock } from "../types/renderer.js";

/**
 * OpenAI chat message — tool role for tool_call results,
 * or user role for injected context.
 * Ref: https://platform.openai.com/docs/api-reference/chat/create
 */
export type OpenAIChatMessage = {
  role: "tool" | "user";
  content: string;
  tool_call_id?: string; // required when role === "tool"
};

export type OpenAIAdapterOptions = {
  /**
   * How to inject verified context into the conversation.
   *
   * "tool"  — wrap blocks as a tool result message (requires tool_call_id).
   *            Use this when your RAG lookup is modelled as a tool call.
   * "user"  — inject as a user-role message before the actual user query.
   *            Use this for pre-fetched context or when no tool loop is in use.
   *
   * Default: "user"
   */
  mode?: "tool" | "user";

  /** Required when mode === "tool". Must match the tool_use id from assistant. */
  toolCallId?: string;

  /**
   * Separator between blocks in the final string.
   * Default: "\n\n---\n\n"
   */
  blockSeparator?: string;
};

/**
 * Converts VerifiedContext → OpenAI chat message.
 *
 * OpenAI does not have a native search_result block type; verified content
 * is serialised as plain text with semantic caveats inline.
 *
 * Usage (tool mode):
 *   const adapter = new OpenAIContextAdapter({ mode: "tool", toolCallId: call.id });
 *   const msg = adapter.adapt(verifiedCtx);
 *   messages.push(msg);
 *
 * Usage (user mode):
 *   const adapter = new OpenAIContextAdapter({ mode: "user" });
 *   const msg = adapter.adapt(verifiedCtx);
 *   messages.push(msg);        // inject before user query
 *   messages.push(userQuery);
 */
export class OpenAIContextAdapter implements ContextAdapter<OpenAIChatMessage> {
  private readonly mode: "tool" | "user";
  private readonly toolCallId: string | undefined;
  private readonly blockSeparator: string;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.mode = options.mode ?? "user";
    this.toolCallId = options.toolCallId;
    this.blockSeparator = options.blockSeparator ?? "\n\n---\n\n";
  }

  adapt(context: VerifiedContext): OpenAIChatMessage {
    const parts = context.admittedBlocks.map((block) =>
      this.blockToText(block)
    );
    const content = parts.join(this.blockSeparator);

    if (this.mode === "tool") {
      return {
        role: "tool",
        tool_call_id: this.toolCallId ?? "",
        content,
      };
    }

    return { role: "user", content };
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
