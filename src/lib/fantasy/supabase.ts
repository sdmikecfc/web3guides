/**
 * Server-side Supabase client for the Fantasy League routes.
 *
 * Uses the service-role key so we can read/write fantasy_* tables
 * without RLS friction. NEVER expose this client to the browser —
 * it's only imported from server-only files (route handlers, server
 * components) and never from any "use client" component.
 */

import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function fantasyDb(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
