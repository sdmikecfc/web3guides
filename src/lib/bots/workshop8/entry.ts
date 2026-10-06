import type { Workshop8 } from './state';

export const PLAY_ENTRY_URL='/bots/play';
export const BUILD_ENTRY_URL='/bots/workshop?view=build&entry=build';
export const ARCADE_ENTRY_URL='/bots/arcade';
/** Published legacy Play links resume owned progress without creating a save. */
export function playEntry(state:Pick<Workshop8,'active'|'draft'|'robots'>|null){
 if(state?.active)return {room:'fight' as const,intro:false};
 if(state?.draft)return {room:'build' as const,intro:false};
 if(state?.robots.length)return {room:'garage' as const,intro:false};
 return {room:'build' as const,intro:false};
}
