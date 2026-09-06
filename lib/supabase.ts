import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the secret key, which bypasses Row Level
// Security — never import this file from client-side ("use client") code.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Memory = {
  id: string;
  content: string;
  created_at: string;
};
