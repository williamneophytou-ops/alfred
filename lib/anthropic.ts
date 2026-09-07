import Anthropic from "@anthropic-ai/sdk";
import { loadMemories, saveMemory, searchMemories } from "./memory";
import { addTask, listActiveTasks, type NewTask } from "./tasks";

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
  {
    name: "add_task",
    description:
      "Add a task, event, deadline, or recurring commitment — anything the user needs to actually DO, whether or not it has a specific date/time attached (leave due_at null if there's no date). This is what powers both Daily Planning and the Tasks list, so use it for any actionable to-do, not just date-bound ones. Use `remember` instead only for passive facts/preferences with nothing to act on (e.g. 'my favorite team is Arsenal').",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short name of the task/event, e.g. 'Driving course' or 'Finish maths homework'.",
        },
        description: {
          type: ["string", "null"],
          description: "Optional extra detail, or null if none.",
        },
        due_at: {
          type: ["string", "null"],
          description:
            "ISO 8601 date-time when it's due or happening, e.g. '2026-09-09T08:30:00'. Null if there's no specific date.",
        },
        priority: {
          type: "string",
          enum: ["urgent", "normal"],
          description: "Mark 'urgent' only if the user explicitly signals this matters more than usual.",
        },
        type: {
          type: "string",
          enum: ["task", "event", "deadline", "recurring"],
        },
      },
      required: ["title", "description", "due_at", "priority", "type"],
      additionalProperties: false,
    },
  },
];

async function executeTool(name: string, input: unknown, source: string): Promise<string> {
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
  if (name === "add_task") {
    const task = input as NewTask;
    const ok = await addTask({ ...task, source });
    return ok ? "Task added." : "Failed to add that task.";
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
  /** Tag for anything add_task creates during this run — e.g. "chat" or "email". */
  taskSource?: string;
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
    : await buildLeanContext();

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
      const result = await executeTool(block.name, block.input, options.taskSource ?? "chat");
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

/**
 * Default context for chat: no general facts pre-loaded (use recall for
 * those), but active tasks ARE always included — that list stays naturally
 * small (done tasks drop off it), so it's cheap, and it's what stops chat
 * from creating duplicate tasks when something already tracked comes up
 * again in conversation.
 */
async function buildLeanContext(): Promise<string> {
  const tasks = await listActiveTasks();
  const taskPart =
    tasks.length > 0
      ? `Currently tracked tasks/events (don't call add_task again for these — only for genuinely new items):\n${tasks
          .map((t) => `- ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`)
          .join("\n")}`
      : "No tasks/events tracked yet.";

  return (
    "You don't have general facts loaded up front — call the recall tool to search saved " +
    `memories whenever the user's message might depend on something you were told before.\n\n${taskPart}`
  );
}

async function buildFullMemoryContext(): Promise<string> {
  const [memories, tasks] = await Promise.all([loadMemories(), listActiveTasks()]);

  const memoryPart =
    memories.length > 0
      ? `Known facts, remembered from past conversations and emails:\n${memories
          .map((m) => `- ${m}`)
          .join("\n")}`
      : "No facts have been remembered yet.";

  const taskPart =
    tasks.length > 0
      ? `Existing tasks/events already tracked (don't re-add these — call add_task only for genuinely new items):\n${tasks
          .map((t) => `- ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`)
          .join("\n")}`
      : "No tasks/events tracked yet.";

  return `${memoryPart}\n\n${taskPart}`;
}
