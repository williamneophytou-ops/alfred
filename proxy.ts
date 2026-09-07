export { auth as proxy } from "@/auth";

export const config = {
  // Optimistic first check: protects everything except NextAuth's own
  // routes, the login page (avoiding a redirect loop), and static assets.
  // Not the only line of defense — see lib/session.ts, checked directly in
  // every route handler, per Next.js's own guidance that Proxy alone isn't
  // sufficient.
  matcher: ["/((?!api/session|login|_next/static|_next/image|favicon.ico).*)"],
};
