/**
 * S5 HEADLESS SCREENSHOTTER — look at the games without a browser.
 *
 * WHY THIS EXISTS. Every visual note Mike has given this season ("the tanks are
 * upside down", "all graphics look bad", "still ugly", "don't think any work has
 * been done") is a note I could not have caught myself, because I have been
 * shipping renderers I have never seen. The harness proves the sims are correct
 * and says nothing at all about whether the screen looks like a game.
 *
 * HOW. The renderers are already pure: `draw(ctx, state, view)` takes a plain
 * CanvasRenderingContext2D and touches nothing else. So we give it a real 2D
 * context from @napi-rs/canvas, drive the sim forward with the harness bots, and
 * write a PNG. Same code path the browser runs, minus the browser.
 *
 * The one wrinkle is that `draw` lives inside a `useCallback` in a React client
 * component. Its dep array is `[]` in every game, which is the machine-checked
 * statement that it closes over nothing but module scope -- so lifting the body
 * out to a standalone module is sound, not a guess. extractDraw() does that
 * lift, and fails loudly if a game ever grows a real dependency.
 *
 *   npx tsx scripts/s5-shot.mts breakthrough 6,14,30
 *
 * Writes to scratchpad/shots/. Dev-only: nothing imports this, and it never runs
 * in CI or a build.
 */
import { createCanvas, Image, type SKRSContext2D } from "@napi-rs/canvas";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "..", "shots");

/**
 * Browser globals the renderers legitimately use. These are shims, not fakes:
 * each one forwards to the real napi-rs implementation, so a gradient or a
 * baked texture behaves exactly as it does in Chrome.
 */
function installDom() {
  const g = globalThis as Record<string, unknown>;
  g.Image = Image;
  g.document = {
    createElement(tag: string) {
      if (tag === "canvas") return createCanvas(1, 1);
      return {};
    },
  };
  g.window = g;
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.devicePixelRatio = 2;
  g.requestAnimationFrame = (fn: (t: number) => void) => setTimeout(() => fn(0), 0) as unknown as number;
  g.cancelAnimationFrame = () => {};
  g.performance = g.performance ?? { now: () => 0 };
  g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}

/**
 * Lift `const draw = useCallback((ctx, s, view) => { ... }, [])` out of the
 * component and into a module of its own, carrying every module-scope helper
 * it depends on.
 *
 * Refuses to run if the dep array is non-empty: that would mean the renderer
 * reads component state, the lift would silently drop it, and the PNG would be
 * a lie. Better to fail than to look at the wrong picture.
 */
function extractDraw(game: string): string {
  const src = readFileSync(join(ROOT, "src/app/s5/games", game, "Client.tsx"), "utf8");

  const compAt = src.search(/^export default function \w+Client/m);
  if (compAt < 0) throw new Error(`${game}: no default component found`);
  const prelude = src.slice(0, compAt);

  /**
   * Lift `const NAME = useCallback(<arrow>, [deps])` to a standalone function.
   * Found by paren balance from the `useCallback(` onward, so it does not care
   * whether the arrow is inline or on its own line, and it cannot be fooled by
   * a nested `}, [` inside the body.
   */
  const lift = (name: string): { code: string; deps: string } | null => {
    const at = src.indexOf(`const ${name} = useCallback(`);
    if (at < 0) return null;
    const open = src.indexOf("(", src.indexOf("useCallback", at));
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    const inner = src.slice(open + 1, end);
    // the dep array is the last top-level [...] in the call
    const dm = /,\s*\[([^\]]*)\]\s*,?\s*$/.exec(inner);
    const deps = dm ? dm[1] : "";
    const arrow = dm ? inner.slice(0, dm.index) : inner;
    return { code: `export const ${name} = ${arrow.trim()};`, deps };
  };

  const drawLift = lift("draw");
  if (!drawLift) throw new Error(`${game}: no draw useCallback found`);
  if (drawLift.deps.trim() !== "") {
    throw new Error(
      `${game}: draw closes over [${drawLift.deps}] -- the lift would drop it. ` +
        `Move that value to module scope, or teach this script to pass it in.`,
    );
  }
  // createSim is where each game seeds its own refs (page fx, camera, cinematic
  // state) before the first paint. Lifting it too means the shot runs the exact
  // setup the shell runs, instead of drawing against half-initialised refs.
  const createLift = lift("createSim");

  // REFS ARE NOT A DEPENDENCY, and React is right not to demand they be listed:
  // a ref is a stable box whose identity never changes. But that means an empty
  // dep array does NOT imply the renderer touches only module scope -- it can
  // still read refs, and both Warpath and Warhawks do (camera state, fx state).
  // Hoisting the declarations verbatim to module scope preserves the semantics
  // exactly for a single mounted component, which is all we are simulating.
  // Scanned by paren balance rather than matched by pattern: these declarations
  // carry generics (useRef<Cam>) and span many lines, and a regex that handles
  // both silently misses the ones it does not.
  const compLines = src.slice(compAt, src.indexOf("const draw = useCallback(")).split("\n");
  const refs: string[] = [];
  for (let i = 0; i < compLines.length; i++) {
    if (!/^ {2}const \w+Ref = useRef/.test(compLines[i])) continue;
    let depth = 0;
    const chunk: string[] = [];
    for (let j = i; j < compLines.length; j++) {
      chunk.push(compLines[j]);
      for (const ch of compLines[j]) {
        if (ch === "(" || ch === "{" || ch === "[") depth++;
        else if (ch === ")" || ch === "}" || ch === "]") depth--;
      }
      if (depth <= 0 && compLines[j].trimEnd().endsWith(";")) {
        i = j;
        break;
      }
    }
    refs.push(chunk.join("\n").replace("useRef", "__ref"));
  }
  // useRef IS a hook and throws outside a render. A ref is a plain mutable box,
  // so __ref is not a stand-in for one -- it is one. Swapping the identifier
  // (rather than rewriting the declaration) keeps generics and multi-line
  // initialisers exactly as the author wrote them.
  const refsTxt = refs.join("\n");
  const refShim = refsTxt ? `function __ref<T>(v: T) { return { current: v }; }\n` : "";

  return `${prelude}\n${refShim}${refsTxt}\n${createLift ? createLift.code : ""}\n${drawLift.code}\n`;
}

async function main() {
  const game = process.argv[2];
  const frames = (process.argv[3] || "10,40,90").split(",").map((n) => parseInt(n, 10));
  if (!game) throw new Error("usage: npx tsx scripts/s5-shot.mts <game> [frame,frame,...]");

  installDom();
  mkdirSync(OUT, { recursive: true });

  // The lifted renderer is written next to the original so its relative imports
  // ("./sim", "../_shared/art") resolve exactly as they do in the real file.
  const shim = join(ROOT, "src/app/s5/games", game, `__shot.tsx`);
  writeFileSync(shim, extractDraw(game));

  try {
    const mod = (await import(pathToFileURL(shim).href)) as {
      draw: (ctx: SKRSContext2D, s: unknown, view: { w: number; h: number }) => void;
      createSim?: (w: number, h: number, seed: string, reduced: boolean, stats: unknown) => unknown;
    };
    const draw = mod.draw;
    const sim = await import(pathToFileURL(join(ROOT, "src/app/s5/games", game, "sim.ts")).href);

    // Shoot at the shape the game actually runs in. Three of the four are
    // portrait; a landscape canvas would show a world the player never sees.
    const dims = (process.argv[4] || "540x760").split("x").map((n) => parseInt(n, 10));
    const W = dims[0];
    const H = dims[1];
    const create = Object.values(sim).find(
      (v) => typeof v === "function" && /^create/.test((v as { name: string }).name),
    ) as (w: number, h: number, seed: string, reduced: boolean, stats: unknown) => unknown;
    const step = Object.values(sim).find(
      (v) => typeof v === "function" && /^step/.test((v as { name: string }).name),
    ) as (s: unknown, dt: number, input: unknown) => void;
    if (!create || !step) throw new Error(`${game}: could not find create*/step* exports`);

    // Prefer the component's own createSim: it seeds the refs the renderer
    // reads. Fall back to the raw sim constructor for games that have none.
    const make = mod.createSim ?? create;
    const s = make(W, H, "shot", false, {
      firepower: 5,
      speed: 5,
      maneuver: 5,
      armor: 5,
      optics: 5,
    });

    const want = new Set(frames);
    const maxF = Math.max(...frames);
    for (let f = 0; f <= maxF; f++) {
      if (want.has(f)) {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        draw(ctx, s, { w: W, h: H });
        const p = join(OUT, `${game}-${String(f).padStart(3, "0")}.png`);
        writeFileSync(p, canvas.toBuffer("image/png"));
        console.log(`wrote ${p}`);
      }
      step(s, 1 / 60, {});
    }
  } finally {
    // The shim is a build-visible .tsx inside app/; leaving it behind would put
    // a stray module in the route tree.
    if (existsSync(shim)) writeFileSync(shim, "");
    const { unlinkSync } = await import("node:fs");
    try {
      unlinkSync(shim);
    } catch {
      /* already gone */
    }
  }
}

main().catch((e) => {
  console.error(String(e?.message || e));
  process.exit(1);
});
