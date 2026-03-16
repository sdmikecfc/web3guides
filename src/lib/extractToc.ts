export interface TocItem { id: string; text: string; level: 2 | 3; }

/** Extract TOC items from a markdown string — pure function, server-safe */
export function extractToc(md: string): TocItem[] {
  const lines = md.split("\n");
  const toc: TocItem[] = [];
  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    if (h2) toc.push({ id: slugId(h2[1]), text: h2[1], level: 2 });
    else if (h3) toc.push({ id: slugId(h3[1]), text: h3[1], level: 3 });
  }
  return toc;
}

function slugId(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
