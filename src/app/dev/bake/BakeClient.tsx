"use client";

/**
 * THE BAKE RIG: CC0 3D packs in, top-down sprite frames out.
 *
 * Why this exists: the mini-games' one real art defect is that nothing is
 * animated — every unit is a single static PNG (see the approved plan). The
 * fix chosen is to bake Quaternius/Kenney low-poly models into top-down sprite
 * STRIPS with real animation frames, and keep the canvas-2D games exactly as
 * they are. This page is the oven. It is not a player surface, it ships
 * nothing (prod 404s in page.tsx), and its output lands in art-src/baked/ for
 * review before anything is promoted to public/s5-art/.
 *
 * The rules baked into the camera, so every asset that comes out of this rig
 * matches the art bible by construction rather than by discipline:
 *
 *   - STRICT TOP-DOWN. Orthographic camera on +Y looking straight down; no
 *     perspective, no three-quarter cheat. (ADR-0092: anything that rotates
 *     must be plan-view or it tumbles.)
 *   - ONE LIGHT, top-left of screen. Screen-up is world -Z here, so key light
 *     sits at (-1, 2, -1). Every model bakes with identical shading.
 *   - NOSE RIGHT. sprRot() draws a sprite unrotated at heading 0 and our sims
 *     all treat heading 0 as +x, so frames bake pointing screen-right. The
 *     per-model yaw dial exists because packs disagree about which way
 *     "forward" was authored; find it once by eye, record it in the manifest.
 *   - NO BAKED SHADOW. The games draw their own ground shadows; a shadow baked
 *     into the sprite would double up and pin the light to one world angle.
 *   - TRANSPARENT ground. What comes out is exactly what spr()/sprRot() draws.
 *
 * Determinism note: this tool renders ART. It never touches a sim, so nothing
 * here can move a tape or a ceiling.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** The packs on the shelf. Paths are art-src/-relative; the bake-src route
 * serves them in dev. Adding a model here is the whole registration step. */
/** yawOffset: the pack's authored "forward" corrected to OUR forward (+x,
 * screen-right). Quaternius tanks are authored nose -x from this camera, so
 * they all carry 180. Found by eye on the first contact sheet; the UI dial is
 * a TRIM on top of this, for checking new packs. */
/** pitch: the cars pack is authored with a different up-axis than the tanks,
 * so the top-down camera saw a car's FRONT (found baking the SUV). Degrees
 * around X applied before yaw, per model. */
const MODELS: { key: string; label: string; path: string; yawOffset: number; pitch?: number; tilt?: boolean }[] = [
  { key: "tank1", label: "Quaternius Tank 1", path: "quaternius-animated-tanks/FBX/Tank.fbx", yawOffset: 180 },
  { key: "tank2", label: "Quaternius Tank 2", path: "quaternius-animated-tanks/FBX/Tank2.fbx", yawOffset: 180 },
  { key: "tank3", label: "Quaternius Tank 3", path: "quaternius-animated-tanks/FBX/Tank3.fbx", yawOffset: 180 },
  { key: "tank4", label: "Quaternius Tank 4", path: "quaternius-animated-tanks/FBX/Tank4.fbx", yawOffset: 180 },
  { key: "car-cop", label: "Q Car Cop", path: "quaternius-cars/FBX/Cop.fbx", yawOffset: 270 , pitch: -90 },
  { key: "car-suv", label: "Q Car SUV", path: "quaternius-cars/FBX/SUV.fbx", yawOffset: 270 , pitch: -90 },
  { key: "car-taxi", label: "Q Car Taxi", path: "quaternius-cars/FBX/Taxi.fbx", yawOffset: 270 , pitch: -90 },
  // CITY-KIT BUILDINGS, the full catalogue. Vanguard tiles each solid block
  // with SEVERAL of these rather than stretching one over the whole rect,
  // so every building is a real model at its own aspect (2026-08-02).
  { key: "bld-ca", label: "C bldg a", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-a.glb", yawOffset: 0, tilt: true },
  { key: "bld-cb", label: "C bldg b", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-b.glb", yawOffset: 0, tilt: true },
  { key: "bld-cc", label: "C bldg c", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-c.glb", yawOffset: 0, tilt: true },
  { key: "bld-cd", label: "C bldg d", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-d.glb", yawOffset: 0, tilt: true },
  { key: "bld-ce", label: "C bldg e", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-e.glb", yawOffset: 0, tilt: true },
  { key: "bld-cf", label: "C bldg f", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-f.glb", yawOffset: 0, tilt: true },
  { key: "bld-cg", label: "C bldg g", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-g.glb", yawOffset: 0, tilt: true },
  { key: "bld-ch", label: "C bldg h", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-h.glb", yawOffset: 0, tilt: true },
  { key: "bld-ci", label: "C bldg i", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-i.glb", yawOffset: 0, tilt: true },
  { key: "bld-cj", label: "C bldg j", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-j.glb", yawOffset: 0, tilt: true },
  { key: "bld-ck", label: "C bldg k", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-k.glb", yawOffset: 0, tilt: true },
  { key: "bld-cl", label: "C bldg l", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-l.glb", yawOffset: 0, tilt: true },
  { key: "bld-cm", label: "C bldg m", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-m.glb", yawOffset: 0, tilt: true },
  { key: "bld-cn", label: "C bldg n", path: "kenney_city-kit-commercial_2.1/Models/GLB format/building-n.glb", yawOffset: 0, tilt: true },
  { key: "bld-ia", label: "I bldg a", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-a.glb", yawOffset: 0, tilt: true },
  { key: "bld-ib", label: "I bldg b", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-b.glb", yawOffset: 0, tilt: true },
  { key: "bld-ic", label: "I bldg c", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-c.glb", yawOffset: 0, tilt: true },
  { key: "bld-id", label: "I bldg d", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-d.glb", yawOffset: 0, tilt: true },
  { key: "bld-ie", label: "I bldg e", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-e.glb", yawOffset: 0, tilt: true },
  { key: "bld-if", label: "I bldg f", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-f.glb", yawOffset: 0, tilt: true },
  { key: "bld-ig", label: "I bldg g", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-g.glb", yawOffset: 0, tilt: true },
  { key: "bld-ih", label: "I bldg h", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-h.glb", yawOffset: 0, tilt: true },
  { key: "bld-ii", label: "I bldg i", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-i.glb", yawOffset: 0, tilt: true },
  { key: "bld-ij", label: "I bldg j", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-j.glb", yawOffset: 0, tilt: true },
  { key: "bld-ik", label: "I bldg k", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-k.glb", yawOffset: 0, tilt: true },
  { key: "bld-il", label: "I bldg l", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-l.glb", yawOffset: 0, tilt: true },
  { key: "bld-im", label: "I bldg m", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-m.glb", yawOffset: 0, tilt: true },
  { key: "bld-in", label: "I bldg n", path: "kenney_city-kit-industrial_1.0/Models/GLB format/building-n.glb", yawOffset: 0, tilt: true },
  { key: "bld-sa", label: "S bldg a", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-a.glb", yawOffset: 0, tilt: true },
  { key: "bld-sb", label: "S bldg b", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-b.glb", yawOffset: 0, tilt: true },
  { key: "bld-sc", label: "S bldg c", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-c.glb", yawOffset: 0, tilt: true },
  { key: "bld-sd", label: "S bldg d", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-d.glb", yawOffset: 0, tilt: true },
  { key: "bld-se", label: "S bldg e", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-e.glb", yawOffset: 0, tilt: true },
  { key: "bld-sf", label: "S bldg f", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-f.glb", yawOffset: 0, tilt: true },
  { key: "bld-sg", label: "S bldg g", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-g.glb", yawOffset: 0, tilt: true },
  { key: "bld-sh", label: "S bldg h", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-h.glb", yawOffset: 0, tilt: true },
  { key: "bld-si", label: "S bldg i", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-i.glb", yawOffset: 0, tilt: true },
  { key: "bld-sj", label: "S bldg j", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-j.glb", yawOffset: 0, tilt: true },
  { key: "bld-sk", label: "S bldg k", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-k.glb", yawOffset: 0, tilt: true },
  { key: "bld-sl", label: "S bldg l", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-l.glb", yawOffset: 0, tilt: true },
  { key: "bld-sm", label: "S bldg m", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-m.glb", yawOffset: 0, tilt: true },
  { key: "bld-sn", label: "S bldg n", path: "kenney_city-kit-suburban_20/Models/GLB format/building-type-n.glb", yawOffset: 0, tilt: true },
  // TOWN PROPS: rooftop furniture + street trees. Never rotate, so the tilt
  // camera is legal (ADR-0092) and their visible height is the point.
  { key: "prop-chimney-s", label: "P chimney small", path: "kenney_city-kit-industrial_1.0/Models/GLB format/chimney-small.glb", yawOffset: 0, tilt: true },
  { key: "prop-chimney-m", label: "P chimney med", path: "kenney_city-kit-industrial_1.0/Models/GLB format/chimney-medium.glb", yawOffset: 0, tilt: true },
  { key: "prop-tank", label: "P roof tank", path: "kenney_city-kit-industrial_1.0/Models/GLB format/detail-tank.glb", yawOffset: 0, tilt: true },
  { key: "prop-tree-l", label: "P tree large", path: "kenney_city-kit-suburban_20/Models/GLB format/tree-large.glb", yawOffset: 0, tilt: true },
  { key: "prop-tree-s", label: "P tree small", path: "kenney_city-kit-suburban_20/Models/GLB format/tree-small.glb", yawOffset: 0, tilt: true },
  { key: "prop-planter", label: "P planter", path: "kenney_city-kit-suburban_20/Models/GLB format/planter.glb", yawOffset: 0, tilt: true },
  // FIELD SCENERY for Armor Clash + Warpath: real trees and boulders to
  // replace drawn canopy circles and AI-painted rock plates (2026-08-02).
  { key: "sc-tree", label: "Sc tree", path: "kenney_tower-defense-kit/Models/GLB format/detail-tree.glb", yawOffset: 0, tilt: true },
  { key: "sc-tree-l", label: "Sc tree lg", path: "kenney_tower-defense-kit/Models/GLB format/detail-tree-large.glb", yawOffset: 0, tilt: true },
  { key: "sc-trees", label: "Sc trees x2", path: "kenney_tower-defense-kit/Models/GLB format/tile-tree-double.glb", yawOffset: 0, tilt: true },
  { key: "sc-trees-q", label: "Sc trees x4", path: "kenney_tower-defense-kit/Models/GLB format/tile-tree-quad.glb", yawOffset: 0, tilt: true },
  { key: "sc-rock", label: "Sc rocks", path: "kenney_tower-defense-kit/Models/GLB format/detail-rocks.glb", yawOffset: 0, tilt: true },
  { key: "sc-rock-l", label: "Sc rocks lg", path: "kenney_tower-defense-kit/Models/GLB format/detail-rocks-large.glb", yawOffset: 0, tilt: true },
  { key: "sc-boulder", label: "Sc boulder", path: "kenney_tower-defense-kit/Models/GLB format/tile-rock.glb", yawOffset: 0, tilt: true },
  { key: "sc-dirt", label: "Sc dirt", path: "kenney_tower-defense-kit/Models/GLB format/detail-dirt.glb", yawOffset: 0, tilt: true },
  // STRUCTURES bake from a TILTED camera (see snap): they never rotate
  // in-game, so ADR-0092's strict-top-down law does not bind them, and the
  // visible face + height is what makes a board feel 3D instead of stamped.
  { key: "tower-a", label: "K Tower round-a", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-a.glb", yawOffset: 0, tilt: true },
  { key: "tower-b", label: "K Tower round-b", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-b.glb", yawOffset: 0, tilt: true },
  { key: "tower-c", label: "K Tower round-c", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-c.glb", yawOffset: 0, tilt: true },
  { key: "tower-d", label: "K Tower round-d", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-d.glb", yawOffset: 0, tilt: true },
  { key: "tower-e", label: "K Tower round-e", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-e.glb", yawOffset: 0, tilt: true },
  { key: "tower-f", label: "K Tower round-f", path: "kenney_tower-defense-kit/Models/GLB format/tower-round-build-f.glb", yawOffset: 0, tilt: true },
  { key: "tower-sq-a", label: "K Tower square-a", path: "kenney_tower-defense-kit/Models/GLB format/tower-square-build-a.glb", yawOffset: 0, tilt: true },
  { key: "tower-sq-b", label: "K Tower square-b", path: "kenney_tower-defense-kit/Models/GLB format/tower-square-build-b.glb", yawOffset: 0, tilt: true },
  { key: "tower-sq-d", label: "K Tower square-d", path: "kenney_tower-defense-kit/Models/GLB format/tower-square-build-d.glb", yawOffset: 0, tilt: true },
  { key: "tower-sq-f", label: "K Tower square-f", path: "kenney_tower-defense-kit/Models/GLB format/tower-square-build-f.glb", yawOffset: 0, tilt: true },
];

const spec = (key: string) => MODELS.find((m) => m.key === key)!;

const CELL = 128; // contact-sheet cell, px
const SHEET_FRAMES = 4; // frames sampled per clip on the sheet

type Loaded = {
  key: string;
  label: string;
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  /** Radius of the XZ bounding circle, so any yaw fits one frustum. */
  radius: number;
  yCenter: number;
};

/** Load one model. FBX for Quaternius, GLB for Kenney — pick by extension. */
async function loadModel(path: string): Promise<{ root: THREE.Group; clips: THREE.AnimationClip[] }> {
  const url = `/api/dev/bake-src/${path}`;
  if (path.toLowerCase().endsWith(".glb") || path.toLowerCase().endsWith(".gltf")) {
    const g = await new GLTFLoader().loadAsync(url);
    return { root: g.scene as unknown as THREE.Group, clips: g.animations ?? [] };
  }
  const f = await new FBXLoader().loadAsync(url);
  return { root: f as THREE.Group, clips: (f as THREE.Group).animations ?? [] };
}

/** Skinned meshes keep their BIND-POSE bounding boxes, and three culls with
 * those, so an animated hull can vanish while its tracks stay: tanks 2 and 4
 * rendered as C-shaped fragments on the first sheet for exactly this reason.
 * An offscreen bake has nothing worth culling, so turn it off everywhere. */
function unCull(root: THREE.Object3D) {
  root.traverse((o) => {
    o.frustumCulled = false;
    // ...and REBUILD THE NORMALS while we are here. Tank2's dome ships with
    // broken normal data: it rendered black the moment its emissive crutch was
    // removed, and DoubleSide (which cures mere inverted winding) did not
    // light it. Face-derived normals fix it, and low-poly exports keep their
    // flat faceting because their face vertices are already split.
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && g.attributes && g.attributes.position) g.computeVertexNormals();
  });
}

/** THE STANDARD RADIUS every model is normalised to. Packs disagree WILDLY
 * about units — tank2 carries a turret node scaled 2117 next to siblings at
 * 100, and tank1 only rendered whole because its export units happened to fit
 * the first camera's 200-unit far plane. Scaling every model to one radius
 * makes the camera a constant instead of a per-pack negotiation, which is why
 * tanks 2 and 4 rendered as fragments (meshes straddling the clip planes) and
 * are whole now. */
const STD_R = 10;

/** Centre the model on origin, then NORMALISE its scale to STD_R. Mutates the
 * group (fine — the group is ours). */
function centreAndMeasure(root: THREE.Group): { radius: number; yCenter: number } {
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.sub(c);
  const size = box.getSize(new THREE.Vector3());
  const raw = Math.hypot(size.x, size.z) / 2;
  if (raw > 0) {
    const k = STD_R / raw;
    root.scale.multiplyScalar(k);
    root.position.multiplyScalar(k);
  }
  return { radius: STD_R, yCenter: 0 };
}

export default function BakeClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetRef = useRef<HTMLCanvasElement | null>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    holder: THREE.Group;
    mixer: THREE.AnimationMixer | null;
  } | null>(null);
  const modelsRef = useRef<Map<string, Loaded>>(new Map());

  const [status, setStatus] = useState("loading models…");
  const [sel, setSel] = useState(MODELS[0].key);
  const [clipIdx, setClipIdx] = useState(0);
  const [clipNames, setClipNames] = useState<string[]>([]);
  const [yaw, setYaw] = useState(0); // degrees; packs disagree about "forward"
  const [playing, setPlaying] = useState(true);
  const playRef = useRef({ playing: true, t: 0 });

  /** One scene for everything: swap the model under `holder`. */
  const ensureThree = useCallback(() => {
    if (threeRef.current) return threeRef.current;
    const cv = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({
      canvas: cv,
      alpha: true, // transparent ground — the sprite IS the model
      antialias: true,
      preserveDrawingBuffer: true, // required for toDataURL capture
    });
    renderer.setPixelRatio(1);
    renderer.setSize(512, 512, false);
    const scene = new THREE.Scene();
    // THE ART BIBLE'S LIGHT, in every bake: key from screen top-left
    // (world -X,-Z), warm-neutral, plus a soft hemisphere so undersides of
    // barrels do not go black. No shadow-casting: shadows are drawn in-game.
    const key = new THREE.DirectionalLight(0xfff4e0, 2.4);
    key.position.set(-6, 10, -6);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x6b6250, 1.1));
    // Straight down. up = -Z makes world -Z screen-up, so +X is screen-right,
    // which is heading 0 in every sim.
    // Everything is normalised to STD_R, so the camera is a constant: high
    // enough that no normalised mesh can sit behind it, far plane deep enough
    // that none can fall out the bottom.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, STD_R * 12);
    camera.position.set(0, STD_R * 6, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const holder = new THREE.Group();
    scene.add(holder);
    threeRef.current = { renderer, scene, camera, holder, mixer: null };
    // Console handle for the pane. Rotating a live scene beats re-deriving
    // axis conventions on paper: the yaw bug survived three "obviously
    // correct" fixes precisely because nothing could be poked.
    (window as unknown as { __rig?: unknown }).__rig = threeRef.current;
    return threeRef.current;
  }, []);

  /** Frame the orthographic camera on a model's bounding circle, from
   * straight above (units: they rotate, so plan view or they tumble) or from
   * a 55-degree TILT (structures: they never rotate, and the visible face +
   * height is what reads as 3D on the board). */
  const frame = useCallback((t: NonNullable<typeof threeRef.current>, radius: number, tilt?: boolean) => {
    const r = radius * (tilt ? 1.25 : 1.08);
    t.camera.left = -r;
    t.camera.right = r;
    t.camera.top = r;
    t.camera.bottom = -r;
    if (tilt) {
      t.camera.position.set(0, STD_R * 5, STD_R * 3.6);
      t.camera.up.set(0, 1, 0);
    } else {
      t.camera.position.set(0, STD_R * 6, 0);
      t.camera.up.set(0, 0, -1);
    }
    t.camera.lookAt(0, 0, 0);
    t.camera.updateProjectionMatrix();
  }, []);

  /** Put one loaded model under the holder and wire its mixer. */
  const mount = useCallback(
    (key: string) => {
      const t = ensureThree();
      const m = modelsRef.current.get(key);
      if (!m) return;
      t.holder.clear();
      t.holder.add(m.root);
      // YXZ: yaw outermost, pitch innermost — pitch fixes the pack's up-axis
      // FIRST, then yaw spins the flattened model in plan (verified live on
      // the SUV; default XYZ composed to a side view).
      t.holder.rotation.order = "YXZ";
      t.holder.rotation.y = ((spec(m.key).yawOffset + yaw) * Math.PI) / 180;
      t.holder.rotation.x = ((spec(m.key).pitch ?? 0) * Math.PI) / 180;
      t.mixer = m.clips.length ? new THREE.AnimationMixer(m.root) : null;
      if (t.mixer && m.clips[clipIdx]) {
        t.mixer.clipAction(m.clips[Math.min(clipIdx, m.clips.length - 1)]).play();
      }
      frame(t, m.radius);
      setClipNames(m.clips.map((c) => `${c.name} (${c.duration.toFixed(2)}s)`));
    },
    [clipIdx, ensureThree, frame, yaw],
  );

  // ── load everything once ──────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    (async () => {
      for (const spec of MODELS) {
        try {
          const { root, clips } = await loadModel(spec.path);
          unCull(root);
          const { radius, yCenter } = centreAndMeasure(root);
          if (dead) return;
          modelsRef.current.set(spec.key, { key: spec.key, label: spec.label, root, clips, radius, yCenter });
          setStatus(`loaded ${modelsRef.current.size}/${MODELS.length}`);
        } catch (e) {
          if (!dead) setStatus(`FAILED ${spec.label}: ${String(e).slice(0, 120)}`);
          return;
        }
      }
      if (!dead) {
        setStatus("ready");
        mount(MODELS[0].key);
      }
    })();
    return () => {
      dead = true;
    };
    // mount intentionally not a dep: this effect is the one-time loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── live preview loop ─────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = threeRef.current;
      if (!t) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (playRef.current.playing && t.mixer) t.mixer.update(dt);
      t.renderer.render(t.scene, t.camera);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // selection / yaw / clip changes remount
  useEffect(() => {
    if (modelsRef.current.size === MODELS.length) mount(sel);
  }, [sel, yaw, clipIdx, mount]);

  useEffect(() => {
    playRef.current.playing = playing;
  }, [playing]);

  /** Render one model at one clip-time into the preview canvas and return the
   * pixels. The preview canvas IS the render target — what you see is what
   * gets saved. */
  const snap = useCallback(
    (key: string, clip: number, time: number, size: number): HTMLCanvasElement => {
      const t = ensureThree();
      const m = modelsRef.current.get(key)!;
      t.holder.clear();
      t.holder.add(m.root);
      // YXZ: yaw outermost, pitch innermost — pitch fixes the pack's up-axis
      // FIRST, then yaw spins the flattened model in plan (verified live on
      // the SUV; default XYZ composed to a side view).
      t.holder.rotation.order = "YXZ";
      t.holder.rotation.y = ((spec(m.key).yawOffset + yaw) * Math.PI) / 180;
      t.holder.rotation.x = ((spec(m.key).pitch ?? 0) * Math.PI) / 180;
      frame(t, m.radius, spec(m.key).tilt);
      t.renderer.setSize(size, size, false);
      const mixer = new THREE.AnimationMixer(m.root);
      if (m.clips[clip]) {
        // update(time), not setTime(time): a fresh mixer's actions pose from
        // an UPDATE tick; setTime on a never-ticked mixer left every frame at
        // the bind pose, which is why the first sheet's frames were identical.
        mixer.clipAction(m.clips[clip]).play();
        mixer.update(time);
      }
      t.renderer.render(t.scene, t.camera);
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      out.getContext("2d")!.drawImage(t.renderer.domElement, 0, 0);
      mixer.stopAllAction();
      return out;
    },
    [ensureThree, frame, yaw],
  );

  /** ── STRIPS ─────────────────────────────────────────────────────────────
   *
   * The production output: per tank, per team, per clip, one horizontal strip
   * of STRIP_FRAMES square frames. Teams are recoloured AT THE MATERIAL, not
   * by post-processing pixels: the same model is baked once in Armor Clash's
   * MINE blue and once in THEIRS red, so the two teams are pixel-identical in
   * shape and shading and differ only in paint — which is exactly the guarantee
   * a recolour filter over a PNG cannot give.
   *
   * What gets painted: materials with real saturation (the hull colours).
   * Greys keep their metal — tracks, guns and wheels stay tracks, guns and
   * wheels, which is what keeps a blue tank reading as a TANK rather than as
   * a blue toy.
   */
  const STRIP_FRAMES = 4;
  const STRIP_CELL = 256;
  const TEAMS = [
    { key: "mine", hex: "#3f8fd0" }, // armorclash MINE
    { key: "theirs", hex: "#e2574d" }, // armorclash THEIRS
  ] as const;
  const STRIP_CLIPS = [
    { short: "forward", match: /Forward/i },
    { short: "turnl", match: /TurningLeft/i },
    { short: "turnr", match: /TurningRight/i },
  ] as const;

  /** Recolour a model toward a team hue; returns the restore.
   *
   * BY MESH NAME, not by colour statistics. The first pass guessed paint vs
   * metal from material saturation, and on this pack the guess was a lottery:
   * the hulls are LOW-saturation beige, so the panels that most needed paint
   * were the ones the threshold protected, and each tank recoloured a
   * different arbitrary subset of itself (the pastel proof sheet). Quaternius
   * names his meshes consistently — Tank_body, Tank_Turret vs TrackMesh*,
   * Tank_Gun — so the paint/metal divide can be stated instead of inferred.
   *
   * Within a painted mesh, very dark materials (vents, shadows, rubber trim)
   * keep their darkness: hue from the team, lightness pulled TOWARD the
   * team's but never flattened, so the bake's directional shading survives. */
  const paintTeam = useCallback((root: THREE.Object3D, hex: string) => {
    // REPLACE, DO NOT EDIT. Four generations of recolour tried to steer this
    // pack's authored materials (diffuse-only, luminance blends, emissive
    // zeroed, emissive re-hued) and each fix exposed the next quirk: black
    // vertex colours here, emissive-driven panels there, broken normals on
    // tank2's dome. The lesson is that an authored material is a bundle of
    // unknowns, so painted meshes get a FRESH Lambert per slot — team colour,
    // no vertex colours, no emissive, nothing inherited — and the low-poly
    // facets plus the rig's one light do all the shading. Deterministic for
    // ANY future pack, which is the property every clever tweak lacked.
    // Panel variety survives as a per-slot value step so a hull is not one
    // flat sticker. Metal parts (tracks, gun, wheels) keep authored materials.
    const team = new THREE.Color(hex);
    const METAL = /track|gun|wheel/i;
    const undo: { m: THREE.Mesh; mats: THREE.Material | THREE.Material[] }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) return;
      if (METAL.test(mesh.name)) return;
      const orig = mesh.material;
      undo.push({ m: mesh, mats: orig });
      const slots = Array.isArray(orig) ? orig.length : 1;
      const fresh: THREE.Material[] = [];
      for (let i = 0; i < slots; i++) {
        // Alternate slots step darker so panel seams read; the exact original
        // colours are irrelevant, the STRUCTURE (different slots = different
        // panels) is what we keep.
        const k = 1 - (i % 3) * 0.14;
        fresh.push(
          new THREE.MeshLambertMaterial({
            color: new THREE.Color(team.r * k, team.g * k, team.b * k),
            side: THREE.DoubleSide,
          }),
        );
      }
      mesh.material = Array.isArray(orig) ? fresh : fresh[0];
    });
    return () => {
      for (const u of undo) u.m.material = u.mats;
    };
  }, []);

  const bakeStrips = useCallback(async () => {
    const tankKeys = ["tank1", "tank2", "tank3", "tank4"];
    let wrote = 0;
    for (const key of tankKeys) {
      const m = modelsRef.current.get(key);
      if (!m) continue;
      for (const team of TEAMS) {
        const restore = paintTeam(m.root, team.hex);
        for (const sc of STRIP_CLIPS) {
          const ci = m.clips.findIndex((c) => sc.match.test(c.name));
          if (ci < 0) continue;
          const clip = m.clips[ci];
          const strip = document.createElement("canvas");
          strip.width = STRIP_FRAMES * STRIP_CELL;
          strip.height = STRIP_CELL;
          const g = strip.getContext("2d")!;
          for (let f = 0; f < STRIP_FRAMES; f++) {
            // Sample inside the clip, never AT duration: the last keyframe
            // wraps to the first and a strip whose frame 4 equals frame 1
            // hitches when the game loops it.
            const time = (clip.duration * f) / STRIP_FRAMES;
            g.drawImage(snap(key, ci, time, STRIP_CELL), f * STRIP_CELL, 0);
          }
          const res = await fetch("/api/dev/bake-save", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              file: `strips/${key}-${team.key}-${sc.short}.png`,
              dataUrl: strip.toDataURL("image/png"),
            }),
          });
          if ((await res.json() as { ok?: boolean }).ok) wrote++;
          setStatus(`strips: ${wrote} written…`);
        }
        restore();
      }
    }
    // The provenance record, beside the strips.
    await fetch("/api/dev/bake-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        file: "strips/manifest.json",
        json: JSON.stringify(
          {
            source: "quaternius-animated-tanks (CC0), baked by /dev/bake",
            frames: STRIP_FRAMES,
            cellPx: STRIP_CELL,
            noseHeading: "+x (sprRot heading 0)",
            teams: Object.fromEntries(TEAMS.map((t) => [t.key, t.hex])),
            clips: Object.fromEntries(STRIP_CLIPS.map((c) => [c.short, String(c.match)])),
            deck: {
              tank1: "medium: Sherman / Cromwell / Hellcat",
              tank2: "heavy: Panther / Tiger / Tiger II",
              tank3: "light: Stuart / Chaffee",
              tank4: "MORTAR (Mike, 2026-08-02)",
            },
          },
          null,
          2,
        ),
      }),
    });
    // restore the interactive preview
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`strips done: ${wrote} files + manifest`);
  }, [mount, paintTeam, sel, snap]);

  /** WARPATH SET: hull-only strips and turret-only sprites from ONE model.
   *
   * Warpath's player tank aims its turret independently of the hull, and the
   * Quaternius rigs keep Tank_Turret/Tank_Gun as separate meshes — so the rig
   * hides mesh subsets per render instead of needing separate assets. Plus
   * the theirs-red SUV single-frame for Vanguard's MG trucks.
   */
  const bakeWarpathSet = useCallback(async () => {
    const save = async (file: string, cvs: HTMLCanvasElement) => {
      const res = await fetch("/api/dev/bake-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, dataUrl: cvs.toDataURL("image/png") }),
      });
      return (((await res.json()) as { ok?: boolean }).ok ? 1 : 0) as number;
    };
    const setVis = (root: THREE.Object3D, show: (name: string) => boolean) => {
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) o.visible = show(o.name);
      });
    };
    let wrote = 0;
    const m = modelsRef.current.get("tank1");
    if (m) {
      const fwd = m.clips.findIndex((c) => /Forward/i.test(c.name));
      for (const team of TEAMS) {
        const restore = paintTeam(m.root, team.hex);
        // hull only: everything except the turret assembly
        setVis(m.root, (n) => !/turret|gun/i.test(n));
        const strip = document.createElement("canvas");
        strip.width = STRIP_FRAMES * STRIP_CELL;
        strip.height = STRIP_CELL;
        const g = strip.getContext("2d")!;
        for (let f = 0; f < STRIP_FRAMES; f++) {
          const t = fwd >= 0 ? (m.clips[fwd].duration * f) / STRIP_FRAMES : 0;
          g.drawImage(snap("tank1", fwd, t, STRIP_CELL), f * STRIP_CELL, 0);
        }
        wrote += await save(`warpath/hull-${team.key}.png`, strip);
        // turret only. NOTE the camera still frames the WHOLE model's radius,
        // so hull and turret bake at the same world scale and the client can
        // compose them without a magic ratio.
        setVis(m.root, (n) => /turret|gun/i.test(n));
        const tur = document.createElement("canvas");
        tur.width = STRIP_CELL;
        tur.height = STRIP_CELL;
        tur.getContext("2d")!.drawImage(snap("tank1", -1, 0, STRIP_CELL), 0, 0);
        wrote += await save(`warpath/turret-${team.key}.png`, tur);
        setVis(m.root, () => true);
        restore();
      }
    }
    const suv = modelsRef.current.get("car-suv");
    if (suv) {
      const restore = paintTeam(suv.root, TEAMS[1].hex); // theirs-red
      const one = document.createElement("canvas");
      one.width = STRIP_CELL;
      one.height = STRIP_CELL;
      one.getContext("2d")!.drawImage(snap("car-suv", -1, 0, STRIP_CELL), 0, 0);
      wrote += await save("vanguard/truck-theirs.png", one);
      restore();
    }
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`warpath set done: ${wrote}`);
  }, [mount, paintTeam, sel, snap]);

  /** FIELD SCENERY: trees and boulders for the two field games, with the same
   * footprint descriptors the buildings carry, so a tree can be planted on a
   * spot rather than floated near one. */
  const bakeScenery = useCallback(async () => {
    const save = async (file: string, body: Record<string, unknown>) => {
      const res = await fetch("/api/dev/bake-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, ...body }),
      });
      return (((await res.json()) as { ok?: boolean }).ok ? 1 : 0) as number;
    };
    const uy = 3.6 / Math.hypot(5, 3.6);
    const uz = -5 / Math.hypot(5, 3.6);
    const out: Record<string, { fw: number; fh: number; fb: number }> = {};
    let wrote = 0;
    for (const spec2 of MODELS) {
      if (!spec2.key.startsWith("sc-")) continue;
      const m = modelsRef.current.get(spec2.key);
      if (!m) continue;
      const box = new THREE.Box3().setFromObject(m.root);
      const r = m.radius * 1.25;
      const su = (y: number, z: number) => uy * y + uz * z;
      const py = (v: number) => 0.5 - v / (2 * r);
      const footBottom = py(su(box.min.y, box.max.z));
      const footTop = py(su(box.min.y, box.min.z));
      out[spec2.key] = {
        fw: (box.max.x - box.min.x) / (2 * r),
        fh: Math.abs(footBottom - footTop),
        fb: 1 - footBottom,
      };
      const one = document.createElement("canvas");
      one.width = STRIP_CELL;
      one.height = STRIP_CELL;
      one.getContext("2d")!.drawImage(snap(spec2.key, -1, 0, STRIP_CELL), 0, 0);
      wrote += await save(`scenery/${spec2.key}.png`, { dataUrl: one.toDataURL("image/png") });
    }
    await save("scenery/scenery.json", { json: JSON.stringify(out, null, 2) });
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`scenery: ${wrote} baked`);
  }, [mount, sel, snap]);

  /** VANGUARD BUILDINGS: every city-kit model, plus the FOOTPRINT DESCRIPTOR
   * each one needs to be laid on a lot.
   *
   * A tilt-baked building's PNG is not its footprint: the sprite is the
   * footprint plus everything the height projects above it. To lay one on a
   * plot of ground the game can drive around, the client has to know where
   * inside the sprite the ground actually is. So this computes it analytically
   * from the camera rather than guessing:
   *
   *   the tilt camera sits at (0, 5R, 3.6R) looking at the origin, so screen
   *   right is world +X and screen up is u = normalize((0, 3.6, -5)) --
   *   therefore a world point projects to  sx = p.x,  su = u.y*p.y + u.z*p.z.
   *
   * The ground quad (y = minY) then projects to a rect of width (maxX-minX)
   * and depth |u.z|*(maxZ-minZ), and its BOTTOM edge (z = maxZ) sits at a
   * known height in the cell. Those three numbers, normalised to the cell, are
   * the descriptor: {fw, fh, fb} = footprint width, footprint depth, and the
   * distance from the sprite's bottom edge up to the footprint's bottom edge.
   */
  const bakeVanguardBuildings = useCallback(async () => {
    const save = async (file: string, body: Record<string, unknown>) => {
      const res = await fetch("/api/dev/bake-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, ...body }),
      });
      return (((await res.json()) as { ok?: boolean }).ok ? 1 : 0) as number;
    };
    const t = ensureThree();
    // the tilt camera's screen-up vector, in world terms (see the note above)
    const uy = 3.6 / Math.hypot(5, 3.6);
    const uz = -5 / Math.hypot(5, 3.6);
    const out: Record<string, { fw: number; fh: number; fb: number; h: number }> = {};
    let wrote = 0;
    for (const spec2 of MODELS) {
      if (!spec2.key.startsWith("bld-")) continue;
      const m = modelsRef.current.get(spec2.key);
      if (!m) continue;
      const box = new THREE.Box3().setFromObject(m.root);
      const r = m.radius * 1.25; // must match frame()'s tilt branch
      const su = (y: number, z: number) => uy * y + uz * z;
      // cell-normalised: 0 at the top of the sprite, 1 at the bottom
      const py = (v: number) => 0.5 - v / (2 * r);
      const footBottom = py(su(box.min.y, box.max.z));
      const footTop = py(su(box.min.y, box.min.z));
      const roofTop = py(su(box.max.y, box.min.z));
      out[spec2.key] = {
        fw: (box.max.x - box.min.x) / (2 * r),
        fh: Math.abs(footBottom - footTop),
        fb: 1 - footBottom,
        h: Math.abs(footBottom - roofTop),
      };
      const one = document.createElement("canvas");
      one.width = STRIP_CELL;
      one.height = STRIP_CELL;
      one.getContext("2d")!.drawImage(snap(spec2.key, -1, 0, STRIP_CELL), 0, 0);
      wrote += await save(`vanguard/${spec2.key}.png`, { dataUrl: one.toDataURL("image/png") });
    }
    await save("vanguard/buildings.json", { json: JSON.stringify(out, null, 2) });
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    void t;
    setStatus(`vanguard buildings: ${wrote} baked + descriptors`);
  }, [ensureThree, mount, sel, snap]);

  /** WARHAWKS BASES: the four SQUARE towers in dark slate, tilt-baked.
   * Mike 2026-08-02: "the ground bases need some kenney love... pick some of
   * the dark gray models that stick out". Enemy structures carry NO team
   * colour: hostility is the client's magenta telegraph, not a livery. */
  const bakeWarhawksBases = useCallback(async () => {
    const save = async (file: string, cvs: HTMLCanvasElement) => {
      const res = await fetch("/api/dev/bake-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, dataUrl: cvs.toDataURL("image/png") }),
      });
      return (((await res.json()) as { ok?: boolean }).ok ? 1 : 0) as number;
    };
    let wrote = 0;
    for (const key of ["tower-sq-a", "tower-sq-b", "tower-sq-d", "tower-sq-f"]) {
      const m = modelsRef.current.get(key);
      if (!m) continue;
      const restore = paintTeam(m.root, "#4b5158"); // dark slate, deliberately grim
      const one = document.createElement("canvas");
      one.width = STRIP_CELL;
      one.height = STRIP_CELL;
      one.getContext("2d")!.drawImage(snap(key, -1, 0, STRIP_CELL), 0, 0);
      wrote += await save(`warhawks/base-${key.slice(-1)}.png`, one);
      restore();
    }
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`warhawks bases done: ${wrote}`);
  }, [mount, paintTeam, sel, snap]);

  /** Bake every tilted structure to a single authored-material frame. No team
   * paint: ownership on the board is the drawn cap band + flag stamped over
   * the sprite, exactly as it is stamped over today's paintings, so whose
   * tower it is never depends on reading a texture. */
  /** Swap a structure's saturated ACCENT materials (the authored red/purple
   * trims) for team Lambert, leaving the grey stone authored. This is the
   * "replace, never negotiate" rule applied narrowly: Kenney GLB materials
   * are clean flat colours (no vertex-colour or emissive tricks), so
   * saturation is a reliable accent detector here in a way it never was on
   * the FBX tanks. */
  const accentTeam = useCallback((root: THREE.Object3D, hex: string) => {
    const team = new THREE.Color(hex);
    const undo: { m: THREE.Mesh; mats: THREE.Material | THREE.Material[] }[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const orig = mesh.material;
      const arr = Array.isArray(orig) ? orig : [orig];
      let touched = false;
      const next = arr.map((mat) => {
        const c = (mat as THREE.MeshStandardMaterial).color;
        if (!c) return mat;
        const hsl = { h: 0, s: 0, l: 0 };
        c.getHSL(hsl);
        if (hsl.s < 0.25) return mat; // stone stays stone
        touched = true;
        return new THREE.MeshLambertMaterial({
          color: new THREE.Color(team.r * (0.6 + hsl.l * 0.7), team.g * (0.6 + hsl.l * 0.7), team.b * (0.6 + hsl.l * 0.7)),
        });
      });
      if (touched) {
        undo.push({ m: mesh, mats: orig });
        mesh.material = Array.isArray(orig) ? next : next[0];
      }
    });
    return () => {
      for (const u of undo) u.m.material = u.mats;
    };
  }, []);

  const bakeStructures = useCallback(async () => {
    let wrote = 0;
    for (const m of MODELS.filter((x) => x.tilt)) {
      const loaded = modelsRef.current.get(m.key);
      if (!loaded) continue;
      for (const team of [null, ...TEAMS] as (null | (typeof TEAMS)[number])[]) {
        const restore = team ? accentTeam(loaded.root, team.hex) : null;
        const cvs = snap(m.key, -1, 0, 512);
        const file = team ? `structures/${m.key}-${team.key}.png` : `structures/${m.key}.png`;
        const res = await fetch("/api/dev/bake-save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file, dataUrl: cvs.toDataURL("image/png") }),
        });
        if (((await res.json()) as { ok?: boolean }).ok) wrote++;
        restore?.();
        setStatus(`structures: ${wrote}…`);
      }
    }
    const tt = threeRef.current;
    if (tt) {
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`structures done: ${wrote}`);
  }, [mount, sel, snap]);

  /** THE CONTACT SHEET: every model × every clip × SHEET_FRAMES, one image.
   * This is the artefact Mike reviews before anything is wired in. */
  const contactSheet = useCallback(async () => {
    setStatus("rendering sheet…");
    const models = Array.from(modelsRef.current.values());
    const rows: { label: string; cells: HTMLCanvasElement[] }[] = [];
    for (const m of models) {
      const clips = m.clips.length ? m.clips : [null as unknown as THREE.AnimationClip];
      clips.forEach((c: THREE.AnimationClip | null, ci: number) => {
        const cells: HTMLCanvasElement[] = [];
        for (let f = 0; f < SHEET_FRAMES; f++) {
          const time = c ? (c.duration * f) / SHEET_FRAMES : 0;
          cells.push(snap(m.key, ci, time, CELL));
        }
        rows.push({ label: `${m.label} · ${c ? c.name : "(no clips)"}`, cells });
      });
    }
    const sheet = sheetRef.current!;
    const pad = 4;
    const labelH = 16;
    sheet.width = pad + SHEET_FRAMES * (CELL + pad);
    sheet.height = rows.reduce((h) => h + labelH + CELL + pad, pad);
    const g = sheet.getContext("2d")!;
    g.fillStyle = "#20242a";
    g.fillRect(0, 0, sheet.width, sheet.height);
    let y = pad;
    for (const row of rows) {
      g.fillStyle = "#d7dee6";
      g.font = "700 11px ui-monospace, monospace";
      g.fillText(row.label, pad + 2, y + 11);
      y += labelH;
      row.cells.forEach((c, i) => {
        // checker under each cell so transparency reads as transparency
        for (let k = 0; k < 8; k++) {
          for (let j = 0; j < 8; j++) {
            g.fillStyle = (k + j) % 2 ? "#2c3138" : "#262b31";
            g.fillRect(pad + i * (CELL + pad) + (k * CELL) / 8, y + (j * CELL) / 8, CELL / 8, CELL / 8);
          }
        }
        g.drawImage(c, pad + i * (CELL + pad), y);
      });
      y += CELL + pad;
    }
    // restore the interactive preview
    t: {
      const tt = threeRef.current;
      if (!tt) break t;
      tt.renderer.setSize(512, 512, false);
      mount(sel);
    }
    setStatus(`sheet: ${rows.length} rows`);
  }, [mount, sel, snap]);

  const saveSheet = useCallback(async () => {
    const sheet = sheetRef.current!;
    const res = await fetch("/api/dev/bake-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: "contact-sheet.png", dataUrl: sheet.toDataURL("image/png") }),
    });
    const j = (await res.json()) as { wrote?: string; error?: string };
    setStatus(j.wrote ? `saved ${j.wrote}` : `save failed: ${j.error}`);
  }, []);

  const btn: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid #3a414a",
    background: "#232830",
    color: "#e6edf3",
    fontSize: 13,
    cursor: "pointer",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#14171b", color: "#e6edf3", padding: 18, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Bake rig — CC0 packs → top-down strips <span style={{ color: "#f0b340" }}>v21-scenery</span></h1>
      <p style={{ fontSize: 12.5, color: "#9aa7b4", margin: "0 0 14px" }}>
        dev-only · art-src in, art-src/baked out · status: <b>{status}</b>
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ ...btn, cursor: "auto" }}>
          {MODELS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={clipIdx} onChange={(e) => setClipIdx(Number(e.target.value))} style={{ ...btn, cursor: "auto" }}>
          {clipNames.length === 0 ? <option value={0}>(no clips)</option> : null}
          {clipNames.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <label style={{ fontSize: 12.5, color: "#9aa7b4" }}>
          yaw{" "}
          <select value={yaw} onChange={(e) => setYaw(Number(e.target.value))} style={{ ...btn, cursor: "auto" }}>
            {[0, 90, 180, 270].map((d) => (
              <option key={d} value={d}>
                {d}°
              </option>
            ))}
          </select>
        </label>
        <button style={btn} onClick={() => setPlaying((p) => !p)}>
          {playing ? "pause" : "play"}
        </button>
        <button style={{ ...btn, borderColor: "#f0b34066", color: "#f0b340" }} onClick={() => void contactSheet()}>
          render contact sheet
        </button>
        <button style={{ ...btn, borderColor: "#7ee06a66", color: "#7ee06a" }} onClick={() => void bakeStrips()}>
          bake team strips
        </button>
        <button style={{ ...btn, borderColor: "#c9a7ff66", color: "#c9a7ff" }} onClick={() => void bakeStructures()}>
          bake structures
        </button>
        <button style={{ ...btn, borderColor: "#8fd3ff66", color: "#8fd3ff" }} onClick={() => void bakeWarpathSet()}>
          bake warpath set
        </button>
        <button style={{ ...btn, borderColor: "#a8b2bc66", color: "#a8b2bc" }} onClick={() => void bakeWarhawksBases()}>
          bake warhawks bases
        </button>
        <button style={{ ...btn, borderColor: "#d9c9a366", color: "#d9c9a3" }} onClick={() => void bakeVanguardBuildings()}>
          bake vanguard buildings
        </button>
        <button style={{ ...btn, borderColor: "#9fd68f66", color: "#9fd68f" }} onClick={() => void bakeScenery()}>
          bake scenery
        </button>
        <button style={btn} onClick={() => void saveSheet()}>
          save sheet
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#8d97a1", marginBottom: 6 }}>live preview (transparent = checker)</div>
          <canvas
            ref={canvasRef}
            width={512}
            height={512}
            style={{
              width: 512,
              height: 512,
              background:
                "repeating-conic-gradient(#262b31 0% 25%, #2c3138 0% 50%) 0 0 / 32px 32px",
              borderRadius: 10,
              border: "1px solid #3a414a",
            }}
          />
        </div>
        <div style={{ overflow: "auto", maxHeight: "80vh" }}>
          <div style={{ fontSize: 11, color: "#8d97a1", marginBottom: 6 }}>contact sheet</div>
          <canvas ref={sheetRef} style={{ borderRadius: 10, border: "1px solid #3a414a", maxWidth: "100%" }} />
        </div>
      </div>
    </main>
  );
}
