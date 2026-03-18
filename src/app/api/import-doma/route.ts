import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { ArticleVisual } from "@/types";

const GENERATE_SECRET = process.env.GENERATE_SECRET ?? "";
const DOMA_BLOG_BASE = "https://blog.doma.xyz";

// ─── HTML helpers ─────────────────────────────────────────────────────────────

/** Strip all HTML tags, decode entities, collapse whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, "[image]")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extract content between a tag match — handles nested tags */
function extractSection(html: string, selector: string): string {
  const idx = html.indexOf(selector);
  if (idx === -1) return "";
  const start = html.indexOf(">", idx) + 1;
  // Walk forward tracking open/close to find matching end
  let depth = 1;
  let i = start;
  const tagMatch = selector.match(/<(\w+)/);
  const tag = tagMatch ? tagMatch[1] : "div";
  while (i < html.length && depth > 0) {
    const openIdx = html.indexOf(`<${tag}`, i);
    const closeIdx = html.indexOf(`</${tag}>`, i);
    if (closeIdx === -1) break;
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth++;
      i = openIdx + 1;
    } else {
      depth--;
      i = closeIdx + tag.length + 3;
    }
  }
  return html.slice(start, i - tag.length - 3);
}

/** Pull all href values from anchor tags in an HTML string */
function extractLinks(html: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  const re = /href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (pattern.test(m[1])) matches.push(m[1]);
  }
  return Array.from(new Set(matches));
}

/** Extract first src from an img tag */
function extractImgSrc(html: string): string {
  const m = html.match(/\bsrc="([^"]+)"/);
  return m ? m[1] : "";
}

// ─── Blog discovery ────────────────────────────────────────────────────────────

interface PostMeta {
  slug: string;
  url: string;
  title: string;
  author: string;
  featureImage: string;
  publishedAt: string;
  excerpt: string;
}

/** Fetch one index page and return article slugs + metadata */
async function fetchIndexPage(pageUrl: string): Promise<PostMeta[]> {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": "web3guides-bot/1.0 (+https://web3guides.com)" },
  });
  if (!res.ok) return [];
  const html = await res.text();

  const posts: PostMeta[] = [];
  // Split on each post-card boundary
  const cards = html.split('<article class="post-card');
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    // Extract slug from the first href in the card that looks like an article path
    const hrefMatch = card.match(/href="(\/[a-z0-9-]+\/)"/);
    if (!hrefMatch) continue;
    const slug = hrefMatch[1].replace(/\//g, "");

    // Title
    const titleMatch = card.match(/class="post-card-title[^"]*">([^<]+)</);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    // Author
    const authorMatch = card.match(/class="post-card-author[^"]*">([^<]+)</);
    const author = authorMatch ? authorMatch[1].trim() : "Doma Foundation";

    // Feature image
    const imgMatch = card.match(/src="([^"]+content\/images[^"]+)"/);
    const featureImage = imgMatch
      ? imgMatch[1].startsWith("http")
        ? imgMatch[1]
        : `${DOMA_BLOG_BASE}${imgMatch[1]}`
      : "";

    // Date
    const dateMatch = card.match(/datetime="([^"]+)"/);
    const publishedAt = dateMatch
      ? new Date(dateMatch[1]).toISOString()
      : new Date().toISOString();

    // Excerpt
    const excerptMatch = card.match(/class="post-card-excerpt[^"]*">([^<]+)</);
    const excerpt = excerptMatch ? excerptMatch[1].trim() : "";

    posts.push({
      slug,
      url: `${DOMA_BLOG_BASE}/${slug}/`,
      title,
      author,
      featureImage,
      publishedAt,
      excerpt,
    });
  }
  return posts;
}

/** Discover all articles across all pages */
async function discoverAllPosts(maxPages = 10): Promise<PostMeta[]> {
  const all: PostMeta[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url =
      page === 1 ? `${DOMA_BLOG_BASE}/` : `${DOMA_BLOG_BASE}/page/${page}/`;
    const posts = await fetchIndexPage(url);
    if (posts.length === 0) break;
    all.push(...posts);
    // Small polite delay
    await new Promise((r) => setTimeout(r, 400));
  }
  return all;
}

// ─── Full article fetch ────────────────────────────────────────────────────────

interface FullPost extends PostMeta {
  bodyHtml: string;
  bodyText: string;
}

async function fetchFullPost(meta: PostMeta): Promise<FullPost> {
  const res = await fetch(meta.url, {
    headers: { "User-Agent": "web3guides-bot/1.0 (+https://web3guides.com)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${meta.url}`);
  const html = await res.text();

  // Pull feature image from article header if not already found
  let featureImage = meta.featureImage;
  if (!featureImage) {
    const figMatch = html.match(/class="gh-article-image[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
    if (figMatch) {
      featureImage = figMatch[1].startsWith("http")
        ? figMatch[1]
        : `${DOMA_BLOG_BASE}${figMatch[1]}`;
    }
  }

  // Grab author name from article meta if available
  let author = meta.author;
  const authorMatch = html.match(/class="gh-article-author-name[^"]*"[^>]*><a[^>]*>([^<]+)</);
  if (authorMatch) author = authorMatch[1].trim();

  // Extract gh-content section
  const bodyHtml = extractSection(html, '<section class="gh-content');
  const bodyText = stripHtml(bodyHtml);

  return { ...meta, featureImage, author, bodyHtml, bodyText };
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
  post: FullPost
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
      // Fetch full article
      const fullPost = await fetchFullPost(meta);

      if (dry_run) {
        results.push({ url: meta.url, title: meta.title, slug: slugify(meta.title), status: "dry_run" });
        continue;
      }

      // Transform with Claude
      const article = await transformWithClaude(client, fullPost);
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
