import { getSupabase } from "./supabase";

// Per-person memory: a running file of notes about anyone the user talks
// about, so Alfred can recall everything he's been told about a specific
// person later, not just chronologically. Background-only — no dashboard UI,
// just the remember_about_person / recall_person tools in lib/anthropic.ts.

export type Person = {
  id: string;
  name: string;
  aliases: string[];
  created_at: string;
};

export type PersonNote = {
  id: string;
  person_id: string;
  content: string;
  source: string;
  created_at: string;
};

/**
 * Case-insensitive match against a person's name or any known alias.
 * Fetches the whole (small) people table and matches in memory rather than
 * relying on fragile SQL fuzzy-matching — fine at the scale this is for.
 */
export async function findPersonByName(name: string): Promise<Person | null> {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const { data, error } = await getSupabase().from("people").select("*");
  if (error) {
    console.error("Failed to list people:", error);
    return null;
  }

  const match = (data ?? []).find(
    (p) =>
      (p.name as string).toLowerCase() === needle ||
      ((p.aliases as string[] | null) ?? []).some((a) => a.toLowerCase() === needle)
  );
  return (match as Person) ?? null;
}

export async function createPerson(name: string): Promise<Person | null> {
  const { data, error } = await getSupabase()
    .from("people")
    .insert({ name })
    .select("*")
    .single();
  if (error || !data) {
    console.error("Failed to create person:", error);
    return null;
  }
  return data as Person;
}

/** Finds a person by name/alias, creating a new file for them if none exists yet. */
export async function findOrCreatePerson(name: string): Promise<Person | null> {
  const existing = await findPersonByName(name);
  if (existing) return existing;
  return createPerson(name);
}

export async function addPersonNote(
  personId: string,
  content: string,
  source = "chat"
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("person_notes")
    .insert({ person_id: personId, content, source });
  if (error) {
    console.error("Failed to add person note:", error);
    return false;
  }
  return true;
}

export async function getPersonNotes(personId: string): Promise<PersonNote[]> {
  const { data, error } = await getSupabase()
    .from("person_notes")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load person notes:", error);
    return [];
  }
  return (data ?? []) as PersonNote[];
}
