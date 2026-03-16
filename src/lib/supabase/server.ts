import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
