import Anthropic from "@anthropic-ai/sdk";
import { loadMemories, saveMemory, searchMemories } from "./memory";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const tools: Anthropic.Tool[] = [
  {
    name: "remember",
    description:
      "Save a fact, deadline, or commitment worth remembering long-term (e.g. an exam date, a preference, a task, something found in an email). Call this whenever something is worth remembering across future conversations.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The fact to remember, written as a short, self-contained sentence.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "recall",
    description:
      "Search previously saved memories for anything relevant to the current message. Call this whenever the user's question might depend on something they told you before (dates, preferences, commitments, anything from a past conversation or email).",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords describing what to search for, e.g. 'driving course' or 'dentist appointment'.",
        },
      },
      required: ["query"],
    },
  },
];

async function executeTool(name: string, input: unknown): Promise<string> {
  if (name === "remember") {
    const { content } = input as { content: string };
    const ok = await saveMemory(content);
    return ok ? "Saved." : "Failed to save that.";
  }
  if (name === "recall") {
    const { query } = input as { query: string };
    const matches = await searchMemories(query);
    return matches.length > 0
      ? matches.map((m) => `- ${m}`).join("\n")
      : "No matching memories found.";
  }
  return "Unknown tool.";
}

const MAX_TOOL_ITERATIONS = 20;

type RunOptions = {
  /**
   * Load every saved memory into the system prompt up front, instead of
   * relying on the recall tool. Costs more tokens as memory grows, but
   * useful when the caller needs full visibility (e.g. email sync checking
   * for duplicates across many items at once).
   */
  includeAllMemories?: boolean;
};

/**
 * Runs a message (or conversation) through Claude with the remember/recall
 * tools available, looping until Claude gives a final text reply. Used by
 * both the chat endpoint and the email sync endpoint.
 */
export async function runWithMemory(
  systemPrompt: string,
  initialMessages: Anthropic.MessageParam[],
  options: RunOptions = {}
): Promise<string> {
  const memoryContext = options.includeAllMemories
    ? await buildFullMemoryContext()
    : "You don't have any facts loaded up front — call the recall tool to search saved memories whenever the user's message might depend on something you were told before.";

  const messages = [...initialMessages];
  let finalReply = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: `${systemPrompt}\n\n${memoryContext}`,
          // Static per-route (chat's system+memory text never changes, sync's
          // stays fixed for the duration of one sync's tool loop) — caching
          // it cuts repeat-turn cost to ~10%, or ~2.5% within the 1h window.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      tools,
      messages,
    });

    console.log(
      "[USAGE] " +
        JSON.stringify({
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
          cache_write: response.usage.cache_creation_input_tokens,
          cache_read: response.usage.cache_read_input_tokens,
        })
    );

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      finalReply = textBlock?.text ?? "";
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return finalReply;
}

async function buildFullMemoryContext(): Promise<string> {
  const memories = await loadMemories();
  return memories.length > 0
    ? `Known facts, remembered from past conversations and emails:\n${memories
        .map((m) => `- ${m}`)
        .join("\n")}`
    : "No facts have been remembered yet.";
}
