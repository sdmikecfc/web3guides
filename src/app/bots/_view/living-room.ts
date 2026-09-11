"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createCombatToy, type CombatToy } from "./combat-toy";
import type { RoomActor, RoomAnchor, RoomLoadStatus } from "../_game/LivingRoomScene";

export interface LivingRoom {
  setActors(actors: RoomActor[], onProgress?: (status: RoomLoadStatus) => void): Promise<boolean>;
  select(id?: string): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  anchors(): RoomAnchor[];
  render(time?: number): void;
  metrics(): { calls: number; triangles: number; cpuMs: number; geometries: number; textures: number; actors: number };
  dispose(): void;
}

type Actor = { definition: RoomActor; toy: CombatToy; head: THREE.Quaternion; body: THREE.Quaternion; arm: THREE.Quaternion; legs: { node: THREE.Object3D; quaternion: THREE.Quaternion }[]; floorOffset: number };
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const STAND_TOP = .44;

/** Source form preview: authentic player meshes retain authored unit scale.
 * Existing room art is projected onto shared wall and floor geometry. */
export function createLivingRoom(canvas: HTMLCanvasElement, variant: "garage" | "community", referenceShot?: "hero" | "key" | "street"): LivingRoom {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .96;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(variant === "garage" ? 0x162126 : 0x22313b);
  const camera = new THREE.OrthographicCamera(-14, 14, 7, -7, .1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer), studio = new RoomEnvironment();
  const environment = pmrem.fromScene(studio, .08); scene.environment = environment.texture; scene.environmentIntensity = .42;
  studio.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffe6c0, 0x392714, .58));
  const key = new THREE.DirectionalLight(0xffdba6, 3.4); key.position.set(8, 13, 9);
  key.target.position.set(0, 0, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 2.6;
  Object.assign(key.shadow.camera, { left: -17, right: 17, top: 12, bottom: -11, near: 1, far: 45 });
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.00015; key.shadow.normalBias = .025;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffedd0, .62); fill.position.set(-8, 6, 12); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffc37b, 1.15); rim.position.set(-3, 8, -5); scene.add(rim);
  const ownedMaterials = new Set<THREE.Material>(), ownedTextures = new Set<THREE.Texture>();
  const ownedGeometry = new Set<THREE.BufferGeometry>();
  const mat = (color: number, roughness = .85, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); ownedMaterials.add(m); return m;
  };
  const texture = (kind: "plaster" | "wood" | "stone") => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = kind === "plaster" ? "#cac5b6" : kind === "wood" ? "#aa967b" : "#b1b0a6"; ctx.fillRect(0, 0, 512, 512);
    let seed = 1709;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    if (kind === "wood") {
      for (let y = 0; y < 512; y += 2) {
        ctx.strokeStyle = `rgba(69,39,18,${.025 + rand() * .12})`; ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 8) ctx.lineTo(x, y + Math.sin(x * .025 + y * .32) * (1 + rand() * 2)); ctx.stroke();
      }
      for (let y = 0; y < 512; y += 128) { ctx.fillStyle = "#59462e55"; ctx.fillRect(0, y, 512, 2); }
    } else {
      for (let i = 0; i < 21000; i++) { ctx.fillStyle = `rgba(${rand() > .5 ? "255,250,225" : "53,48,39"},${rand() * .19})`; const r = kind === "plaster" ? rand() * 3 : rand() * 5; ctx.fillRect(rand() * 512, rand() * 512, r, r); }
      for (let i = 0; i < 90; i++) { const x = rand() * 512, y = rand() * 512, r = 12 + rand() * 60; const gradient = ctx.createRadialGradient(x,y,0,x,y,r); gradient.addColorStop(0,`rgba(78,69,52,${.015+rand()*.045})`); gradient.addColorStop(1,"rgba(78,69,52,0)"); ctx.fillStyle=gradient; ctx.fillRect(x-r,y-r,r*2,r*2); }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    ownedTextures.add(t); return t;
  };
  const darkWood = mat(0x705033); darkWood.map = texture("wood");
  const brass = mat(0xc2a15d, .43, .68), iron = mat(0x756c56, .46, .70), rubber = mat(0x30291e);
  const paper = mat(0xe2d2a6), mint = mat(0x7dafa0), red = mat(0xaa5b42);
  const bulb = mat(0xffe0a3, .45); bulb.emissive.setHex(0xffc578); bulb.emissiveIntensity = .65;
  const shell = new THREE.Group(); shell.name = variant === "garage" ? "Garage review set" : "Community review set"; scene.add(shell);
  const box = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, radius = .025) => {
    const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d);
    ownedGeometry.add(geometry); const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const cylinder = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, radius: number, height: number, sides = 12) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, sides); ownedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const numberPlate = (parent: THREE.Object3D, number: number, x: number, y: number, z: number, width = .76) => {
    box(parent, brass, x, y, z, width, .36, .07, .035);
    const c = document.createElement("canvas"); c.width = 128; c.height = 64;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#c7b588"; ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#473d2d"; ctx.font = "bold 40px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(number).padStart(2, "0"), 64, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; ownedTextures.add(t);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: .5 }); ownedMaterials.add(m);
    const g = new THREE.PlaneGeometry(width * .88, .30); ownedGeometry.add(g);
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z + .04); parent.add(mesh);
  };
  // Merge static props by material. The dense decorative set adds only one
  // draw per material; robot skinned meshes remain independent and unmodified.
  const batch = (group: THREE.Group) => {
    group.updateMatrixWorld(true); const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const originals: THREE.BufferGeometry[] = [];
    group.traverse(o => { if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return; const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix); const list = bins.get(o.material) ?? []; list.push(g); bins.set(o.material, list); originals.push(o.geometry); });
    group.clear();
    originals.forEach(g => { g.dispose(); ownedGeometry.delete(g); });
    for (const [material, list] of Array.from(bins)) { const g = mergeGeometries(list); list.forEach(x => x.dispose()); if (!g) continue; ownedGeometry.add(g); const mesh = new THREE.Mesh(g, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); }
  };
  // The approved room plates are projected onto a real back wall and floor.
  // Splitting them at the floor line keeps both mobile rows on the ground;
  // a flat CSS/background image would put the rear row against the wall.
  const backdropLoads: Promise<void>[] = [];
  const plateSources = new Map<string, { base: THREE.Texture; maps: THREE.Texture[] }>();
  const plateMap = (url: string, repeatX = 1, repeatY = 1, offsetX = 0, offsetY = 0) => {
    let source = plateSources.get(url);
    if (!source) {
      const maps: THREE.Texture[] = [];
      let loaded!: () => void, failed!: (error: unknown) => void;
      backdropLoads.push(new Promise<void>((resolve, reject) => { loaded = resolve; failed = reject; }));
      const base = new THREE.TextureLoader().load(url, () => { maps.forEach(t => { t.needsUpdate = true; }); loaded(); }, undefined, failed);
      base.colorSpace = THREE.SRGBColorSpace; ownedTextures.add(base);
      source = { base, maps }; plateSources.set(url, source);
    }
    const t = source.base.clone(); t.repeat.set(repeatX, repeatY); t.offset.set(offsetX, offsetY);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); source.maps.push(t); ownedTextures.add(t); return t;
  };
  const plate = (texture: THREE.Texture, x: number, y: number, z: number, w: number, h: number, horizontal = false) => {
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }); ownedMaterials.add(material);
    const geometry = new THREE.PlaneGeometry(w, h); ownedGeometry.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
    if (horizontal) mesh.rotation.x = -Math.PI / 2; scene.add(mesh); return mesh;
  };
  const shadow = new THREE.ShadowMaterial({ opacity: .23, color: 0x2c1b0d }); ownedMaterials.add(shadow);
  const groundGeometry = new THREE.PlaneGeometry(40, 40); ownedGeometry.add(groundGeometry);
  const ground = new THREE.Mesh(groundGeometry, shadow); ground.rotation.x = -Math.PI / 2; ground.position.set(0,.006,5); ground.receiveShadow = true; scene.add(ground);
  if (variant === "garage") {
    const url = "/bots-art/plates/workshop-interior.png";
    plate(plateMap(url,1,.667,0,.333),0,6.0,-4,32,12);
    plate(plateMap(url,1,.333),0,-.004,7.5,40,23,true);
    // One shallow 3D corkboard, dressed by hand, sits on the photographed wall.
    box(shell,darkWood,-10.55,4.35,-3.72,2.50,2.68,.17,.065);
    const corkFace = mat(0x8c6132); corkFace.map = texture("plaster");
    box(shell,corkFace,-10.55,4.35,-3.61,2.31,2.49,.06,.02);
    for(let i=0;i<3;i++) {
      const x=-11.11+(i%2)*.86,y=4.85-Math.floor(i/2)*1.01;
      const note=box(shell,i===1?mint:paper,x,y,-3.55,.90,.90,.02,0); note.rotation.z=(i-1)*.07;
      for(let line=0;line<4;line++) box(shell,darkWood,x,y+.19-line*.10,-3.533,.54,.015,.003,0);
      const pin=cylinder(shell,red,x,y+.36,-3.51,.034,.04,8);pin.rotation.x=Math.PI/2;
    }
  } else {
    const url = "/bots-art/plates/street-elevation.webp";
    // Three workshops on either side frame a real, recessed arena destination.
    // The existing handmade facades supply their rich clay and prop detail.
    plate(plateMap(url,3/7,.50,0,.28),-11.3,5.12,-6,17.5,10.24);
    plate(plateMap(url,3/7,.50,4/7,.28),11.3,5.12,-6,17.5,10.24);
    plate(plateMap(url,1,.28),0,-.004,8,48,28,true);
    plate(plateMap("/bots-art/plates/arena-evening.png",.43,1,.285,0),0,2.35,-10,5.6,4.7);
    const portal = mat(0x5d3c23,.73), trim = mat(0xb48138,.42,.52);
    for(const side of [-1,1]) {
      box(shell,portal,side*2.74,2.35,-5.75,.48,4.7,.66,.18);
      box(shell,trim,side*2.52,2.35,-5.34,.09,4.6,.08,.035);
      box(shell,darkWood,side*2.78,2.35,-8.0,.40,4.7,4.50,.08);
      for(let i=0;i<7;i++) cylinder(shell,bulb,side*2.65,.38+i*.65,-5.35,.075,.12,10).rotation.x=Math.PI/2;
    }
    box(shell,portal,0,4.94,-5.75,5.94,.58,.67,.22);
    box(shell,darkWood,0,.06,-7.85,5.30,.10,4.6,.06);
    const signCanvas=document.createElement("canvas"); signCanvas.width=512;signCanvas.height=128;
    const ctx=signCanvas.getContext("2d")!;ctx.fillStyle="#392515";ctx.fillRect(0,0,512,128);ctx.strokeStyle="#cda453";ctx.lineWidth=7;ctx.strokeRect(7,7,498,114);
    ctx.font="bold 70px Georgia";ctx.fillStyle="#f8dea0";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("ARENA",256,68);
    const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;ownedTextures.add(signTexture);
    plate(signTexture,0,5.55,-5.30,4.65,1.16);
    const arenaGlow = new THREE.PointLight(0xffb950, 24, 12, 2); arenaGlow.position.set(0,3.5,-6.5); scene.add(arenaGlow);
  }
  batch(shell);
  const stands: THREE.Group[] = [], selection: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 5; i++) {
    const stand = new THREE.Group(); stand.name = `Stand ${i + 1}`; scene.add(stand); stands.push(stand);
    if (variant === "garage") {
      for (const x of [-1.22, 1.22]) for (const z of [-.74, .74]) {
        const wheel = cylinder(stand, rubber, x, .14, z, .14, .12, 14); wheel.rotation.z = Math.PI / 2;
        box(stand, iron, x, .23, z, .15, .17, .16);
      }
      box(stand, iron, 0, .31, 0, 3.13, .15, 2.12, .09);
      box(stand, brass, 0, .405, 0, 3.22, .07, 2.2, .07);
      for(const x of [-1.35,1.35]) { cylinder(stand,iron,x,.69,-.82,.04,.72); cylinder(stand,brass,x,1.07,-.82,.07,.10); }
      box(stand,iron,0,1.04,-.82,2.7,.08,.08,.03);
      numberPlate(stand, i + 1, 0, .32, 1.08);
      batch(stand);
      const strip = mat(0xc6a466, .35, .6); selection.push(strip);
      box(stand, strip, 0, .435, 1.03, 2.78, .018, .045, .005);
    }
  }
  let actors: Actor[] = [], selectedId: string | undefined, width = 1, height = 1, mobile = false, disposed = false, generation = 0, cpuMs = 0, lastPoseTime = -1;
  const quat = new THREE.Quaternion(), point = new THREE.Vector3();
  const bayPosition = (bay: number) => {
    const i = Math.max(0, Math.min(4, bay - 1));
    return mobile ? i < 3 ? new THREE.Vector3((i - 1) * 4.05, 0, -.8) : new THREE.Vector3((i - 3.5) * 4.5, 0, 9.5)
      : new THREE.Vector3((i - 2) * (variant === "garage" ? 4.4 : 5.0), 0, variant === "garage" ? 1.5 : 1.0 + (i % 2) * .8);
  };
  const place = () => {
    stands.forEach((stand, i) => { stand.position.copy(bayPosition(i + 1)); stand.visible = !referenceShot || referenceShot === "street" || i === 2; });
    actors.forEach(actor => { actor.toy.root.position.copy(bayPosition(actor.definition.bay)); actor.toy.root.position.y = actor.floorOffset + (variant === "garage" ? STAND_TOP : 0); });
  };
  const api: LivingRoom = {
    async setActors(definitions, onProgress) {
      const ticket = ++generation;
      const wanted = definitions.slice(0, 5), failedIds: string[] = [];
      let pending = wanted.length;
      const report = () => { if (!disposed && ticket === generation) onProgress?.({ ready: actors.length, pending, failedIds: [...failedIds] }); };
      actors = actors.filter(actor => { if (wanted.some(d => d.id === actor.definition.id)) return true; scene.remove(actor.toy.root); actor.toy.dispose(); return false; });
      report();
      // Art and occupants load independently. One unavailable model must not
      // erase the neighbours that are already standing in the street.
      const backdropReady = Promise.allSettled(backdropLoads);
      await Promise.all(wanted.map(async definition => {
        const existing = actors.find(a => a.definition.id === definition.id);
        if (existing && JSON.stringify(existing.definition) === JSON.stringify(definition)) { pending--; report(); return; }
        let toy: CombatToy | undefined;
        try {
        toy = await createCombatToy(definition.build, definition.look, false, referenceShot ? "inspection" : "fight"); toy.resetPose();
        toy.applyClip("guard", .5, 1, ["armL", "armR", "elbowL", "elbowR", "wristL", "wristR"]);
        toy.root.rotation.y = -.11 + (definition.bay - 3) * -.035;
        toy.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().makeEmpty();
        // Feet establish support. Weapons and cosmetic geometry must never lift a robot.
        toy.root.traverseVisible(o => { const mesh = o as THREE.Mesh; if (!mesh.isMesh || !["legL", "legR"].includes(mesh.userData.socket)) return; const skin = mesh as THREE.SkinnedMesh; if (skin.isSkinnedMesh) { skin.skeleton.update(); skin.computeBoundingBox(); if (skin.boundingBox) bounds.union(skin.boundingBox.clone().applyMatrix4(skin.matrixWorld)); } else { mesh.geometry.computeBoundingBox(); if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)); } });
        const floorOffset = bounds.isEmpty() ? 0 : -bounds.min.y;
        if (disposed || ticket !== generation) { toy.dispose(); return; }
        if (existing) { scene.remove(existing.toy.root); existing.toy.dispose(); actors = actors.filter(a => a !== existing); }
        const legs = ["legL", "legR", "kneeL", "kneeR"].flatMap(name => { const node = toy!.bones[name]; return node ? [{ node, quaternion: node.quaternion.clone() }] : []; });
        actors.push({ definition, toy, head: toy.sockets.head.quaternion.clone(), body: toy.sockets.torso.quaternion.clone(), arm: toy.sockets.armL.quaternion.clone(), legs, floorOffset });
        actors.sort((a, b) => a.definition.bay - b.definition.bay); scene.add(toy.root); place(); lastPoseTime = -1; api.select(selectedId);
        } catch (error) { toy?.dispose(); if (!disposed && ticket === generation) { if (existing && actors.includes(existing)) { scene.remove(existing.toy.root); existing.toy.dispose(); actors = actors.filter(actor => actor !== existing); } failedIds.push(definition.id); console.warn("[room occupant unavailable]", definition.id, error); } }
        finally { pending--; report(); }
      }));
      await backdropReady;
      return !disposed && ticket === generation;
    },
    select(id) {
      selectedId = id;
      selection.forEach((m, index) => { const chosen = actors.some(a => a.definition.id === id && a.definition.bay === index + 1); m.emissive.setHex(chosen ? 0xffca79 : 0x000000); m.emissiveIntensity = chosen ? .8 : 0; });
    },
    resize(w, h, ratio = 1) {
      width = Math.max(1, w); height = Math.max(1, h); mobile = width < 621;
      renderer.setPixelRatio(Math.min(mobile ? 1.35 : 1.5, ratio)); renderer.setSize(width, height, false);
      const aspect = width / height, worldWidth = mobile ? 13.0 : 27.5;
      const vertical = Math.max(mobile ? variant === "community" ? 16.0 : 14.0 : 10.0, worldWidth / aspect);
      camera.left = -vertical * aspect / 2; camera.right = vertical * aspect / 2; camera.top = vertical / 2; camera.bottom = -vertical / 2;
      camera.position.set(mobile ? .6 : 1.0, mobile ? 16.5 : 10.5, 27);
      camera.lookAt(0, mobile ? 2.0 : 2.8, mobile ? 2.6 : .1); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); place();
      // Isolated cinematic references retain real part identity and world scale.
      // These camera crops never run in the player garage or Community room.
      if (referenceShot === "hero" || referenceShot === "key") {
        const v = referenceShot === "key" ? 2.7 : 7.8;
        camera.left = -v * aspect / 2; camera.right = v * aspect / 2; camera.top = v / 2; camera.bottom = -v / 2;
        camera.position.set(referenceShot === "key" ? 3.4 : 5, referenceShot === "key" ? 8.1 : 6.5, 23);
        camera.lookAt(0, referenceShot === "key" ? 3.5 : 2.9, 1.5);
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      }
      renderer.shadowMap.needsUpdate = true;
    },
    anchors() {
      camera.updateMatrixWorld();
      return stands.map((_, index) => {
        const bay = index + 1, position = bayPosition(bay);
        point.copy(position).add(new THREE.Vector3(0, mobile && variant === "garage" ? STAND_TOP : 0, 1.2)).project(camera);
        const actor = actors.find(a => a.definition.bay === bay);
        return { id: actor?.definition.id ?? `empty-${bay}`, bay, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2, width: Math.max(44, 3.8 / (camera.right - camera.left) * width), height: Math.max(44, 4.9 / (camera.top - camera.bottom) * height) };
      });
    },
    render(time = 0) {
      if (disposed || renderer.getContext().isContextLost()) return;
      const start = performance.now();
      if (lastPoseTime !== time) {
        actors.forEach((actor, i) => {
          const t = time ? time + i * 1.73 : 0;
          const base = bayPosition(actor.definition.bay), activity = actor.definition.activity;
          actor.toy.root.position.copy(base); actor.toy.root.position.y = actor.floorOffset + (variant === "garage" ? STAND_TOP : 0);
          actor.toy.root.rotation.y = -.11 + (actor.definition.bay - 3) * -.035;
          actor.toy.sockets.head.quaternion.copy(actor.head).multiply(quat.setFromAxisAngle(Y, t ? Math.sin(t * .48) * .055 : 0));
          actor.toy.sockets.torso.quaternion.copy(actor.body).multiply(quat.setFromAxisAngle(Z, t ? Math.sin(t * .67) * .008 : 0));
          actor.toy.sockets.armL.quaternion.copy(actor.arm);
          actor.legs.forEach(rest => rest.node.quaternion.copy(rest.quaternion));
          if (variant === "community" && t && activity && !referenceShot) {
            if (activity === "wave") {
              const greeting = Math.max(0, Math.sin(t * .55));
              actor.toy.sockets.armL.quaternion.multiply(quat.setFromAxisAngle(Z, greeting * (.8 + Math.sin(t * 6) * .12)));
              actor.toy.sockets.head.quaternion.multiply(quat.setFromAxisAngle(Y, Math.sin(t * .55) * .16));
            } else if (activity === "inspect") {
              actor.toy.sockets.head.quaternion.multiply(quat.setFromAxisAngle(X, .14 + Math.sin(t * .8) * .08));
              actor.toy.sockets.armL.quaternion.multiply(quat.setFromAxisAngle(X, -.25 + Math.sin(t * 2) * .13));
            } else {
              const pace = Math.sin(t * .24), moving = Math.abs(Math.cos(t * .24)) > .2;
              actor.toy.root.position.z += pace * (mobile ? .3 : .6);
              actor.toy.root.rotation.y += Math.cos(t * .24) < 0 ? .28 : -.28;
              actor.toy.applyClip("advance", moving ? (t * 1.15) % 1 : 0, moving ? .25 : 0, ["legL", "legR", "kneeL", "kneeR"]);
            }
          }
        });
        lastPoseTime = time; renderer.shadowMap.needsUpdate = true;
      }
      renderer.render(scene, camera); cpuMs = performance.now() - start;
    },
    metrics: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, cpuMs, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, actors: actors.length }),
    dispose() {
      if (disposed) return; disposed = true; generation++;
      actors.forEach(a => a.toy.dispose()); actors = [];
      ownedGeometry.forEach(g => g.dispose()); ownedMaterials.forEach(m => m.dispose()); ownedTextures.forEach(t => t.dispose());
      environment.dispose(); key.shadow.dispose(); renderer.dispose(); scene.clear();
    },
  };
  return api;
}
