import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Try featured first
    const { data: featured } = await supabase
      .from("guides")
      .select("id, title, slug, subdomain, summary, difficulty")
      .eq("featured", true)
      .order("published_at", { ascending: false })
      .limit(12);

    if (featured && featured.length >= 6) {
      return NextResponse.json({ guides: featured });
    }

    // Fall back to most recent articles that have content
    const { data: recent, error } = await supabase
      .from("guides")
      .select("id, title, slug, subdomain, summary, difficulty")
      .not("content", "is", null)
      .order("published_at", { ascending: false })
      .limit(12);

    if (error) {
      console.error("[featured-guides]", error.message);
      return NextResponse.json({ guides: [] });
    }

    return NextResponse.json({ guides: recent ?? [] });
  } catch (e) {
    console.error("[featured-guides] unexpected:", e);
    return NextResponse.json({ guides: [] });
  }
}
