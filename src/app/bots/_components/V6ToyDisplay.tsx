"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createToyV6, type ToyV6 } from "../_view/v6-toy";
import type { BuildV6 } from "@/lib/bots/v6/types";

/** One selected-robot canvas. Shelf/stand thumbnails should use still images. */
export default function V6ToyDisplay({ build, className, title = "Your robot", active = true }: { build: BuildV6; className?: string; title?: string; active?: boolean }) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), [error, setError] = useState("");
  const key = JSON.stringify(build.appearanceBuild);
  useEffect(() => {
    if (!canvas.current || !host.current || !active) return;
    let disposed = false, toy: ToyV6 | undefined, raf = 0, down = false, lastX = 0, angle = .45;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas.current, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(33, 1, .1, 50);
    const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment(), env = pmrem.fromScene(room, .04); scene.environment = env.texture; scene.environmentIntensity = .7; pmrem.dispose(); room.dispose();
    scene.add(new THREE.HemisphereLight(0xffe7c4, 0x675343, 2)); const light = new THREE.DirectionalLight(0xffe6bd, 3); light.position.set(-3, 5, 4); scene.add(light); const rim = new THREE.DirectionalLight(0xbad7ff, 2); rim.position.set(3, 4, -3); scene.add(rim);
    const floorG = new THREE.CylinderGeometry(1.6, 1.65, .10, 48), floorM = new THREE.MeshStandardMaterial({ color: 0xba9766, roughness: .7 }); const floor = new THREE.Mesh(floorG, floorM); floor.position.y = -.045; scene.add(floor);
    const resize = () => { const b = host.current?.getBoundingClientRect(); if (!b) return; renderer.setSize(Math.max(1, b.width), Math.max(1, b.height), false); camera.aspect = b.width / Math.max(1, b.height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize(); setError("");
    const c = canvas.current, start = (e: PointerEvent) => { down = true; lastX = e.clientX; c.setPointerCapture(e.pointerId); }, move = (e: PointerEvent) => { if (down) { angle += (e.clientX - lastX) * .009; lastX = e.clientX; } }, end = () => { down = false; };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move); c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    const keyboard = (e: KeyboardEvent) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); angle += e.key === "ArrowLeft" ? -.15 : .15; } }; c.addEventListener("keydown", keyboard);
    createToyV6(build).then(value => {
      if (disposed) { value.dispose(); return; } toy = value; scene.add(toy.root);
      const loop = () => { if (disposed) return; raf = requestAnimationFrame(loop); if (document.hidden) return; const distance = Math.max(6.4, 4.5 / Math.max(.5, camera.aspect)); camera.position.set(Math.sin(angle) * distance, 2.7, Math.cos(angle) * distance); camera.lookAt(0, 1.48, .08); renderer.render(scene, camera); }; loop();
    }).catch(e => { if (!disposed) setError(e instanceof Error ? e.message : "The robot preview could not load."); });
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", end); c.removeEventListener("pointercancel", end); c.removeEventListener("keydown", keyboard); toy?.dispose(); floorG.dispose(); floorM.dispose(); env.dispose(); renderer.dispose(); };
    // A canonical build identity owns its model, not unrelated UI state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  return <div ref={host} className={className} style={{ position: "relative", width: "100%", height: "100%", minHeight: 180 }}><canvas ref={canvas} tabIndex={0} aria-label={`${title}. Drag or use arrow keys to turn.`} style={{ width: "100%", height: "100%", display: "block", touchAction: "pan-y" }} />{error && <p role="status" style={{ position: "absolute", inset: "35% 16px auto", textAlign: "center", color: "#e8c897" }}>{error}</p>}</div>;
}
