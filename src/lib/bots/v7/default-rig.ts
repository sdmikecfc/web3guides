import data from './rig-data.json';
import {registerRigManifestV7} from './rig';
import type {RigManifestV7} from './types';
export const DEFAULT_RIG_V7=registerRigManifestV7(data as unknown as RigManifestV7);
