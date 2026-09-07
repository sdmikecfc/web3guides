"use client";
import { useEffect, useRef } from "react";
import type { BuildV4, Slot } from "./engine";
export default function PartInspection({ build, slot }: { build: BuildV4; slot: Slot | "weapon" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(build);
  useEffect(() => {
    let dead = false, cleanup = () => {};
    async function start() {
      const [THREE, { createClayRobot }] = await Promise.all([import("three"), import("./robot")]);
      if (dead || !canvas.current) return;
      const robot = await createClayRobot(JSON.parse(key)); if (dead) { robot.dispose(); return; }
      const renderer = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true, alpha: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .01, 30);
      scene.add(robot.root, new THREE.HemisphereLight(0xffeed2, 0x594434, 1.5));
      const light = new THREE.DirectionalLight(0xffe6c0, 3.2); light.position.set(-3, 5, 4); scene.add(light);
      const rim = new THREE.DirectionalLight(0xffce91, 2); rim.position.set(3, 3, -3); scene.add(rim);
      Object.entries(robot.meshes).forEach(([s, meshes]) => meshes.forEach(m => { m.visible = s === slot; }));
      robot.root.updateMatrixWorld(true);
      const box = new THREE.Box3(); for (const m of robot.meshes[slot]) box.expandByObject(m);
      const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length(), radius = Math.max(.8, size * 1.65);
      camera.position.copy(centre).add(new THREE.Vector3(.6, .32, 1).normalize().multiplyScalar(radius)); camera.lookAt(centre);
      const resize = new ResizeObserver(entries => { const r = entries[0].contentRect; if (!r.width || !r.height) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); renderer.render(scene, camera); });
      resize.observe(canvas.current!);
      cleanup = () => { resize.disconnect(); robot.dispose(); renderer.dispose(); };
    }
    void start().catch(() => { /* Main scene reports asset failures with a retry. */ });
    return () => { dead = true; cleanup(); };
  }, [key, slot]);
  return <canvas ref={canvas} aria-label={`3D preview of selected ${slot}`} style={{ width: "100%", height: 155, display: "block" }} />;
}
