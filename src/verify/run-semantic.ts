import Anthropic from "@anthropic-ai/sdk";
import type { SemanticVerify } from "./verify-spec.js";
import type { VerifyFailure } from "../failure/types.js";

export async function runSemanticVerify(
  spec: SemanticVerify,
  context: { output: string },
): Promise<VerifyFailure | null> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set — required for semantic verify");
  }

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: spec.model ?? "claude-haiku-4-5-20251001",
    max_tokens: 64,
    system: "You are a strict validator. Answer ONLY with the single word: true or false.",
    messages: [
      {
        role: "user",
        content: `${spec.prompt}\n\nOutput to evaluate:\n${context.output}`,
      },
    ],
  });

  const responseText = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .toLowerCase();

  const pass = responseText.startsWith("true");

  if (pass) return null;
  return { type: "VERIFY_FAIL", logs: `Semantic verify failed: ${responseText}`, exitCode: 1 };
}
