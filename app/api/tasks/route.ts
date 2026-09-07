import { NextRequest, NextResponse } from "next/server";
import { listActiveTasks, setTaskStatus, deleteTask } from "@/lib/tasks";
import { requireSession } from "@/lib/session";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const tasks = await listActiveTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load tasks." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { taskId, status } = await req.json();
    if (!taskId || !status) {
      return NextResponse.json({ error: "Missing taskId or status" }, { status: 400 });
    }
    await setTaskStatus(taskId, status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update task." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { taskId } = await req.json();
    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    }
    await deleteTask(taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete task." }, { status: 500 });
  }
}
