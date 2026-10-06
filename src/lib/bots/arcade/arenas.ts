/** Presentation only. Every arena uses the same deterministic fighting lane. */
export const ARENAS = [
 {id:'reactor',name:'Reactor Pit',file:'reactor.png',description:'Amber reactor light and rising steam.'},
 {id:'salvage',name:'Neon Salvage Dock',file:'salvage-dock.png',description:'Rain, neon and the bones of a starship.'},
 {id:'hangar',name:'Frozen Orbital Hangar',file:'orbital-hangar.png',description:'An icy planet beyond the hangar doors.'},
] as const;
export type ArenaId = typeof ARENAS[number]['id'];
export function arenaDefinition(value:unknown){return ARENAS.find(arena=>arena.id===value)??ARENAS[0];}
