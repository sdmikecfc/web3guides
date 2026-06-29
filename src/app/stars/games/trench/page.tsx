/**
 * STARFALL · Trench Run — a real 3D Death-Star trench (three.js, first-person).
 * Fly the trench at full burn: greebled metal walls rush past, fog + a gold glow
 * at the vanishing point for depth, barriers approach and you bank to thread the
 * gap. 3 lives, speed ramps. WebGL render loop; banks the score via the shared
 * session/nonce flow. (WebGL doesn't render headless — eyeball on deploy.)
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { useStarSession, SessionGate, startRun, submitScore, type ScoreResult, type RunStartResult } from "../shared";

const GOLD = "#f0b340";
const GAME = "trench";
const FLOOR_MS = 9000;

// trench dimensions / world
const TW = 16; // width
const TH = 12; // height
const SEG = 40;
const CAM_Z = 10;
const OBST_N = 7;
const OBST_GAP = 42; // z spacing between barriers (more reaction time)
const XB = 6; // camera lateral bound
const YB = 4.4; // camera vertical bound
const FRAME_GAP = 26; // z spacing between wireframe boundary rings
const NRING = 14;
const WIRE = 0x5eead4; // teal boundary wireframe (pops against the gold painting)

type ObType = "left" | "right" | "low" | "high";
interface Obst {
  group: THREE.Group;
  z: number;
  type: ObType;
  gap: number;
  scored: boolean;
}
interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  dust: THREE.Points;
  rings: THREE.LineLoop[];
  obs: Obst[];
  state: "idle" | "playing";
  score: number;
  lives: number;
  speed: number;
  t: number;
  camX: number;
  camY: number;
  keyX: number;
  keyY: number;
  pjoyX: number;
  pjoyY: number;
  pjoyActive: boolean;
  shake: number;
  resize: () => void;
}

function obstacleSolid(type: ObType, gap: number): { x: number; y: number; w: number; h: number } {
  // returns center + size of the SOLID block (the gap is the rest of the cross-section)
  if (type === "left") return { x: (-XB - 2 + gap) / 2, y: 0, w: gap - (-XB - 2), h: TH };
  if (type === "right") return { x: (XB + 2 + gap) / 2, y: 0, w: XB + 2 - gap, h: TH };
  if (type === "low") return { x: 0, y: (-YB - 2 + gap) / 2, w: TW, h: gap - (-YB - 2) };
  return { x: 0, y: (YB + 2 + gap) / 2, w: TW, h: YB + 2 - gap }; // high
}

function newObstacle(): { type: ObType; gap: number } {
  const types: ObType[] = ["left", "right", "low", "high"];
  const type = types[Math.floor(Math.random() * types.length)];
  const gap =
    type === "left" || type === "right"
      ? -XB + 2 + Math.random() * (2 * XB - 4)
      : -YB + 2 + Math.random() * (2 * YB - 4);
  return { type, gap };
}

export default function TrenchGame() {
  const session = useStarSession();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const nonceRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const scoreElRef = useRef<HTMLSpanElement | null>(null);
  const livesElRef = useRef<HTMLSpanElement | null>(null);
  const onOverRef = useRef<(score: number) => void>(() => {});

  const [phase, setPhase] = useState<"idle" | "playing" | "over">("idle");
  const [finalScore, setFinalScore] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [banking, setBanking] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const finish = useCallback(
    async (score: number) => {
      setFinalScore(score);
      setPhase("over");
      if (!session.token || !nonceRef.current) return;
      if (Date.now() - startedAtRef.current < FLOOR_MS) {
        setResult({ ok: false, error: "Too quick to count — hold out a little longer next run." });
        return;
      }
      setBanking(true);
      const r = await submitScore(session.token, GAME, score, nonceRef.current, { v: 2 }).catch(
        () => ({ ok: false, error: "Network hiccup. Your score didn't bank." }) as ScoreResult,
      );
      setResult(r);
      setBanking(false);
    },
    [session.token],
  );
  onOverRef.current = finish;

  // Build the WebGL world once the session gate opens (the mount div exists then).
  useEffect(() => {
    if (!session.token || !mountRef.current || worldRef.current) return;
    const mount = mountRef.current;
    let world: World;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const bgTex = new THREE.TextureLoader().load("/stars-art/bg-trench.png");
      bgTex.colorSpace = THREE.SRGBColorSpace;
      scene.background = bgTex; // painted Death-Star trench behind the live geometry
      scene.fog = new THREE.FogExp2(0x070a14, 0.006); // lighter so the painting reads through

      const camera = new THREE.PerspectiveCamera(80, mount.clientWidth / mount.clientHeight, 0.1, 1000);
      camera.position.set(0, 0, CAM_Z);

      scene.add(new THREE.AmbientLight(0x4a5a80, 1.1));
      const dir = new THREE.DirectionalLight(0xfff0d0, 1.2);
      dir.position.set(0.4, 1, 0.5);
      scene.add(dir);

      // Forward-streaking dust = the only motion cue (the painted trench is the world).
      const DUST = 360;
      const dustGeo = new THREE.BufferGeometry();
      const dpos = new Float32Array(DUST * 3);
      for (let i = 0; i < DUST; i++) {
        dpos[i * 3] = (Math.random() - 0.5) * 64;
        dpos[i * 3 + 1] = (Math.random() - 0.5) * 40;
        dpos[i * 3 + 2] = -Math.random() * 440;
      }
      dustGeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
      const dust = new THREE.Points(
        dustGeo,
        new THREE.PointsMaterial({ color: 0xbcd0ff, size: 0.5, transparent: true, opacity: 0.65, sizeAttenuation: true }),
      );
      scene.add(dust);

      // Boundary wireframe — the 4 corner rails + cross-section rings that rush toward
      // you. Shows the play borders + depth/motion without clashing with the painting.
      const wireMat = new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.55 });
      const railPts: number[] = [];
      for (const ex of [-XB, XB]) {
        for (const ey of [-YB, YB]) {
          railPts.push(ex, ey, CAM_Z + 2, ex, ey, -320);
        }
      }
      const railGeo = new THREE.BufferGeometry();
      railGeo.setAttribute("position", new THREE.Float32BufferAttribute(railPts, 3));
      scene.add(new THREE.LineSegments(railGeo, wireMat));

      const ringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-XB, -YB, 0),
        new THREE.Vector3(XB, -YB, 0),
        new THREE.Vector3(XB, YB, 0),
        new THREE.Vector3(-XB, YB, 0),
      ]);
      const rings: THREE.LineLoop[] = [];
      for (let i = 0; i < NRING; i++) {
        const r = new THREE.LineLoop(ringGeo, wireMat);
        r.position.z = -i * FRAME_GAP + FRAME_GAP;
        scene.add(r);
        rings.push(r);
      }

      const obMat = new THREE.MeshStandardMaterial({ color: 0x161a26, metalness: 0.7, roughness: 0.5, emissive: 0x3a2a08, emissiveIntensity: 0.6 });
      const obEdgeMat = new THREE.LineBasicMaterial({ color: 0xffc24d });
      const obs: Obst[] = [];
      for (let i = 0; i < OBST_N; i++) {
        const { type, gap } = newObstacle();
        const grp = new THREE.Group();
        const s = obstacleSolid(type, gap);
        const box = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(s.w), Math.abs(s.h), 2.4), obMat);
        box.position.set(s.x, s.y, 0);
        grp.add(box);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), obEdgeMat);
        edges.position.copy(box.position);
        grp.add(edges);
        const z = -OBST_GAP * (i + 2);
        grp.position.z = z;
        scene.add(grp);
        obs.push({ group: grp, z, type, gap, scored: false });
      }

      const resize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", resize);

      world = {
        renderer, scene, camera, dust, rings, obs,
        state: "idle", score: 0, lives: 3, speed: 14, t: 0,
        camX: 0, camY: 0, keyX: 0, keyY: 0, pjoyX: 0, pjoyY: 0, pjoyActive: false, shake: 0, resize,
      };
      worldRef.current = world;
    } catch {
      return;
    }

    const loop = (now: number) => {
      const w = worldRef.current;
      if (!w) return;
      const dt = Math.min(0.05, (now - lastRef.current) / 1000 || 0);
      lastRef.current = now;
      const playing = w.state === "playing";
      if (playing) {
        w.t += dt;
        w.speed = 21 + w.t * 1.7;
      } else {
        w.speed = 14;
      }

      // velocity steering — the ship HOLDS its position (no recenter). Keys move
      // while held; the cursor is a RELATIVE joystick (offset from center → direction),
      // so the mouse never has to leave the canvas.
      const sx = w.keyX !== 0 ? w.keyX : w.pjoyActive ? w.pjoyX : 0;
      const sy = w.keyY !== 0 ? w.keyY : w.pjoyActive ? w.pjoyY : 0;
      const MOVE = playing ? 30 : 0; // lateral steer speed — must clear the trench faster than barriers arrive
      w.camX = Math.max(-XB, Math.min(XB, w.camX + sx * MOVE * dt));
      w.camY = Math.max(-YB, Math.min(YB, w.camY + sy * MOVE * dt));
      w.camera.position.x = w.camX + (Math.random() - 0.5) * w.shake;
      w.camera.position.y = w.camY + (Math.random() - 0.5) * w.shake;
      w.camera.rotation.z = -sx * 0.12;
      if (w.shake > 0) w.shake = Math.max(0, w.shake - dt * 0.8);

      // streak the dust toward the camera, recycle
      const dattr = w.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
      const darr = dattr.array as Float32Array;
      for (let i = 0; i < darr.length; i += 3) {
        darr[i + 2] += w.speed * dt;
        if (darr[i + 2] > CAM_Z + 4) {
          darr[i + 2] -= 460;
          darr[i] = (Math.random() - 0.5) * 64;
          darr[i + 1] = (Math.random() - 0.5) * 40;
        }
      }
      dattr.needsUpdate = true;
      // boundary rings rush toward the camera, recycle
      for (const r of w.rings) {
        r.position.z += w.speed * dt;
        if (r.position.z > CAM_Z + 4) r.position.z -= NRING * FRAME_GAP;
      }
      // obstacles
      for (const o of w.obs) {
        o.z += w.speed * dt;
        o.group.position.z = o.z;
        if (playing && !o.scored && o.z >= CAM_Z - 1) {
          o.scored = true;
          const s = obstacleSolid(o.type, o.gap);
          const inX = w.camX > s.x - Math.abs(s.w) / 2 - 0.4 && w.camX < s.x + Math.abs(s.w) / 2 + 0.4;
          const inY = w.camY > s.y - Math.abs(s.h) / 2 - 0.4 && w.camY < s.y + Math.abs(s.h) / 2 + 0.4;
          if (inX && inY) {
            w.lives -= 1;
            w.shake = 0.7;
          } else {
            w.score += 100;
          }
        }
        if (o.z > CAM_Z + SEG / 2) {
          // recycle far ahead with a fresh barrier
          const far = Math.min(...w.obs.map((x) => x.z)) - OBST_GAP;
          const nx = newObstacle();
          o.type = nx.type;
          o.gap = nx.gap;
          o.z = far;
          o.scored = false;
          const s = obstacleSolid(o.type, o.gap);
          const box = o.group.children[0] as THREE.Mesh;
          box.geometry.dispose();
          box.geometry = new THREE.BoxGeometry(Math.abs(s.w), Math.abs(s.h), 2.4);
          box.position.set(s.x, s.y, 0);
          const edges = o.group.children[1] as THREE.LineSegments;
          edges.geometry.dispose();
          edges.geometry = new THREE.EdgesGeometry(box.geometry);
          edges.position.copy(box.position);
        }
      }

      if (playing) {
        w.score += dt * w.speed * 0.6;
        if (scoreElRef.current) scoreElRef.current.textContent = `${Math.round(w.score)}`;
        if (livesElRef.current) livesElRef.current.textContent = "♥".repeat(Math.max(0, w.lives));
        if (w.lives <= 0) {
          w.state = "idle";
          onOverRef.current(Math.round(w.score));
        }
      }

      w.renderer.render(w.scene, w.camera);
      rafRef.current = requestAnimationFrame(loop);
    };
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      const w = worldRef.current;
      if (w) {
        window.removeEventListener("resize", w.resize);
        w.renderer.dispose();
        if (w.renderer.domElement.parentNode) w.renderer.domElement.parentNode.removeChild(w.renderer.domElement);
      }
      worldRef.current = null;
    };
  }, [session.token]);

  const begin = useCallback(async () => {
    const w = worldRef.current;
    if (!session.token || !w) return;
    setStartError(null);
    const rs: RunStartResult = await startRun(session.token, GAME).catch(() => ({ ok: false, error: "network" }));
    if (!rs.ok || !rs.nonce) {
      setStartError(rs.error || "Could not open a run. Try again.");
      return;
    }
    nonceRef.current = rs.nonce;
    startedAtRef.current = Date.now();
    w.score = 0;
    w.lives = 3;
    w.t = 0;
    w.camX = w.camY = 0;
    w.keyX = w.keyY = w.pjoyX = w.pjoyY = 0;
    w.pjoyActive = false;
    w.obs.forEach((o, i) => {
      o.z = -OBST_GAP * (i + 2);
      o.scored = false;
    });
    w.state = "playing";
    setResult(null);
    setPhase("playing");
  }, [session.token]);

  // pointer → a RELATIVE joystick: offset from the canvas center sets a steer
  // direction (small offsets steer, so the cursor stays well inside the canvas).
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const w = worldRef.current;
    const mount = mountRef.current;
    if (!w || !mount) return;
    const r = mount.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1..1 from center
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    const DEAD = 0.07;
    const RANGE = 0.4;
    const norm = (v: number) => {
      const a = Math.abs(v);
      if (a < DEAD) return 0;
      return Math.sign(v) * Math.min(1, (a - DEAD) / (RANGE - DEAD));
    };
    w.pjoyX = norm(nx);
    w.pjoyY = -norm(ny);
    w.pjoyActive = true;
  };
  const endPointer = () => {
    const w = worldRef.current;
    if (w) w.pjoyActive = false;
  };
  useEffect(() => {
    const k = (down: boolean) => (e: KeyboardEvent) => {
      const w = worldRef.current;
      if (!w) return;
      if (e.key === "ArrowLeft" || e.key === "a") w.keyX = down ? -1 : w.keyX < 0 ? 0 : w.keyX;
      else if (e.key === "ArrowRight" || e.key === "d") w.keyX = down ? 1 : w.keyX > 0 ? 0 : w.keyX;
      else if (e.key === "ArrowUp" || e.key === "w") w.keyY = down ? 1 : w.keyY > 0 ? 0 : w.keyY;
      else if (e.key === "ArrowDown" || e.key === "s") w.keyY = down ? -1 : w.keyY < 0 ? 0 : w.keyY;
    };
    const kd = k(true);
    const ku = k(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "radial-gradient(900px 500px at 50% -10%, #131a2e 0%, #060912 60%)",
        color: "#e8ecf5",
        padding: "28px 16px 56px",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Link href="/games" style={{ color: "#cdd4e4", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
            ‹ Arcade
          </Link>
          <span style={{ fontSize: 12, letterSpacing: 2, color: GOLD, textTransform: "uppercase", fontWeight: 700 }}>
            Trench Run
          </span>
        </div>

        <SessionGate session={session}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", borderRadius: 16, overflow: "hidden", border: "1px solid #1c2236", background: "#05070f" }}>
            <div ref={mountRef} onPointerMove={move} onPointerDown={move} onPointerUp={endPointer} onPointerLeave={endPointer} style={{ width: "100%", height: "100%", touchAction: "none", cursor: phase === "playing" ? "crosshair" : "default" }} />
            {/* HUD */}
            <div style={{ position: "absolute", top: 10, left: 14, fontSize: 18, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px #000", pointerEvents: "none" }}>
              <span ref={scoreElRef}>0</span>
            </div>
            <div style={{ position: "absolute", top: 10, right: 14, fontSize: 18, fontWeight: 800, color: "#ff8a8a", textShadow: "0 1px 4px #000", pointerEvents: "none" }}>
              <span ref={livesElRef}>♥♥♥</span>
            </div>
            {phase !== "playing" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(5,7,15,0.55)", textAlign: "center", padding: 24 }}>
                {phase === "over" && (
                  <>
                    <div style={{ fontSize: 14, color: "#aeb6c8", letterSpacing: 2, textTransform: "uppercase" }}>Run over</div>
                    <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{finalScore}</div>
                    {banking ? (
                      <div style={{ color: "#aeb6c8", fontSize: 14 }}>Banking…</div>
                    ) : result?.ok ? (
                      <div style={{ color: "#86f0c4", fontSize: 14, lineHeight: 1.5 }}>
                        +{result.stardust ?? 0} Salvage{(result.starlight ?? 0) > 0 ? ` · +${result.starlight} Starlight` : ""}
                        <br />
                        <span style={{ color: "#8b95ad" }}>
                          {result.improved ? "New daily best!" : "No improvement on today's best."} · {result.attemptsLeft ?? 0} left today
                        </span>
                      </div>
                    ) : result?.already ? (
                      <div style={{ color: "#8b95ad", fontSize: 14 }}>That was your last run today. Come back tomorrow.</div>
                    ) : result?.error ? (
                      <div style={{ color: "#f8b37a", fontSize: 13, lineHeight: 1.5 }}>{result.error}</div>
                    ) : null}
                  </>
                )}
                {phase === "idle" && (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 800, color: GOLD }}>Trench Run</div>
                    <p style={{ fontSize: 13.5, color: "#aeb6c8", lineHeight: 1.55, margin: "0 0 6px", maxWidth: 300 }}>
                      Move your finger (or arrow keys) to steer. Bank to thread the gap in every barrier. 3 lives, full burn.
                    </p>
                  </>
                )}
                <button onClick={begin} style={{ marginTop: 4, padding: "13px 30px", background: GOLD, color: "#1a1205", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                  {phase === "over" ? "Play again" : "Launch"}
                </button>
                {startError && <div style={{ color: "#f87171", fontSize: 13 }}>{startError}</div>}
              </div>
            )}
          </div>
          <p style={{ color: "#5b6478", fontSize: 12, marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
            Best of 3 runs a day counts. Salvage buys upgrades + cosmetics; a little Starlight helps your crew.
          </p>
        </SessionGate>
      </div>
    </main>
  );
}
