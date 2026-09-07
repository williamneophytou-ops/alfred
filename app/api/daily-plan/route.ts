import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateDailyPlan, regenerateDailyPlan } from "@/lib/planning";
import { setTaskStatus, setTaskPriority } from "@/lib/tasks";
import { requireSession } from "@/lib/session";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const plan = await getOrGenerateDailyPlan();
    return NextResponse.json(plan);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load today's plan." }, { status: 500 });
  }
}

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  // Force a fresh regeneration (e.g. user wants to re-plan after changes).
  try {
    const plan = await regenerateDailyPlan();
    return NextResponse.json(plan);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to regenerate plan." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const { taskId, status, priority } = await req.json();
    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
    }
    if (status) await setTaskStatus(taskId, status);
    if (priority) await setTaskPriority(taskId, priority);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update task." }, { status: 500 });
  }
}
