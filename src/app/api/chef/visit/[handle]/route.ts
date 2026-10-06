import { NextResponse } from "next/server";
import { dkDb } from "@/lib/chef/server";
import { walletForHandle } from "@/lib/chef/board";
import { sanitizeSave } from "@/app/chef/game/_engine/save";
import { serviceTier } from "@/app/chef/game/_engine/campaign";
import { authorityEnabled, resolveKitchenHandle } from "@/lib/chef/authority-server";
import { sanitizeDesign, sanitizeMaintenance } from "@/app/chef/game/_engine/building";
import { operativeMenuForSave } from "@/lib/chef/offline";

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

export const dynamic = "force-dynamic";

const DK_GAME_KEY = "dk";

export async function GET(
  _req: Request,
  { params }: { params: { handle: string } }
) {
  // handleOf() produces `0xa1b2c3…4d5e` — six leading chars, a REAL
  // ellipsis, four trailing. Anything else 404s before touching the database.
  let handle: string;
  try { handle = decodeURIComponent(String(params.handle || "")).toLowerCase(); }
  catch { return NextResponse.json({ ok: false }, { status: 404 }); }
  if (!/^0x[a-f0-9]{4}…[a-f0-9]{4}$/.test(handle)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const db = dkDb();
  const wallet = authorityEnabled() ? await resolveKitchenHandle(db, handle) : await walletForHandle(handle);
  if (!wallet) return NextResponse.json({ ok: false }, { status: 404 });

  const { data, error } = await db
    .from("domain_kitchen_players")
    .select("state, best_quality")
    .eq("game_key", DK_GAME_KEY)
    .eq("wallet", wallet)
    .maybeSingle<{ state: unknown; best_quality: number }>();
  if (error || !data) return NextResponse.json({ ok: false }, { status: 404 });

  const save = sanitizeSave(data.state);
  const condition = sanitizeMaintenance(save.maintenance);
  const selected = operativeMenuForSave(save);
  const instances = Object.fromEntries(save.layout.flatMap(piece => {
    const instance = save.equipment.instances[String(piece.uid)];
    return instance && instance.itemId === piece.itemId
      ? [[String(instance.uid), { uid: instance.uid, itemId: instance.itemId, condition: instance.condition }]] : [];
  }));
  return NextResponse.json({
    ok: true,
    name: save.name,
    tier: serviceTier(Number(data.best_quality) || 0).name,
    theme: save.theme,
    shell: save.shell,
    layout: save.layout.map((p) => ({
      uid: p.uid,
      itemId: p.itemId,
      gx: p.gx,
      gy: p.gy,
      facing: p.facing,
    })),
    crew: { chef: save.crew.chef, waiter: save.crew.waiter },
    hires: { waiters: save.waiters, chefs: save.chefs },
    design: sanitizeDesign(save.design),
    condition: { cleanliness: condition.cleanliness, equipment: condition.equipment },
    equipment: { instances },
    interactions: { parcels: authorityEnabled(), help: authorityEnabled() && (condition.cleanliness < 100 || condition.equipment < 100) },
    menu: { selected, levels: Object.fromEntries(selected.map((id) => [id, save.pantry.levels[id] ?? 1])) },
  });
}
