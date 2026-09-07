import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-300 to-slate-500 p-4 font-sans">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-950/60 p-8 text-center shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-3xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white">
          A
        </div>
        <h1 className="mb-1 text-xl font-semibold text-white">Alfred</h1>
        <p className="mb-6 text-sm text-slate-400">
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
            className="w-full rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </div>
  );
}
