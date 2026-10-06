import type {Build} from './types';
export const fighterArtKey=(build:Pick<Build,'style'|'tier'|'boss'>)=>build.boss?(build.tier===4?'overload':'sovereign'):`${build.style}${build.tier>1?`-t${build.tier}`:''}`;
export function fighterSheets(build:Build){const key=fighterArtKey(build);return[`${key}-jab`,`${key}-motion`,`${key}-combat`,`${key}-special`,...(key==='tank'?['tank-walk']:[])];}
