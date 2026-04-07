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
    { cookies: { getAll: () => [], setAll: () => {} } }
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
