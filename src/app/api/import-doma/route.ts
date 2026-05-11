import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { ArticleVisual } from "@/types";

const GENERATE_SECRET = process.env.GENERATE_SECRET ?? "";
const DOMA_BLOG_BASE = "https://blog.doma.xyz";

// ─── HTML / RSS helpers ────────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
    .replace(/\s{2,}/g, " ").trim();
}

/** Pull text content from a CDATA or plain XML tag */
function xmlText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

/** Pull an attribute value from a self-closing or opening tag */
function xmlAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

// ─── Blog discovery via RSS ───────────────────────────────────────────────────

interface PostMeta {
  slug: string;
  url: string;
  title: string;
  author: string;
  featureImage: string;
  publishedAt: string;
  excerpt: string;
  bodyText: string;   // full article text from content:encoded
}

/** Parse one RSS page and return PostMeta array */
async function fetchRSSPage(rssUrl: string): Promise<PostMeta[]> {
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "web3guides-bot/1.0 (+https://web3guides.com)" },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const posts: PostMeta[] = [];
  // Split on <item> boundaries
  const items = xml.split("<item>");
  for (let i = 1; i < items.length; i++) {
    const item = items[i];

    const title = xmlText(item, "title");
    const url   = xmlText(item, "link");
    if (!url || !title) continue;

    // Derive slug from URL path
    const slug = url.replace(/^https?:\/\/[^/]+\//, "").replace(/\/$/, "");

    const author      = xmlText(item, "dc:creator") || "Doma Foundation";
    const publishedAt = (() => {
      try { return new Date(xmlText(item, "pubDate")).toISOString(); }
      catch { return new Date().toISOString(); }
    })();
    const featureImage = xmlAttr(item, "media:content", "url");

    // content:encoded has the full HTML — extract text from it
    const contentMatch = item.match(/<content:encoded>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/i);
    const contentHtml  = contentMatch ? contentMatch[1] : "";
    const bodyText     = stripHtml(contentHtml).slice(0, 8000);

    // description as excerpt fallback
    const excerptHtml  = xmlText(item, "description");
    const excerpt      = stripHtml(excerptHtml).slice(0, 300);

    posts.push({ slug, url, title, author, featureImage, publishedAt, excerpt, bodyText });
  }
  return posts;
}

/** Discover all posts across paginated RSS feed */
async function discoverAllPosts(maxPages = 15): Promise<PostMeta[]> {
  const all: PostMeta[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const rssUrl = page === 1
      ? `${DOMA_BLOG_BASE}/rss/`
      : `${DOMA_BLOG_BASE}/rss/${page}/`;
    const posts = await fetchRSSPage(rssUrl);
    if (posts.length === 0) break;
    all.push(...posts);
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

// ─── Full article fetch (used only if RSS body is too thin) ───────────────────

interface FullPost extends PostMeta {
  bodyHtml: string;
}

async function fetchFullPost(meta: PostMeta): Promise<FullPost> {
  // RSS already gives us bodyText from content:encoded — no scrape needed
  return { ...meta, bodyHtml: "" };
}

// ─── Claude transformation ────────────────────────────────────────────────────

interface TransformedArticle {
  title: string;
  summary: string;
  key_points: string[];
  content: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  read_time_minutes: number;
  visuals: ArticleVisual[];
}

async function transformWithClaude(
  client: Anthropic,
  post: PostMeta
): Promise<TransformedArticle> {
  // Trim body text to avoid huge context — Claude still gets full picture
  const trimmedBody =
    post.bodyText.length > 6000
      ? post.bodyText.slice(0, 6000) + "\n\n[…article continues…]"
      : post.bodyText;

  const stream = await client.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are transforming a Doma Protocol blog post into a structured educational article for web3guides.com/doma.

ORIGINAL ARTICLE:
URL: ${post.url}
Title: ${post.title}
Author: ${post.author}
Published: ${post.publishedAt}
Excerpt: ${post.excerpt}

BODY TEXT:
${trimmedBody}

TASK:
Transform this into our article format. Keep all factual information accurate. Restructure for scannability. Add clear section headings if the original does not have them.

CRITICAL RULES:
- NO raw code blocks
- NO markdown fences (\`\`\`)
- NO bullet lists — convert to prose or numbered steps
- DO NOT invent facts not present in the original
- Every ## heading must be Title Case and descriptive
- The final section MUST be exactly:
  ## Originally Published on the Doma Blog
  This article was originally written by ${post.author} and published on the [Doma Blog](${post.url}). All credit to the original authors. Republished on web3guides.com with attribution to support the Doma community.

VISUALS — Include 2–3 visuals from these types:
"stats" — { type:"stats", after_section:"## Heading", items:[{value:"X",label:"Y"}] } — 3–4 items
"comparison" — { type:"comparison", after_section:"## Heading", left:{label:"A",points:["..."]}, right:{label:"B",points:["..."]} }
"steps" — { type:"steps", after_section:"## Heading", heading:"optional", items:[{step:"Name",detail:"..."}] } — 3–6 steps
"callout" — { type:"callout", after_section:"## Heading", variant:"insight"|"warning"|"tip", heading:"...", body:"..." }
"checklist" — { type:"checklist", after_section:"## Heading", heading:"...", items:["..."] } — 4–7 items

Return ONLY valid JSON (no markdown fences):
{
  "title": "original title, unchanged",
  "summary": "2 sentences. What this covers and why it matters. Under 200 chars.",
  "key_points": ["4 specific takeaways, verb-first, under 10 words each"],
  "content": "Full markdown article with ## headings. Attribution section last.",
  "tags": ["doma","tag2","tag3","tag4"],
  "difficulty": "beginner",
  "read_time_minutes": 5,
  "visuals": []
}`,
      },
    ],
  });

  const message = await stream.finalMessage();
  let rawText = "";
  for (const block of message.content) {
    if (block.type === "text") { rawText = block.text; break; }
  }

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Claude response");
  return JSON.parse(jsonMatch[0]) as TransformedArticle;
}

// ─── Slug helper ──────────────────────────────────────────────────────────────

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization");
  if (GENERATE_SECRET && authHeader !== `Bearer ${GENERATE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    limit = 5,          // max new articles to import per call
    dry_run = false,    // if true, discover + log but don't insert
  } = body as { limit?: number; dry_run?: boolean };

  const supabase = await createClient();
  const client = new Anthropic({ apiKey });

  // 1. Discover all posts from the blog
  const allPosts = await discoverAllPosts(10);

  // 2. Check which source_urls already exist in the DB
  const { data: existing } = await supabase
    .from("guides")
    .select("source_url")
    .eq("subdomain", "doma")
    .like("source_url", `${DOMA_BLOG_BASE}%`);

  const existingUrls = new Set((existing ?? []).map((r) => r.source_url));
  const newPosts = allPosts.filter((p) => !existingUrls.has(p.url));

  if (newPosts.length === 0) {
    return NextResponse.json({ message: "No new posts found", total_discovered: allPosts.length });
  }

  // 3. Process up to `limit` new posts
  const toProcess = newPosts.slice(0, limit);
  const results: Array<{ url: string; title: string; slug: string; status: string }> = [];
  const errors: string[] = [];

  for (const meta of toProcess) {
    try {
      if (dry_run) {
        results.push({ url: meta.url, title: meta.title, slug: slugify(meta.title), status: "dry_run" });
        continue;
      }

      // Transform with Claude — bodyText already populated from RSS
      const article = await transformWithClaude(client, meta);
      const slug = slugify(article.title);

      // Check for slug collision
      const { data: slugConflict } = await supabase
        .from("guides")
        .select("id")
        .eq("subdomain", "doma")
        .eq("slug", slug)
        .single();

      const finalSlug = slugConflict ? `${slug}-${Date.now()}` : slug;

      const { error: insertError } = await supabase.from("guides").insert({
        subdomain: "doma",
        title: article.title,
        summary: article.summary,
        content: article.content,
        tags: article.tags,
        difficulty: article.difficulty,
        read_time_minutes: article.read_time_minutes,
        slug: finalSlug,
        // source_url points to the original Doma blog post for attribution
        source_url: meta.url,
        author: meta.author,
        published_at: meta.publishedAt,
        visuals: article.visuals ?? [],
        key_points: article.key_points ?? [],
      });

      if (insertError) {
        errors.push(`${meta.slug}: ${insertError.message}`);
      } else {
        results.push({ url: meta.url, title: article.title, slug: finalSlug, status: "imported" });
      }

      // Polite delay between Claude calls
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${meta.slug}: ${msg}`);
    }
  }

  return NextResponse.json({
    total_discovered: allPosts.length,
    already_imported: existingUrls.size,
    new_available: newPosts.length,
    processed: toProcess.length,
    results,
    errors,
  });
}
