import { NextResponse } from "next/server";
import { dkDb } from "@/lib/chef/server";
import { walletForHandle } from "@/lib/chef/board";
import { sanitizeSave } from "@/app/chef/game/_engine/save";
import { serviceTier } from "@/app/chef/game/_engine/campaign";

/**
 * VISIT A KITCHEN (CUTE+VIRAL push): the public, read-only view of one
 * player's restaurant, addressed by their board handle so a wallet is never
 * in a URL.
 *
 * SCRUBBED BY CONSTRUCTION. The response is built field by field from an
 * allowlist; it never spreads the save. What goes out: the room name, the
 * layout, the theme and shell, the crew LOOK INDICES and hire counts, and the
 * public tier label. What can never go out: the wallet, coins, dials, pantry,
 * courses, regulars (their generated names are still someone's private room
 * flavour), and the chef's typed name, whose sanitizer comment has said
 * "never published" since M7d and stays true.
 *
 * The save passes through sanitizeSave() first, so even a hand-forged blob in
 * the database exits as legal game state, and dk-board-check's visit block
 * asserts the exact key set of this response.
 */

export const revalidate = 60;

const DK_GAME_KEY = "dk";

export async function GET(
  _req: Request,
  { params }: { params: { handle: string } }
) {
  // handleOf() produces `0xa1b2c3…4d5e` — six leading chars, a REAL
  // ellipsis, four trailing. Anything else 404s before touching the database.
  const handle = decodeURIComponent(String(params.handle || "")).toLowerCase();
  if (!/^0x[a-f0-9]{4}…[a-f0-9]{4}$/.test(handle)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const wallet = await walletForHandle(handle);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 404 });

  const db = dkDb();
  const { data, error } = await db
    .from("domain_kitchen_players")
    .select("state, best_quality")
    .eq("game_key", DK_GAME_KEY)
    .eq("wallet", wallet)
    .maybeSingle<{ state: unknown; best_quality: number }>();
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });

  const save = sanitizeSave(data.state);
  return NextResponse.json({
    ok: true,
    name: save.name,
    tier: serviceTier(Number(data.best_quality) || 0).name,
    theme: save.theme,
    shell: save.shell,
    layout: save.layout.map((p) => ({
      itemId: p.itemId,
      gx: p.gx,
      gy: p.gy,
      facing: p.facing,
    })),
    crew: { chef: save.crew.chef, waiter: save.crew.waiter },
    hires: { waiters: save.waiters, chefs: save.chefs },
  });
}
