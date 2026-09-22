/**
 * BATTLE BOTS WALK GATE (lane P): open every player surface on the running
 * dev server, at a desktop width and a phone width, and FAIL on anything the
 * player would see go wrong.
 *
 * scripts/bots-shot.mjs takes a picture and prints page exceptions. It does
 * not watch the network, so a missing part PNG or a 500 from the portrait
 * route is invisible to it: the canvas quietly falls back and the screenshot
 * looks fine. This walk enables the CDP Network domain, so a 404 on art is a
 * failure and not a shrug.
 *
 *   node scripts/bots-walk-check.mjs
 *   node scripts/bots-walk-check.mjs --base http://localhost:3000
 *   node scripts/bots-walk-check.mjs --only build      one surface
 *
 * Writes .bots-preview/look/WALK-<surface>-<width>.png and ends
 * ALL CHECKS GREEN / N CHECK(S) FAILED (exit 1), like the other gates.
 *
 * Dev-only: nothing imports it and it never runs in a build.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";

const CHROMES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const arg = (flag, dflt = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};

const BASE = arg("--base", "http://localhost:3000");
const ONLY = arg("--only", null);
const VERBOSE = process.argv.includes("--verbose");
const OUT_DIR = ".bots-preview/look";
const PORT = Number(arg("--port", "0")) || 9500 + (process.pid % 300);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const report = (ok, gate, msg) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "[OK] " : "[FAIL]"} walk ${gate} ${msg}`);
};

// ---------------------------------------------------------------------------
// the surfaces, in the order a player meets them
// ---------------------------------------------------------------------------

/** Real rows off the dev database, fetched below, land in these. */
const ids = { fight: null, bot: null, house: null };

function surfaces() {
  return [
    { key: "landing", url: `/bots`, wait: "bay" },
    { key: "garage", url: `/bots/garage`, wait: "bay" },
    { key: "build", url: `/bots/garage/build?bay=1`, wait: "art" },
    { key: "shop", url: `/bots/shop`, wait: "img" },
    // battles and board draw their robots CLIENT side, after a fetch. Waiting
    // on readyState alone captured them empty and reported "images none",
    // which is the walk lying about the page, not the page being wrong.
    { key: "battles", url: `/bots/battles`, wait: "img" },
    { key: "fight", url: `/bots/fight/${ids.fight}`, wait: "bay" },
    { key: "board", url: `/bots/board`, wait: "page" },
    // the live board is empty until somebody wins a fight, so the row of a
    // player's robots is drawn on the preview route. Walking only the empty
    // board would have called an unproven row proven.
    { key: "board-row", url: `/bots/board/preview`, wait: "img" },
    { key: "strategy", url: `/bots/strategy`, wait: "page" },
  ].filter((s) => !ONLY || s.key === ONLY);
}

/** Image routes: no DOM, checked over plain fetch for status and bytes. */
function imageRoutes() {
  return [
    { key: "ko card", url: `/api/bots/card/ko?f=${ids.fight}`, type: "image/png" },
    { key: "portrait bot", url: `/api/bots/portrait?b=${ids.bot}&s=300`, type: "image/png" },
    { key: "portrait fight", url: `/api/bots/portrait?f=${ids.fight}&w=0&s=120`, type: "image/png" },
    { key: "portrait house", url: `/api/bots/portrait?h=${ids.house}&t=30&s=120`, type: "image/png" },
  ];
}

// ---------------------------------------------------------------------------
// chrome over CDP, with the network watched
// ---------------------------------------------------------------------------

async function cdp(width, height, mobile) {
  const exe = CHROMES.find(existsSync);
  if (!exe) throw new Error("no Chrome or Edge found");
  const profile = join(tmpdir(), `bots-walk-${PORT}`);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* a locked stale profile is not fatal: Chrome reuses it */
  }
  const child = spawn(exe, [
    "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
    `--window-size=${width},${height}`, "about:blank",
  ], { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) { child.kill(); throw new Error("Chrome never opened its debug port"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });

  // what this walk exists to collect
  const seen = { console: [], exceptions: [], bad: [], failed: [], excused: [] };
  const urlOf = new Map();
  /** the message half of a groupCollapsed, waiting for its stack half */
  let lastGroup = null;

  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      return;
    }
    const p = msg.params || {};
    if (msg.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails;
      seen.exceptions.push(String(d?.exception?.description || d?.text || "").split("\n")[0].slice(0, 160));
    } else if (msg.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "warning" || p.type === "startGroupCollapsed")) {
      // PixiJS raises a deprecation as console.groupCollapsed(message) then
      // console.warn(stack). Chrome takes that branch, so watching only
      // "warning" catches a naked stack trace with the reason hidden inside a
      // collapsed group. Both halves are read here, and the stack half is
      // folded into the message it belongs to instead of being a second find.
      const text = (p.args || []).map((a) => a.value ?? a.description ?? "").join(" ").replace(/\s*\n\s*/g, " | ");
      const bareStack = /^\s*(\|\s*)?at\s/.test(text);
      if (bareStack && lastGroup) {
        const i = seen.console.indexOf(lastGroup);
        const merged = `${lastGroup} [raised ${text.replace(/%c/g, "").slice(0, 120)}]`;
        if (known(merged)) { if (i >= 0) seen.console.splice(i, 1); lastGroup = null; return; }
        if (i >= 0) seen.console[i] = merged; else if (!excused(merged)) seen.console.push(merged);
        lastGroup = null;
        return;
      }
      const line = `${p.type === "startGroupCollapsed" ? "warning" : p.type}: ${text.replace(/%c/g, "").slice(0, 300)}`;
      if (p.type === "startGroupCollapsed") lastGroup = excused(line) ? null : line;
      if (known(line)) { lastGroup = line; return; }
      if (VERBOSE) {
        console.log(`\n  --- console.${p.type} (${(p.args || []).length} args) ---`);
        (p.args || []).forEach((a, i) => console.log(`    arg[${i}] ${a.type}: ${JSON.stringify(String(a.value ?? a.description ?? "")).slice(0, 500)}`));
      }
      (excused(line) ? seen.excused : seen.console).push(line);
    } else if (msg.method === "Network.requestWillBeSent") {
      urlOf.set(p.requestId, p.request?.url || "");
    } else if (msg.method === "Network.responseReceived") {
      const st = p.response?.status ?? 0;
      // 304 is a cache hit, not a fault
      if (st >= 400) {
        const line = `${st} ${short(p.response?.url || "")}`;
        (excused(line) ? seen.excused : seen.bad).push(line);
      }
    } else if (msg.method === "Network.loadingFailed") {
      // a cancelled navigation request is the page moving on, not a fault
      if (!p.canceled) {
        const line = `${p.errorText} ${short(urlOf.get(p.requestId) || "")}`;
        (excused(line) ? seen.excused : seen.failed).push(line);
      }
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: mobile ? 3 : 1, mobile,
  });
  if (mobile) {
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  }
  return { send, seen, close: () => { ws.close(); child.kill(); } };
}

const short = (u) => String(u).replace(BASE, "").slice(0, 96);

/**
 * THE ONLY THINGS THIS WALK FORGIVES, each one named with its reason. The
 * list is deliberately short and specific: a wildcard here turns the gate
 * into decoration. Anything from our own source is NOT on it.
 */
const EXCUSED = [
  {
    // Next's dev overlay republishes webpack's build warnings as console
    // warnings. This one is a source-map warning inside a dependency; it is
    // not our code, and it does not exist in a production build.
    test: (s) => /warning:/.test(s) && /node_modules/.test(s),
    why: "a webpack build warning from a dependency, dev only",
  },
  {
    // A visitor who has not connected a wallet asks who they are and is told
    // "nobody". 401 is the correct answer, not a fault.
    test: (s) => /^401 \/api\/bots\/me/.test(s),
    why: "signed out: /api/bots/me answers 401, which is right",
  },
];
const excused = (line) => EXCUSED.some((e) => e.test(line));

/**
 * REAL defects that are already known and written down. These are NOT
 * forgiven: the walk still ends red because of them. They are pulled out of
 * the per-surface lines only so one defect on six screens is reported once,
 * with its fix, instead of six times with none.
 */
const KNOWN = [
  {
    id: "pixi-addchild-graphics",
    test: (s) => /Deprecation/.test(s) && /addChild: Only Containers/.test(s),
    what: "buildRig adds a Graphics as the child of a Graphics, which PixiJS 8 deprecates",
    where: "src/app/bots/_view/rig.ts: topper.addChild(hatArt) (~1550) and bootBand[s].addChild(bootMark[s]) (~1558); onPart() returns a Graphics",
    fix: "both parents DRAW (drawCrown / drawBootBand), so they cannot simply become Containers: " +
      "give each a Container that holds the transform and put the drawing Graphics and its child inside it, " +
      "then move .clear() / .position / .visible onto the right one of the two",
    risk: "a warning today, a break on the next PixiJS major. It moves nothing on screen now",
  },
];
const knownHit = new Map();
function known(line) {
  const k = KNOWN.find((x) => x.test(line));
  if (k) knownHit.set(k.id, (knownHit.get(k.id) || 0) + 1);
  return !!k;
}

const evaluate = (send, expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    .then((r) => r.result?.value);

/** Wait for the surface to actually be finished, not merely loaded. */
async function settle(send, mode) {
  const test =
    mode === "art" ? "b && b.artReady"
    : mode === "bay" ? "b && b.ready"
    : mode === "img" ? "document.images.length > 0"
    : "false";
  const got = await evaluate(send, `(async () => {
    for (let i = 0; i < 400; i++) {
      const b = window.__bots;
      if (${test}) return "ready";
      if (document.readyState === "complete" && ${mode === "page" ? "i > 6" : "i > 80"}) return "page";
      await new Promise(r => setTimeout(r, 150));
    }
    return "timeout";
  })()`);
  // the <img> portraits load after the DOM: a picture taken before they land
  // would hide the very 404 this walk is looking for
  // A portrait is loading="lazy", so an image below the fold never goes
  // complete and never will until the reader scrolls. "every image complete"
  // therefore times out on the longest lists and says nothing. What is a
  // DEFECT is an image the browser finished and could not decode, so that is
  // what is counted; the rest are reported as still to come.
  const imgs = await evaluate(send, `(async () => {
    for (let i = 0; i < 60; i++) {
      const all = [...document.images];
      if (all.length && all.some(im => im.complete)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 500));
    const all = [...document.images];
    if (!all.length) return "none";
    const done = all.filter(im => im.complete);
    const broken = done.filter(im => !im.naturalWidth).length;
    return (broken ? "broken:" + broken + " of " : "ok:") + done.length + "/" + all.length + " loaded";
  })()`);
  await sleep(400);
  return { got, imgs };
}

async function capture(send, file) {
  mkdirSync(dirname(file), { recursive: true });
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(r.data, "base64"));
  return Buffer.from(r.data, "base64").length;
}

// ---------------------------------------------------------------------------
// the walk
// ---------------------------------------------------------------------------

async function walk(width, height, mobile) {
  const label = `${width}`;
  const b = await cdp(width, height, mobile);
  try {
    for (const s of surfaces()) {
      const before = { c: b.seen.console.length, e: b.seen.exceptions.length, bad: b.seen.bad.length, f: b.seen.failed.length, x: b.seen.excused.length };
      await b.send("Page.navigate", { url: BASE + s.url });
      const { got, imgs } = await settle(b.send, s.wait);
      const bytes = await capture(b.send, join(OUT_DIR, `WALK-${s.key}-${label}.png`));

      const cons = b.seen.console.slice(before.c);
      const exc = b.seen.exceptions.slice(before.e);
      const bad = b.seen.bad.slice(before.bad);
      const failed = b.seen.failed.slice(before.f);
      const art = bad.concat(failed).filter((x) => /bots-art|portrait|card\/ko/.test(x));

      const ok = exc.length === 0 && cons.length === 0 && bad.length === 0 && failed.length === 0 && got !== "timeout" && !String(imgs).startsWith("broken");
      report(
        ok,
        `(${label}) ${s.key.padEnd(9)}`,
        ok
          ? `${s.url} ${got}, images ${imgs}, console clean, no failed request, ${(bytes / 1024).toFixed(0)} KB shot` +
              (b.seen.excused.length - before.x ? ` (${b.seen.excused.length - before.x} excused)` : "")
          : `${s.url} ${got}, images ${imgs}` +
              (exc.length ? ` | EXCEPTION ${exc.slice(0, 2).join(" ; ")}` : "") +
              (cons.length ? ` | CONSOLE ${cons.slice(0, 3).join(" ; ")}` : "") +
              (art.length ? ` | ART ${art.slice(0, 3).join(" ; ")}` : "") +
              (bad.concat(failed).length && !art.length ? ` | NET ${bad.concat(failed).slice(0, 3).join(" ; ")}` : ""),
      );
    }

    // the build screen, driven: pick a face, a sticker and a spot, reload on
    // the SAME profile, and read back what the page draws
    if (!ONLY || ONLY === "build") {
      await b.send("Page.navigate", { url: `${BASE}/bots/garage/build?bay=1` });
      await settle(b.send, "art");
      const picked = await evaluate(b.send, `(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const tap = async (label) => {
          const el = [...document.querySelectorAll("button")].find(
            (x) => (x.getAttribute("aria-label") || "").toLowerCase().startsWith(label.toLowerCase()));
          if (!el) return "MISS " + label;
          el.click(); await sleep(320); return "tapped " + label;
        };
        const steps = [await tap("Happy"), await tap("Heart"), await tap("Cheek")];
        await sleep(600);
        const row = (JSON.parse(localStorage.getItem("bots.garage.v1") || "{}").builds || {})["1"];
        return { steps, onScreen: window.__bots && window.__bots.look ? window.__bots.look().look : null, stored: row ? row.look : null };
      })()`);
      await capture(b.send, join(OUT_DIR, `WALK-build-picked-${label}.png`));

      await b.send("Page.navigate", { url: `${BASE}/bots/garage/build?bay=1` });
      await settle(b.send, "art");
      const back = await evaluate(b.send, `(async () => {
        const on = window.__bots && window.__bots.look ? window.__bots.look().look : null;
        return { onScreen: on, pressed: [...document.querySelectorAll("button[aria-pressed=true]")]
          .map(x => x.getAttribute("aria-label")).filter(Boolean) };
      })()`);
      await capture(b.send, join(OUT_DIR, `WALK-build-reload-${label}.png`));

      const chose = picked?.onScreen || {};
      const kept = back?.onScreen || {};
      const missed = (picked?.steps || []).filter((s) => String(s).startsWith("MISS"));
      const ok =
        missed.length === 0 &&
        chose.face === "happy" && chose.sticker === "heart" && chose.spot === "cheek" &&
        kept.face === "happy" && kept.sticker === "heart" && kept.spot === "cheek";
      report(
        ok,
        `(${label}) pick+reload`,
        ok
          ? `tapped Happy / Heart / Cheek, the page drew them, and after a real reload it still draws ` +
              `${kept.face} / ${kept.sticker} / ${kept.spot} with ${(back?.pressed || []).length} tiles pressed`
          : `steps ${JSON.stringify(picked?.steps)} chose ${JSON.stringify(chose)} kept ${JSON.stringify(kept)}`,
      );
    }
  } finally {
    b.close();
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const t0 = Date.now();

// real ids off the running server, so the walk visits real rows
try {
  const r = await fetch(`${BASE}/api/bots/battles`).then((x) => x.json());
  ids.fight = (r.recent || [])[0]?.id ?? null;
  ids.bot = (r.defenders || [])[0]?.botId ?? null;
  ids.house = (r.pve || [])[0]?.shapeId ?? null;
} catch (e) {
  console.error(`cannot reach ${BASE}: is the dev server up? (${e.message})`);
  process.exit(2);
}
if (!ids.fight || !ids.bot) {
  console.error(`the dev database has no finished fight or no defender to walk (fight ${ids.fight}, bot ${ids.bot})`);
  process.exit(2);
}
console.log(`walking ${BASE} with fight ${ids.fight}, bot ${ids.bot}, house ${ids.house}\n`);

// image routes first: they are plain bytes and need no browser
for (const im of imageRoutes()) {
  try {
    const res = await fetch(BASE + im.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "";
    const png = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
    const ok = res.status === 200 && type.includes(im.type.split("/")[1]) && png;
    report(ok, `(img) ${im.key.padEnd(15)}`, `${im.url} -> ${res.status} ${type} ${(buf.length / 1024).toFixed(1)} KB${png ? " (real PNG)" : " NOT A PNG"}`);
  } catch (e) {
    report(false, `(img) ${im.key.padEnd(15)}`, `${im.url} threw ${e.message}`);
  }
}
console.log("");

await walk(1440, 900, false);
console.log("");
await walk(390, 844, true);

for (const k of KNOWN) {
  const n = knownHit.get(k.id) || 0;
  if (!n) continue;
  report(false, "(known)", `${k.what}
         seen ${n} times on this walk
         where: ${k.where}
         fix:   ${k.fix}
         risk:  ${k.risk}`);
}

console.log(`\nshots in ${OUT_DIR}/WALK-*.png`);
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s wall clock`);
console.log(failures === 0 ? "ALL CHECKS GREEN" : `${failures} CHECK(S) FAILED`);
if (failures > 0) process.exit(1);
