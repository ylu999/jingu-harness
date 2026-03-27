import type { ContextAdapter } from "./context-adapter.js";
import type { VerifiedContext, VerifiedBlock } from "../types/renderer.js";

/**
 * Claude API search_result block shape.
 * Matches Anthropic SDK SearchResultBlockParam.
 * Ref: https://platform.claude.com/docs/en/docs/build-with-claude/search-results
 */
export type ClaudeSearchResultBlock = {
  type: "search_result";
  source: string;       // sourceId used as identifier
  title: string;
  content: Array<{ type: "text"; text: string }>;
  citations?: { enabled: boolean };
};

export type ClaudeAdapterOptions = {
  /**
   * Whether to enable Claude's citation feature on each block.
   * Default: true. Set false to disable citations for all blocks.
   * Note: Claude API requires citations to be all-or-nothing across a request.
   */
  citations?: boolean;

  /**
   * Prefix for the source identifier. Default: none.
   * e.g. "harness:" → source becomes "harness:claim-1"
   */
  sourcePrefix?: string;
};

/**
 * Converts VerifiedContext → Claude API search_result blocks.
 *
 * Usage:
 *   const adapter = new ClaudeContextAdapter();
 *   const blocks = adapter.adapt(verifiedCtx);
 *   // Pass blocks as tool_result content or top-level user message content
 *
 * Each admitted block becomes one search_result block.
 * Downgraded grade and conflict notes are appended to the text content
 * so Claude sees them as contextual caveats.
 */
export class ClaudeContextAdapter implements ContextAdapter<ClaudeSearchResultBlock[]> {
  private readonly citations: boolean;
  private readonly sourcePrefix: string;

  constructor(options: ClaudeAdapterOptions = {}) {
    this.citations = options.citations ?? true;
    this.sourcePrefix = options.sourcePrefix ?? "";
  }

  adapt(context: VerifiedContext): ClaudeSearchResultBlock[] {
    return context.admittedBlocks.map((block) => this.blockToSearchResult(block));
  }

  private blockToSearchResult(block: VerifiedBlock): ClaudeSearchResultBlock {
    const textParts: string[] = [block.content];

    // Append grade caveat so Claude adjusts confidence accordingly
    if (block.grade) {
      textParts.push(`[Evidence grade: ${block.grade}]`);
    }

    // Append unsupported attributes so Claude avoids asserting them
    if (block.unsupportedAttributes && block.unsupportedAttributes.length > 0) {
      textParts.push(
        `[Not supported by evidence: ${block.unsupportedAttributes.join(", ")}]`
      );
    }

    // Append conflict note so Claude surfaces the contradiction to the user
    if (block.conflictNote) {
      textParts.push(`[Conflict: ${block.conflictNote}]`);
    }

    return {
      type: "search_result",
      source: `${this.sourcePrefix}${block.sourceId}`,
      title: block.sourceId,
      content: [{ type: "text", text: textParts.join("\n") }],
      citations: { enabled: this.citations },
    };
  }
}
