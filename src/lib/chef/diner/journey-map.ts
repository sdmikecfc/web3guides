import type { DinerNode, NodeKind } from './progression';

/** Three committed roads, with an occasional local fork inside each corridor. */
export function openRoadJourney(seed:string):DinerNode[]{
  let value=2166136261;for(const char of `${seed}:journey-v7`)value=Math.imul(value^char.charCodeAt(0),16777619);
  const roll=(max:number)=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)%max;};
  const names:Record<NodeKind,string>={slow:'Relaxed Lunch',medium:'Steady Lunch',busy:'Lunch Rush',special:'Chef’s Challenge',shop:'Equipment market',event:'Roadside encounter',bonus:'Roadside gift',ingredients:'Farm stand',finale:'The grand finale'};
  const rows:DinerNode[][]=[];
  const add=(kinds:NodeKind[])=>{const row=rows.length,nodes=kinds.map((kind,column)=>({id:`r${row}c${column}`,row,column,kind,next:[] as string[],name:names[kind],...(['event','ingredients'].includes(kind)?{mystery:true}:{})}));rows.push(nodes);return nodes;};
  const linkAll=(a:DinerNode[],b:DinerNode[])=>a.forEach(n=>n.next=b.map(n=>n.id));
  for(const kind of ['slow','slow','medium','shop'] as NodeKind[]){const last=rows.at(-1),next=add([kind]);if(last)linkAll(last,next);}
  for(let block=0;block<2;block++){
    const templates:Array<[NodeKind,NodeKind,NodeKind]>=[['medium','shop','busy'],['busy','bonus','medium'],[block?'special':'slow','event','special']];
    // Fisher-Yates affects whole corridors; each keeps a different opportunity.
    for(let i=2;i>0;i--){const j=roll(i+1);[templates[i],templates[j]]=[templates[j],templates[i]];}
    const starts=add(templates.map(t=>t[0]));linkAll(rows[rows.length-2],starts);
    const fork=roll(3),withFork=roll(3)!==0;
    const middleKinds:NodeKind[]=[],owners:number[]=[];
    templates.forEach((t,lane)=>{middleKinds.push(t[1]);owners.push(lane);if(withFork&&lane===fork){middleKinds.push(t[1]==='shop'?'bonus':'shop');owners.push(lane);}});
    const middles=add(middleKinds),ends=add(templates.map(t=>t[2]));
    starts.forEach((n,lane)=>n.next=middles.filter((_,i)=>owners[i]===lane).map(n=>n.id));
    middles.forEach((n,i)=>n.next=[ends[owners[i]].id]);
  }
  const rest=add([roll(2)?'event':'bonus']);linkAll(rows[rows.length-2],rest);const finale=add(['finale']);linkAll(rest,finale);
  return rows.flat();
}

/** Three-stop corridors: a choice spends future opportunities, not just a click. */
export function branchingJourney(seed: string): DinerNode[] {
  let value = 2166136261;
  for (const char of `${seed}:journey-v6`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  const flip = () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) % 2 === 0; };
  const first: NodeKind[][] = [['medium', 'busy'], ['event', 'shop'], ['busy', 'medium']];
  const second: NodeKind[][] = [['busy', 'medium'], ['bonus', 'shop'], ['special', 'busy']];
  if (flip()) first.forEach(row => row.reverse());
  if (flip()) second.forEach(row => row.reverse());
  const kinds: NodeKind[][] = [['slow'], ['slow'], ['medium'], ['shop'], ...first, ...second, [flip() ? 'event' : 'bonus'], ['finale']];
  const names: Record<NodeKind, string> = {slow:'Relaxed Lunch',medium:'Steady Lunch',busy:'Lunch Rush',special:'Chef’s Challenge',shop:'Equipment market',event:'Roadside encounter',bonus:'Roadside gift',ingredients:'Farm stand',finale:'The grand finale'};
  const rows = kinds.map((row, index) => row.map((kind, column): DinerNode => ({
    id:`r${index}c${column}`,row:index,column,kind,next:[],name:names[kind],
    ...(['event','bonus'].includes(kind) ? { mystery:true } : {}),
  })));
  for (let index = 0; index < rows.length - 1; index++) {
    const next = rows[index + 1], committed = [4, 5, 7, 8].includes(index);
    for (const node of rows[index]) node.next = committed ? [next[node.column].id] : next.map(n => n.id);
  }
  return rows.flat();
}

export function readableStopName(name: string): string {
  return name.replaceAll('Chefâ€™s', 'Chef’s');
}
