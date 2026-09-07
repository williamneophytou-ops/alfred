import Anthropic from "@anthropic-ai/sdk";
import { loadMemories, saveMemory, searchMemories } from "./memory";
import {
  addTask,
  listActiveTasks,
  getTasksByIds,
  getTasksInRange,
  type NewTask,
} from "./tasks";
import { listCalendarEvents, createCalendarEvent } from "./calendar";
import { findOrCreatePerson, findPersonByName, addPersonNote, getPersonNotes } from "./people";

export type ComponentPayload =
  | {
      type: "task_list";
      data: {
        title: string;
        items: {
          id: string;
          title: string;
          due: string | null;
          status: string;
          priority: string;
        }[];
      };
    }
  | {
      type: "calendar";
      data: {
        title: string;
        range: { start: string; end: string };
        events: {
          id: string;
          title: string;
          start: string;
          end: string | null;
          type: string;
        }[];
      };
    };

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
  {
    name: "check_calendar",
    description:
      "Read the user's real Google Calendar for a date range — separate from add_task's internal tracking. Use this whenever the user asks what's actually on their calendar/schedule.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        range_start: { type: "string", description: "ISO 8601 date-time, start of the range." },
        range_end: { type: "string", description: "ISO 8601 date-time, end of the range." },
      },
      required: ["range_start", "range_end"],
      additionalProperties: false,
    },
  },
  {
    name: "add_calendar_event",
    description:
      "Create a real event directly on the user's Google Calendar — separate from add_task (which only tracks things internally for planning). Use this for genuine scheduled events with a specific time (appointments, meetings), in addition to add_task if it's also worth tracking as a task.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: ["string", "null"] },
        start: { type: "string", description: "ISO 8601 date-time the event starts." },
        end: { type: "string", description: "ISO 8601 date-time the event ends." },
        location: { type: ["string", "null"] },
      },
      required: ["title", "description", "start", "end", "location"],
      additionalProperties: false,
    },
  },
  {
    name: "remember_about_person",
    description:
      "Save a fact or note about a specific person — something they told you, something you talked " +
      "about with them, something that happened involving them. This builds an ongoing file per " +
      "person so their whole history can be recalled later, not just the current conversation. Use " +
      "plain `remember` instead for general facts that aren't tied to one specific person.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The person's name, as the user refers to them (e.g. 'Sarah', 'Dan from work').",
        },
        fact: {
          type: "string",
          description: "The note to save, written as a short self-contained sentence.",
        },
      },
      required: ["name", "fact"],
      additionalProperties: false,
    },
  },
  {
    name: "recall_person",
    description:
      "Look up everything on file for a specific person by name — every note saved about them from " +
      "past conversations and emails. Use this whenever the user asks about someone by name, or " +
      "knowing their history would help you respond.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The person's name to look up." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "show_component",
    description:
      "Display an interactive visual view in the chat instead of (or alongside) plain text — a task list or a calendar/timeline. Use this when a visual genuinely helps (e.g. 'what's on my plate', 'show my week') — not for ordinary conversation. Reference real tasks by id (from recall/add_task results or the tracked-tasks list) rather than inventing details — the actual current title/due date/status is looked up server-side, so you can't get this wrong.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        component_type: { type: "string", enum: ["task_list", "calendar"] },
        title: { type: "string", description: "Short heading for the view, e.g. 'This Week' or 'Overdue'." },
        task_ids: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "For task_list: the real ids of tasks to show. Null/omit for calendar.",
        },
        range_start: {
          type: ["string", "null"],
          description: "For calendar: ISO date, start of the range. Null for task_list.",
        },
        range_end: {
          type: ["string", "null"],
          description: "For calendar: ISO date, end of the range. Null for task_list.",
        },
      },
      required: ["component_type", "title", "task_ids", "range_start", "range_end"],
      additionalProperties: false,
    },
  },
];

type ToolExecutionResult = {
  result: string;
  component?: ComponentPayload;
};

async function executeTool(
  name: string,
  input: unknown,
  source: string
): Promise<ToolExecutionResult> {
  if (name === "remember") {
    const { content } = input as { content: string };
    const ok = await saveMemory(content);
    return { result: ok ? "Saved." : "Failed to save that." };
  }
  if (name === "recall") {
    const { query } = input as { query: string };
    const matches = await searchMemories(query);
    return {
      result:
        matches.length > 0
          ? matches.map((m) => `- ${m}`).join("\n")
          : "No matching memories found.",
    };
  }
  if (name === "add_task") {
    const task = input as NewTask;
    const taskId = await addTask({ ...task, source });
    return { result: taskId ? "Task added." : "Failed to add that task." };
  }
  if (name === "check_calendar") {
    const { range_start, range_end } = input as { range_start: string; range_end: string };
    try {
      const events = await listCalendarEvents(range_start, range_end);
      return {
        result:
          events.length > 0
            ? events
                .map((e) => `- ${e.title} (${e.start}${e.location ? `, ${e.location}` : ""})`)
                .join("\n")
            : "No events found in that range.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Calendar check failed.";
      return { result: message };
    }
  }
  if (name === "add_calendar_event") {
    const { title, description, start, end, location } = input as {
      title: string;
      description: string | null;
      start: string;
      end: string;
      location: string | null;
    };
    try {
      const { ok, link } = await createCalendarEvent({
        title,
        description: description ?? undefined,
        startIso: start,
        endIso: end,
        location: location ?? undefined,
      });
      return {
        result: ok ? `Event created.${link ? ` (${link})` : ""}` : "Failed to create the event.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create the event.";
      return { result: message };
    }
  }
  if (name === "remember_about_person") {
    const { name: personName, fact } = input as { name: string; fact: string };
    const person = await findOrCreatePerson(personName);
    if (!person) return { result: "Failed to save that." };
    const ok = await addPersonNote(person.id, fact, source);
    return { result: ok ? `Saved to ${person.name}'s file.` : "Failed to save that." };
  }
  if (name === "recall_person") {
    const { name: personName } = input as { name: string };
    const person = await findPersonByName(personName);
    if (!person) return { result: `No file found for ${personName}.` };
    const notes = await getPersonNotes(person.id);
    return {
      result:
        notes.length > 0
          ? `${person.name}:\n${notes.map((n) => `- ${n.content}`).join("\n")}`
          : `${person.name} has a file, but nothing saved yet.`,
    };
  }
  if (name === "show_component") {
    const { component_type, title, task_ids, range_start, range_end } = input as {
      component_type: "task_list" | "calendar";
      title: string;
      task_ids: string[] | null;
      range_start: string | null;
      range_end: string | null;
    };

    if (component_type === "task_list") {
      const tasks = await getTasksByIds(task_ids ?? []);
      const component: ComponentPayload = {
        type: "task_list",
        data: {
          title,
          items: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            due: t.due_at,
            status: t.status,
            priority: t.priority,
          })),
        },
      };
      return { result: "Shown to the user.", component };
    }

    if (component_type === "calendar" && range_start && range_end) {
      type MergedEvent = { id: string; title: string; start: string; end: string | null; type: string };

      const tasks = await getTasksInRange(range_start, range_end);
      const taskEvents: MergedEvent[] = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        start: t.due_at as string,
        end: null,
        type: t.type,
      }));

      // Merge in real Google Calendar events too, if connected — best
      // effort, since a calendar view shouldn't fail just because that
      // separate connection isn't set up.
      let calendarEvents: MergedEvent[] = [];
      try {
        const events = await listCalendarEvents(range_start, range_end);
        calendarEvents = events.map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          type: "calendar_event",
        }));
      } catch {
        // Not connected, or the call failed — show tasks only.
      }

      const component: ComponentPayload = {
        type: "calendar",
        data: {
          title,
          range: { start: range_start, end: range_end },
          events: [...taskEvents, ...calendarEvents].sort((a, b) =>
            a.start.localeCompare(b.start)
          ),
        },
      };
      return { result: "Shown to the user.", component };
    }

    return { result: "Missing required fields for that component." };
  }
  return { result: "Unknown tool." };
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

export type RunResult = {
  reply: string;
  component: ComponentPayload | null;
};

/**
 * Runs a message (or conversation) through Claude with the remember/recall/
 * add_task/show_component tools available, looping until Claude gives a
 * final text reply. Used by both the chat endpoint and the email sync
 * endpoint (which ignores the returned component — no UI there).
 */
export async function runWithMemory(
  systemPrompt: string,
  initialMessages: Anthropic.MessageParam[],
  options: RunOptions = {}
): Promise<RunResult> {
  const memoryContext = options.includeAllMemories
    ? await buildFullMemoryContext()
    : await buildLeanContext();

  const messages = [...initialMessages];
  let finalReply = "";
  let finalComponent: ComponentPayload | null = null;

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
      const { result, component } = await executeTool(
        block.name,
        block.input,
        options.taskSource ?? "chat"
      );
      if (component) finalComponent = component;
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { reply: finalReply, component: finalComponent };
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
      ? `Currently tracked tasks/events — don't call add_task again for these, only for genuinely ` +
        `new items. Each one's real id is given in brackets; use it (never invent one) if you call ` +
        `show_component for a task_list:\n${tasks
          .map((t) => `- [${t.id}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`)
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
      ? `Existing tasks/events already tracked (don't re-add these — call add_task only for genuinely ` +
        `new items). Each one's real id is in brackets:\n${tasks
          .map((t) => `- [${t.id}] ${t.title}${t.due_at ? ` (due ${t.due_at})` : ""}`)
          .join("\n")}`
      : "No tasks/events tracked yet.";

  return `${memoryPart}\n\n${taskPart}`;
}
