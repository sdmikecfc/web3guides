import { dishDef } from "./cookbook";
import { interactionCells, itemDef } from "./items";
import type { Grid } from "./path";
import type { PlacedItem } from "./world";

export interface EquipmentInstance { uid: number; itemId: string; condition: number }
export interface EquipmentState { instances: Record<string, EquipmentInstance> }
export interface OperatingStation { uid: number; itemId: string; machine: string; x: number; y: number; gx: number; gy: number; condition: number; dishes: string[] }
export interface KitchenOperations { stations: OperatingStation[]; menu: string[]; unavailable: { uid: number; reason: "broken" | "blocked" }[] }
export const EQUIPMENT_RULES = { version: 1, wearPerPlate: 0.12 } as const;
/** Shared permanent truck technology also improves the bot-run home kitchen. */
export const HOME_TECHNOLOGY_RULES = { version: 1, cookPerLevel: 0.12, prepPerLevel: 0.06, servicePerLevel: 0.08 } as const;
export function homeTechnology(levels: Partial<Record<"cook" | "prep" | "service", number>> = {}) {
  const level = (key: "cook" | "prep" | "service") => Number.isFinite(levels[key]) ? Math.max(0, Math.min(3, Math.floor(levels[key]!))) : 0;
  return {
    cook: 1 + HOME_TECHNOLOGY_RULES.cookPerLevel * level("cook") + HOME_TECHNOLOGY_RULES.prepPerLevel * level("prep"),
    service: 1 + HOME_TECHNOLOGY_RULES.servicePerLevel * level("service"),
  };
}

/** Selling consumes the same oldest/worn stored instance that placing would use. */
export function sellStoredEquipment(equipment:EquipmentState,layout:{uid?:number}[],itemId:string) {
  const instance=Object.values(equipment.instances).filter(e=>e.itemId===itemId&&!layout.some(p=>p.uid===e.uid)).sort((a,b)=>a.condition-b.condition||a.uid-b.uid)[0];
  if(instance)delete equipment.instances[String(instance.uid)];
}

/** Stable IDs also persist while a machine sits in storage. */
export function sanitizeEquipment(raw: unknown): EquipmentState {
  const value = raw && typeof raw === "object" ? (raw as EquipmentState).instances : null;
  const instances: EquipmentState["instances"] = {};
  if (value && typeof value === "object") for (const entry of Object.values(value).slice(0, 1000)) {
    if (!entry || !Number.isSafeInteger(entry.uid) || entry.uid < 1 || entry.uid > 1_000_000 || itemDef(entry.itemId)?.kind !== "stove") continue;
    instances[String(entry.uid)] = { uid: entry.uid, itemId: entry.itemId, condition: Number.isFinite(entry.condition) ? Math.max(0, Math.min(100, entry.condition)) : 100 };
  }
  return { instances };
}

/** Reuse existing identities by item type even when a legacy editor omits IDs. */
export function reconcileEquipmentLayout<T extends { uid?: number; itemId: string }>(layout: T[], previous: EquipmentState): (T & { uid: number })[] {
  const used = new Set<number>();
  const reserved=new Set([...Object.values(previous.instances).map(e=>e.uid),...layout.map(p=>p.uid??0)]);
  let next = 1;
  const allocate=()=>{while(reserved.has(next)||used.has(next))next++;const uid=next++;reserved.add(uid);return uid;};
  return layout.map(p => {
    const machine = itemDef(p.itemId)?.kind === "stove";
    let uid = p.uid;
    if(uid&&(!Number.isSafeInteger(uid)||uid<1||uid>1_000_000||(!machine&&previous.instances[String(uid)])))uid=undefined;
    if (machine && (!uid || !previous.instances[String(uid)] || previous.instances[String(uid)].itemId !== p.itemId || used.has(uid))) {
      // Lowest condition first prevents anonymous storage placement from repairing a machine.
      uid = Object.values(previous.instances).filter(e => e.itemId === p.itemId && !used.has(e.uid)).sort((a,b)=>a.condition-b.condition||a.uid-b.uid)[0]?.uid;
    }
    if (!uid || used.has(uid)) uid = allocate();
    used.add(uid);
    if (machine && !previous.instances[String(uid)]) previous.instances[String(uid)] = { uid, itemId: p.itemId, condition: 100 };
    return { ...p, uid };
  });
}

export function deriveKitchenOperations(layout: PlacedItem[], grid: Grid, door: {x:number;y:number}, equipment: EquipmentState, dishIds: string[]): KitchenOperations {
  const reach = new Uint8Array(grid.w * grid.h), queue = [door.y * grid.w + door.x];
  if (grid.cells[queue[0]] === 0) reach[queue[0]] = 1;
  else return { stations: [], menu: [], unavailable: [] };
  for (let i=0;i<queue.length;i++) {
    const n=queue[i],x=n%grid.w,y=Math.floor(n/grid.w);
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const nx=x+dx,ny=y+dy,k=ny*grid.w+nx;
      if(nx<0||ny<0||nx>=grid.w||ny>=grid.h||reach[k]||grid.cells[k]!==0)continue;
      reach[k]=1;queue.push(k);
    }
  }
  const stations:OperatingStation[]=[],unavailable:KitchenOperations["unavailable"]=[];
  const hasPass=layout.some(p=>itemDef(p.itemId)?.kind==="counter"&&interactionCells(p.itemId,p.gx,p.gy,p.facing).some(c=>c.x>=0&&c.y>=0&&c.x<grid.w&&c.y<grid.h&&!!reach[c.y*grid.w+c.x]));
  for(const p of layout) {
    const def=itemDef(p.itemId);if(def?.kind!=="stove")continue;
    const machine=def.machine??"stove",condition=equipment.instances[String(p.uid)]?.condition??100;
    const work=interactionCells(p.itemId,p.gx,p.gy,p.facing).find(c=>c.x>=0&&c.y>=0&&c.x<grid.w&&c.y<grid.h&&!!reach[c.y*grid.w+c.x]);
    if(condition<=0||!work||!hasPass){unavailable.push({uid:p.uid,reason:condition<=0?"broken":"blocked"});continue;}
    const dishes=dishIds.filter(id=>(dishDef(id)?.machine??"stove")===machine);
    // A machine itself unlocks its product, including migrated or gifted machines.
    if(machine==="fryer"&&!dishes.includes("fries"))dishes.push("fries");
    if(machine==="drinks"&&!dishes.includes("lemonade"))dishes.push("lemonade");
    stations.push({uid:p.uid,itemId:p.itemId,machine,x:work.x,y:work.y,gx:p.gx,gy:p.gy,condition,dishes});
  }
  return {stations,menu:Array.from(new Set(stations.flatMap(s=>s.dishes))),unavailable};
}
