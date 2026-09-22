import * as THREE from "three";

/** The lab shares the game's workshop and miniature arena art direction. */
export async function createLabSet(scene: THREE.Scene, arenaRadius = 5.68, surroundAudience = false) {
  const workshop = new THREE.Group(), arena = new THREE.Group();
  scene.add(workshop, arena);
  arena.scale.set(arenaRadius / 5.68, 1, arenaRadius / 5.68);
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const mat = (color: number, roughness = .7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Group, x = 0, y = 0, z = 0) {
    geometry.add(g); materials.add(m);
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.receiveShadow = true; parent.add(o); return o;
  }
  function texture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; paint(canvas.getContext("2d")!);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.add(t); return t;
  }
  const wood = texture(512, 256, c => {
    c.fillStyle = "#a0784e"; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 360; i++) {
      c.strokeStyle = i % 3 ? "rgba(66,38,19,.07)" : "rgba(247,204,130,.11)";
      c.beginPath(); c.moveTo(0, i * .73); c.bezierCurveTo(150, i * .73 + Math.sin(i) * 5, 370, i * .73 - 3, 512, i * .73); c.stroke();
    }
    c.fillStyle = "#553b2730"; c.fillRect(0, 84, 512, 2); c.fillRect(0, 170, 512, 2);
  });
  const plinthMat = mat(0xb19a7d, .84); plinthMat.map = wood;
  const plinth = mesh(new THREE.BoxGeometry(4.4, .19, 3.3), plinthMat, workshop, 0, -.105); plinth.castShadow = true;
  mesh(new THREE.BoxGeometry(4.44, .035, 3.34), mat(0x785033), workshop, 0, -.19);
  const shadow = mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x302113, opacity: .22 }), workshop, 0, -.23); shadow.rotation.x = -Math.PI / 2;

  const canvasFloor = texture(512, 512, c => {
    c.fillStyle = "#cbb898"; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 18000; i++) {
      c.fillStyle = i % 2 ? "rgba(255,250,230,.045)" : "rgba(65,42,25,.035)";
      c.fillRect((i * 97) % 512, (i * 173 + Math.floor(i / 512) * 37) % 512, 1, 1);
    }
    c.strokeStyle = "rgba(106,75,39,.23)"; c.lineWidth = 1.4; c.beginPath(); c.arc(256, 256, 226, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "rgba(106,75,39,.12)"; c.beginPath(); c.arc(256, 256, 83, 0, Math.PI * 2); c.stroke();
  });
  const timber = mat(0x38251b, .56), rubber = mat(0x27231f, .78), brass = mat(0xb68c48, .3, .8);
  mesh(new THREE.CylinderGeometry(5.85, 5.98, .38, 96), timber, arena, 0, -.23);
  const floorMat = mat(0xf0dec2, .87); floorMat.map = canvasFloor;
  mesh(new THREE.CylinderGeometry(5.68, 5.68, .055, 96), floorMat, arena, 0, -.033);
  mesh(new THREE.TorusGeometry(5.78, .105, 12, 96), rubber, arena, 0, -.02).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(5.90, .028, 8, 96), brass, arena, 0, -.15).rotation.x = Math.PI / 2;
  mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0x211810 }), arena, 0, -.45).rotation.x = -Math.PI / 2;
  const bulbGeo = new THREE.SphereGeometry(.065, 12, 8), socketGeo = new THREE.CylinderGeometry(.092, .085, .06, 12);
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffe1ad, emissive: 0xffbc59, emissiveIntensity: 1.3, roughness: .25 });
  geometry.add(bulbGeo); geometry.add(socketGeo); materials.add(lamp);
  const bulbs = new THREE.InstancedMesh(bulbGeo, lamp, 40), sockets = new THREE.InstancedMesh(socketGeo, brass, 40);
  arena.add(bulbs, sockets); const matrix = new THREE.Matrix4();
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2, x = Math.sin(a) * 5.86, z = Math.cos(a) * 5.86;
    sockets.setMatrixAt(i, matrix.makeTranslation(x, .005, z)); bulbs.setMatrixAt(i, matrix.makeTranslation(x, .065, z));
  }
  const railPoints = Array.from({ length: 49 }, (_, i) => { const a = Math.PI / 2 + i / 48 * Math.PI; return new THREE.Vector3(Math.sin(a) * 5.86, .74, Math.cos(a) * 5.86); });
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), 64, .047, 8, false), rubber, arena);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI / 2 + i / 8 * Math.PI;
    mesh(new THREE.CylinderGeometry(.048, .073, .76, 12), brass, arena, Math.sin(a) * 5.86, .35, Math.cos(a) * 5.86);
  }
  const contact = texture(128, 128, c => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, "rgba(32,22,14,.38)"); g.addColorStop(.45, "rgba(32,22,14,.15)"); g.addColorStop(1, "rgba(32,22,14,0)"); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
  const contacts = [0, 1].map(() => {
    const m = mesh(new THREE.PlaneGeometry(2.5, 1.65), new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }), workshop, 0, .002);
    scene.attach(m); m.rotation.x = -Math.PI / 2; return m;
  });
  const loader = new THREE.TextureLoader();
  const plates = await Promise.allSettled([loader.loadAsync("/bots-art/plates/workshop-interior.png"), loader.loadAsync("/bots-art/plates/arena-evening.png")]);
  let workshopPlate: THREE.Texture | undefined;
  let audienceMaterial: THREE.MeshBasicMaterial | undefined, audienceStill: THREE.Texture | undefined;
  plates.forEach(p => { if (p.status === "fulfilled") { p.value.colorSpace = THREE.SRGBColorSpace; textures.add(p.value); } });
  if (plates[0].status === "fulfilled") workshopPlate = plates[0].value;
  if (plates[1].status === "fulfilled") {
    const t = plates[1].value; t.repeat.set(surroundAudience ? 2 : 1, .46); t.offset.set(0, .54);
    if (surroundAudience) t.wrapS = THREE.RepeatWrapping;
    audienceStill = t; audienceMaterial = new THREE.MeshBasicMaterial({ map: t, color: 0xa89c88, toneMapped: false, side: THREE.BackSide });
    const audience = mesh(new THREE.CylinderGeometry(10.8, 10.8, 8.8, surroundAudience ? 128 : 72, 1, true, Math.PI / 2, Math.PI * (surroundAudience ? 2 : 1)), audienceMaterial, arena, 0, 3.6); audience.receiveShadow = false;
  }
  // One small, locally served Higgsfield loop. Three updates its video texture
  // on decoded frames, independently of the camera's render rate.
  const crowd = document.createElement("video");
  crowd.src = "/bots-art/video/arena-crowd-loop.mp4"; crowd.muted = true; crowd.defaultMuted = true;
  crowd.loop = true; crowd.playsInline = true; crowd.preload = "none";
  const crowdTexture = new THREE.VideoTexture(crowd); crowdTexture.colorSpace = THREE.SRGBColorSpace; textures.add(crowdTexture);
  if (surroundAudience) { crowdTexture.wrapS = THREE.RepeatWrapping; crowdTexture.repeat.x = 2; }
  let playPending = false, playbackFailed = false, disposed = false;
  const visibility = () => { if (document.hidden) crowd.pause(); };
  document.addEventListener("visibilitychange", visibility);
  const dark = new THREE.Color(0x211810);
  return {
    update(showroom: boolean, width: number, height: number, robots: THREE.Group[], motion = true) {
      workshop.visible = showroom; arena.visible = !showroom; scene.background = showroom && workshopPlate ? workshopPlate : dark;
      const animate = !showroom && motion && !document.hidden && !playbackFailed;
      if (animate && crowd.paused && !playPending) {
        playPending = true;
        void crowd.play().catch(() => { if (!disposed) playbackFailed = true; }).finally(() => { playPending = false; if (disposed) crowd.pause(); });
      } else if (!animate && !crowd.paused) crowd.pause();
      if (audienceMaterial) {
        const map = animate && crowd.readyState >= 2 ? crowdTexture : audienceStill;
        if (audienceMaterial.map !== map) { audienceMaterial.map = map ?? null; audienceMaterial.needsUpdate = true; }
      }
      if (showroom && workshopPlate) {
        const aspect = width / height, imageAspect = workshopPlate.image.width / workshopPlate.image.height;
        const x = Math.min(1, aspect / imageAspect), y = Math.min(1, imageAspect / aspect);
        workshopPlate.repeat.set(x, y); workshopPlate.offset.set((1 - x) / 2, (1 - y) / 2); workshopPlate.updateMatrix();
      }
      contacts.forEach((m, i) => { m.visible = !showroom || i === 0; m.position.set(robots[i].position.x, .003, robots[i].position.z); });
    },
    crowdState() { return { playing: !crowd.paused && crowd.readyState >= 2, time: crowd.currentTime, failed: playbackFailed }; },
    dispose() { disposed = true; document.removeEventListener("visibilitychange", visibility); crowd.pause(); crowd.removeAttribute("src"); crowd.load(); geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); workshop.removeFromParent(); arena.removeFromParent(); contacts.forEach(m => m.removeFromParent()); },
  };
}
