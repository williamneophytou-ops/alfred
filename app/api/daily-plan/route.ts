import { NextRequest, NextResponse } from "next/server";
import { getOrGenerateDailyPlan, regenerateDailyPlan } from "@/lib/planning";
import { setTaskStatus, setTaskPriority } from "@/lib/tasks";

export async function GET() {
  try {
    const plan = await getOrGenerateDailyPlan();
    return NextResponse.json(plan);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load today's plan." }, { status: 500 });
  }
}

export async function POST() {
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
