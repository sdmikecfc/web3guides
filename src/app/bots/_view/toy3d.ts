"use client";

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Build, Part } from "../_engine/parts";
import { combatPart } from "@/lib/bots/combat-model";
import { CARD_BY_ID, type Socket } from "@/lib/bots/fixtures";
import { beginnerArtKey } from "@/lib/bots/beginner-catalog";
import { PAINTS } from "../_ui/tokens";
import { marksOf, type BotLook } from "./look";

/** World units: floor at zero, front +Z. These joints belong to the 3D art;
 * the frozen deterministic engine and 2D registration contract are untouched. */
export const TOY_BIND = {
  torso: [0, 1.08, 0], head: [0, 2.53, 0],
  armL: [-0.96, 2.2224, 0], armR: [0.96, 2.2224, 0],
  legL: [-0.44, 1.08, 0], legR: [0.44, 1.08, 0],
  weapon: [0, -1.08, 0.14],
} as const;

export interface Toy3D {
  root: THREE.Group;
  sockets: Record<Socket, THREE.Group>;
  height: number;
  resetPose(): void;
  dispose(): void;
}

type Material = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
type V3 = readonly [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

function grainTexture(): THREE.DataTexture {
  const size = 64, bytes = new Uint8Array(size * size * 4);
  let seed = 271828;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const v = 100 + (seed >>> 26);
    bytes[i * 4] = bytes[i * 4 + 1] = bytes[i * 4 + 2] = v;
    bytes[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function hull(points: readonly (readonly [number, number])[], depth: number, bevel = 0.10): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const core = Math.max(0.02, depth - bevel * 2);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, steps: 1, curveSegments: 24 });
  geometry.translate(0, 0, -core / 2);
  return geometry;
}

function crescent(radius: number, inner: number, depth: number, start = Math.PI * 0.22, end = Math.PI * 1.78): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, start, end, false);
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  const bevel = Math.min(0.025, depth * 0.20);
  const core = depth - bevel * 2;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 32 });
  geo.translate(0, 0, -core / 2);
  return geo;
}

/** A complete, synchronous model. Every mesh and texture is owned by this
 * instance, so route changes can dispose it without invalidating another toy. */
export function createToy(build: Build, look: BotLook = {}): Toy3D {
  const root = new THREE.Group();
  root.name = "Doma toy";
  const sockets = {} as Record<Socket, THREE.Group>;
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const grain = grainTexture();
  textures.add(grain);

  const physical = (parameters: THREE.MeshPhysicalMaterialParameters) => {
    const material = new THREE.MeshPhysicalMaterial(parameters);
    materials.add(material);
    return material;
  };
  const enamel = (color: number) => physical({ color, metalness: 0.07, roughness: 0.31, clearcoat: 0.78, clearcoatRoughness: 0.20, ior: 1.47, bumpMap: grain, bumpScale: 0.007, envMapIntensity: 0.85 });
  const brass = physical({ color: 0xb99550, metalness: 0.82, roughness: 0.26, clearcoat: 0.18, envMapIntensity: 1.10 });
  const ivory = enamel(0xeee4cd);
  const coral = physical({ color: 0xc9755e, metalness: 0.02, roughness: 0.57, bumpMap: grain, bumpScale: 0.009 });
  const rubber = physical({ color: 0x303a32, metalness: 0, roughness: 0.64 });
  const dark = physical({ color: 0x202a24, metalness: 0.18, roughness: 0.43 });
  const steel = physical({ color: 0xa7aaa0, metalness: 0.74, roughness: 0.32, envMapIntensity: 1 });
  const wood = physical({ color: 0x9d7146, metalness: 0, roughness: 0.49, bumpMap: grain, bumpScale: 0.015 });
  const lens = physical({ color: 0xf2d394, emissive: 0xedbf6b, emissiveIntensity: 0.13, roughness: 0.115, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, ior: 1.45 });
  const pupil = physical({ color: 0x25291f, metalness: 0.06, roughness: 0.18, clearcoat: 0.95, clearcoatRoughness: 0.10 });
  const paint = {} as Record<Socket, Material>;

  const source = (socket: Socket): Part => combatPart(build, socket);
  const missing = (socket: Socket) => {
    const p = source(socket);
    return !p || !p.id || p.id.startsWith("empty.") || p.id.startsWith("empty-") || !p.s?.some(v => v > 0);
  };
  const variant = (socket: Socket) => {
    const id = source(socket)?.id;
    const card = CARD_BY_ID[beginnerArtKey(id) ?? id];
    return card ? (card.tier - 1) * 2 + card.design - 1 : 0;
  };
  for (const name of ["torso", "head", "armL", "armR", "legL", "legR", "weapon"] as Socket[]) {
    const g = new THREE.Group();
    g.name = name;
    g.userData.socket = name;
    const bind = TOY_BIND[name]; g.position.set(bind[0], bind[1], bind[2]);
    sockets[name] = g;
    if (name === "torso") g.scale.y = 1.12;
    if (name === "legL" || name === "legR") g.scale.set(1.08, 1.08 / 1.40, 1.04);
    if (name === "weapon") { sockets.armR.add(g); g.rotation.z = -0.30; }
    else root.add(g);
    const p = source(name);
    const colorId = p?.paint ?? CARD_BY_ID[p?.id]?.color;
    const fallback = colorId ? Number.parseInt(PAINTS[colorId].slice(1), 16) : name === "weapon" ? look.paint?.armR ?? 0x86afa0 : 0x86afa0;
    paint[name] = enamel(look.paint?.[name] ?? fallback);
  }

  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: Material, at: V3 = [0, 0, 0]) => {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(...at);
    result.castShadow = result.receiveShadow = true;
    parent.add(result);
    return result;
  };
  const box = (g: THREE.Object3D, size: V3, at: V3, material: Material, radius = 0.10) =>
    mesh(g, new RoundedBoxGeometry(...size, 4, Math.min(radius, ...size.map(v => v * 0.46))), material, at);
  const ball = (g: THREE.Object3D, size: V3, at: V3, material: Material) => {
    const m = mesh(g, new THREE.SphereGeometry(1, 32, 20), material, at);
    m.scale.set(...size);
    return m;
  };
  const cylinder = (g: THREE.Object3D, radius: number, height: number, at: V3, material: Material, axis: "x" | "y" | "z" = "y", topRadius = radius) => {
    const m = mesh(g, new THREE.CylinderGeometry(topRadius, radius, height, 40, 1), material, at);
    if (axis === "x") m.rotation.z = Math.PI / 2;
    if (axis === "z") m.rotation.x = Math.PI / 2;
    return m;
  };
  const ring = (g: THREE.Object3D, radius: number, tube: number, at: V3, material: Material, axis: "x" | "y" | "z" = "z", arc = Math.PI * 2) => {
    const m = mesh(g, new THREE.TorusGeometry(radius, tube, 12, 48, arc), material, at);
    if (axis === "x") m.rotation.y = Math.PI / 2;
    if (axis === "y") m.rotation.x = Math.PI / 2;
    return m;
  };
  const rod = (g: THREE.Object3D, a: V3, b: V3, radius: number, material: Material) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    const m = mesh(g, new THREE.CapsuleGeometry(radius, Math.max(0.005, d.length() - 2 * radius), 4, 16), material);
    m.position.copy(va.add(vb).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  };
  const tube = (g: THREE.Object3D, points: V3[], radius: number, material: Material, smooth = true) => {
    const vectors = points.map(p => new THREE.Vector3(...p));
    const curve = smooth ? new THREE.CatmullRomCurve3(vectors) : new THREE.CatmullRomCurve3(vectors, false, "centripetal", 0.5);
    return mesh(g, new THREE.TubeGeometry(curve, Math.max(24, points.length * 5), radius, 10, false), material);
  };
  const coil = (g: THREE.Object3D, top: number, bottom: number, radius: number, turns: number, thickness: number) => {
    const points: V3[] = [];
    for (let i = 0; i <= 80; i++) {
      const k = i / 80, a = k * turns * Math.PI * 2;
      points.push([Math.cos(a) * radius, top + (bottom - top) * k, Math.sin(a) * radius]);
    }
    tube(g, points, thickness, brass);
  };
  const screw = (g: THREE.Object3D, at: V3, radius = 0.034, material = brass) => {
    cylinder(g, radius, 0.023, at, material, "z");
    box(g, [radius * 1.05, 0.009, 0.008], [at[0], at[1], at[2] + 0.015], dark, 0.003);
  };
  const lathe = (g: THREE.Object3D, points: readonly (readonly [number, number])[], at: V3, material: Material, zScale = 1) => {
    const m = mesh(g, new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 48), material, at);
    m.scale.z = zScale;
    return m;
  };
  const star = (g: THREE.Object3D, r: number, at: V3, material: Material) => {
    const p: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.46 : r; p.push([Math.cos(a) * d, Math.sin(a) * d]); }
    return mesh(g, hull(p, 0.026, 0.005), material, at);
  };
  const windingKey = (g: THREE.Object3D, y: number) => {
    const k = new THREE.Group(); k.position.set(0, y, -0.035); k.rotation.z = -0.10; g.add(k);
    cylinder(k, 0.083, 0.08, [0, 0.03, 0], brass);
    cylinder(k, 0.040, 0.15, [0, 0.125, 0], brass);
    box(k, [0.18, 0.060, 0.065], [0, 0.235, 0], brass, 0.025);
    for (const x of [-0.135, 0.135]) ring(k, 0.093, 0.032, [x, 0.24, 0], brass);
  };

  // Bodies keep substantial volume and a common mechanical shoulder span.
  const body = sockets.torso, bodyMaterial = paint.torso, b = variant("torso");
  let chestZ = 0.55;
  if (missing("torso")) {
    box(body, [0.50, 0.86, 0.40], [0, 0.59, 0], rubber, 0.16);
    rod(body, [-0.88, 1.02, 0], [0.88, 1.02, 0], 0.10, steel);
  } else {
    switch (b) {
      case 0: lathe(body, [[0, -.02], [.47, -.02], [.65, .10], [.73, .35], [.73, .95], [.60, 1.17], [.34, 1.22], [0, 1.22]], [0, 0, 0], bodyMaterial, .78); break;
      case 1: lathe(body, [[0, -.03], [.48, -.03], [.76, .12], [.85, .39], [.72, .78], [.46, 1.12], [.28, 1.23], [0, 1.23]], [0, 0, 0], bodyMaterial, .73); chestZ = .59; break;
      case 2: lathe(body, [[0, .02], [.64, .02], [.76, .10], [.75, .20], [.50, .43], [.45, .70], [.54, 1.01], [.74, 1.10], [.69, 1.22], [0, 1.22]], [0, 0, 0], bodyMaterial, .79); chestZ = .39; break;
      case 3: box(body, [1.10, 1.43, 1.0], [0, .58, 0], bodyMaterial, .21); chestZ = .515; break;
      case 4: mesh(body, hull([[-.78, 1.17], [.78, 1.17], [.49, .02], [-.49, .02]], 1.06, .12), bodyMaterial); break;
      case 5: ball(body, [.82, .71, .61], [0, .60, 0], bodyMaterial); chestZ = .62; break;
      case 6: box(body, [1.78, 1.04, 1.12], [0, .72, 0], bodyMaterial, .20); box(body, [.91, .41, .74], [0, .08, 0], bodyMaterial, .13); chestZ = .57; break;
      default: mesh(body, hull([[-.52,1.23],[.52,1.23],[.79,.83],[.57,.19],[.31,.02],[-.31,.02],[-.57,.19],[-.79,.83]], 1.08, .12), bodyMaterial); break;
    }
    // A molded access door reads through reflected light, not a printed outline.
    box(body, [.61, .56, .23], [0, .62, chestZ - .08], bodyMaterial, .105);
    for (const x of [-.22, .22]) screw(body, [x, .82, chestZ + .043], .028);
    for (const x of [-.14, -.045, .05, .145]) box(body, [.041, .014, .01], [x, .41, chestZ + .041], dark, .006);
  }
  cylinder(body, .26, .10, [0, 1.25, 0], brass);
  for (const side of [-1, 1]) {
    rod(body, [side * .40, 1.02, 0], [side * .95, 1.02, 0], .17, brass);
    cylinder(body, .275, .13, [side * .86, 1.02, 0], bodyMaterial, "x");
    cylinder(body, .16, .12, [side * .44, -.015, 0], brass);
  }

  const head = sockets.head, headMaterial = paint.head, h = variant("head");
  let crownY = 1.31, eyeY = .68, eyeSpread = .31, eyeR = .19, mouthY = .30;
  let oneEye = false, squareEyes = false;
  let frontAt = (_x: number, _y: number) => .53;
  cylinder(head, .19, .22, [0, .015, 0], brass);
  cylinder(head, .27, .065, [0, .10, 0], headMaterial);
  if (missing("head")) {
    ball(head, [.21, .15, .21], [0, .12, 0], rubber);
    crownY = .25;
  } else {
    switch (h) {
      case 0:
        box(head, [1.51, .87, 1.04], [0, .55, 0], headMaterial, .23);
        box(head, [1.60, .16, 1.10], [0, .88, 0], headMaterial, .07);
        crownY = .99; eyeY = .56; eyeR = .17; mouthY = .28; frontAt = () => .52; break;
      case 1:
        mesh(head, hull([[-.69,.13],[-.55,.36],[-.43,.99],[-.25,1.25],[.25,1.25],[.43,.99],[.55,.36],[.69,.13],[.32,.06],[-.32,.06]], 1.04, .14), headMaterial);
        crownY = 1.40; eyeY = .73; eyeR = .275; oneEye = true; mouthY = .29; frontAt = () => .53; break;
      case 2:
        ball(head, [.82,.66,.62], [0,.70,0], headMaterial);
        for (const side of [-1,1]) { cylinder(head,.24,.14,[side*.78,.63,0],brass,"x"); ball(head,[.15,.24,.27],[side*.85,.63,0],headMaterial); }
        crownY=1.35; eyeY=.75; eyeR=.205; eyeSpread=.32; mouthY=.32;
        frontAt=(x,y)=>.62*Math.sqrt(Math.max(.1,1-(x/.82)**2-((y-.70)/.66)**2)); break;
      case 3:
        box(head,[1.12,1.30,1.04],[0,.75,0],headMaterial,.21);
        box(head,[1.16,.15,1.07],[0,1.25,0],headMaterial,.07);
        crownY=1.43; eyeY=.79; eyeSpread=.245; eyeR=.168; mouthY=.39; frontAt=()=>.52; break;
      case 4:
        mesh(head,hull([[-.61,.11],[-.32,1.17],[.23,1.17],[.64,.11]],1.0,.13),headMaterial);
        crownY=1.30; eyeY=.68; eyeR=.25; oneEye=true; mouthY=.28; frontAt=()=>.50; break;
      case 5:
        box(head,[1.81,.84,1.08],[0,.55,0],headMaterial,.32);
        box(head,[1.49,.45,.07],[0,.60,.539],dark,.18);
        crownY=.98; eyeY=.60; eyeSpread=.38; eyeR=.174; mouthY=.27; frontAt=(_x,y)=>y<.38 ? .22+Math.sqrt(Math.max(.001,.32**2-Math.max(0,Math.abs(y-.55)-.10)**2)) : .585; break;
      case 6:
        mesh(head,hull([[-.48,.08],[-.76,.61],[-.65,1.08],[-.42,1.23],[.42,1.23],[.65,1.08],[.76,.61],[.48,.08]],1.13,.12),headMaterial);
        box(head,[1.48,.18,.28],[0,.99,.45],headMaterial,.07);
        crownY=1.37; eyeY=.70; eyeSpread=.315; eyeR=.185; mouthY=.28; frontAt=()=>.565; break;
      default:
        box(head,[1.56,1.09,1.10],[0,.68,0],headMaterial,.22);
        box(head,[1.31,.57,.09],[0,.74,.55],dark,.13);
        crownY=1.25; eyeY=.74; eyeSpread=.32; eyeR=.18; squareEyes=true; mouthY=.28; frontAt=(_x,y)=>y<.42 ? .33+Math.sqrt(Math.max(.001,.22**2-Math.max(0,Math.abs(y-.68)-.325)**2)) : .60; break;
    }
    const eyes = oneEye ? [0] : [-eyeSpread, eyeSpread];
    eyes.forEach((x, index) => {
      const z = frontAt(x,eyeY), closed = look.face === "sleepy" || (look.face === "wink" && index === eyes.length - 1);
      if(squareEyes) {
        box(head,[eyeR*2.14,eyeR*2.06,.10],[x,eyeY,z+.035],brass,.09);
        box(head,[eyeR*1.86,eyeR*1.82,.082],[x,eyeY,z+.087],closed?headMaterial:lens,.075);
      } else {
        cylinder(head,eyeR+.051,.24,[x,eyeY,z-.072],headMaterial,"z");
        cylinder(head,eyeR+.014,.070,[x,eyeY,z+.059],dark,"z");
        ring(head,eyeR+.015,.027,[x,eyeY,z+.106],brass);
        ball(head,[eyeR*.94,eyeR*.94,eyeR*.49],[x,eyeY,z+.094],closed?headMaterial:lens);
      }
      const faceZ = squareEyes ? z + .139 : z + .094 + eyeR * .49;
      if(closed) {
        tube(head,[ [x-eyeR*.68,eyeY+.015,faceZ], [x,eyeY-.025,faceZ+.007], [x+eyeR*.68,eyeY+.015,faceZ] ],.012,dark);
      } else if(look.face==="stars") star(head,eyeR*.53,[x,eyeY,faceZ+.009],brass);
      else if(look.face==="happy") tube(head,[[x-eyeR*.35,eyeY-.025,faceZ],[x,eyeY+.025,faceZ+.01],[x+eyeR*.35,eyeY-.025,faceZ]],.019,dark);
      else ball(head,[eyeR*.25,eyeR*.31,.025],[x+.012,eyeY-.007,faceZ-.009],pupil);
    });
    const smileWidth = oneEye ? .105 : .145;
    tube(head,[[-smileWidth,mouthY+.045,frontAt(-smileWidth,mouthY)+.027],[0,mouthY,frontAt(0,mouthY)+.034],[smileWidth,mouthY+.045,frontAt(smileWidth,mouthY)+.027]],.021,dark);
    if(!oneEye && h===2) ball(head,[.055,.052,.052],[0,.45,frontAt(0,.45)+.024],headMaterial);
    windingKey(head,crownY);
  }

  const addFoot = (g: THREE.Group, material: Material, width=.59, depth=.90, ankle=true) => {
    box(g,[width+.05,.13,depth+.07],[0,-1.335,.13],coral,.065);
    box(g,[width,.32,depth],[0,-1.16,.13],material,.145);
    if(ankle) box(g,[.36,.25,.40],[0,-.98,-.055],material,.11);
    // Fine separation line is physical rubber between the shoe and its sole.
    box(g,[width+.025,.025,depth+.025],[0,-1.265,.13],rubber,.011);
  };
  for (const socket of ["legL","legR"] as const) {
    const g=sockets[socket], material=paint[socket], v=variant(socket);
    ball(g,[.19,.19,.19],[0,0,0],brass);
    cylinder(g,.22,.10,[0,-.12,0],material);
    if(missing(socket)) continue;
    if(v===1) {
      cylinder(g,.16,.52,[0,-.39,0],material);
      box(g,[.38,.28,.42],[0,-.66,0],material,.13);
      cylinder(g,.355,.34,[0,-1.02,.06],coral,"x");
      for(const side of [-1,1]) {
        ring(g,.294,.086,[side*.16,-1.02,.06],rubber,"x");
        cylinder(g,.25,.035,[side*.215,-1.02,.06],material,"x");
        cylinder(g,.075,.051,[side*.239,-1.02,.06],brass,"x");
      }
      ring(g,.395,.064,[0,-1.02,.06],material,"x",Math.PI);
    } else if(v===5) {
      cylinder(g,.19,.57,[0,-.39,0],material);
      box(g,[.54,.25,.84],[0,-.80,.10],material,.11);
      box(g,[.57,.43,1.04],[0,-1.185,.10],coral,.20);
      for(const side of [-1,1]) {
        box(g,[.030,.30,.91],[side*.285,-1.185,.10],rubber,.14);
        for(const z of [-.22,.10,.42]) cylinder(g,.114,.040,[side*.312,-1.185,z],z===.10?ivory:brass,"x");
      }
      for(const z of [-.30,-.10,.10,.30,.50]) box(g,[.59,.025,.035],[0,-1.386,z],rubber,.01);
    } else {
      if(v===0) { cylinder(g,.17,.59,[0,-.41,0],material); ball(g,[.20,.22,.20],[0,-.74,0],material); addFoot(g,material); }
      if(v===2) { cylinder(g,.070,.67,[0,-.48,0],rubber); coil(g,-.20,-.89,.17,2.7,.046); cylinder(g,.235,.105,[0,-.20,0],ivory); cylinder(g,.235,.105,[0,-.91,0],ivory); addFoot(g,material,.61,.79,false); }
      if(v===3) { cylinder(g,.195,.31,[0,-.30,0],material); cylinder(g,.082,.55,[0,-.67,0],brass); cylinder(g,.20,.14,[0,-.86,0],material); addFoot(g,material,.55,1.01,false); }
      if(v===4) { tube(g,[[0,-.18,0],[-.19,-.39,0],[-.23,-.64,0],[0,-.95,0]],.14,material); cylinder(g,.12,.24,[-.19,-.52,0],brass,"x"); addFoot(g,material,.55,.84,false); }
      if(v===6) { for(const x of [-.16,.16]) rod(g,[x*.6,-.19,0],[x,-.97,0],.095,material); cylinder(g,.19,.12,[0,-.22,0],brass); addFoot(g,material,.63,.82,false); }
      if(v===7) { lathe(g,[[0,-.99],[.29,-.99],[.30,-.87],[.19,-.50],[.16,-.23],[0,-.23]],[0,0,0],material,.83); addFoot(g,material,.62,.76,false); }
    }
  }

  for(const socket of ["armL","armR"] as const) {
    const g=sockets[socket], material=paint[socket], v=variant(socket), side=socket==="armL"?-1:1;
    ball(g,[.235,.235,.235],[0,0,0],brass);
    cylinder(g,.265,.14,[0,0,0],material,"x");
    if(missing(socket)) continue;
    const limb=new THREE.Group(); limb.scale.x=side; g.add(limb);
    if(v===3 || v===5) {
      box(limb,[.34,.27,.35],[0,-.26,0],material,.11);
      cylinder(limb,.069,.58,[0,-.60,0],v===3?brass:rubber);
      if(v===5) coil(limb,-.36,-.86,.155,2.6,.040);
      cylinder(limb,.19,.11,[0,-.83,0],ivory);
    } else {
      rod(limb,[0,-.17,0],[0,-.56,.035],.16,material);
      ball(limb,[.172,.172,.172],[0,-.58,.035],brass);
      if(v===7) { cylinder(limb,.19,.37,[0,-.78,.04],material); for(const y of [-.64,-.90]) cylinder(limb,.27,.085,[0,y,.04],ivory); }
      else box(limb,[v===2?.38:.33,.37,.38],[0,-.79,.065],material,.14);
    }
    if(v===1) {
      const claw=mesh(limb,crescent(.30,.165,.29),material,[.17,-1.06,.12]); claw.rotation.z=-.04;
      screw(limb,[-.055,-1.06,.285],.048);
    } else if(v===2) {
      box(limb,[.55,.46,.54],[0,-1.07,.10],material,.14);
      ball(limb,[.12,.17,.16],[-.25,-1.08,.18],material);
      for(const x of [-.135,0,.135]) box(limb,[.010,.12,.012],[x,-.96,.373],rubber,.004);
    } else if(v===4) {
      ball(limb,[.23,.17,.23],[0,-.97,.10],material);
      for(const s of [-1,1]) tube(limb,[[s*.15,-1.02,.10],[s*.23,-1.18,.15],[s*.16,-1.29,.20]],.078,material);
    } else if(v===6) {
      mesh(limb,hull([[-.23,-.69],[.23,-.69],[.31,-.92],[.19,-1.23],[-.19,-1.23],[-.31,-.92]],.19,.05),material,[0,0,.21]);
      ball(limb,[.19,.20,.20],[0,-1.08,.25],material);
      screw(limb,[0,-.83,.334],.047);
    } else if(v===7) ball(limb,[.29,.17,.25],[0,-1.08,.11],material);
    else { ball(limb,[.245,.24,.26],[0,-1.08,.12],material); ball(limb,[.115,.17,.16],[-.19,-1.075,.24],material); }
  }

  const weapon=sockets.weapon, weaponMaterial=paint.weapon, w=variant("weapon");
  if(!missing("weapon")) {
    cylinder(weapon,.055,.84,[0,.39,0],wood);
    cylinder(weapon,.082,.27,[0,0,0],rubber);
    for(const y of [-.10,-.045,.01,.065,.12]) ring(weapon,.080,.010,[0,y,0],dark,"y");
    cylinder(weapon,.093,.08,[0,.185,0],brass);
    if(w===0) { const jaw=mesh(weapon,crescent(.285,.156,.16),weaponMaterial,[0,.92,0]); jaw.rotation.z=Math.PI/2; screw(weapon,[0,.70,.11],.035); }
    if(w===1) lathe(weapon,[[0,.38],[.075,.38],[.125,.51],[.175,.87],[.15,1.12],[.07,1.21],[0,1.21]],[0,0,0],weaponMaterial);
    if(w===2) {
      mesh(weapon,hull([[-.08,.65],[.15,.74],[.44,.63],[.40,1.29],[.12,1.16],[-.08,1.19]],.19,.045),weaponMaterial);
      mesh(weapon,hull([[.34,.65],[.44,.63],[.40,1.29],[.31,1.24]],.21,.018),steel);
      box(weapon,[.30,.29,.26],[-.13,.93,0],weaponMaterial,.07);
      screw(weapon,[0,.94,.148],.055);
    }
    if(w===3) {
      box(weapon,[.38,.43,.38],[0,.66,0],weaponMaterial,.12);
      cylinder(weapon,.125,.10,[0,.925,0],brass);
      cylinder(weapon,.115,.38,[0,1.155,0],steel,"y",.020);
      const points:V3[]=[]; for(let i=0;i<=64;i++){const k=i/64,a=k*Math.PI*7,r=.117*(1-k)+.021*k;points.push([Math.cos(a)*r,.97+k*.36,Math.sin(a)*r]);} tube(weapon,points,.014,brass);
      for(const x of [-.075,0,.075]) box(weapon,[.012,.16,.012],[x,.67,.194],dark,.004);
    }
    if(w===4) {
      const points:[number,number][]=[]; for(let i=0;i<48;i++){const a=i/48*Math.PI*2,r=[.29,.33,.33,.285][i%4];points.push([Math.cos(a)*r,Math.sin(a)*r]);}
      mesh(weapon,hull(points,.095,.016),steel,[0,.99,0]);
      cylinder(weapon,.24,.115,[0,.99,0],weaponMaterial,"z"); ring(weapon,.185,.015,[0,.99,.066],brass);
      cylinder(weapon,.085,.15,[0,.99,0],brass,"z"); screw(weapon,[0,.99,.088],.04,steel);
    }
    if(w===5) { cylinder(weapon,.11,.12,[0,.53,0],brass); ring(weapon,.21,.040,[0,.59,0],brass,"y"); cylinder(weapon,.175,.62,[0,.91,0],weaponMaterial,"y",.023); ball(weapon,[.033,.040,.033],[0,1.22,0],brass); }
    if(w===6) {
      box(weapon,[.71,.38,.43],[0,.96,0],weaponMaterial,.105);
      for(const x of [-.355,.355]) { cylinder(weapon,.235,.14,[x,.96,0],rubber,"x"); cylinder(weapon,.207,.023,[x+Math.sign(x)*.078,.96,0],brass,"x"); }
      screw(weapon,[0,.96,.231],.064);
    }
    if(w===7) {
      mesh(weapon,hull([[-.15,.62],[.12,.65],[.36,.81],[.48,1.16],[.26,1.07],[-.14,1.04]],.15,.052),weaponMaterial);
      mesh(weapon,hull([[.11,.69],[.36,.81],[.48,1.16],[.41,1.11],[.28,.86]],.16,.020),steel);
      cylinder(weapon,.16,.065,[0,.57,0],brass); screw(weapon,[-.035,.82,.127],.036);
    }
  }

  // Only real, supplied choices and earned marks are drawn.
  const marks=marksOf(look.earned);
  const label = (g: THREE.Object3D, at: V3, width: number, height: number, draw: (ctx: CanvasRenderingContext2D)=>void) => {
    if(typeof document==="undefined") return;
    const canvas=document.createElement("canvas"); canvas.width=256; canvas.height=256;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    draw(ctx);
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=4; textures.add(texture);
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.58,metalness:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}); materials.add(material);
    const m=mesh(g,new THREE.PlaneGeometry(width,height),material,at); m.castShadow=false;
  };
  const starCount=marks.stars+(marks.gold?1:0);
  if(!missing("torso")) {
    for(let i=0;i<starCount;i++) star(body,.043,[(i-(starCount-1)/2)*.117,.99,chestZ+.035],marks.gold&&i===starCount-1?brass:ivory);
    const number=marks.count??look.plate;
    if(number!=null) {
      box(body,[.41,.19,.055],[0,.23,chestZ-.025],ivory,.055);
      label(body,[0,.23,chestZ+.010],.36,.17,ctx=>{ctx.fillStyle="#28362c";ctx.font="bold 126px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(number),128,135,218);});
    }
    for(let i=0;i<marks.patches;i++) {
      box(body,[.16,.14,.025],[-.40+i*.17,.36,chestZ-.04],ivory,.018);
      for(const x of [-.05,.05]) box(body,[.012,.12,.009],[-.40+i*.17+x,.36,chestZ-.023],brass,.003);
    }
  }
  if(look.sticker) {
    const s=look.sticker, g=s.spot==="cheek"?head:s.spot==="boot"?sockets.legR:body;
    const at:V3=s.spot==="cheek"?[.42,.32,frontAt(.42,.32)+.020]:s.spot==="boot"?[0,-1.15,.59]:[0,.62,chestZ+.043];
    label(g,at,s.spot==="chest"?.36:.23,s.spot==="chest"?.36:.23,ctx=>{
      ctx.fillStyle=`#${s.color.toString(16).padStart(6,"0")}`; ctx.strokeStyle=ctx.fillStyle; ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=21;
      if(s.id==="heart") {ctx.beginPath();ctx.moveTo(128,214);ctx.bezierCurveTo(8,138,20,38,90,52);ctx.bezierCurveTo(116,56,127,80,128,86);ctx.bezierCurveTo(147,31,221,41,229,103);ctx.bezierCurveTo(234,148,174,192,128,214);ctx.fill();}
      else if(s.id==="bolt") {ctx.beginPath();ctx.moveTo(143,25);ctx.lineTo(54,142);ctx.lineTo(113,142);ctx.lineTo(100,229);ctx.lineTo(202,101);ctx.lineTo(144,101);ctx.closePath();ctx.fill();}
      else if(s.id==="star") {ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?43:104;const x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}
      else if(s.id==="stripes") for(const y of [65,128,191]) {ctx.beginPath();ctx.moveTo(45,y+24);ctx.lineTo(211,y-24);ctx.stroke();}
      else if(s.id==="wrenches") for(const flip of [-1,1]) {ctx.save();ctx.translate(128,128);ctx.rotate(flip*.74);ctx.beginPath();ctx.moveTo(0,-66);ctx.lineTo(0,88);ctx.stroke();ctx.beginPath();ctx.arc(0,-78,29,.25,Math.PI-.25);ctx.stroke();ctx.restore();}
      else {ctx.beginPath();ctx.roundRect(31,69,194,118,29);ctx.stroke();ctx.beginPath();ctx.arc(128,128,22,0,Math.PI*2);ctx.fill();}
    });
  }
  for(const s of ["armL","armR"] as const) for(let i=0;i<marks.cuffs;i++) cylinder(sockets[s],.20,.040,[0,-.72+i*.13,.05],brass);
  if(marks.sparkle&&!missing("head")) for(const x of oneEye?[0]:[-eyeSpread,eyeSpread]) star(head,.043,[x+.05,eyeY+.06,frontAt(x,eyeY)+.17],ivory);
  if(look.hat&&!missing("head")) {
    const hat=new THREE.Group();hat.position.set(0,crownY+.08,0);head.add(hat);const color=enamel(look.hat.color);
    // Hats share the crown seat; their own silhouette stays unmistakable.
    if(look.hat.kind==="bow") { for(const side of [-1,1]) {const loop=ball(hat,[.21,.15,.10],[side*.18,.14,.05],color);loop.rotation.z=side*.25;}ball(hat,[.09,.10,.11],[0,.14,.08],brass); }
    if(look.hat.kind==="propeller") {cylinder(hat,.035,.25,[0,.13,0],brass);const rotor=box(hat,[.70,.045,.10],[0,.27,0],color,.020);rotor.rotation.y=.40;ball(hat,[.07,.05,.07],[0,.285,0],brass);}
    if(look.hat.kind==="ears") for(const side of [-1,1]) {const ear=ball(hat,[.11,.35,.10],[side*.24,.24,0],color);ear.rotation.z=-side*.18;ball(hat,[.055,.23,.025],[side*.24,.24,.09],ivory);}
    if(look.hat.kind==="flag") {cylinder(hat,.025,.51,[.09,.25,0],brass);mesh(hat,hull([[.10,.49],[.43,.38],[.10,.29]],.04,.01),color);}
    if(look.hat.kind==="bell") {lathe(hat,[[0,0],[.25,0],[.21,.09],[.15,.31],[0,.35]],[0,0,0],color);ring(hat,.23,.027,[0,.016,0],brass,"y");}
    if(look.hat.kind==="spring") {coil(hat,.04,.35,.075,2.5,.02);ball(hat,[.10,.10,.10],[0,.38,0],color);}
  }
  if(marks.crown&&!missing("head")) {
    const y=crownY+(look.hat?.kind==="propeller"?.49:look.hat?.kind==="ears"?.72:.43);
    cylinder(head,.28,.085,[0,y,0],brass);
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const x=Math.sin(a)*.27,z=Math.cos(a)*.27;mesh(head,new THREE.ConeGeometry(.065,.19,4),brass,[x,y+.11,z]);ball(head,[.037,.037,.037],[x,y+.22,z],ivory);}
  }

  // Raycasters can walk directly from any visible surface to its socket.
  for(const name of ["torso","head","armL","armR","legL","legR","weapon"] as Socket[]) sockets[name].traverse(o=>{o.userData.socket=name;});
  const pose=Object.values(sockets).map(g=>({g,p:g.position.clone(),q:g.quaternion.clone(),s:g.scale.clone(),v:g.visible}));
  root.updateMatrixWorld(true);
  const extent=new THREE.Box3().setFromObject(root);
  const height=Math.max(3.9,extent.max.y);
  root.userData.toyHeight=height;
  let disposed=false;
  return {
    root,sockets,height,
    resetPose(){for(const b of pose){b.g.position.copy(b.p);b.g.quaternion.copy(b.q);b.g.scale.copy(b.s);b.g.visible=b.v;}},
    dispose(){if(disposed)return;disposed=true;const geometries=new Set<THREE.BufferGeometry>();root.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());root.removeFromParent();root.clear();},
  };
}
