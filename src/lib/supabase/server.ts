import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Service-role client — bypasses RLS. Use only in server components/routes
 * that have already authenticated the user (e.g. dashboard behind cookie auth).
 * Never expose to the browser.
 */
export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      // NEVER LET NEXT CACHE A DATABASE READ (2026-08-17, the empty-feed hunt).
      // Next 14 defaults fetch() to force-cache inside route handlers, and
      // supabase-js queries ARE fetches. The live feed's four queries first
      // ran while the tables were empty; Next cached those empty responses
      // against their URLs and served them back for hours - 200 OK, zero
      // rows, no error, immune to a `.error` check and unchanged by a
      // redeploy. Freshness belongs to unstable_cache/revalidateTag, which
      // this codebase already uses deliberately; the raw client must always
      // hit the database.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}

/**
 * Works with both Next.js 14 (sync cookies()) and 15 (async cookies()).
 * Cast to `any` so TypeScript doesn't complain about the overloaded return type.
 */
export async function createClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieStore = await (cookies as any)();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore
          }
        },
      },
    }
  );
}
