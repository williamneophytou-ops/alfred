import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client. Uses the secret key, which bypasses Row Level
// Security — never import this file from client-side ("use client") code.
//
// Created lazily (on first use, at request time) rather than at module
// load time, so the build doesn't try to read these env vars before
// they're available.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return client;
}

export type Memory = {
  id: string;
  content: string;
  created_at: string;
};
