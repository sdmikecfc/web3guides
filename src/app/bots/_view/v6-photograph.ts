"use client";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createFightV6, fighterPoseV6, type BuildV6, type SocketV6 } from "@/lib/bots/v6";
import { restArmPoseV6 } from "@/lib/bots/v6/pose";
import { createToyV6, setToyVisibilityV6, type ToyV6 } from "./v6-toy";

type PhotoOptions = { slot?: SocketV6; visibleSlots?: SocketV6[] };
const cache = new Map<string, string>();
let queue = Promise.resolve(), pending = 0;
let stage: ReturnType<typeof makeStage> | null = null;
export const photographKeyV6 = (build: BuildV6, options: PhotoOptions = {}) => JSON.stringify([build.appearanceBuild, build.assetVersion, build.collisionVersion, options.slot, options.visibleSlots]);

function makeStage() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas"), alpha: true, antialias: true });
  renderer.setSize(300, 260, false); renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 300 / 260, .01, 100);
  const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer), env = pmrem.fromScene(room, .04); room.dispose(); pmrem.dispose(); scene.environment = env.texture; scene.environmentIntensity = .7;
  scene.add(new THREE.HemisphereLight(0xffe7c4, 0x675343, 2));
  const key = new THREE.DirectionalLight(0xffe6bd, 3), rim = new THREE.DirectionalLight(0xbad7ff, 2); key.position.set(-3, 5, 4); rim.position.set(3, 4, -3); scene.add(key, rim);
  return { renderer, scene, camera, dispose() { env.dispose(); renderer.dispose(); renderer.forceContextLoss(); } };
}
/** Only one offscreen renderer photographs exact models; gallery cards retain 2D images. */
export function photographToyV6(build: BuildV6, options: PhotoOptions = {}, wanted: () => boolean = () => true): Promise<string | null> {
  const key = photographKeyV6(build, options), previous = cache.get(key);
  if (previous) { cache.delete(key); cache.set(key, previous); return Promise.resolve(previous); }
  pending++;
  let resolve!: (value: string | null) => void, reject!: (error: unknown) => void;
  const result = new Promise<string | null>((yes, no) => { resolve = yes; reject = no; });
  queue = queue.catch(() => {}).then(async () => {
    let toy: ToyV6 | undefined;
    try {
      if (!wanted()) { resolve(null); return; }
      const cached = cache.get(key); if (cached) { resolve(cached); return; }
      toy = await createToyV6(build);
      if (!wanted()) { resolve(null); return; }
      const state = createFightV6(1, build, build); state.fighters[0].x = 0; state.fighters[0].z = 0; state.fighters[0].yaw = 0; state.fighters[1].x = 0; state.fighters[1].z = 6000;
      const pose = fighterPoseV6(state, 0);
      if ((options.visibleSlots && !options.visibleSlots.includes("weapon")) || (options.slot && options.slot !== "weapon")) { pose.arms.left = restArmPoseV6(build.collision, "left"); pose.arms.right = restArmPoseV6(build.collision, "right"); pose.weapons = {}; pose.mounts = {}; }
      toy.pose(state.fighters[0], 0, pose, true); toy.root.position.set(0, 0, 0); toy.root.rotation.set(0, 0, 0);
      setToyVisibilityV6(toy, options.slot, options.visibleSlots); toy.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().makeEmpty();
      toy.root.traverseVisible(node => { const mesh = node as THREE.Mesh; if (!mesh.isMesh) return; mesh.geometry.computeBoundingBox(); if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)); });
      if (bounds.isEmpty()) throw new Error("The selected part has no visible picture.");
      stage ??= makeStage(); const { renderer, camera, scene } = stage;
      const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), radius = size.length() / 2;
      const distance = Math.max(.4, radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1);
      camera.position.copy(center).add(new THREE.Vector3(.48, .27, 1).normalize().multiplyScalar(distance)); camera.lookAt(center); camera.updateProjectionMatrix();
      scene.add(toy.root); renderer.render(scene, camera); const picture = renderer.domElement.toDataURL("image/png"); scene.remove(toy.root);
      cache.set(key, picture); while (cache.size > 80) cache.delete(cache.keys().next().value!); resolve(picture);
    } catch (error) { reject(error); }
    finally { if (toy) { stage?.scene.remove(toy.root); toy.dispose(); } pending--; if (!pending && stage) { stage.dispose(); stage = null; } }
  });
  return result;
}
