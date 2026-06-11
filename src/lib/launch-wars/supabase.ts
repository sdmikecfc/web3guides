/**
 * Server-side Supabase client for the Launch Wars routes.
 *
 * Delegates to the existing createServiceClient() in @/lib/supabase/server —
 * same pattern fantasy/og-tournament use, same env vars, same proven config.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export function launchWarsDb() {
  return createServiceClient();
}
