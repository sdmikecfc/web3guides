export interface StatItem { value: string; label: string; }

export interface ParsedSection {
  id: string;
  heading: string;
  level: 2 | 3;
  bullets: string[];      // bullet lines, plain text
  stats: StatItem[];      // numbers found in section text
  concepts: string[];     // **bold** and `code` terms
  bodyLines: string[];    // raw markdown lines (excl. heading)
}

function slugId(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Split full markdown into an intro block + H2/H3 sections */
export function parseArticleSections(md: string): {
  intro: string;
  sections: ParsedSection[];
} {
  const lines = md.split("\n");
  const sections: ParsedSection[] = [];
  const introLines: string[] = [];

  let curHeading: string | null = null;
  let curLevel: 2 | 3 = 2;
  let curLines: string[] = [];

  function flush() {
    if (curHeading !== null) {
      sections.push(buildSection(curHeading, curLevel, curLines));
    }
  }

  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);

    if (h2) {
      flush();
      curHeading = h2[1];
      curLevel = 2;
      curLines = [];
    } else if (h3 && curHeading !== null) {
      // Treat sub-headings as part of the current section
      curLines.push(line);
    } else if (h3) {
      flush();
      curHeading = h3[1];
      curLevel = 3;
      curLines = [];
    } else {
      if (curHeading === null) introLines.push(line);
      else curLines.push(line);
    }
  }
  flush();

  return { intro: introLines.join("\n"), sections };
}

function buildSection(heading: string, level: 2 | 3, lines: string[]): ParsedSection {
  const body = lines.join("\n");

  const bullets = lines
    .filter((l) => /^- /.test(l))
    .map((l) =>
      l
        .replace(/^- /, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .trim()
    )
    .filter((b) => b.length > 4 && b.length < 220)
    .slice(0, 6);

  return {
    id: slugId(heading),
    heading,
    level,
    bullets,
    stats: extractStats(body),
    concepts: extractConcepts(body),
    bodyLines: lines,
  };
}

// ─── stat extraction ───────────────────────────────────────────────────────────
const STAT_RE =
  /(\$[\d,.]+\s*[KMBTkmbt]?|\d+(?:[,.]\d+)*(?:\.\d+)?\s*(?:[KMBTkmbt%]|x|X|\s+(?:million|billion|trillion|thousand|hours|days|years|minutes|seconds))?)/g;

function extractStats(text: string): StatItem[] {
  // Strip fenced code blocks and inline code before extracting — prevents
  // gas costs / bytecode values from producing nonsense infographic labels
  const cleanText = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ");

  const results: StatItem[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(STAT_RE.source, "g");

  while ((m = re.exec(cleanText)) !== null && results.length < 4) {
    const value = m[1].trim();
    if (value.length < 2 || /^\d$/.test(value)) continue;

    const start = Math.max(0, m.index - 40);
    const end = Math.min(cleanText.length, m.index + m[0].length + 50);
    const ctx = cleanText
      .slice(start, end)
      .replace(value, "")
      .replace(/[^a-zA-Z\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 4)
      .join(" ")
      .toLowerCase();

    if (ctx.length > 2) results.push({ value, label: ctx });
  }
  return results;
}

function extractConcepts(text: string): string[] {
  const bold = Array.from(text.matchAll(/\*\*(.+?)\*\*/g))
    .map((m) => m[1].trim())
    .filter((t) => t.length > 2 && t.length < 40);
  const code = Array.from(text.matchAll(/`(.+?)`/g))
    .map((m) => m[1].trim())
    .filter((t) => t.length > 1 && t.length < 30);
  const seen = new Set<string>();
  return [...bold, ...code].filter((t) => seen.has(t) ? false : (seen.add(t), true)).slice(0, 8);
}
