/**
 * Server-side Supabase client for the Fantasy League routes.
 *
 * Delegates to the existing createServiceClient() in @/lib/supabase/server —
 * same pattern the dashboard uses, same env vars, same proven config.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export function fantasyDb() {
  return createServiceClient();
}
