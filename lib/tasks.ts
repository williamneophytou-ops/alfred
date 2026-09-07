import { getSupabase } from "./supabase";

export type TaskStatus = "not_started" | "in_progress" | "done";
export type TaskPriority = "urgent" | "normal";
export type TaskType = "task" | "event" | "deadline" | "recurring";

export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  source: string;
  created_at: string;
};

export type NewTask = {
  title: string;
  description?: string;
  due_at?: string; // ISO string
  priority?: TaskPriority;
  type?: TaskType;
  source?: string;
};

export async function addTask(task: NewTask): Promise<boolean> {
  const { error } = await getSupabase().from("tasks_and_events").insert({
    title: task.title,
    description: task.description ?? null,
    due_at: task.due_at ?? null,
    priority: task.priority ?? "normal",
    type: task.type ?? "task",
    source: task.source ?? "chat",
  });
  if (error) {
    console.error("Failed to add task:", error);
    return false;
  }
  return true;
}

/**
 * Tasks relevant to "today": due today, overdue (carried over from a
 * previous day), or flagged urgent regardless of date. Matches the
 * gather step in the Daily Planning Logic doc.
 */
export async function getTasksForPlanning(): Promise<TaskRecord[]> {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const { data, error } = await getSupabase()
    .from("tasks_and_events")
    .select("*")
    .neq("status", "done")
    .or(`due_at.lte.${endOfToday.toISOString()},priority.eq.urgent`)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to load tasks for planning:", error);
    return [];
  }
  return (data ?? []) as TaskRecord[];
}

/** All not-done tasks, for duplicate-avoidance when reviewing a batch of emails. */
export async function listActiveTasks(): Promise<TaskRecord[]> {
  const { data, error } = await getSupabase()
    .from("tasks_and_events")
    .select("*")
    .neq("status", "done")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to list active tasks:", error);
    return [];
  }
  return (data ?? []) as TaskRecord[];
}

export async function getTasksByIds(ids: string[]): Promise<TaskRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase()
    .from("tasks_and_events")
    .select("*")
    .in("id", ids);
  if (error) {
    console.error("Failed to load tasks by id:", error);
    return [];
  }
  return (data ?? []) as TaskRecord[];
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<boolean> {
  const { error } = await getSupabase()
    .from("tasks_and_events")
    .update({ status })
    .eq("id", id);
  if (error) {
    console.error("Failed to update task status:", error);
    return false;
  }
  return true;
}

export async function setTaskPriority(id: string, priority: TaskPriority): Promise<boolean> {
  const { error } = await getSupabase()
    .from("tasks_and_events")
    .update({ priority })
    .eq("id", id);
  if (error) {
    console.error("Failed to update task priority:", error);
    return false;
  }
  return true;
}
