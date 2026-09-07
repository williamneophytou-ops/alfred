import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient, GMAIL_SCOPES } from "@/lib/google";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const client = getOAuthClient(redirectUri);

  const url = client.generateAuthUrl({
    access_type: "offline", // required to get a refresh token back
    prompt: "consent", // forces Google to re-issue a refresh token every time
    scope: GMAIL_SCOPES,
  });

  return NextResponse.redirect(url);
}
