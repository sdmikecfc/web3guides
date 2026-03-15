import { createClient } from "@/lib/supabase/server";
import type { Guide } from "@/types";

/**
 * Fetch all guides for a given subdomain, newest first.
 * Optionally filter by difficulty or tag.
 */
export async function getGuidesBySubdomain(
  subdomain: string,
  options?: {
    limit?: number;
    offset?: number;
    difficulty?: string;
    tag?: string;
  }
): Promise<Guide[]> {
  const supabase = createClient();
  const { limit = 24, offset = 0, difficulty, tag } = options ?? {};

  let query = supabase
    .from("guides")
    .select("*")
    .eq("subdomain", subdomain)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  if (tag) {
    // Supabase jsonb/array contains
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[getGuidesBySubdomain] Supabase error:", error.message);
    return [];
  }

  return (data ?? []) as Guide[];
}

/**
 * Fetch a single guide by subdomain + slug.
 */
export async function getGuide(
  subdomain: string,
  slug: string
): Promise<Guide | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("guides")
    .select("*")
    .eq("subdomain", subdomain)
    .eq("slug", slug)
    .single();

  if (error) {
    console.error("[getGuide] Supabase error:", error.message);
    return null;
  }

  return data as Guide;
}

/**
 * Count guides for a subdomain (for pagination UI).
 */
export async function countGuides(subdomain: string): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("guides")
    .select("*", { count: "exact", head: true })
    .eq("subdomain", subdomain);

  if (error) {
    console.error("[countGuides] Supabase error:", error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Fetch recent guides across ALL subdomains (for a global feed or sitemap).
 */
export async function getAllRecentGuides(limit = 50): Promise<Guide[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("guides")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getAllRecentGuides] Supabase error:", error.message);
    return [];
  }

  return (data ?? []) as Guide[];
}
