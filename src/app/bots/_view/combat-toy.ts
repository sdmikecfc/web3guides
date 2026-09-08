"use client";

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createToy, type Toy3D } from "./toy3d";
import { combatPart } from "@/lib/bots/combat-model";
import { beginnerArtKey } from "@/lib/bots/beginner-catalog";
import { CARD_BY_ID, type Socket } from "@/lib/bots/fixtures";
import { PAINTS } from "../_ui/tokens";
import type { Build } from "../_engine/parts";
import type { BotLook } from "./look";
import { toyPilotEnabled } from "@/lib/bots/rollout";
import { hasStrikingFace, nativeWeaponContact, weaponGripYaw } from "./weapon-surface";
import { attachToyCosmetics } from "./toy-cosmetics";

const SOCKETS: Socket[] = ["head", "torso", "armL", "armR", "legL", "legR", "weapon"];
type V3 = [number, number, number];
interface ModuleEntry { socket: Socket; file: string; inspection: string; triangles: number; movement?: string; grip?: V3; contact?: V3; attackFamily?: string }
interface Manifest { version: string; motion: string; parts: Record<string, { variants: ModuleEntry[] }> }
export interface CombatToy extends Toy3D {
  blender: boolean;
  bones: Record<string, THREE.Object3D>;
  movement: readonly [string, string];
  weaponFamily: string;
  weaponContact: THREE.Vector3;
  weaponFace?: THREE.Vector3;
  setVisible(socket: Socket, visible: boolean): void;
  applyClip(name: string, time: number, weight?: number, mask?: readonly string[], mirror?: boolean): void;
  target(socket: Socket, out: THREE.Vector3): THREE.Vector3;
  hand(side: "L" | "R", out: THREE.Vector3): THREE.Vector3;
  tip(out: THREE.Vector3): THREE.Vector3;
  freezePart(socket: Socket): THREE.Group;
}

const assetRoot = "/bots-art/3d/pilot/";
const loader = new GLTFLoader();
let manifestPromise: Promise<Manifest> | undefined;
const glbs = new Map<string, Promise<GLTF>>();
function asset(file: string) {
  let p = glbs.get(file);
  if (!p) { p = loader.loadAsync(assetRoot + file); glbs.set(file, p); p.catch(() => glbs.delete(file)); }
  return p;
}
function manifest() {
  return manifestPromise ??= fetch(assetRoot + "manifest.json").then(r => {
    if (!r.ok) throw new Error("Toy library unavailable"); return r.json() as Promise<Manifest>;
  }).catch(e => { manifestPromise = undefined; throw e; });
}
const paintHex = (id?: string) => id && id in PAINTS ? Number.parseInt(PAINTS[id as keyof typeof PAINTS].slice(1), 16) : 0x8eb7a4;
export const artIdentity = (id: string) => beginnerArtKey(id) ?? id;

interface Channel { node: string; property: string; sample: (time: number) => ArrayLike<number> }
function channelsOf(gltf?: GLTF) {
  const clips = new Map<string, Channel[]>();
  for (const clip of gltf?.animations ?? []) {
    const channels: Channel[] = [];
    for (const t of clip.tracks) {
      const at = t.name.lastIndexOf(".");
      // Animation tracks expose an interpolant factory at runtime; this is
      // missing from the pinned @types/three KeyframeTrack declaration.
      const track = t as THREE.KeyframeTrack & { createInterpolant(): { evaluate(time: number): ArrayLike<number> } };
      const interpolant = track.createInterpolant();
      channels.push({ node: t.name.slice(0, at), property: t.name.slice(at + 1), sample: time => interpolant.evaluate(time) });
    }
    clips.set(clip.name, channels);
  }
  return clips;
}

/** Complete-scene selection: asset failure falls back before the bell, never
 * swaps a visible robot halfway through a replay. */
export async function createCombatToy(build: Build, look: BotLook = {}, forceNative = false, detail: "fight" | "inspection" = "fight"): Promise<CombatToy> {
  // A disabled pilot never requests a Blender model, motion clip or manifest.
  if (!toyPilotEnabled()) return nativeCombatToy(build, look);
  const fallback = async () => nativeCombatToy(build, look, await asset("toy-motion-v1.glb").catch(() => undefined));
  // A look changes decorations, never which moulds the player selected.
  if (forceNative) return fallback();
  try {
    const m = await manifest();
    if (m.version !== "toy-rig-v1") throw new Error("Unsupported toy rig");
    const entries = SOCKETS.map(socket => {
      const id = artIdentity(combatPart(build, socket).id);
      if (!id || /^empty[.-]/.test(id)) return undefined;
      return m.parts[id]?.variants.find(v => v.socket === socket);
    });
    const motion = await asset(m.motion);
    const loaded = await Promise.all(entries.map(e => e ? asset(detail === "inspection" ? e.inspection : e.file).catch(() => undefined) : undefined));
    const nativeSockets = SOCKETS.filter((socket, i) => {
      const id = combatPart(build, socket).id;
      return id && !/^empty[.-]/.test(id) && !loaded[i];
    });
    // An unauthored or unavailable part keeps its own native mould. It must
    // never switch the other six selected pieces to a different art style.
    const native = nativeSockets.length ? nativeCombatToy(build, look) : null;
    const nativeMeshes: THREE.Mesh[] = [];
    const root = new THREE.Group(); root.name = "Articulated toy";
    const rig = cloneSkeleton(motion.scene);
    const bones: Record<string, THREE.Object3D> = {};
    const witness: THREE.Object3D[] = [];
    rig.traverse(o => { if (o instanceof THREE.Bone) bones[o.name] = o; if (o instanceof THREE.Mesh) witness.push(o); });
    witness.forEach(o => o.removeFromParent()); root.add(rig); root.updateMatrixWorld(true);
    const meshes = {} as Record<Socket, THREE.Mesh[]>;
    const materials = new Set<THREE.Material>();
    const skeletons = new Set<THREE.Skeleton>();
    for (let i = 0; i < entries.length; i++) {
      const socket = SOCKETS[i];
      meshes[socket] = [];
      if (!loaded[i]) continue;
      const group = cloneSkeleton(loaded[i]!.scene);
      group.updateMatrixWorld(true);
      const incoming: THREE.SkinnedMesh[] = [];
      group.traverse(o => { if (o instanceof THREE.SkinnedMesh) incoming.push(o); });
      for (const mesh of incoming) {
        const world = mesh.matrixWorld.clone();
        const skeleton = skeletons.values().next().value ?? new THREE.Skeleton(mesh.skeleton.bones.map(b => {
          if (!bones[b.name]) throw new Error(`Missing canonical bone ${b.name}`);
          return bones[b.name] as THREE.Bone;
        }), mesh.skeleton.boneInverses.map(i => i.clone()));
        skeletons.add(skeleton);
        mesh.bind(skeleton, mesh.bindMatrix.clone());
        root.add(mesh); world.decompose(mesh.position, mesh.quaternion, mesh.scale);
        const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const painted = original.map(old => {
          const mat = old.clone() as THREE.MeshStandardMaterial;
          const part = combatPart(build, socket), id = artIdentity(part.id);
          if (old.name === "paint") mat.color.setHex(look.paint?.[socket] ?? paintHex(part.paint ?? CARD_BY_ID[id]?.color));
          mat.envMapIntensity = .8; materials.add(mat); return mat;
        });
        mesh.material = Array.isArray(mesh.material) ? painted : painted[0];
        mesh.castShadow = mesh.receiveShadow = true;
        // GPU skinning moves vertices beyond their rest AABB. Conservative
        // culling keeps a raised hand from disappearing near a frame edge.
        mesh.frustumCulled = false;
        mesh.userData.socket = socket; meshes[socket].push(mesh);
      }
    }
    if (native) {
      const boneNames = new Map(Object.entries(native.bones).map(([name, bone]) => [bone, name]));
      native.root.updateMatrixWorld(true);
      root.updateMatrixWorld(true);
      for (const socket of nativeSockets) {
        const pieces: THREE.Mesh[] = [];
        native.root.traverse(o => { if (o instanceof THREE.Mesh && o.userData.socket === socket) pieces.push(o); });
        for (const mesh of pieces) {
          let parent: THREE.Object3D | null = mesh.parent;
          while (parent && !boneNames.has(parent)) parent = parent.parent;
          const bone = bones[parent ? boneNames.get(parent)! : socket];
          // Preserve the authored rest position, including the hand grip,
          // then let the shared rig animate this piece with its neighbours.
          bone.attach(mesh);
          meshes[socket].push(mesh);
          nativeMeshes.push(mesh);
        }
      }
    }
    const sockets = Object.fromEntries(SOCKETS.map(s => [s, bones[s]])) as Record<Socket, THREE.Group>;
    root.updateMatrixWorld(true);
    const cosmetics = attachToyCosmetics(look, bones, meshes, new Set(SOCKETS.filter((_, i) => !!loaded[i])));
    const weaponCard=CARD_BY_ID[artIdentity(build.weapon.id)];
    const weaponVariant=weaponCard?(weaponCard.tier-1)*2+weaponCard.design-1:0;
    if(loaded[6])bones.weapon.rotateY(weaponGripYaw(weaponVariant));
    root.updateMatrixWorld(true);
    const rest = Object.values(bones).map(b => ({ b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    const clips = channelsOf(motion);
    const targetLocal: Record<Socket, V3> = { head: [0,.5,.52], torso:[0,.56,.53], armL:[0,-.7,.2], armR:[0,-.7,.2], legL:[0,-.76,.17], legR:[0,-.76,.17], weapon:[0,.8,0] };
    const tempQ = new THREE.Quaternion();
    const weaponContact = loaded[6] ? new THREE.Vector3(...(entries[6]?.contact ?? [0,1,0]))
      : native ? bones.weapon.worldToLocal(native.sockets.weapon.localToWorld(native.weaponContact.clone())) : new THREE.Vector3(0,1,0);
    let disposed = false;
    const toy: CombatToy = {
      root, sockets, bones, height: 3.88, blender: true,
      movement: [loaded[4] ? entries[4]?.movement ?? "boot" : native?.movement[0] ?? "boot", loaded[5] ? entries[5]?.movement ?? "boot" : native?.movement[1] ?? "boot"],
      weaponFamily: loaded[6] ? entries[6]?.attackFamily ?? "blunt" : native?.weaponFamily ?? "blunt",
      weaponContact,
      weaponFace: loaded[6] ? (hasStrikingFace(weaponVariant)?new THREE.Vector3(1,0,0):undefined)
        : native?.weaponFace?.clone().transformDirection(native.sockets.weapon.matrixWorld).transformDirection(bones.weapon.matrixWorld.clone().invert()),
      resetPose() {
        for (const r of rest) { r.b.position.copy(r.p); r.b.quaternion.copy(r.q); r.b.scale.copy(r.s); }
        for (const s of SOCKETS) toy.setVisible(s, true);
      },
      setVisible(socket, visible) { for (const mesh of meshes[socket]) mesh.visible = visible; sockets[socket].userData.visible = visible; },
      applyClip(name, time, weight=1, mask, mirror=false) {
        for (const ch of clips.get(name) ?? []) {
          let node = ch.node;
          if (mirror) node = node.endsWith("L") ? node.slice(0,-1)+"R" : node.endsWith("R") ? node.slice(0,-1)+"L" : node;
          if (mask && !mask.includes(node)) continue;
          const bone = bones[node]; if (!bone || ch.property !== "quaternion") continue;
          const v = ch.sample(Math.max(0, Math.min(1,time)));
          tempQ.set(v[0], mirror ? -v[1] : v[1], mirror ? -v[2] : v[2], v[3]); bone.quaternion.slerp(tempQ, weight);
        }
      },
      target(socket, out) { root.updateMatrixWorld(true); return out.set(...targetLocal[socket]).applyMatrix4(bones[socket].matrixWorld); },
      hand(side, out) { root.updateMatrixWorld(true); return out.set(0,0,.345).applyMatrix4(bones["wrist"+side].matrixWorld); },
      tip(out) { root.updateMatrixWorld(true); return out.copy(toy.weaponContact).applyMatrix4(bones.weapon.matrixWorld); },
      freezePart(socket) {
        root.updateMatrixWorld(true);
        const frozen = new THREE.Group();
        const capture = socket === "armR" ? [socket,"weapon"] as Socket[] : [socket];
        const v = new THREE.Vector3();
        for (const s of capture) for (const original of meshes[s]) {
          const skin = original as THREE.SkinnedMesh; if(skin.isSkinnedMesh)skin.skeleton.update();
          const geometry = original.geometry.clone(), positions = geometry.getAttribute("position") as THREE.BufferAttribute;
          for (let i=0;i<positions.count;i++) {
            v.fromBufferAttribute(skin.geometry.getAttribute("position") as THREE.BufferAttribute,i);
            if(skin.isSkinnedMesh)skin.applyBoneTransform(i,v); v.applyMatrix4(skin.matrixWorld); positions.setXYZ(i,v.x,v.y,v.z);
          }
          geometry.deleteAttribute("skinIndex"); geometry.deleteAttribute("skinWeight"); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
          const part = new THREE.Mesh(geometry, original.material); part.castShadow = true; part.receiveShadow = true; frozen.add(part);
        }
        const origin = bones[socket].getWorldPosition(new THREE.Vector3());
        for (const mesh of frozen.children as THREE.Mesh[]) mesh.geometry.translate(-origin.x,-origin.y,-origin.z);
        frozen.position.copy(origin); return frozen;
      },
      dispose() {
        if (disposed) return; disposed=true;
        // Native geometry is instance-owned, unlike the shared GLB geometry.
        // Return the transferred meshes to their owner for one complete cleanup.
        if (native) { nativeMeshes.forEach(mesh => native.root.add(mesh)); native.dispose(); }
        cosmetics.dispose(); materials.forEach(m => m.dispose()); skeletons.forEach(s => s.dispose()); root.removeFromParent(); root.clear();
      },
    };
    root.userData.toyHeight = toy.height; root.userData.rigVersion = m.version;
    return toy;
  } catch { return fallback(); }
}

/** Retains every historical mould while the Blender pilot is reviewed. */
function nativeCombatToy(build: Build, look: BotLook, motion?: GLTF): CombatToy {
  const base = createToy(build, look), bones: Record<string, THREE.Object3D> = { ...base.sockets };
  const root=base.root;
  const rest: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }[]=[];
  for (const side of ["L","R"] as const) {
    const arm=base.sockets[("arm"+side) as Socket]; root.updateMatrixWorld(true);
    const leaves: THREE.Mesh[]=[];arm.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.socket!=="weapon")leaves.push(o);});
    const elbow=new THREE.Group(), wrist=new THREE.Group();elbow.position.set(0,-.55,.015);wrist.position.set(0,-.53,.04);arm.add(elbow);elbow.add(wrist);
    bones["elbow"+side]=elbow;bones["wrist"+side]=wrist;root.updateMatrixWorld(true);
    const p=new THREE.Vector3();
    for (const mesh of leaves) {mesh.getWorldPosition(p);arm.worldToLocal(p);if(p.y<-.91)wrist.attach(mesh);else if(p.y<-.56)elbow.attach(mesh);}
    if(side==="R"){
      const card=CARD_BY_ID[artIdentity(build.weapon.id)],v=card?(card.tier-1)*2+card.design-1:0;
      wrist.attach(base.sockets.weapon);base.sockets.weapon.position.set(0,0,.37);base.sockets.weapon.rotation.set(0,weaponGripYaw(v),0);
    }
    bones["knee"+side]=base.sockets[("leg"+side) as Socket];
    const ankle=new THREE.Group();ankle.position.set(0,-1.22,.12);base.sockets[("leg"+side) as Socket].add(ankle);bones["ankle"+side]=ankle;
  }
  for(const o of Array.from(new Set(Object.values(bones))))rest.push({o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});
  const variant=(socket:Socket)=>{const card=CARD_BY_ID[artIdentity(combatPart(build,socket).id)];return card?(card.tier-1)*2+card.design-1:0;};
  const clips = channelsOf(motion);
  const q=new THREE.Quaternion();
  const movement=(s:Socket)=>variant(s)===1?"wheel":variant(s)===5?"track":variant(s)===2?"spring":"boot";
  const toy: CombatToy={...base,bones,blender:false,movement:[movement("legL"),movement("legR")],weaponFamily:[3,5].includes(variant("weapon"))?"thrust":"blunt",weaponContact:nativeWeaponContact(variant("weapon")),weaponFace:hasStrikingFace(variant("weapon"))?new THREE.Vector3(1,0,0):undefined,
    resetPose(){base.resetPose();for(const r of rest){r.o.position.copy(r.p);r.o.quaternion.copy(r.q);r.o.scale.copy(r.s);}for(const s of SOCKETS)toy.setVisible(s,true);},
    setVisible(s,v){root.traverse(o=>{if(o instanceof THREE.Mesh && o.userData.socket===s)o.visible=v;});base.sockets[s].userData.visible=v;},
    applyClip(name,time,weight=1,mask,mirror=false){for(const ch of clips?.get(name)??[]){let node=ch.node;if(mirror)node=node.endsWith("L")?node.slice(0,-1)+"R":node.endsWith("R")?node.slice(0,-1)+"L":node;if(mask&&!mask.includes(node))continue;const b=bones[node];if(!b||ch.property!=="quaternion")continue;const v=ch.sample(Math.max(0,Math.min(1,time)));q.set(v[0],mirror?-v[1]:v[1],mirror?-v[2]:v[2],v[3]);b.quaternion.slerp(q,weight);}},
    target(s,out){root.updateMatrixWorld(true);return out.set(0,s==="head"?.55:s==="torso"?.65:s.startsWith("leg")?-.9:-.65,.30).applyMatrix4(base.sockets[s].matrixWorld);},
    hand(side,out){root.updateMatrixWorld(true);return out.set(0,0,.37).applyMatrix4(bones["wrist"+side].matrixWorld);},
    tip(out){root.updateMatrixWorld(true);return out.copy(toy.weaponContact).applyMatrix4(base.sockets.weapon.matrixWorld);},
    freezePart(s){
      root.updateMatrixWorld(true);
      const source=base.sockets[s],g=source.clone(true);
      source.matrixWorld.decompose(g.position,g.quaternion,g.scale);g.visible=true;
      // The post-break pose has already hidden the living socket. Restore only
      // this captured part (and its held weapon), never other missing pieces.
      g.traverse(o=>{
        if(o instanceof THREE.Mesh)o.geometry=o.geometry.clone();
        if(o.userData.socket===s || s==="armR"&&o.userData.socket==="weapon")o.visible=true;
      });
      return g;
    },
  };
  return toy;
}
