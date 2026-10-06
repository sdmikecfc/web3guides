import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {QUALITY_BUDGETS,type Atmosphere,type RenderQuality} from './presentation';

export interface CinematicLighting {
  sun: THREE.DirectionalLight;
  /** Recenter the single shadow map when a truck/restaurant changes size. */
  setRoomBounds: (width: number, height: number) => void;
  setAtmosphere:(value:Atmosphere|'night')=>void;
  setQuality:(value:RenderQuality)=>void;
  dispose: () => void;
}

/**
 * Warm miniature photography: broad reflection cards, one window-like key and
 * cool sky bounce. No screen-space effects, per-lamp shadows or per-frame work.
 * The environment is generated once on this renderer and owned by this rig.
 */
export function setupCinematicLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  mode: 'home' | 'truck' | 'catalogue',
): CinematicLighting {
  const catalogue = mode === 'catalogue';
  const previousEnvironment = scene.environment;
  const previousIntensity = scene.environmentIntensity;
  const previousToneMapping = renderer.toneMapping;
  const previousExposure = renderer.toneMappingExposure;
  const previousShadows = renderer.shadowMap.enabled;
  const previousShadowType = renderer.shadowMap.type;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .97;
  renderer.shadowMap.enabled = !catalogue;
  // Variance shadows produced repeated speckles on flat tiles and awnings,
  // especially on mobile half-float targets. Filtered depth shadows stay clean
  // and avoid the two variance-blur passes at the same bounded map resolution.
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sky = new THREE.HemisphereLight('#eaf2ff', '#a18a70', .58);
  sky.name = 'miniature-sky-bounce';
  const sun = new THREE.DirectionalLight('#ffe6be', mode === 'truck' ? 3.0 : 3.25);
  sun.name = 'miniature-window-light';
  sun.castShadow = !catalogue;
  const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const shadowSize = compact ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = .1;
  sun.shadow.camera.far = 55;
  sun.shadow.normalBias = .018;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 3;
  sun.shadow.blurSamples = 6;
  const fill = new THREE.DirectionalLight('#dceaff', .40);
  fill.name = 'miniature-soft-fill';
  fill.position.set(8, 7, -6);
  scene.add(sky, sun, sun.target, fill);

  let environment: THREE.WebGLRenderTarget | null = null;
  const studio = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    // The small blurred cubemap supplies broad soft highlights on enamel and
    // chrome. Its room never appears in the game, nor costs an ongoing pass.
    environment = generator.fromScene(studio, .10);
    environment.texture.name = 'miniature-softbox-environment';
    scene.environment = environment.texture;
    scene.environmentIntensity = .38;
  } catch {
    // Some low-memory mobile contexts cannot allocate a cubemap. Directional
    // lighting still produces a fully playable scene, with a little more fill.
    sky.intensity = 1.05;
  } finally {
    studio.dispose();
    generator.dispose();
  }

  function setRoomBounds(width: number, height: number) {
    const centerX = (width - 1) / 2;
    const centerZ = (height - 1) / 2 + (mode === 'home' ? .65 : 1.3);
    sun.target.position.set(centerX, .15, centerZ);
    sun.position.set(centerX - 7, 13, centerZ + 6);
    const radius = Math.max(5, width * .54 + 3, height * .54 + 3);
    Object.assign(sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    sun.shadow.needsUpdate = true;
  }
  setRoomBounds(catalogue ? 1 : 10, catalogue ? 1 : 8);
  let disposed = false;
  return {
    sun,
    setRoomBounds,
    setAtmosphere(value) {
      const evening=value==='evening',rain=value==='rain',night=value==='night';
      sun.color.set(night?'#ffd096':evening?'#ffd2a0':rain?'#dce8f3':'#ffe6be');
      // Keep the work surface readable at night; the scenery supplies the contrast.
      sun.intensity=night?1.65:evening?2.35:rain?2.15:mode==='truck'?3:3.25;
      sky.color.set(night?'#869eb9':evening?'#d9def2':rain?'#d8e7f0':'#eaf2ff');
      sky.intensity=environment?(night?.38:rain?.85:evening?.70:.58):1.05;
      fill.intensity=night?.32:evening?.55:rain?.65:.4;
      scene.environmentIntensity=night?.18:evening?.32:rain?.30:.38;
      renderer.toneMappingExposure=evening?.98:.97;
    },
    setQuality(value) {
      const budget=QUALITY_BUDGETS[value];
      renderer.shadowMap.enabled=!catalogue&&budget.shadows;
      // Remove the light's shadow from the shader layout too. Merely disabling
      // map updates can retain the previous projection when changing quality.
      sun.castShadow=!catalogue&&budget.shadows;
      if(sun.shadow.mapSize.x!==budget.shadowSize){
        sun.shadow.map?.dispose();sun.shadow.map=null;
        sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;
        sun.shadow.mapSize.set(budget.shadowSize,budget.shadowSize);
      }
      sun.shadow.blurSamples=value==='high'?6:3;
      sun.shadow.needsUpdate=true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(sky, sun, sun.target, fill);
      sun.shadow.dispose();
      if (scene.environment === environment?.texture) {
        scene.environment = previousEnvironment;
        scene.environmentIntensity = previousIntensity;
      }
      environment?.dispose();
      renderer.toneMapping = previousToneMapping;
      renderer.toneMappingExposure = previousExposure;
      renderer.shadowMap.enabled = previousShadows;
      renderer.shadowMap.type = previousShadowType;
    },
  };
}
