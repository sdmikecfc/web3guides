import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Group } from "three";
import { ENTRY_MAP, defaultAppearance } from "@/lib/bots/workshop8/catalogue";
import { Practice8, build8 } from "@/lib/bots/workshop8/runtime/v8-engine";
import { prepareLibrary } from "@/lib/bots/workshop8/runtime/parts-assembly";
import { PREVIEW_VERSIONS } from "@/lib/bots/workshop8/runtime/asset-versions";
import type { Fight8 } from "@/lib/bots/workshop8/state";
import { prepareTraining, TRAINING_VERSION } from '@/lib/bots/workshop8/training';
import receipt from "../../../../server-assets/bots8/receipt.json";

const cache = new Map<string, Promise<Group>>();
async function asset(id: string): Promise<Group> {
  const metadata = (receipt.assets as Record<string, { sourceHash: string; sha256: string }>)[id];
  if (!metadata || (ENTRY_MAP.has(id) && metadata.sourceHash !== ENTRY_MAP.get(id)!.sha256)) throw Error("Fight geometry does not match the catalogue.");
  if (!cache.has(id)) {
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    const loaded = (async () => {
      const bytes = gunzipSync(await readFile(join(process.cwd(), "server-assets/bots8", `${id}.glb.gz`)));
      if (createHash("sha256").update(bytes).digest("hex") !== metadata.sha256) throw Error("Fight geometry failed its integrity check.");
      const model = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")).scene;
      if (ENTRY_MAP.has(id)) { model.userData.weaponKind = ENTRY_MAP.get(id)!.weapon; model.userData.weaponHands = ENTRY_MAP.get(id)!.hands; prepareLibrary(model); }
      return model;
    })();
    cache.set(id, loaded); loaded.catch(() => cache.delete(id));
  }
  return cache.get(id)!;
}

export const WORKSHOP_RULES = {events:2,rules:`mk8-practice-${PREVIEW_VERSIONS.rules}-stable-fists-1`,motion:`mk8-weapon-motion-${PREVIEW_VERSIONS.motion}`,presentation:`mk8-personal-toys-${PREVIEW_VERSIONS.presentation}`};
export async function simulateWorkshopFight(fight: Fight8, tick: number) {
  const recorded=fight.versions as Record<string,unknown>|undefined;
  // Event annotations and presentation do not alter contact math. Older packets
  // retain event v1 and their archived renderer, with the same pinned rules/pose.
  if(!recorded||recorded.rules!==WORKSHOP_RULES.rules||recorded.motion!==WORKSHOP_RULES.motion||![undefined,1,2].includes(recorded.events as number|undefined)||fight.mode==='training'&&recorded.training!==TRAINING_VERSION)throw Error('This fight needs its recorded engine version. No result was changed.');
  const ids = [...new Set([...Object.values(fight.choices), ...Object.values(fight.rival), "__support", "__special"])];
  const library = new Map(await Promise.all(ids.map(async id => [id, await asset(id)] as const)));
  const engine = new Practice8([build8(fight.choices, ENTRY_MAP, fight.appearance), build8(fight.rival, ENTRY_MAP, defaultAppearance(ENTRY_MAP.get(fight.rival.torso)!.family))], library, fight.seed, true);
  engine.eventVersion=recorded.events===2?2:1;
  if(fight.mode==='training')prepareTraining(engine);
  // Only server-accepted owner inputs are replayed. Defender decisions are
  // deterministic and remain automatic during disconnection.
  engine.pending = (fight.inputs ?? []).filter(i => i.who === 0).map(i => ({ ...i }));
  engine.auto = [false, true];
  const target = Math.max(0, Math.min(7200, Math.floor(tick)));
  while (!engine.done && engine.tick < target) engine.step();
  return engine;
}
