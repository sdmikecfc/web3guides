import { EQUIPMENT_BY_ID, RECIPE_BY_ID, TRUCK_TIERS } from './content';
import type { DinerTier, Point, ServiceStation, ServiceTable, StationKind } from './types';

export const pointKey = (p: Point): string => `${p.x},${p.y}`;
export function serviceGeometry(tier: DinerTier = 1) {
  const t = TRUCK_TIERS[tier];
  return { truck:{x:0,y:0,w:t.w,h:t.h},door:{x:1,y:t.h-1},ramp:{x:1,y:t.h},pavement:{x:-1,y:t.h+1,w:t.pavementW,h:t.pavementH},queue:{x:-1,y:t.h+1},exit:{x:-1,y:t.h+t.pavementH} };
}
export function inServiceFloor(tier: DinerTier, p: Point): boolean {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
  const g = serviceGeometry(tier);
  return (p.x >= 0 && p.x < g.truck.w && p.y >= 0 && p.y < g.truck.h) || (p.x === g.ramp.x && p.y === g.ramp.y) || (p.x >= g.pavement.x && p.x < g.pavement.x + g.pavement.w && p.y >= g.pavement.y && p.y < g.pavement.y + g.pavement.h);
}
export function stationFootprint(station: Pick<ServiceStation,'kind'|'x'|'y'|'facing'>): Point[] {
  const raw = EQUIPMENT_BY_ID[station.kind]?.footprint ?? [1,1];
  const [w,h] = station.facing % 2 ? [raw[1],raw[0]] : raw;
  return Array.from({length:w*h},(_,i) => ({x:station.x+i%w,y:station.y+Math.floor(i/w)}));
}
export function stationWorkingCell(station: Pick<ServiceStation,'kind'|'x'|'y'|'facing'>):Point {
  const cells=stationFootprint(station),maxX=Math.max(...cells.map(c=>c.x)),maxY=Math.max(...cells.map(c=>c.y));
  return station.facing===0?{x:station.x,y:maxY+1}:station.facing===1?{x:station.x-1,y:station.y}:station.facing===2?{x:station.x,y:station.y-1}:{x:maxX+1,y:station.y};
}
export function tableFootprint(table: Pick<ServiceTable,'x'|'y'|'capacity'> & Partial<Pick<ServiceTable,'rotation'>>): Point[] {
  const originalW=table.capacity===4?2:1,[w,h]=(table.rotation??0)%2?[2,originalW]:[originalW,2];
  return Array.from({length:w*h},(_,i) => ({x:table.x+i%w,y:table.y+Math.floor(i/w)}));
}
export function blockedCells(stations: ServiceStation[],tables: ServiceTable[]): Set<string> { return new Set([...stations.flatMap(stationFootprint),...tables.flatMap(tableFootprint)].map(pointKey)); }
const neighbors = (p:Point):Point[] => [{x:p.x,y:p.y-1},{x:p.x+1,y:p.y},{x:p.x,y:p.y+1},{x:p.x-1,y:p.y}];
export function servicePath(tier: DinerTier,stations: ServiceStation[],tables: ServiceTable[],from:Point,to:Point):Point[] | null {
  const start = {x:Math.round(from.x),y:Math.round(from.y)};
  const blocked = blockedCells(stations,tables);
  if (!inServiceFloor(tier,start) || !inServiceFloor(tier,to) || blocked.has(pointKey(to)) || blocked.has(pointKey(start))) return null;
  const queue:Point[]=[start], previous = new Map<string,Point|null>([[pointKey(start),null]]);
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    if(p.x===to.x && p.y===to.y) {
      const result:Point[]=[]; let q:Point|null=p;
      while(q) { result.push(q); q=previous.get(pointKey(q)) ?? null; }
      result.reverse(); result.shift();
      // Preserve physical centering if a new input arrives midway through a tile.
      if(Math.abs(from.x-start.x)+Math.abs(from.y-start.y)>.001) result.unshift(start);
      return result;
    }
    for(const q of neighbors(p)) if(inServiceFloor(tier,q) && !blocked.has(pointKey(q)) && !previous.has(pointKey(q))) { previous.set(pointKey(q),p); queue.push(q); }
  }
  return null;
}
export function adjacentCells(points: Point[]):Point[] {
  const own=new Set(points.map(pointKey)), seen=new Set<string>();
  return points.flatMap(neighbors).filter(p => !own.has(pointKey(p)) && !seen.has(pointKey(p)) && !!seen.add(pointKey(p)));
}
export function targetPath(tier:DinerTier,stations:ServiceStation[],tables:ServiceTable[],from:Point,footprint:Point[]):Point[] | null {
  let best:Point[]|null=null;
  for(const point of adjacentCells(footprint)) { const path=servicePath(tier,stations,tables,from,point); if(path && (best===null || path.length<best.length)) best=path; }
  return best;
}
export function isAdjacent(point:Point,footprint:Point[]):boolean { return footprint.some(p=>Math.abs(point.x-p.x)+Math.abs(point.y-p.y)<=1.01); }
export function makeStation(id:string,kind:StationKind,x:number,y:number,tier:1|2|3=1,facing:0|1|2|3=0):ServiceStation {
  const capacity = EQUIPMENT_BY_ID[kind]?.tiers[tier-1]?.capacity ?? 1;
  return {id,kind,x,y,tier,facing,slots:Array.from({length:capacity},()=>({item:null,job:null}))};
}
export function makeTable(id:string,x:number,y:number,capacity:2|4=2,tier:1|2=1,rotation:0|1|2|3=0):ServiceTable {
  const w=capacity===4?2:1,h=2;
  const positions=capacity===2?[{x:-1,y:0},{x:1,y:1}]:[{x:-1,y:0},{x:-1,y:1},{x:2,y:0},{x:2,y:1}];
  const rotated=positions.map(p=>rotation===0?p:rotation===1?{x:h-1-p.y,y:p.x}:rotation===2?{x:w-1-p.x,y:h-1-p.y}:{x:p.y,y:w-1-p.x});
  return {id,x,y,capacity,tier,rotation,seats:rotated.map((p,i)=>({x:x+p.x,y:y+p.y,id:`${id}_seat_${i+1}`,status:'clean',customerId:null,mealId:null,item:null}))};
}
export function starterStations(tier:DinerTier=1):ServiceStation[] {
  const t=TRUCK_TIERS[tier];
  return [makeStation('crate','crate',0,0),makeStation('grill','grill',1,0),makeStation('prep','prep',2,0),makeStation('fryer','fryer',3,0),makeStation('sink','sink',0,t.h-1,1,2),makeStation('bin','bin',t.w-1,t.h-1,1,2)];
}
export function starterTables(tier:DinerTier=1):ServiceTable[] {
  const y=TRUCK_TIERS[tier].h+2;
  const positions = tier===1 ? [{x:3,y}] : tier===2 ? [{x:3,y},{x:5,y:y+2}] : tier===3 ? [{x:3,y},{x:6,y},{x:3,y:y+3}] : [{x:3,y},{x:6,y},{x:3,y:y+3},{x:6,y:y+3},{x:0,y:y+3}];
  return positions.map((p,i)=>makeTable(`table_${i+1}`,p.x,p.y));
}
/** Deterministic starter arrangement for the chosen menu; ownership is checked by progression. */
export function buildServiceLoadout(tier:DinerTier,menu:string[],equipmentTiers:Record<string,number>={}):{stations:ServiceStation[];tables:ServiceTable[];error:string|null} {
  const t=TRUCK_TIERS[tier];if(!t)return {stations:[],tables:[],error:'Unknown truck tier.'};
  const kinds:StationKind[]=[];
  for(const recipeId of menu) {
    const recipe=RECIPE_BY_ID[recipeId];if(!recipe)return {stations:[],tables:[],error:'Unknown recipe.'};
    for(const step of recipe.steps)if(!kinds.includes(step.station))kinds.push(step.station);
  }
  const positions:Point[]=[];
  for(let x=1;x<t.w;x++)positions.push({x,y:0});
  for(let x=2;x<t.w-1;x++)positions.push({x,y:t.h-1});
  if(t.h>=4)for(let y=1;y<t.h-1;y++)positions.push({x:0,y},{x:t.w-1,y});
  if(kinds.length>positions.length)return {stations:[],tables:starterTables(tier),error:'This menu needs more stations than your truck can fit. Choose fewer recipes or grow the truck.'};
  const tierFor=(kind:StationKind):1|2|3=>Math.max(1,Math.min(EQUIPMENT_BY_ID[kind].tiers.length,Number.isFinite(equipmentTiers[kind])?Math.floor(equipmentTiers[kind]):1)) as 1|2|3;
  const stations=[makeStation('crate','crate',0,0),...kinds.map((kind,i)=>{const p=positions[i],facing=p.y===0?0:p.y===t.h-1?2:p.x===0?3:1;return makeStation(kind,kind,p.x,p.y,tierFor(kind),facing);}),makeStation('sink','sink',0,t.h-1,tierFor('sink'),2),makeStation('bin','bin',t.w-1,t.h-1,1,2)];
  const tables=starterTables(tier);return {stations,tables,error:validateServiceLayout(tier,stations,tables)};
}
/** Layout editing and replay validation use the exact same navigation grid. */
export function validateServiceLayout(tier:DinerTier,stations:ServiceStation[],tables:ServiceTable[]):string|null {
  if(!TRUCK_TIERS[tier]) return 'Unknown truck tier.';
  if(stations.length>40 || tables.length<1 || tables.length>TRUCK_TIERS[tier].tables) return 'This truck cannot hold that many fixtures.';
  const g=serviceGeometry(tier), used=new Set<string>(),ids=new Set<string>();
  for(const station of stations) {
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(station.id) || ids.has(station.id) || !['crate','grill','prep','fryer','sink','bin','oven','blender','coffee','drinks','waffle','pass'].includes(station.kind) || !EQUIPMENT_BY_ID[station.kind]?.tiers[station.tier-1] || !Number.isInteger(station.facing) || station.facing<0 || station.facing>3 || ![1,2,3].includes(station.tier)) return 'Invalid station.';
    ids.add(station.id);
    for(const p of stationFootprint(station)) {
      if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>=g.truck.w||p.y>=g.truck.h||used.has(pointKey(p))||(p.x===g.door.x&&p.y===g.door.y)) return 'Keep stations inside the truck and leave the door clear.';
      used.add(pointKey(p));
    }
  }
  for(const table of tables) {
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(table.id)||ids.has(table.id)||![1,2].includes(table.tier)||![0,1,2,3].includes(table.rotation??0)||![2,4].includes(table.capacity)||table.seats.length!==table.capacity) return 'Invalid table.';
    ids.add(table.id);
    for(const p of tableFootprint(table)) {
      if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<g.pavement.x+1||p.x>=g.pavement.x+g.pavement.w||p.y<g.pavement.y||p.y>=g.pavement.y+g.pavement.h||used.has(pointKey(p))) return 'Keep tables on the pavement and leave the queue clear.';
      used.add(pointKey(p));
    }
    const expected=makeTable(table.id,table.x,table.y,table.capacity,table.tier,table.rotation??0);
    for(let i=0;i<table.seats.length;i++) if(table.seats[i].id!==expected.seats[i].id||table.seats[i].x!==expected.seats[i].x||table.seats[i].y!==expected.seats[i].y) return 'Invalid seat positions.';
  }
  for(const required of ['crate','sink','bin']) if(!stations.some(s=>s.kind===required)) return `Add a ${required}.`;
  for(const station of stations) if(!servicePath(tier,stations,tables,g.door,stationWorkingCell(station))) return `Leave a clear path to the front of the ${EQUIPMENT_BY_ID[station.kind].name.toLowerCase()}.`;
  for(const table of tables) for(const seat of table.seats) if(!servicePath(tier,stations,tables,g.door,seat)) return 'Every seat needs a clear route to the truck.';
  if(!servicePath(tier,stations,tables,g.door,g.queue)) return 'Keep the pavement entrance clear.';
  return null;
}
