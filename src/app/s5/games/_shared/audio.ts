/**
 * S5 shared SAMPLE LOADER — the audio equivalent of art.ts's try-image-else-
 * vector contract: TRY SAMPLE, ELSE SYNTH. Lazily fetches + decodes audio
 * files from /s5-art/audio/<name>.<ext> into an AudioBuffer cache, keyed by
 * name, with in-flight de-duplication. A missing file or a decode failure
 * marks that name permanently "unavailable" and every later call for it
 * resolves to null instantly: a missing or partial audio directory is
 * completely invisible to the player, exactly like a missing sprite PNG is to
 * art.ts. This module never throws.
 *
 * EXTENSION RULE (mirrors art.ts's bg-*.webp carve-out): every ONE-SHOT name
 * ships as .mp3; the six LOOP names ship as .wav (16-bit mono PCM, 22050 Hz,
 * exactly 2.000s each). Reason: mp3 encoder padding makes sample-exact
 * looping unreliable across browsers (Safari especially), and loops are the
 * one place that matters here. PCM WAV decodes identically everywhere via
 * decodeAudioData, and the pack's loop material is wrap-crossfaded, so
 * sfx.ts's loop() can use loopStart=0 / loopEnd=buffer.duration exactly (no
 * inset needed — see sfx.ts for the loop-point contract).
 *
 * BANDWIDTH RULE: nothing fetches until unlock() has been called once (the
 * first unmute / user gesture), so a muted visitor costs zero network bytes.
 * sfx.ts calls unlock() the moment audio is actually enabled (born-unmuted
 * createSfx(true), or the first manual unmute).
 *
 * This module owns NO AudioContext: decodeAudioData just needs *a* context to
 * decode against, and sfx.ts already owns the one every game plays through,
 * so every call here takes that context as a parameter rather than creating
 * its own (avoids any cross-context sample-rate mismatch).
 */

/** ONE base64 JSON holds every clip. This is not a size optimisation, it is a
 * correctness one: serving /s5-art/audio/<name>.mp3 makes download-manager
 * extensions (FDM and friends) pop a "save this file?" dialog mid-game, which
 * is exactly what happened on the first real playtest. Nothing on the wire may
 * look like a downloadable media file. application/json is never intercepted,
 * and it collapses 35 requests into 1. Built by gen-s5-audio.py; the mp3/wav
 * intermediates live in audio_build/ and are NOT served. */
const PACK_URL = "/s5-art/audio/pack.json";

type Pack = { v: number; clips: Record<string, string> };

let packPromise: Promise<Record<string, string> | null> | null = null;

function loadPack(): Promise<Record<string, string> | null> {
  if (!packPromise) {
    packPromise = (async () => {
      try {
        const res = await fetch(PACK_URL);
        if (!res.ok) throw new Error(`pack ${res.status}`);
        const j = (await res.json()) as Pack;
        return j && j.clips ? j.clips : null;
      } catch {
        return null; // whole pack missing: every name falls back to the synth
      }
    })();
  }
  return packPromise;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Entry =
  | { state: "loading"; promise: Promise<AudioBuffer | null> }
  | { state: "ready"; buffer: AudioBuffer }
  | { state: "failed" };

const cache = new Map<string, Entry>();
let unlocked = false;

/** Call once, from inside a user-gesture / already-enabled-audio path (sfx.ts
 * does this). Idempotent. Before this, ensure()/prefetch() are no-ops that
 * resolve to null, so a muted visitor never costs a byte of network. */
export function unlock(): void {
  unlocked = true;
}

export function isUnlocked(): boolean {
  return unlocked;
}

/** Fetch + decode one name, memoized. Never throws: a 404 or a decode error
 * permanently marks the name "failed" so it is never refetched/redecoded and
 * every future call resolves to null immediately. */
export function ensure(ctx: AudioContext, name: string): Promise<AudioBuffer | null> {
  if (!unlocked) return Promise.resolve(null);
  const hit = cache.get(name);
  if (hit) {
    if (hit.state === "ready") return Promise.resolve(hit.buffer);
    if (hit.state === "failed") return Promise.resolve(null);
    return hit.promise; // in-flight: de-duplicated
  }
  const promise = (async () => {
    try {
      const clips = await loadPack();
      const b64 = clips ? clips[name] : undefined;
      if (!b64) throw new Error(`sample ${name} not in pack`);
      const buf = await ctx.decodeAudioData(b64ToBytes(b64).buffer as ArrayBuffer);
      cache.set(name, { state: "ready", buffer: buf });
      return buf;
    } catch {
      cache.set(name, { state: "failed" });
      return null;
    }
  })();
  cache.set(name, { state: "loading", promise });
  return promise;
}

/** Synchronous cache read for the hot path (sfx.play/loop): returns a
 * decoded buffer only if it is ALREADY resolved. Never kicks off a fetch and
 * never blocks a frame. Call ensure()/prefetch() ahead of time to warm this;
 * a name that has not resolved yet just reads as null (caller falls back to
 * the synth for that one call, same as art.ts's ready()). */
export function peek(name: string): AudioBuffer | null {
  const hit = cache.get(name);
  return hit && hit.state === "ready" ? hit.buffer : null;
}

/** Fire-and-forget warm-up for a game's whole sound pack; call once at run
 * start. Names already cached (ready, loading, or permanently failed) are
 * skipped. No-op until unlock() has been called. */
export function prefetch(ctx: AudioContext, names: readonly string[]): void {
  if (!unlocked) return;
  for (const n of names) {
    if (!cache.has(n)) void ensure(ctx, n);
  }
}
