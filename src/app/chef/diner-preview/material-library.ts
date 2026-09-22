import * as THREE from 'three';

/** Material response, independent of a player's chosen paint colour. */
export type MiniatureSurface = 'paint' | 'ceramic' | 'wood' | 'metal' | 'fabric' | 'food' | 'skin' | 'leaf';

const SURFACES: Record<MiniatureSurface, { roughness: number; metalness: number; envMapIntensity: number }> = {
  paint: { roughness: .57, metalness: 0, envMapIntensity: .72 },
  ceramic: { roughness: .31, metalness: 0, envMapIntensity: .85 },
  wood: { roughness: .76, metalness: 0, envMapIntensity: .46 },
  metal: { roughness: .36, metalness: .52, envMapIntensity: .95 },
  fabric: { roughness: .94, metalness: 0, envMapIntensity: .30 },
  food: { roughness: .66, metalness: 0, envMapIntensity: .50 },
  skin: { roughness: .79, metalness: 0, envMapIntensity: .42 },
  leaf: { roughness: .72, metalness: 0, envMapIntensity: .48 },
};

// Exact original kit colours only: a player's new wall colour must not suddenly
// become metal, and skin/burger browns must not be inferred to be varnished wood.
const KIT_SURFACES: Record<string, MiniatureSurface> = {
  '#fff9ee': 'ceramic', '#f7f2e6': 'ceramic', '#fff8e9': 'ceramic',
  '#bdcdc7': 'metal', '#647e77': 'metal',
  '#876647': 'wood', '#c59a6c': 'wood', '#78644e': 'wood', '#806b4c': 'wood',
  '#dfad62': 'food', '#cc9450': 'food', '#f2d099': 'food',
  '#785039': 'food', '#b65c53': 'food',
  '#e4b38e': 'skin',
  '#668b55': 'leaf', '#608b61': 'leaf', '#81a875': 'leaf', '#9ab983': 'leaf',
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared originals are immutable. Clone before changing colour, alpha or maps. */
export function miniatureMaterial(color: string, surface?: MiniatureSurface): THREE.MeshStandardMaterial {
  const resolved = surface ?? KIT_SURFACES[color.toLowerCase()] ?? 'paint';
  const key = `${resolved}:${color.toLowerCase()}`;
  let result = materials.get(key);
  if (!result) {
    result = new THREE.MeshStandardMaterial({ color, ...SURFACES[resolved] });
    result.name = `miniature-${resolved}-${color}`;
    result.userData.sharedKitResource = true;
    result.userData.miniatureSurface = resolved;
    materials.set(key, result);
  }
  return result;
}

export function miniatureMaterialCount(): number { return materials.size; }
