import { getSupabase } from "./supabase";

export async function loadMemories(): Promise<string[]> {
  const { data } = await getSupabase()
    .from("memories")
    .select("content")
    .order("created_at", { ascending: true });

  return (data ?? []).map((m) => m.content as string);
}

export async function searchMemories(query: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("memories")
    .select("content")
    .textSearch("content", query, { type: "websearch", config: "english" })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Memory search failed:", error);
    return [];
  }
  return (data ?? []).map((m) => m.content as string);
}

export async function saveMemory(content: string): Promise<boolean> {
  const { error } = await getSupabase().from("memories").insert({ content });
  if (error) {
    console.error("Failed to save memory:", error);
    return false;
  }
  return true;
}
