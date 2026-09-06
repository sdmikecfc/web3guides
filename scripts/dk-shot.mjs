/**
 * DOMAIN KITCHEN HEADLESS SCREENSHOTTER — look at the real page, chrome and all.
 *
 * WHY THIS EXISTS. scripts/s5-shot.mts opens with the lesson that earned it:
 * "I have been shipping renderers I have never seen." The same trap was open
 * here in a different place. dk-preview.mjs composites the BAKED ART and can
 * prove registration, but it renders no DOM at all, so the shop, the panels and
 * the modals -- a third of the screen -- were unreviewable. The in-app browser
 * pane cannot always composite frames for a screenshot, and chunking a canvas
 * data URL back through a tool call is not a workflow.
 *
 * HOW. Chrome is already installed on this machine, so this drives it over the
 * DevTools Protocol: no new dependency, no browser download, no CI footprint.
 * It waits for the game to actually finish its counted preload rather than
 * guessing with a virtual time budget, can run arbitrary setup JS (open a
 * modal, tick the world, swap a theme) and then captures a real PNG.
 *
 *   node scripts/dk-shot.mjs --out shop.png --click "🛒"
 *   node scripts/dk-shot.mjs --out crew.png --eval "__dk.tick(600)" --click "Crew"
 *   node scripts/dk-shot.mjs --out wide.png --size 1440x900
 *
 * Dev-only: nothing imports it, and it never runs in a build.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

const URL_ = arg("--url", "http://chef.localhost:3000/");
const OUT = arg("--out", ".dk-preview/shot.png");
const [W, H] = arg("--size", "1280x800").split("x").map(Number);
const CLICK = arg("--click", null);      // click the first element whose text contains this
/**
 * --eval runs a snippet in the page; --eval-file runs a FILE.
 *
 * Prefer the file for anything longer than a line. Passing real JS through a
 * PowerShell argument means flattening it to one line, and the moment it
 * contains a `//` comment everything after it silently becomes commented out
 * -- which looks exactly like the page failing to boot. A file keeps its
 * newlines, so comments and multi-line probes behave.
 */
const EVAL_FILE = arg("--eval-file", null);
const EVAL = EVAL_FILE
  ? readFileSync(EVAL_FILE, "utf8")
  : arg("--eval", null);
// --mobile is not the same as a narrow window: it sets a device pixel ratio,
// a touch-capable UA and touch event support, which is what actually decides
// whether hover styles apply and how the canvas is sized on a phone.
const MOBILE = process.argv.includes("--mobile");
const PORT = 9222 + Math.floor(process.uptime() * 7) % 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp() {
  const exe = CHROMES.find(existsSync);
  if (!exe) throw new Error("no Chrome or Edge found");
  const profile = join(tmpdir(), `dk-shot-${PORT}`);
  rmSync(profile, { recursive: true, force: true });

  const child = spawn(exe, [
    "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    // --dsf N reproduces a Windows display-scale (125% = 1.25) headlessly:
    // coordinate-mapping bugs that only bite scaled displays show up here
    ...(arg("--dsf", "") ? [`--force-device-scale-factor=${arg("--dsf", "")}`] : []),
    "about:blank",
  ], { stdio: "ignore" });

  // wait for the debugging endpoint to answer
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

  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  return { send, close: () => { ws.close(); child.kill(); } };
}

/** run an expression in the page and return its value */
const evaluate = (send, expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    .then((r) => r.result?.value);

const shot = await cdp();
try {
  await shot.send("Page.enable");
  await shot.send("Runtime.enable");
  await shot.send("Emulation.setDeviceMetricsOverride", {
    width: W, height: H,
    deviceScaleFactor: MOBILE ? 3 : 1,
    mobile: MOBILE,
  });
  if (MOBILE) {
    await shot.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await shot.send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
  }
  await shot.send("Page.navigate", { url: URL_ });

  // Wait for the game itself, not for the load event. preload.ts is a REAL
  // counted load of ~2MB, so "loaded" and "ready to look at" are far apart.
  const ready = await evaluate(shot.send, `(async () => {
    for (let i = 0; i < 200; i++) {
      if (window.__dk) return "game";
      // Not every page IS the game: /chef/board and friends have no canvas and
      // never define the hook, so give up quickly rather than burning the full
      // 30s wait on a page that has already finished loading.
      if (i > 12 && document.readyState === "complete" && !document.querySelector("canvas")) {
        return "page";
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return document.querySelector("canvas") ? "canvas-only" : "timeout";
  })()`);
  if (ready === "timeout") console.warn("warn: game never booted, capturing whatever is there");

  // Wait for every <img> too, not just the game. This script wipes its profile
  // on each run so there is no cache, and the DOM chrome loads its thumbnails
  // over the network AFTER the Pixi preload resolves. Capturing on __dk alone
  // photographed empty thumbnail boxes and made a loading race look like a CSS
  // bug -- which nearly got "fixed" in the stylesheet.
  const imgs = await evaluate(shot.send, `(async () => {
    for (let i = 0; i < 120; i++) {
      const all = [...document.images];
      if (all.length && all.every(im => im.complete && im.naturalWidth > 0)) return all.length;
      await new Promise(r => setTimeout(r, 100));
    }
    return "images-timeout:" + [...document.images].filter(im => !im.complete || !im.naturalWidth).length;
  })()`);
  if (String(imgs).startsWith("images-timeout")) console.warn(`warn: ${imgs}`);

  // async wrapper so an --eval can await: the React chrome re-renders off its
  // own ~600ms poll, so mutating world state and capturing immediately
  // photographs the PREVIOUS snapshot. Callers can `await` a beat.
  //
  // The eval's RETURN VALUE is printed, so this doubles as a measuring tool
  // under real device emulation: tap-target sizes, computed styles and
  // viewport behaviour can only be checked with the mobile UA and DPR applied,
  // which a normal browser tab cannot fake.
  if (EVAL) {
    const out = await evaluate(shot.send, `(async () => { ${EVAL} })()`);
    if (out !== undefined) console.log("eval:", JSON.stringify(out, null, 2));
  }

  if (CLICK) {
    const hit = await evaluate(shot.send, `(() => {
      const wanted = ${JSON.stringify(CLICK)};
      // Collapse headers are clickable DIVs, not buttons, so a button-only
      // selector silently did nothing and the shot looked like the panel had
      // failed to open. Anything with a pointer cursor counts as a control.
      const els = [...document.querySelectorAll("button, a, [role=button], div, span")]
        .filter((e) => e.tagName !== "DIV" || getComputedStyle(e).cursor === "pointer");
      const el = els.find(e => (e.textContent || "").includes(wanted));
      if (!el) return "miss:" + els.map(e => (e.textContent||"").trim().slice(0,14)).join("|");
      el.click();
      return "clicked";
    })()`);
    if (String(hit).startsWith("miss")) console.warn(`warn: no control matched ${CLICK}. saw ${hit.slice(5)}`);
    await sleep(450);
  }

  // one more frame so any transition settles
  await sleep(350);
  const { data } = await shot.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log(`${ready} -> ${OUT} (${W}x${H})`);
} finally {
  shot.close();
}
