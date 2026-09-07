import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { NextResponse } from "next/server";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Kept away from the default /api/auth base path so it doesn't collide
  // with the existing /api/auth/google* routes used for Gmail linking.
  basePath: "/api/session",
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Only the owner's own Google account may ever sign in — this is a
    // single-owner app, not a multi-user one. Defense-in-depth alongside
    // (not instead of) Google's own Testing-mode test-user allowlist.
    async signIn({ profile }) {
      return profile?.email === process.env.OWNER_EMAIL;
    },
    // Gate for middleware: every page and API route (per middleware.ts's
    // matcher) requires a signed-in session, or the caller gets redirected
    // (pages) / a 401 (API routes) instead of ever reaching the route.
    authorized({ request, auth }) {
      if (auth?.user) return true;
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return false;
    },
  },
});
