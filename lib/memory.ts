import { getSupabase } from "./supabase";

export async function loadMemories(): Promise<string[]> {
  const { data } = await getSupabase()
    .from("memories")
    .select("content")
    .order("created_at", { ascending: true });

  return (data ?? []).map((m) => m.content as string);
}

// Common words that carry no search meaning of their own — stripped before
// the fallback substring search below, so a query like "what did you find
// in my email" searches on "find"/"email" rather than every word verbatim.
const STOPWORDS = new Set([
  "what", "whats", "when", "where", "which", "who", "how", "why",
  "did", "do", "does", "doing", "done",
  "is", "are", "was", "were", "be", "been", "being",
  "the", "a", "an", "this", "that", "these", "those",
  "i", "me", "my", "you", "your", "he", "she", "it", "we", "they",
  "in", "on", "at", "to", "for", "of", "with", "from", "about", "into",
  "and", "or", "but", "if", "so", "than", "then",
  "can", "could", "will", "would", "should", "have", "has", "had",
  "find", "know", "tell", "remember", "recall", "any", "anything",
]);

/**
 * Postgres full-text search only matches on (stemmed) keyword overlap, not
 * meaning — a natural-language paraphrase that shares no words with how a
 * memory was actually saved comes back empty even when it's clearly the
 * right memory. Fall back to a looser substring match on the query's
 * significant words when the strict search finds nothing.
 */
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
  if (data && data.length > 0) {
    return data.map((m) => m.content as string);
  }

  const words = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  if (words.length === 0) return [];

  const { data: fallback, error: fallbackError } = await getSupabase()
    .from("memories")
    .select("content")
    .or(words.map((w) => `content.ilike.%${w}%`).join(","))
    .order("created_at", { ascending: false })
    .limit(10);

  if (fallbackError) {
    console.error("Memory fallback search failed:", fallbackError);
    return [];
  }
  return (fallback ?? []).map((m) => m.content as string);
}

export async function saveMemory(content: string): Promise<boolean> {
  const { error } = await getSupabase().from("memories").insert({ content });
  if (error) {
    console.error("Failed to save memory:", error);
    return false;
  }
  return true;
}
