import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/google";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  const appUrl = new URL("/", req.url);

  if (error) {
    appUrl.searchParams.set("gmail", "error");
    return NextResponse.redirect(appUrl);
  }

  if (!code) {
    appUrl.searchParams.set("gmail", "error");
    return NextResponse.redirect(appUrl);
  }

  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const client = getOAuthClient(redirectUri);

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Google only sends a refresh_token the first time you consent, or
      // when prompt=consent forces re-issue. If this ever happens, the
      // user needs to fully disconnect the app's access and reconnect.
      appUrl.searchParams.set("gmail", "no_refresh_token");
      return NextResponse.redirect(appUrl);
    }

    const { error: dbError } = await getSupabase()
      .from("google_tokens")
      .upsert({ id: "default", refresh_token: tokens.refresh_token });

    if (dbError) {
      console.error("Failed to save Google tokens:", dbError);
      appUrl.searchParams.set("gmail", "error");
      return NextResponse.redirect(appUrl);
    }

    appUrl.searchParams.set("gmail", "connected");
    return NextResponse.redirect(appUrl);
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    appUrl.searchParams.set("gmail", "error");
    return NextResponse.redirect(appUrl);
  }
}
