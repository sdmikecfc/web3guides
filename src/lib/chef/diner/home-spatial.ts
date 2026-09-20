import type { Point } from './types';

export const HOME_TERRACE_DEPTH=3;
export const HOME_INTERIOR_ELEVATION=.095;
export const HOME_TERRACE_ELEVATION=.035;

/** Physical visual board. The owned restaurant grid is never expanded by this. */
export function homeSpatial(width:number,height:number){
  const doorX=Math.floor(width/2);
  return {
    interior:{x:0,y:0,w:width,h:height,elevation:HOME_INTERIOR_ELEVATION},
    terrace:{x:0,y:height,w:width,h:HOME_TERRACE_DEPTH,elevation:HOME_TERRACE_ELEVATION},
    door:{x:doorX,y:height-1},
    threshold:{minX:doorX-.56,maxX:doorX+.56,minY:height-.66,maxY:height-.34,elevation:HOME_INTERIOR_ELEVATION},
    bounds:{minX:-.63,maxX:width-.37,minY:-.63,maxY:height+HOME_TERRACE_DEPTH-.37},
    context:{
      parcel:{x:0,y:height+2},collections:{x:1,y:height+2},
      binder:{x:width-2,y:height+2},till:{x:width-1,y:height+2},
    },
    regular:{x:doorX-2,y:height+1},
    approach:[{x:doorX,y:height},{x:doorX,y:height+1},{x:doorX,y:height+2}],
  };
}

/** Null means unsupported. This never clamps or changes a simulation position. */
export function homeSupportAt(width:number,height:number,x:number,y:number):{zone:'interior'|'threshold'|'terrace';elevation:number}|null{
  const space=homeSpatial(width,height),step=space.threshold;
  if(x>=step.minX&&x<=step.maxX&&y>=step.minY&&y<=step.maxY)return {zone:'threshold',elevation:step.elevation};
  if(x<-.5||x>width-.5||y<-.5)return null;
  if(y<height-.5)return {zone:'interior',elevation:HOME_INTERIOR_ELEVATION};
  if(y<=height+HOME_TERRACE_DEPTH-.5)return {zone:'terrace',elevation:HOME_TERRACE_ELEVATION};
  return null;
}

/** Choose a reachable, unoccupied chore location without changing navigation. */
export function chooseHomeInteractionTile({width,height,blocked,reserved=[],preferred}:{width:number;height:number;blocked:readonly Point[];reserved?:readonly Point[];preferred:Point}):Point|null{
  const key=(p:Point)=>`${p.x},${p.y}`,occupied=new Set(blocked.map(key)),excluded=new Set(reserved.map(key));
  const door=homeSpatial(width,height).door;
  const walkable=(p:Point)=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<width&&p.y<height&&!occupied.has(key(p));
  if(!walkable(door))return null;
  const queue:Point[]=[door],seen=new Set([key(door)]),candidates:Point[]=[];
  for(let i=0;i<queue.length;i++){
    const current=queue[i];
    if(key(current)!==key(door)&&!excluded.has(key(current)))candidates.push(current);
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const next={x:current.x+dx,y:current.y+dy};if(walkable(next)&&!seen.has(key(next))){seen.add(key(next));queue.push(next);}}
  }
  candidates.sort((a,b)=>(Math.abs(a.x-preferred.x)+Math.abs(a.y-preferred.y))-(Math.abs(b.x-preferred.x)+Math.abs(b.y-preferred.y))||a.y-b.y||a.x-b.x);
  return candidates[0]??null;
}
