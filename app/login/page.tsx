import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-black p-4 font-sans">
      <div className="w-full max-w-sm rounded-3xl border border-cyan-400/25 bg-slate-950/70 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(103,232,249,0.15)] backdrop-blur-3xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-600 text-lg font-semibold text-black shadow-[0_0_12px_rgba(34,211,238,0.5)]">
          A
        </div>
        <h1 className="font-display mb-1 text-xl font-semibold tracking-wide text-white">
          ALFRED
        </h1>
        <p className="mb-6 text-xs font-semibold uppercase tracking-wider text-cyan-400/80">
          Personal AI Assistant — sign in to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-full bg-cyan-600 px-5 py-2.5 text-sm font-medium text-black hover:bg-cyan-500"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
