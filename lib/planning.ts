import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "./supabase";
import { anthropic } from "./anthropic";
import { getTasksForPlanning, getTasksByIds, type TaskRecord } from "./tasks";

export type PlanItem = {
  task_id: string | null;
  title: string;
  reason: string;
  time: string | null;
};

export type DailyPlan = {
  date: string;
  items: PlanItem[];
  generatedAt: string;
  tasks: Record<string, TaskRecord>; // current live state of each referenced task
};

const submitPlanTool: Anthropic.Tool = {
  name: "submit_plan",
  description: "Submit the generated daily plan as a priority-ordered list of items.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "The plan, in the order the user should tackle things.",
        items: {
          type: "object",
          properties: {
            task_id: {
              type: "string",
              description: "The id of the task/event this item is for, if it corresponds to one of the listed tasks.",
            },
            title: { type: "string" },
            reason: {
              type: "string",
              description: "One short sentence on why this is placed here (e.g. 'due today', 'overdue from yesterday', 'fixed 8:30am start').",
            },
            time: {
              type: "string",
              description: "Fixed clock time if this is a scheduled event (e.g. '8:30 AM'), otherwise omit.",
            },
          },
          required: ["title", "reason"],
        },
      },
    },
    required: ["items"],
  },
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function generatePlan(tasks: TaskRecord[]): Promise<PlanItem[]> {
  const today = todayDateString();

  const taskList =
    tasks.length > 0
      ? tasks
          .map(
            (t) =>
              `- id: ${t.id} | title: ${t.title} | due: ${t.due_at ?? "no specific date"} | ` +
              `priority: ${t.priority} | type: ${t.type}${t.description ? ` | notes: ${t.description}` : ""}`
          )
          .join("\n")
      : "(no tasks or events tracked for today)";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system:
      `Today is ${today}. You are Alfred, planning the user's day. Build a priority-ordered list: ` +
      "any task manually flagged 'urgent' goes first, no exceptions. Otherwise, order by due-date " +
      "proximity — overdue items are carried over and should generally lead. Fixed-time events anchor " +
      "the day; sequence other tasks around them. Give each item one short reason for its placement. " +
      "If there are no tasks, return an empty items array. Call submit_plan with the result.",
    tools: [submitPlanTool],
    tool_choice: { type: "tool", name: "submit_plan" },
    messages: [
      {
        role: "user",
        content: `Today's tasks/events to plan around:\n${taskList}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  const items = (toolUse?.input as { items?: PlanItem[] } | undefined)?.items ?? [];
  return items.map((item) => ({
    task_id: item.task_id ?? null,
    title: item.title,
    reason: item.reason,
    time: item.time ?? null,
  }));
}

/** Returns today's plan, generating and caching it on first request of the day. */
export async function getOrGenerateDailyPlan(): Promise<DailyPlan> {
  const date = todayDateString();

  const { data: existing } = await getSupabase()
    .from("daily_plans")
    .select("*")
    .eq("date", date)
    .maybeSingle();

  let items: PlanItem[];
  let generatedAt: string;

  if (existing) {
    items = existing.plan_content as PlanItem[];
    generatedAt = existing.generated_at;
  } else {
    const tasks = await getTasksForPlanning();
    items = await generatePlan(tasks);
    generatedAt = new Date().toISOString();

    const { error } = await getSupabase()
      .from("daily_plans")
      .upsert({ date, plan_content: items, generated_at: generatedAt });
    if (error) console.error("Failed to save daily plan:", error);
  }

  const taskIds = items.map((i) => i.task_id).filter((id): id is string => !!id);
  const taskRecords = await getTasksByIds(taskIds);
  const tasksById = Object.fromEntries(taskRecords.map((t) => [t.id, t]));

  return { date, items, generatedAt, tasks: tasksById };
}

/** Forces regeneration even if a plan already exists today (e.g. after tasks change). */
export async function regenerateDailyPlan(): Promise<DailyPlan> {
  const date = todayDateString();
  await getSupabase().from("daily_plans").delete().eq("date", date);
  return getOrGenerateDailyPlan();
}
