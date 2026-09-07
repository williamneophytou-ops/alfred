import { NextResponse } from "next/server";
import { isGoogleConnected } from "@/lib/google";
import { requireSession } from "@/lib/session";

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const connected = await isGoogleConnected();
  return NextResponse.json({ connected });
}
