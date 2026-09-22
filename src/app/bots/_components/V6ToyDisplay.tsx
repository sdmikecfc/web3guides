"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createToyV6, setToyVisibilityV6, type ToyV6 } from "../_view/v6-toy";
import type { BuildV6, SocketV6 } from "@/lib/bots/v6/types";
import { createFightV6, fighterPoseV6 } from "@/lib/bots/v6/engine";
import { restArmPoseV6 } from "@/lib/bots/v6/pose";

/** One selected-robot canvas. Shelf/stand thumbnails should use still images. */
export default function V6ToyDisplay({ build, className, title = "Your robot", active = true, slot, visibleSlots }: { build: BuildV6; className?: string; title?: string; active?: boolean; slot?: SocketV6; visibleSlots?: readonly SocketV6[] }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState(""), [readyKey, setReadyKey] = useState("");
  const key = JSON.stringify([build.appearanceBuild, build.assetVersion, build.collisionVersion, slot, visibleSlots]);
  useEffect(() => {
    if (!canvas.current || !host.current || !active) return;
    let disposed = false, toy: ToyV6 | undefined, raf = 0, down = false, lastX = 0, angle = .45, dirty = true;
    const target = new THREE.Vector3(0, 1.48, 0), modelSize = new THREE.Vector3(2.5, 3, 2.5);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(33, 1, .1, 50);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, .04); scene.environment = env.texture; scene.environmentIntensity = .7; pmrem.dispose(); room.dispose();
    scene.add(new THREE.HemisphereLight(0xffe7c4, 0x675343, 2)); const light = new THREE.DirectionalLight(0xffe6bd, 3); light.position.set(-3, 5, 4); scene.add(light); const rim = new THREE.DirectionalLight(0xbad7ff, 2); rim.position.set(3, 4, -3); scene.add(rim);
    const floorG = new THREE.CylinderGeometry(1.6, 1.65, .10, 48), floorM = new THREE.MeshStandardMaterial({ color: 0xba9766, roughness: .7 }); const floor = new THREE.Mesh(floorG, floorM); floor.position.y = -.045; scene.add(floor);
    const resize = () => { const b = host.current?.getBoundingClientRect(); if (!b) return; renderer.setSize(Math.max(1, b.width), Math.max(1, b.height), false); camera.aspect = b.width / Math.max(1, b.height); camera.updateProjectionMatrix(); dirty = true; };
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize(); setError(""); setReadyKey("");
    const c = canvas.current, start = (e: PointerEvent) => { down = true; lastX = e.clientX; c.setPointerCapture(e.pointerId); }, move = (e: PointerEvent) => { if (down) { angle += (e.clientX - lastX) * .009; lastX = e.clientX; dirty = true; } }, end = () => { down = false; };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move); c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    const keyboard = (e: KeyboardEvent) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); angle += e.key === "ArrowLeft" ? -.15 : .15; dirty = true; } }; c.addEventListener("keydown", keyboard);
    const visibility = () => { dirty = true; }; document.addEventListener("visibilitychange", visibility);
    createToyV6(build).then(value => {
      if (disposed) { value.dispose(); return; } toy = value; scene.add(toy.root);
      const state = createFightV6(0, build, build); state.fighters[0].x = 0; state.fighters[0].z = 0; state.fighters[0].yaw = 0; state.fighters[1].x = 0; state.fighters[1].z = 6000;
      const pose = fighterPoseV6(state, 0);
      if ((visibleSlots && !visibleSlots.includes("weapon")) || (slot && slot !== "weapon")) { pose.arms.left = restArmPoseV6(build.collision, "left"); pose.arms.right = restArmPoseV6(build.collision, "right"); pose.weapons = {}; pose.mounts = {}; }
      toy.pose(state.fighters[0], 0, pose);
      setToyVisibilityV6(toy, slot, visibleSlots);
      const box = new THREE.Box3(), piece = new THREE.Box3();
      const measure = () => { box.makeEmpty(); toy!.root.updateMatrixWorld(true); toy!.root.traverseVisible(o => { if (!(o instanceof THREE.Mesh)) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); piece.copy(o.geometry.boundingBox!).applyMatrix4(o.matrixWorld); box.union(piece); }); };
      measure(); if (!box.isEmpty()) { box.getCenter(target); toy.root.position.x -= target.x; toy.root.position.z -= target.z; toy.root.position.y -= box.min.y; measure(); box.getCenter(target); box.getSize(modelSize); floor.scale.setScalar(Math.max(.32, Math.max(modelSize.x, modelSize.z) / 2.8)); }
      const loop = () => { if (disposed) return; raf = requestAnimationFrame(loop); if (document.hidden || !dirty) return; dirty = false; const spread = Math.max(modelSize.x, modelSize.z), distance = Math.max(slot ? .25 : 1.4, modelSize.y * 1.12, spread / Math.max(.4, camera.aspect)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .66; camera.position.set(target.x + Math.sin(angle) * distance, target.y + distance * .25, target.z + Math.cos(angle) * distance); camera.lookAt(target); renderer.render(scene, camera); setReadyKey(key); }; loop();
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : "The robot preview could not load."); });
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener("visibilitychange", visibility); c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointercancel", end); c.removeEventListener("keydown", keyboard); toy?.dispose(); floorG.dispose(); floorM.dispose(); env.dispose(); renderer.dispose(); };
    // A canonical build identity owns its model, not unrelated UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  return <div ref={host} className={className} data-v6-preview-ready={active && readyKey === key && !error} data-v6-preview-error={error || undefined} style={{ position: "relative", width: "100%", height: "100%", minHeight: slot ? 0 : 180 }}><canvas ref={canvas} tabIndex={0} aria-label={`${title}. Drag or use arrow keys to turn.`} style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} />{error && <p role="status" style={{ position: "absolute", inset: "35% 16px auto", textAlign: "center", color: "#e8c897" }}>{error}</p>}</div>;
}
