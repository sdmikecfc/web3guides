/**
 * Ambassador handle grammar — pure functions, no I/O (mirrors src/lib/s6/handles.ts
 * discipline: a URL never carries a wallet or a full Discord id).
 *
 * handle = slug(displayName), else "amb-" + last 6 of the discord id.
 * Intra-board slug collisions get a deterministic "-XXXX" suffix (last 4 of id)
 * so two ambassadors named "Max" both keep working links.
 */

export function slugify(name: string | null | undefined): string {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type Handleable = { discordId: string; displayName: string | null };

/** Assign a unique handle to every row. Deterministic for a given board. */
export function buildHandles<T extends Handleable>(rows: T[]): Map<string, T> {
  const byHandle = new Map<string, T>();
  const wanted = rows.map((r) => {
    const slug = slugify(r.displayName);
    return { row: r, base: slug || `amb-${r.discordId.slice(-6)}` };
  });
  const counts = new Map<string, number>();
  for (const w of wanted) counts.set(w.base, (counts.get(w.base) || 0) + 1);
  for (const w of wanted) {
    const handle =
      (counts.get(w.base) || 0) > 1 ? `${w.base}-${w.row.discordId.slice(-4)}` : w.base;
    byHandle.set(handle, w.row);
  }
  return byHandle;
}

export function handleFor<T extends Handleable>(rows: T[], discordId: string): string | null {
  let found: string | null = null;
  buildHandles(rows).forEach((row, handle) => {
    if (found === null && row.discordId === discordId) found = handle;
  });
  return found;
}

/** Shorten a wallet for display — full addresses never render on the dashboard. */
export function shortWallet(w: string | null | undefined): string {
  const s = String(w ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return s ? s.slice(0, 12) : "—";
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
