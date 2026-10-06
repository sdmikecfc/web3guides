import { NextResponse } from "next/server";
import { dkDb, DK_GAME_KEY, walletForDkSession } from "@/lib/chef/server";
import { authorityEnabled, commandFingerprint, kitchenResponse, loadKitchen, resolveKitchenHandle, applyServerKitchenCommand } from "@/lib/chef/authority-server";
import { isSocialCommand, KitchenCommandError, type KitchenCommand } from "@/lib/chef/authority";
import { operationalQuality } from "@/lib/chef/offline";
import { KITCHEN_RULES } from "@/lib/chef/rules";
import { itemDef } from "@/app/chef/game/_engine/items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!authorityEnabled()) return response({ ok: false, code: "rollout_pending", error: "Connected restaurant progression is not enabled yet." }, 503);
  try {
    const raw = await req.text();
    if (raw.length > KITCHEN_RULES.maxCommandBytes) return response({ ok: false, error: "That action is too large." }, 413);
    let body: { t?: unknown; id?: unknown; revision?: unknown; command?: KitchenCommand };
    try { body = JSON.parse(raw); } catch { return response({ ok: false, error: "Invalid kitchen action." }, 400); }
    if (!body || typeof body !== "object") return response({ ok: false, error: "Invalid kitchen action." }, 400);
    const db = dkDb();
    const wallet = await walletForDkSession(db, body.t);
    if (!wallet) return response({ ok: false, error: "Session expired. Sign in again." }, 401);
    const now = Date.now();
    const current = await loadKitchen(db, wallet, now);
    if (body.command === undefined) return response(await kitchenResponse(db, current, now));
    if (!body.command || typeof body.command !== "object" || Array.isArray(body.command) || typeof body.command.type !== "string")
      return response({ ok: false, code: "invalid_command", error: "Choose a valid kitchen action." }, 400);
    if (typeof body.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0)
      return response({ ok: false, code: "invalid_envelope", error: "A command needs its unique ID and saved revision." }, 400);
    const fingerprint = commandFingerprint(body.command);
    const { data: receipt, error: receiptError } = await db.from("domain_kitchen_commands").select("fingerprint")
      .eq("game_key", DK_GAME_KEY).eq("wallet", wallet).eq("command_id", body.id).maybeSingle();
    if (receiptError) throw new KitchenCommandError("authority_unavailable", "The restaurant service is unavailable.", 503);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new KitchenCommandError("id_reused", "This action ID has already been used.", 409);
      return response({ ...await kitchenResponse(db, current, now), duplicate: true });
    }
    if (body.revision !== current.revision) return response({ ...await kitchenResponse(db, current, now), ok: false, code: "conflict", error: "Your kitchen changed on another device. Review the refreshed restaurant." }, 409);
    let target: { id: string; record: typeof current } | undefined;
    if (isSocialCommand(body.command)) {
      const id = await resolveKitchenHandle(db, "targetHandle" in body.command ? body.command.targetHandle : undefined);
      if (!id || id === wallet) throw new KitchenCommandError("invalid_neighbor", "That restaurant is unavailable.", 404);
      target = { id, record: await loadKitchen(db, id, now) };
    }
    const next = applyServerKitchenCommand(current, body.command, now, wallet, target);
    const seats = (record: typeof current) => record.save.layout.filter((p) => itemDef(p.itemId)?.kind === "chair").length;
    const { data: result, error } = await db.rpc("dk_commit_command", {
      p_game: DK_GAME_KEY, p_wallet: wallet, p_command: body.id, p_fingerprint: fingerprint,
      p_expected_revision: current.revision, p_save: next.actor.save, p_authority: next.actor.authority,
      p_quality: operationalQuality(next.actor.save, next.actor.authority.settlement.condition), p_seats: seats(next.actor),
      p_target_wallet: target?.id ?? null, p_target_revision: target?.record.revision ?? null,
      p_target_save: next.target?.save ?? null, p_target_authority: next.target?.authority ?? null,
      p_target_quality: next.target ? operationalQuality(next.target.save, next.target.authority.settlement.condition) : null,
      p_target_seats: next.target ? seats(next.target) : null,
    });
    if (error) throw new KitchenCommandError("authority_unavailable", "The action could not be confirmed. Retry with the same action ID.", 503);
    if (!result?.ok) {
      const fresh = await loadKitchen(db, wallet, now);
      return response({ ...await kitchenResponse(db, fresh, now), ok: false, code: result?.code ?? "conflict", error: "Your kitchen changed while saving. Review the refreshed restaurant." }, 409);
    }
    return response({ ...await kitchenResponse(db, await loadKitchen(db, wallet, now), now), duplicate: !!result.duplicate });
  } catch (error) {
    if (error instanceof KitchenCommandError) return response({ ok: false, code: error.code, error: error.message, ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}) }, error.status);
    console.error("[domain-kitchen] command failed", error instanceof Error ? error.name : "unknown");
    return response({ ok: false, code: "authority_unavailable", error: "Your kitchen could not be reached. Please try again." }, 503);
  }
}
