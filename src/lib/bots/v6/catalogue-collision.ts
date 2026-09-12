import data from './catalogue-collision-data.json';
import { registerCollisionManifestV6, type CollisionManifestV6 } from './collision';

/** Measured, versioned attachment and contact geometry from the local Blender catalogue. */
export const CATALOGUE_COLLISION_VERSION_V6 = 'mk6-collision-catalogue-1';
export const CATALOGUE_COLLISION_V6 = registerCollisionManifestV6(data as unknown as CollisionManifestV6);
