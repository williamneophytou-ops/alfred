import { auth, signOut } from "@/auth";
import HomeClient from "./HomeClient";

export default async function Page() {
  const session = await auth();

  return (
    <>
      <HomeClient />
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="fixed left-4 top-4 z-50"
      >
        <button
          type="submit"
          className="rounded-full border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
        >
          Sign out{session?.user?.email ? ` (${session.user.email})` : ""}
        </button>
      </form>
    </>
  );
}
