import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Defense-in-depth session check for use directly inside route handlers.
 * Proxy (proxy.ts) already gates these routes as an optimistic first check,
 * but Next.js's own guidance is that Proxy shouldn't be the only line of
 * defense — routes should verify the session themselves too, as close to
 * the data as possible.
 *
 * Usage: `const unauthorized = await requireSession(); if (unauthorized) return unauthorized;`
 */
export async function requireSession(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
