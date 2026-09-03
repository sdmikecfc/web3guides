/**
 * BATTLE BOTS HEADLESS SCREENSHOTTER: look at the real page, chrome and all.
 * A copy of scripts/dk-shot.mjs (the Domain Kitchen screenshotter) pointed
 * at the Build screen, per the reuse law. The lesson it carries is s5-shot's:
 * "I have been shipping renderers I have never seen."
 *
 * HOW. Chrome is already installed on this machine, so this drives it over
 * the DevTools Protocol: no new dependency, no browser download. It waits for
 * the bay to actually finish building (the page sets window.__bots when the
 * Pixi stage is live and every part texture is on the rig), can run setup
 * JS (select a tray card so the hotspots pulse, lift a drag ghost) and then
 * captures a real PNG.
 *
 *   node scripts/bots-shot.mjs --out w1-build-1440.png --size 1440x900
 *   node scripts/bots-shot.mjs --out w1-build-390.png --size 390x844 --mobile
 *   node scripts/bots-shot.mjs --out drag.png --eval "window.__bots.drag('p_010', 620, 420)"
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

const URL_ = arg("--url", "http://localhost:3000/bots/garage/build?bay=1");
const OUT = arg("--out", ".bots-preview/shot.png");
const [W, H] = arg("--size", "1440x900").split("x").map(Number);
const CLICK = arg("--click", null);      // click the first element whose text contains this
/**
 * --eval runs a snippet in the page; --eval-file runs a FILE. Prefer the file
 * for anything longer than a line (a `//` comment in a one-line PowerShell
 * argument silently comments out the rest, which looks exactly like the page
 * failing to boot).
 */
const EVAL_FILE = arg("--eval-file", null);
const EVAL = EVAL_FILE ? readFileSync(EVAL_FILE, "utf8") : arg("--eval", null);
// --mobile is not the same as a narrow window: it sets a device pixel ratio,
// a touch-capable UA and touch event support, which is what decides whether
// hover styles apply and how the canvas is sized on a phone.
const MOBILE = process.argv.includes("--mobile");
// per-process port and profile (week 2): process.uptime() is ~0 this early,
// so every run landed on 9222 and a Chrome left behind by a killed run held
// its profile dir open (EBUSY on "Account Web Data"); the pid spreads them
const PORT = Number(arg("--port", "0")) || 9222 + (process.pid % 300);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdp() {
  const exe = CHROMES.find(existsSync);
  if (!exe) throw new Error("no Chrome or Edge found");
  const profile = join(tmpdir(), `bots-shot-${PORT}`);
  // --keep with a fixed --port reuses the profile, so localStorage survives
  // between two runs (the save-then-load check on the Build screen)
  if (!process.argv.includes("--keep")) {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* a locked stale profile is not fatal: Chrome reuses it */
    }
  }

  const child = spawn(exe, [
    "--headless", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--mute-audio",
    // the bay is WebGL: headless Chrome needs the software GL path told on
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    `--window-size=${W},${H}`,
    ...(arg("--dsf", "") ? [`--force-device-scale-factor=${arg("--dsf", "")}`] : []),
    "about:blank",
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
    // week 2: a canvas that never boots leaves a blank frame and a "1 error"
    // pill; print the page's exceptions and console errors so the reason is
    // in the log, not behind a headless overlay
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails;
      const text = d?.exception?.description || d?.text || "";
      console.warn("page exception:", text.split("\n").slice(0, 4).join(" | "));
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      const parts = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      console.warn("page console.error:", String(parts).split("\n").slice(0, 3).join(" | "));
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

  // Wait for the bay itself, not for the load event: the Pixi stage and the
  // part textures load AFTER the DOM is up, and the dev server may still be
  // compiling the route on first hit.
  const ready = await evaluate(shot.send, `(async () => {
    for (let i = 0; i < 400; i++) {
      if (window.__bots && window.__bots.ready) return "bay";
      if (i > 40 && document.readyState === "complete" && !document.querySelector("canvas")) return "page";
      await new Promise(r => setTimeout(r, 150));
    }
    return document.querySelector("canvas") ? "canvas-only" : "timeout";
  })()`);
  if (ready === "timeout") console.warn("warn: bay never booted, capturing whatever is there");

  // the tray thumbnails are <img>s loaded over the network after the bay
  const imgs = await evaluate(shot.send, `(async () => {
    for (let i = 0; i < 120; i++) {
      const all = [...document.images];
      if (all.length && all.every(im => im.complete && im.naturalWidth > 0)) return all.length;
      await new Promise(r => setTimeout(r, 100));
    }
    return "images-timeout:" + [...document.images].filter(im => !im.complete || !im.naturalWidth).length;
  })()`);
  if (String(imgs).startsWith("images-timeout")) console.warn(`warn: ${imgs}`);

  if (EVAL) {
    const out = await evaluate(shot.send, `(async () => { ${EVAL} })()`);
    if (out !== undefined) console.log("eval:", JSON.stringify(out, null, 2));
  }

  if (CLICK) {
    const hit = await evaluate(shot.send, `(() => {
      const wanted = ${JSON.stringify(CLICK)};
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

  // let the lift finish rising and the fonts settle before the capture
  await sleep(900);
  const { data } = await shot.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log(`${ready} -> ${OUT} (${W}x${H})`);
} finally {
  shot.close();
}
