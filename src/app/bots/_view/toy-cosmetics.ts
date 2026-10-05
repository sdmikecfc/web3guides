"use client";

import * as THREE from "three";
import type { Socket } from "@/lib/bots/fixtures";
import { marksOf, type BotLook, type StickerId } from "./look";

type V3 = readonly [number, number, number];
type Parts = Record<Socket, THREE.Mesh[]>;

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * .43 : radius;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}

function sticker(ctx: CanvasRenderingContext2D, id: StickerId, color: number) {
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 21; ctx.lineCap = "round"; ctx.lineJoin = "round";
  // A fine cream keyline keeps a same-colour sticker legible on its own paint.
  ctx.shadowColor = "#ffefd0"; ctx.shadowBlur = 3;
  if (id === "heart") {
    ctx.beginPath(); ctx.moveTo(128, 214); ctx.bezierCurveTo(8, 138, 20, 38, 90, 52);
    ctx.bezierCurveTo(116, 56, 127, 80, 128, 86); ctx.bezierCurveTo(147, 31, 221, 41, 229, 103);
    ctx.bezierCurveTo(234, 148, 174, 192, 128, 214); ctx.fill();
  } else if (id === "bolt") {
    ctx.beginPath(); ctx.moveTo(143, 25); ctx.lineTo(54, 142); ctx.lineTo(113, 142);
    ctx.lineTo(100, 229); ctx.lineTo(202, 101); ctx.lineTo(144, 101); ctx.closePath(); ctx.fill();
  } else if (id === "star") star(ctx, 128, 128, 104);
  else if (id === "stripes") for (const y of [65, 128, 191]) {
    ctx.beginPath(); ctx.moveTo(45, y + 24); ctx.lineTo(211, y - 24); ctx.stroke();
  } else if (id === "wrenches") for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(128, 128); ctx.rotate(side * .74);
    ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(0, 88); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -78, 29, .25, Math.PI - .25); ctx.stroke(); ctx.restore();
  } else {
    ctx.beginPath(); ctx.roundRect(31, 69, 194, 118, 29); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 128, 22, 0, Math.PI * 2); ctx.fill();
  }
}

/** Cosmetics are additional instance-owned surfaces on the chosen moulds.
 * They never select a renderer, replace a part, or edit a shared GLB buffer. */
export function attachToyCosmetics(look: BotLook, bones: Record<string, THREE.Object3D>, meshes: Parts, authored: ReadonlySet<Socket>) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const additions: THREE.Mesh[] = [];
  const original = Object.fromEntries(Object.entries(meshes).map(([s, value]) => [s, [...value]])) as Parts;
  const boxes = new Map<string, THREE.Box3>();
  const v = new THREE.Vector3(), inverse = new THREE.Matrix4(), ray = new THREE.Raycaster();
  const has = (s: Socket) => authored.has(s) && original[s].length > 0;
  const bounds = (socket: Socket, paint = false) => {
    const key = socket + (paint ? ":paint" : "");
    const cached = boxes.get(key); if (cached) return cached;
    const box = new THREE.Box3(); inverse.copy(bones[socket].matrixWorld).invert();
    for (const mesh of original[socket]) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (paint && !mats.some(m => m.name === "paint")) continue;
      if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.update();
      const count = mesh.geometry.getAttribute("position").count;
      for (let i = 0; i < count; i++) box.expandByPoint(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
    }
    if (box.isEmpty() && paint) return bounds(socket);
    boxes.set(key, box); return box;
  };
  const own = (socket: Socket, geo: THREE.BufferGeometry, mat: THREE.Material, parent = bones[socket], at: V3 = [0, 0, 0], kind = "decoration") => {
    geometry.add(geo); materials.add(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...at);
    mesh.name = `cosmetic:${kind}`; mesh.userData.socket = socket; mesh.userData.cosmetic = true;
    mesh.castShadow = false; mesh.receiveShadow = true;
    parent.add(mesh); meshes[socket].push(mesh); additions.push(mesh); return mesh;
  };
  const clay = (color: number, metalness = .05) => new THREE.MeshStandardMaterial({ color, roughness: metalness > .4 ? .3 : .5, metalness });
  const patch = (socket: Socket, x: number, y: number, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, kind: string, anchor = socket as string, segments = 4, clearance = .009) => {
    if (!has(socket) || typeof document === "undefined") return;
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    draw(ctx);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: .63, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    materials.add(mat);
    // A small surface grid follows the actual selected mesh, including curved
    // cheeks and chest panels. Project before posing, then ride its own bone.
    const geo = new THREE.PlaneGeometry(w, h, segments, segments), p = geo.getAttribute("position");
    geometry.add(geo);
    const socketBone = bones[socket], parent = bones[anchor] ?? socketBone;
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(socketBone.matrixWorld);
    const source = new THREE.Vector3(), point = new THREE.Vector3();
    const front = bounds(socket).max.z + .5;
    for (let i = 0; i < p.count; i++) {
      source.set(x + p.getX(i), y + p.getY(i), front).applyMatrix4(socketBone.matrixWorld);
      ray.set(source, direction);
      const hit = ray.intersectObjects(original[socket], false)[0];
      point.copy(hit?.point ?? source.clone().addScaledVector(direction, .5));
      point.addScaledVector(direction, -clearance);
      parent.worldToLocal(point); p.setXYZ(i, point.x, point.y, point.z);
    }
    geo.computeVertexNormals(); own(socket, geo, mat, parent, [0, 0, 0], kind);
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    additions.forEach(m => { m.removeFromParent(); const list = meshes[m.userData.socket as Socket]; const i = list.indexOf(m); if (i >= 0) list.splice(i, 1); });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  };
  try {
  const marks = marksOf(look.earned);
  if (look.sticker) {
    const s = look.sticker, socket: Socket = s.spot === "cheek" ? "head" : s.spot === "boot" ? "legR" : "torso";
    if (has(socket)) {
      const box = bounds(socket, true);
      const x = s.spot === "cheek" ? Math.min(box.max.x - .13, .39) : 0;
      const y = s.spot === "cheek" ? .32 : s.spot === "boot" ? box.min.y + .23 : .60;
      const size = s.spot === "chest" ? .43 : .23;
      patch(socket, x, y, size, size, ctx => sticker(ctx, s.id, s.color), `sticker:${s.id}`, s.spot === "boot" ? "ankleR" : socket);
    }
  }
  const number = marks.count ?? look.plate;
  if (number != null) patch("torso", 0, .24, .37, .18, ctx => {
    ctx.fillStyle = "#e9d9b9"; ctx.beginPath(); ctx.roundRect(8, 25, 240, 206, 34); ctx.fill();
    ctx.strokeStyle = "#ac8752"; ctx.lineWidth = 9; ctx.stroke();
    ctx.fillStyle = "#343b30"; ctx.font = "bold 158px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(number), 128, 139, 215);
  }, "number");
  const count = marks.stars + (marks.gold ? 1 : 0);
  for (let i = 0; i < count; i++) patch("torso", (i - (count - 1) / 2) * .13, .96, .10, .10, ctx => {
    ctx.fillStyle = marks.gold && i === count - 1 ? "#efc56a" : "#f5e7c8"; star(ctx, 128, 128, 104);
  }, "win-star");
  for (let i = 0; i < marks.patches; i++) patch("torso", -.38 + i * .18, .35, .15, .13, ctx => {
    ctx.strokeStyle = "#594932"; ctx.lineWidth = 11; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(35, 143); ctx.quadraticCurveTo(130, 90, 222, 134); ctx.stroke();
    for (const x of [65, 107, 149, 191]) { ctx.beginPath(); ctx.moveTo(x - 8, 83); ctx.lineTo(x + 8, 161); ctx.stroke(); }
  }, "repair-stitch");
  for (const socket of ["armL", "armR"] as const) for (let i = 0; i < marks.cuffs; i++) if (has(socket)) {
    const band = new THREE.TorusGeometry(.163, .021, 5, 16); band.rotateX(Math.PI / 2);
    own(socket, band, clay(0xb99550, .8), bones[`elbow${socket.slice(-1)}`] ?? bones[socket], [0, -.18 - i * .11, .04], "cuff");
  }
  if (has("head") && ((look.face && look.face !== "calm") || marks.sparkle)) {
    // The authored lens material identifies eye positions without guessing the
    // selected head family. Paint covers only each lens, keeping its metal rim.
    const eyeMeshes = original.head.filter(mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(m => m.name === "eye"));
    const eyePoints: THREE.Vector3[] = [];
    inverse.copy(bones.head.matrixWorld).invert();
    for (const mesh of eyeMeshes) for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) {
      eyePoints.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
    }
    const allEyes = new THREE.Box3().setFromPoints(eyePoints), single = !allEyes.isEmpty() && allEyes.max.x - allEyes.min.x < .55;
    const groups = single ? [eyePoints] : [eyePoints.filter(p => p.x < 0), eyePoints.filter(p => p.x >= 0)];
    groups.forEach((points, index) => {
      if (!points.length) return;
      const eye = new THREE.Box3().setFromPoints(points), centre = eye.getCenter(new THREE.Vector3());
      const size = (eye.max.y - eye.min.y) * .91, closed = look.face === "sleepy" || look.face === "wink" && index === groups.length - 1;
      // Happy previously kept the authored pupils and added a small curved
      // stroke above them. Preserve those eyes instead of repainting the lens.
      if (look.face === "happy") patch("head", centre.x, centre.y + size * .69, size * .70, size * .32, ctx => {
        ctx.strokeStyle = "#3b4130"; ctx.lineWidth = 25; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(37, 174); ctx.quadraticCurveTo(128, 40, 219, 174); ctx.stroke();
      }, "face:happy", "head", 12, .016);
      if (marks.sparkle) patch("head", centre.x - size * .23, centre.y + size * .23, size * .27, size * .27, ctx => {
        ctx.fillStyle = "#fff9de"; star(ctx, 128, 128, 100);
      }, "eye-sparkle", "head", 8, .020);
      if (!closed && look.face !== "stars") return;
      patch("head", centre.x, centre.y, size, size, ctx => {
        ctx.fillStyle = closed ? "#dac79e" : "#f2d394"; ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#353b2c"; ctx.strokeStyle = "#353b2c"; ctx.lineWidth = 19; ctx.lineCap = "round";
        if (look.face === "stars") { ctx.fillStyle = "#84631d"; star(ctx, 128, 128, 83); }
        else if (closed) {
          ctx.beginPath(); ctx.moveTo(57, 124); ctx.quadraticCurveTo(128, 166, 199, 124); ctx.stroke();
        }
        if (marks.sparkle) { ctx.fillStyle = "#fff9de"; star(ctx, 77, 66, 30); }
      }, `face:${look.face ?? "calm"}`, "head", 16, .018);
    });
  }
  if (has("head") && (look.hat || marks.crown)) {
    const top = bounds("head", true).max.y + .045, hat = look.hat;
    const brass = clay(0xb99550, .8), ivory = clay(0xeee4cd), color = clay(hat?.color ?? 0xb99550);
    const ball = (scale: V3, at: V3, mat = color) => { const m = own("head", new THREE.SphereGeometry(1, 16, 10), mat, bones.head, at, "hat"); m.scale.set(...scale); return m; };
    const rod = (r: number, h: number, at: V3, mat = brass) => own("head", new THREE.CylinderGeometry(r, r, h, 12), mat, bones.head, at, "hat");
    if (hat?.kind === "bow") { for (const side of [-1, 1]) ball([.21, .15, .10], [side * .18, top + .14, .06]).rotation.z = side * .25; ball([.09, .10, .11], [0, top + .14, .09], brass); }
    if (hat?.kind === "propeller") { rod(.035, .25, [0, top + .13, 0]); own("head", new THREE.BoxGeometry(.7, .045, .1), color, bones.head, [0, top + .27, 0], "hat").rotation.y = .4; ball([.07, .05, .07], [0, top + .285, 0], brass); }
    if (hat?.kind === "ears") for (const side of [-1, 1]) { ball([.11, .35, .10], [side * .24, top + .24, 0]).rotation.z = -side * .18; ball([.055, .23, .025], [side * .24, top + .24, .09], ivory); }
    if (hat?.kind === "flag") { rod(.025, .51, [.09, top + .25, 0]); own("head", new THREE.BoxGeometry(.32, .20, .035), color, bones.head, [.25, top + .38, 0], "hat"); }
    if (hat?.kind === "bell") { own("head", new THREE.CylinderGeometry(.10, .25, .30, 18), color, bones.head, [0, top + .15, 0], "hat"); ball([.055, .065, .055], [0, top, 0], brass); }
    if (hat?.kind === "spring") {
      const points = Array.from({ length: 41 }, (_, i) => { const t = i / 40, a = t * Math.PI * 5; return new THREE.Vector3(Math.cos(a) * .07, top + t * .35, Math.sin(a) * .07); });
      own("head", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, .018, 5, false), brass, bones.head, [0, 0, 0], "hat"); ball([.10, .10, .10], [0, top + .38, 0]);
    }
    if (marks.crown) {
      const y = top + (hat?.kind === "ears" ? .72 : hat ? .51 : .13);
      rod(.28, .085, [0, y, 0]);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, x = Math.sin(a) * .27, z = Math.cos(a) * .27; own("head", new THREE.ConeGeometry(.065, .19, 4), brass, bones.head, [x, y + .11, z], "crown"); ball([.037, .037, .037], [x, y + .22, z], ivory); }
    }
    // Materials that a particular hat did not use are still owned here.
    materials.add(brass); materials.add(ivory); materials.add(color);
  }
  } catch (error) {
    // A missing canvas or malformed decoration must never reroute a complete
    // authored robot to a different model. Keep its selected parts intact.
    dispose(); console.warn("[toy cosmetics] Decoration could not be drawn", error);
  }
  return { additions, dispose };
}
