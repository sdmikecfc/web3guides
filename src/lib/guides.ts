import { createClient } from "@/lib/supabase/server";
import type { Guide } from "@/types";

export async function getGuidesBySubdomain(
  subdomain: string,
  options?: { limit?: number; offset?: number; difficulty?: string; tag?: string }
): Promise<Guide[]> {
  try {
    const supabase = await createClient();
    const { limit = 24, offset = 0, difficulty, tag } = options ?? {};
    let query = supabase
      .from("guides")
      .select("*")
      .eq("subdomain", subdomain)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (difficulty) query = query.eq("difficulty", difficulty);
    if (tag) query = query.contains("tags", [tag]);
    const { data, error } = await query;
    if (error) { console.error("[getGuidesBySubdomain]", error.message); return []; }
    return (data ?? []) as Guide[];
  } catch (e) { console.error("[getGuidesBySubdomain] unexpected:", e); return []; }
}

export async function getGuide(subdomain: string, slug: string): Promise<Guide | null> {
  try {
    const supabase = await createClient();
    // First: exact subdomain+slug match (fast path)
    const { data, error } = await supabase
      .from("guides").select("*")
      .eq("subdomain", subdomain).eq("slug", slug).single();
    if (!error && data) return data as Guide;

    // Fallback: slug-only lookup across all subdomains.
    // Needed when a guide from subdomain X is linked from subdomain Y's listing
    // (e.g. easy.web3guides.com shows all-difficulty articles from every subdomain).
    const { data: fallback, error: fallbackError } = await supabase
      .from("guides").select("*")
      .eq("slug", slug)
      .limit(1)
      .single();
    if (fallbackError) { console.error("[getGuide fallback]", fallbackError.message); return null; }
    return fallback as Guide;
  } catch (e) { console.error("[getGuide] unexpected:", e); return null; }
}

export async function countGuides(subdomain: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("guides").select("*", { count: "exact", head: true })
      .eq("subdomain", subdomain);
    if (error) { console.error("[countGuides]", error.message); return 0; }
    return count ?? 0;
  } catch (e) { console.error("[countGuides] unexpected:", e); return 0; }
}

export async function getGuidesByDifficulty(
  difficulty: string,
  options?: { limit?: number; offset?: number }
): Promise<Guide[]> {
  try {
    const supabase = await createClient();
    const { limit = 24, offset = 0 } = options ?? {};
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .eq("difficulty", difficulty)
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) { console.error("[getGuidesByDifficulty]", error.message); return []; }
    return (data ?? []) as Guide[];
  } catch (e) { console.error("[getGuidesByDifficulty] unexpected:", e); return []; }
}

export async function countGuidesByDifficulty(difficulty: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("guides").select("*", { count: "exact", head: true })
      .eq("difficulty", difficulty);
    if (error) { console.error("[countGuidesByDifficulty]", error.message); return 0; }
    return count ?? 0;
  } catch (e) { console.error("[countGuidesByDifficulty] unexpected:", e); return 0; }
}

export async function getAllRecentGuides(limit = 50): Promise<Guide[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("guides").select("*")
      .order("published_at", { ascending: false }).limit(limit);
    if (error) { console.error("[getAllRecentGuides]", error.message); return []; }
    return (data ?? []) as Guide[];
  } catch (e) { console.error("[getAllRecentGuides] unexpected:", e); return []; }
}
