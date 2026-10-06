export const TRUCK_PAINTS = [
  { id: "sage", label: "Garden sage", color: "#7eaa8b", shade: "#5f8870" },
  { id: "tomato", label: "Tomato red", color: "#d68268", shade: "#b66050" },
  { id: "sunshine", label: "Vanilla cream", color: "#e6cc91", shade: "#c9a968" },
  { id: "sky", label: "Coastal blue", color: "#82b3be", shade: "#568b9a" },
];
const INK = "#6d5945";
const iso = (x: number, y: number, z = 0) => ({ x: (x-y)*38, y: (x+y)*19-z });
const polygon = (points: Array<{ x:number; y:number }>) => points.map(p=>`${p.x},${p.y}`).join(" ");
function plane(points: Array<[number,number,number]>) { return polygon(points.map(([x,y,z])=>iso(x,y,z))); }
function Box({x=0,y=0,w=.84,d=.84,h=34,top="#fff2cf",front="#d6b68a",side="#b89468"}:{x?:number;y?:number;w?:number;d?:number;h?:number;top?:string;front?:string;side?:string}) {
  const a=x-w/2,b=x+w/2,c=y-d/2,e=y+d/2;
  return <g stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
    <polygon points={plane([[a,e,0],[b,e,0],[b,e,h],[a,e,h]])} fill={front}/>
    <polygon points={plane([[b,c,0],[b,e,0],[b,e,h],[b,c,h]])} fill={side}/>
    <polygon points={plane([[a,c,h],[b,c,h],[b,e,h],[a,e,h]])} fill={top}/>
  </g>;
}
export function TruckDishArt({dish="pasta",size=64,held=false}:{dish?:string;size?:number;held?:boolean}) {
  const salad=dish.includes("salad")||dish.includes("leaf")||dish.includes("vegetable");
  const fries=dish.includes("fries")||dish.includes("potato");
  const drink=dish.includes("drink")||dish.includes("cup");
  const dirty=dish.includes("dirty");
  const plain=dish==="plate"||dish==="clean_plate"||dish==="bowl";
  const raw=dish.startsWith("raw_")||dish==="cut_potato",cup=dish==="cup"||dish==="lemon_cup",unplated=dish.startsWith("cooked_")||dish==="chopped_salad"||dish==="sauced_pasta";
  if(raw||dish==="sauce"||dish==="burnt")return <svg width={size} height={size*.75} viewBox="0 0 80 60" aria-hidden="true" style={{display:"block"}}><ellipse cx="40" cy="46" rx="27" ry="7" fill="#806747" opacity=".12"/>{dish==="raw_pasta"?<g strokeLinecap="round">{[0,1,2,3,4,5,6].map(i=><path key={i} d={`M${25+i*4} ${17+i%2*4}l-4 28`} stroke={i%2?"#e5bc68":"#f4d48d"} strokeWidth="4"/>)}<path d="m20 32 33 5" stroke="#c17b52" strokeWidth="7"/></g>:dish==="raw_salad"?<g>{[[-11,0,-35],[0,-9,0],[10,1,30]].map(([x,y,r],i)=><g key={i} transform={`rotate(${r} ${40+x} ${30+y})`}><ellipse cx={40+x} cy={30+y} rx="10" ry="17" fill={i%2?"#a1ba67":"#739b55"} stroke="#587e42"/><path d={`M${40+x} ${17+y}v28`} stroke="#c8d59a" strokeWidth="2"/></g>)}</g>:dish==="raw_tomato"?<g><ellipse cx="39" cy="34" rx="22" ry="17" fill="#de7855" stroke="#b76445" strokeWidth="1.5"/><path d="m39 22-13-7 10 0 4-10 4 12 13-2-12 9Z" fill="#67914e"/><ellipse cx="29" cy="29" rx="5" ry="3" fill="#efa084"/></g>:dish==="raw_potato"?<g><ellipse cx="40" cy="32" rx="23" ry="17" transform="rotate(-20 40 32)" fill="#c9a267" stroke="#9d7a4f" strokeWidth="1.5"/>{[[27,29],[45,22],[52,36],[36,41]].map(([x,y],i)=><path key={i} d={`m${x} ${y} 2 1`} stroke="#9b7c53" strokeWidth="2" strokeLinecap="round"/>)}</g>:dish==="cut_potato"?<g>{[0,1,2,3,4].map(i=><path key={i} d={`M${23+i*7} ${25+i%2*5}l-4 18`} stroke="#f0d48a" strokeWidth="7" strokeLinecap="round"/>)}</g>:dish==="sauce"?<g><path d="M14 29q2 22 26 22t26-22" fill="#e0b385" stroke={INK} strokeWidth="1.5"/><ellipse cx="40" cy="29" rx="26" ry="11" fill="#f7deba" stroke={INK}/><ellipse cx="40" cy="29" rx="21" ry="7" fill="#ce7151"/><path d="m32 25 6 2m7 2 5-3" stroke="#ed9b6e" strokeWidth="2"/></g>:<g><ellipse cx="40" cy="37" rx="27" ry="11" fill="#73604c"/><path d="m18 34 7-9 9 4 8-9 10 8 12-2-4 12-30 5Z" fill="#4e4c3f"/><path d="M29 16q-8-7 0-13m15 15q7-9 0-13" stroke="#a3a08c" fill="none" strokeWidth="2"/></g>}</svg>;
  return <svg width={size} height={size*.75} viewBox="0 0 80 60" aria-hidden="true" style={{display:"block",overflow:"visible"}}>
    <ellipse cx="40" cy="46" rx="31" ry="8" fill="#806747" opacity=".12"/>
    {drink?<><path d="M26 18h29l-4 28q-10 6-21 0Z" fill={cup?"#eee9d5":"#f1d3a1"} stroke={INK} strokeWidth="2"/><ellipse cx="40" cy="18" rx="15" ry="6" fill="#f8f0d9" stroke={INK} strokeWidth="2"/><ellipse cx="40" cy="18" rx="11" ry="3.6" fill={cup?"#c6ccb5":"#e9bd60"}/>{!cup&&<><path d="m44 16 4-13" stroke="#7d9e7c" strokeWidth="3"/><circle cx="27" cy="20" r="7" fill="#f2d987" stroke="#ddba5d"/><path d="m23 17 8 6m-8 0 8-6" stroke="#fff1bd"/></>}{dish==="lemon_cup"&&<circle cx="27" cy="21" r="7" fill="#f2d987" stroke="#ddba5d"/>}</>:
    fries?<><path d="m23 28 5 22h26l5-22Z" fill="#cf7559" stroke={INK} strokeWidth="2"/>{[0,1,2,3,4].map(i=><path key={i} d={`M${27+i*6} 32l${i%2?3:-1}-20`} stroke="#efd177" strokeWidth="5" strokeLinecap="round"/>)}<path d="M29 36q13 10 25-1" fill="none" stroke="#f7ddab" strokeWidth="2"/></>:
    <><ellipse cx="40" cy="38" rx="33" ry="14" fill={unplated?"#b4c0ad":"#d6ceb1"} stroke={INK} strokeWidth="1.5"/><ellipse cx="40" cy="33" rx="34" ry="14" fill={unplated?"#d2dbc5":"#fff9e4"} stroke={INK} strokeWidth="1.5"/><ellipse cx="40" cy="33" rx="26" ry="9" fill="none" stroke="#ded1ab"/>
    {dirty?<><path d="m25 34 9-5m8 8 12-3M42 27l7 2" stroke="#b7855b" strokeWidth="3" strokeLinecap="round"/><ellipse cx="32" cy="31" rx="3" ry="1.7" fill="#94a56b"/></>:plain?null:salad?<>
      {[[-15,-2,-25],[-5,-8,20],[9,-7,-20],[18,1,35],[4,3,-15],[-7,3,30]].map(([x,y,a],i)=><ellipse key={i} cx={40+x} cy={29+y} rx="10" ry="6" fill={i%2?"#8eaf64":"#689652"} stroke="#557c46" strokeWidth=".8" transform={`rotate(${a} ${40+x} ${29+y})`}/>)}
      {[[28,30],[43,22],[52,34]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="5" ry="3.8" fill="#dd7857" stroke="#b85b42"/>)}</>:
      <><ellipse cx="40" cy="31" rx="24" ry="10" fill="#dfb469"/>{[0,1,2,3].map(i=><path key={i} d={`M${21+i*3} ${28+i*3}c-2-8 19-16 32-5s-12 17-18 6 19-7 23 0`} fill="none" stroke={i%2?"#f7d887":"#ffe6a5"} strokeWidth="3.3" strokeLinecap="round"/>)}{dish!=="cooked_pasta"&&<path d="M30 23q12-8 25 3l-6 7-16-1Z" fill="#d87654"/>}<path d="M40 24q-14-13-13-1 4 8 13 1m0 0q7-15 12-7 0 8-12 7" fill="#67904f"/></>}
    </>}
    {held&&<circle cx="68" cy="9" r="6" fill="#fff7dc"/>}
  </svg>;
}

export interface TruckArtStation { id:number; machineId:string; x:number; y:number; facing:number; food?:string|null; progress?:number; label:string; selected?:boolean; disabled?:boolean }
export interface TruckArtPerson { x:number; y:number; facing?:number; held?:string|null; working?:boolean; moving?:boolean; helper?:boolean }
export interface TruckArtCustomer { id:number; dish:string; patience:number; maxPatience:number }
export interface TruckWorldArtProps {
  width:number; height:number; paint:string; sign:string; stations:TruckArtStation[];
  player:TruckArtPerson; helpers?:TruckArtPerson[]; customers:TruckArtCustomer[];
  setup:boolean; onStation:(id:number)=>void; onTile:(x:number,y:number)=>void;
  onGroundKey?:(key:string)=>void; paused?:boolean;
}

function Plant({x,y,small=false}:{x:number;y:number;small?:boolean}) { return <g transform={`translate(${x} ${y}) scale(${small?.7:1})`}><ellipse cy="5" rx="14" ry="6" fill="#776044" opacity=".1"/><path d="m-10-13 3 17h14l3-17Z" fill="#d98d6b" stroke={INK} strokeWidth="1.3"/><ellipse cy="-13" rx="11" ry="4" fill="#b87757"/>{[-1,0,1].map((v,i)=><path key={i} d={`M0-14Q${v*32-8}-39 ${v*8}-46Q${v*26+14}-36 0-14Z`} fill={i%2?"#7e9c60":"#5d8456"} stroke="#577148" strokeWidth="1"/>)}</g>; }

function Person({person}:{person:TruckArtPerson}) {
  const rear=person.facing===2||person.facing===3;
  return <g aria-hidden="true">
    <ellipse cy="2" rx="14" ry="6" fill="#5f6545" opacity=".13"/>
    <path d="M-8-13-9 0M7-13 9 0" stroke="#615747" strokeWidth="7" strokeLinecap="round"/>
    <path d="M-12-38Q0-43 12-38L14-13Q0-6-14-13Z" fill={person.helper?"#dbac67":"#f5edd3"} stroke={INK} strokeWidth="1.2"/>
    <path d="M-8-36h16v24q-8 3-16 0Z" fill={person.helper?"#bb7452":"#739981"}/>
    <path d={person.held?"M-12-30-14-19 0-19M12-30 15-20 3-18":"M-12-33-17-21M12-33 17-21"} fill="none" stroke="#d6a17a" strokeWidth="6" strokeLinecap="round"/>
    <ellipse cy="-49" rx="14" ry="16" fill="#e6b790" stroke={INK} strokeWidth="1.1"/>
    {rear?<path d="M-14-52q0-18 14-14 16-1 14 19l-6-7-7 4-7-7Z" fill="#83664e"/>:<><path d="M-13-56q-2-14 14-11 12-3 13 12l-7-4-6 5-6-5Z" fill="#87624a"/><circle cx="-5" cy="-49" r="1.5" fill="#5e4937"/><circle cx="6" cy="-49" r="1.5" fill="#5e4937"/><ellipse cx="-9" cy="-44" rx="3" ry="1.6" fill="#d9917f" opacity=".65"/><path d="M-3-42q4 4 8-1" fill="none" stroke="#925e49" strokeWidth="1.4" strokeLinecap="round"/></>}
    <path d="M-12-63Q-23-68-14-77q5-6 12-1 6-10 14-3 8 0 7 9 6 8-6 10v7h-25Z" fill="#fffaf0" stroke="#b7a88d" strokeWidth="1.2"/><path d="M-11-64h23v8h-23Z" fill="#e6e3d0"/>
    {person.held&&<g transform="translate(-21 -37)"><TruckDishArt dish={person.held} size={42}/></g>}
    {person.working&&<g><circle cx="20" cy="-61" r="3" fill="#e4b44e"/><path d="m23-71 2 4 4-2m-13-6 1 5" fill="none" stroke="#e4b44e" strokeWidth="2" strokeLinecap="round"/></g>}
  </g>;
}

function Station({station}:{station:TruckArtStation}) {
  const type=station.machineId;
  const stove=type.includes("stove")||type==="sauce",prep=type.includes("prep"),sink=type.includes("sink"),pantry=type.includes("pantry"),fridge=type==="fridge",plates=type.includes("plate"),pass=type.includes("pass"),fryer=type.includes("fryer"),drinks=type.includes("drink");
  return <g>
    <ellipse cy="2" rx="28" ry="12" fill="#60503c" opacity=".12"/>
    <Box top={stove||fryer?"#72786f":sink?"#e0e5d7":"#faf2d8"} front={pass?"#88a88b":"#d2b58c"} side={pass?"#648873":"#bc9a73"}/>
    {station.facing<2&&<g transform={station.facing===1?"scale(-1 1)":undefined}><path d="m-25-10 22 11v-25l-22-11Z" fill="none" stroke="#a38662" strokeWidth="1"/><path d="m-15-24 9 4" stroke="#7d6e51" strokeWidth="2.2" strokeLinecap="round"/></g>}
    {fridge?<g transform="translate(0 -34)"><Box h={37} top="#e8eee0" front="#b5d0bf" side="#94b1a3"/><path d="m-24-25 20 10v30l-20-10Z" fill="#d6e5d4" stroke="#769685"/><path d="m-6-8 0 11" stroke="#fff6dc" strokeWidth="3" strokeLinecap="round"/><path d="m9-18 13-6m-13 12 13-6" stroke="#b9d0bc" strokeWidth="2"/></g>:
    pantry?<g transform="translate(0 -36)"><path d="m-25-4 22-11 27 13v14L1 24-25 11Z" fill="#b88f59" stroke={INK}/><path d="m-25-4 26 12L24-2 1-15Z" fill="#e3c490" stroke={INK}/>{[[-12,-3],[1,3],[10,-2]].map(([x,y],i)=><g key={i}><ellipse cx={x} cy={y} rx="7" ry="6" fill={i%2?"#89a35e":"#d77456"}/><path d={`M${x} ${y-4}l-5-4 5 2 4-4-1 6`} fill="#5c854b"/></g>)}<path d="m-24 4 25 12 22-10" fill="none" stroke="#e7cd9a" strokeWidth="2"/></g>:
    stove?<g transform="translate(0 -40)"><ellipse cy="7" rx="22" ry="10" fill="#5f6159"/><path d="M-20-2q1 19 20 19T20-2" fill="#d78a62" stroke={INK} strokeWidth="1.5"/><ellipse cy="-2" rx="21" ry="9" fill="#f4cea0" stroke={INK} strokeWidth="1.5"/><ellipse cy="-2" rx="16" ry="5.8" fill={type==="sauce"?"#c96e50":"#e2bd6c"}/><path d="m-20 0-8-3v7h9m39-4 8-3v7h-9" fill="none" stroke="#967452" strokeWidth="3"/>{station.progress!=null&&<path d="M-8-16q-5-7 0-13M5-17q5-9 0-16" fill="none" stroke="#b8b49c" strokeWidth="2" strokeLinecap="round"/>}</g>:
    prep?<g transform="translate(0 -37)"><path d="m-23 0 21-10 26 12L3 13Z" fill="#c8a26c" stroke="#9b754b"/>{[[-7,-1],[0,3],[7,0]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="6" ry="3" fill={i%2?"#a4bd6a":"#769a50"} transform={`rotate(-20 ${x} ${y})`}/>)}<path d="m6-8 14 7-3 4-14-8Z" fill="#dbe0d0" stroke="#a2a596" strokeWidth=".8"/><path d="m19-2 7 3" stroke="#876444" strokeWidth="3" strokeLinecap="round"/></g>:
    sink?<g transform="translate(0 -35)"><ellipse rx="23" ry="10" fill="#99aeae" stroke="#738b86"/><ellipse cy="1" rx="17" ry="7" fill="#b9d6cd"/><path d="M-15-8v-17q1-8 8-4l4 2v7" fill="none" stroke="#a0b0a6" strokeWidth="4"/><path d="M-15-8v-17q1-8 8-4l4 2" fill="none" stroke="#ecede0" strokeWidth="1.3"/></g>:
    plates?<g transform="translate(0 -36)">{[0,1,2,3].map(i=><g key={i}><ellipse cy={-i*4} rx="22" ry="8.5" fill="#d5d1b9" stroke="#a4997e"/><ellipse cy={-i*4-2} rx="22" ry="8" fill="#fff8e1" stroke="#c8b994"/><ellipse cy={-i*4-2} rx="16" ry="5" fill="none" stroke="#c4cbad"/></g>)}</g>:
    pass?<g transform="translate(0 -35)"><path d="M-6 0q0-12 11-12T16 0Z" fill="#e2b469" stroke="#aa8047"/><ellipse cx="5" cy="0" rx="12" ry="4" fill="#cf9f52" stroke="#aa8047"/><path d="M5-11v-4" stroke="#a37c40" strokeWidth="3" strokeLinecap="round"/><path d="m-27-5-9-4v-26l13 6v25" fill="#597b68" stroke={INK}/><path d="m-32-28 7 3m-7 5 7 3" stroke="#faf4d8" strokeWidth="1.5"/></g>:
    fryer?<g transform="translate(0 -38)"><path d="m-22-5 21-10 25 13v16L2 24-22 11Z" fill="#a9b5a6" stroke={INK}/><path d="m-20-5 21-9 21 12L2 8Z" fill="#c3a466" stroke="#777e6b"/>{[-9,-2,5,12].map((x,i)=><path key={i} d={`M${x} ${i%2?2:-2}l4-12`} stroke="#f2d888" strokeWidth="3"/>)}<path d="m18 3 9 5 8-4" fill="none" stroke="#6c6e5b" strokeWidth="3"/></g>:
    drinks?<g transform="translate(0 -35)"><path d="M-16-3v-31q16-10 30 0v31" fill="#dca679" stroke={INK}/><ellipse cy="-34" rx="16" ry="6" fill="#f0cc8c" stroke={INK}/><path d="M-14-30q14 5 26 0v19q-12 6-26 0Z" fill="#b87953"/><path d="M7-9v8h7" fill="none" stroke="#6e725f" strokeWidth="3"/><path d="m3 4 2 10h11l2-10" fill="#fff4d5" stroke={INK}/></g>:null}
    {station.food&&<g transform="translate(-23 -57)"><TruckDishArt dish={station.food} size={46}/></g>}
    {station.progress!=null&&<g transform="translate(-23 -78)"><rect width="46" height="7" rx="3.5" fill="#fffaf0" stroke="#c9b996"/><rect x="1.5" y="1.5" width={Math.max(0,Math.min(43,43*station.progress))} height="4" rx="2" fill="#7b9f6d"/></g>}
    {station.selected&&<><path d="m-30 11 29 15 30-15" stroke="#4d805f" strokeWidth="4" fill="none" strokeLinecap="round"/><path d={station.facing===0?"m-25 17-10 5 4-9":station.facing===1?"m-26-14-10-4 9-4":station.facing===2?"m25-16 10-5-4 9":"m25 15 10 4-9 4"} fill="#4d805f"/></>}
  </g>;
}

export function TruckMachineArt({machineId,size=72}:{machineId:string;size?:number}) {
  return <svg width={size} height={size} viewBox="-44 -86 88 110" aria-hidden="true"><Station station={{id:0,machineId,x:0,y:0,facing:0,label:machineId}}/></svg>;
}

export function TruckWorldArt({width,height,paint,sign,stations,player,helpers=[],customers,setup,onStation,onTile,onGroundKey,paused=false}:TruckWorldArtProps) {
  const palette=TRUCK_PAINTS.find(p=>p.id===paint)??TRUCK_PAINTS[0];
  const origin={x:height*38+127,y:147};
  const sceneWidth=(width+height)*38+274,sceneHeight=(width+height)*19+350;
  const awningA=iso(-.5,-.5,104),awningB=iso(width-.5,-.5,104),awningC=iso(width-.5,-1.45,104),awningD=iso(-.5,-1.45,104);
  const things=[...stations.map(s=>({depth:s.x+s.y+.06,key:`s${s.id}`,station:s,person:null})),{depth:player.x+player.y+.12,key:"player",station:null,person:player},...helpers.map((h,i)=>({depth:h.x+h.y+.12,key:`h${i}`,station:null,person:{...h,helper:true}}))].sort((a,b)=>a.depth-b.depth);
  return <svg viewBox={`${sceneWidth*.075} 0 ${sceneWidth*.85} ${sceneHeight*.87}`} width="100%" height="100%" role="group" aria-label={`${sign || "The Little Kitchen"} food truck. ${setup?"Arrange your stations.":"Tap a station to move and cook."}`} tabIndex={0} onKeyDown={event=>{if(onGroundKey)onGroundKey(event.key);}} style={{display:"block",overflow:"hidden",touchAction:"manipulation"}}>
    <defs><pattern id="truck-grass-dots" width="43" height="39" patternUnits="userSpaceOnUse"><path d="m10 19 2-4m2 6 2-3" stroke="#97b082" strokeWidth="1.3" opacity=".45"/></pattern><filter id="truck-soft-shadow"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <ellipse cx={sceneWidth/2} cy={sceneHeight*.75} rx={sceneWidth*.37} ry={sceneHeight*.12} fill="#738160" opacity=".13" filter="url(#truck-soft-shadow)"/>
    <g transform={`translate(${origin.x} ${origin.y})`}>
      <polygon points={plane([[-1,-2,-24],[width+1.8,-2,-24],[width+1.8,height+2.4,-24],[-1,height+2.4,-24]])} fill="#e1e7cd" stroke="#c5d0b0" strokeWidth="2"/>
      <polygon points={plane([[-1,-2,-24],[width+1.8,-2,-24],[width+1.8,height+2.4,-24],[-1,height+2.4,-24]])} fill="url(#truck-grass-dots)"/>
      {/* A low chassis keeps every station and the player visible. */}
      <g transform="translate(0 18)"><Box x={(width-1)/2} y={(height-1)/2} w={width+.2} d={height+.2} h={18} top="#d8bf94" front={palette.color} side={palette.shade}/></g>
      {[.45,Math.max(1,width-1.35)].map((x,i)=>{const pt=iso(x,height-.37,-20);return <g key={i} transform={`translate(${pt.x} ${pt.y})`}><ellipse rx="17" ry="20" fill="#5b6057" stroke="#454e49" strokeWidth="3"/><ellipse rx="9" ry="12" fill="#d5d7c9"/><ellipse rx="3" ry="5" fill="#9ba391"/></g>;})}
      {/* Back wall and awning are behind the cooking floor. */}
      <polygon points={plane([[-.55,-.6,0],[width-.45,-.6,0],[width-.45,-.6,82],[-.55,-.6,82]])} fill="#f8ebcf" stroke={INK} strokeWidth="1.5"/>
      <polygon points={plane([[-.55,-.6,0],[width-.45,-.6,0],[width-.45,-.6,23],[-.55,-.6,23]])} fill={palette.color}/>
      {[-.5,width-.5].map((u,i)=>{const a=iso(u,-.6,78),b=iso(u,-.6,105);return <path key={i} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke="#a58a61" strokeWidth="3"/>;})}
      <polygon points={polygon([awningA,awningB,awningC,awningD])} fill="#fff5d8" stroke={INK} strokeWidth="1.5"/>
      {Array.from({length:width*2},(_,i)=>{const u=-.5+i/2;return <polygon key={i} points={plane([[u,-.5,104],[u+.25,-.5,104],[u+.25,-1.45,104],[u,-1.45,104]])} fill={palette.color}/>;})}
      <polygon points={plane([[-.5,-.5,104],[width-.5,-.5,104],[width-.5,-.5,95],[-.5,-.5,95]])} fill={palette.shade} stroke={INK} strokeWidth="1.3"/>
      {/* The cab uses the same projection as the floor: connected roof, doors, bonnet, and windscreen. */}
      <polygon points={plane([[width-.35,1.15,0],[width+1.15,1.15,0],[width+1.15,1.15,47],[width+.7,1.15,64],[width-.35,1.15,64]])} fill={palette.color} stroke={INK} strokeWidth="1.4"/>
      <polygon points={plane([[width+1.15,-.5,0],[width+1.15,1.15,0],[width+1.15,1.15,47],[width+1.15,-.5,47]])} fill={palette.shade} stroke={INK} strokeWidth="1.4"/>
      <polygon points={plane([[width-.35,-.5,64],[width+.7,-.5,64],[width+.7,1.15,64],[width-.35,1.15,64]])} fill="#fff0d1" stroke={INK} strokeWidth="1.4"/>
      <polygon points={plane([[width+.7,-.5,64],[width+1.15,-.5,47],[width+1.15,1.15,47],[width+.7,1.15,64]])} fill="#abc9be" stroke={INK} strokeWidth="1.4"/>
      <polygon points={plane([[width-.23,1.16,55],[width+.62,1.16,55],[width+.89,1.16,43],[width-.23,1.16,43]])} fill="#c7dfcd" stroke={INK} strokeWidth="1.2"/>
      <path d={`M${iso(width-.12,1.17,30).x} ${iso(width-.12,1.17,30).y}l9 4`} stroke="#f8e7bf" strokeWidth="3" strokeLinecap="round"/>
      <polygon points={plane([[width+1.16,-.28,25],[width+1.16,.89,25],[width+1.16,.89,14],[width+1.16,-.28,14]])} fill="#787c68" stroke={INK}/>
      {[-.31,.98].map((v,i)=>{const p=iso(width+1.17,v,33);return <ellipse key={i} cx={p.x} cy={p.y} rx="4" ry="5" fill="#fff0b6" stroke="#ab956b"/>;})}
      <g transform={`translate(${iso(width+.35,1.2,-6).x} ${iso(width+.35,1.2,-6).y})`}><ellipse rx="12" ry="16" fill="#5b6057" stroke="#454e49" strokeWidth="2"/><ellipse rx="6" ry="9" fill="#d5d7c9"/></g>
      {Array.from({length:width*height},(_,i)=>{const x=i%width,y=Math.floor(i/width);return <polygon key={i} points={plane([[x-.5,y-.5,0],[x+.5,y-.5,0],[x+.5,y+.5,0],[x-.5,y+.5,0]])} fill={(x+y)%2?"#eee2bf":"#fbf2d6"} stroke={setup?"#b3b894":"#d7cba8"} strokeWidth={setup?1.3:.75} onClick={()=>onTile(x,y)} style={{cursor:setup?"crosshair":"pointer"}}/>;})}
      {/* Quiet chalkboard sign hangs from the same back-wall plane. */}
      <g transform={`translate(${iso(width/2-.2,-.61,79).x} ${iso(width/2-.2,-.61,79).y}) matrix(1 .5 0 1 0 0)`}><rect x="-54" y="-25" width="108" height="27" rx="5" fill="#496951" stroke="#d9bc89" strokeWidth="3"/><text x="0" y="-7" textAnchor="middle" fontFamily="Georgia,serif" fontWeight="700" fontSize="11" fill="#fff3d3">{(sign||"The Little Kitchen").slice(0,22)}</text></g>
      {things.map(thing=>{const object=thing.station??thing.person!,pt=iso(object.x,object.y);return thing.station?<g key={thing.key} transform={`translate(${pt.x} ${pt.y})`} role="button" tabIndex={0} aria-label={`${thing.station.label}${thing.station.food?`, holding ${thing.station.food}`:""}${thing.station.progress!=null?", preparing":""}`} onClick={event=>{event.stopPropagation();onStation(thing.station!.id);}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();onStation(thing.station!.id);}}} style={{cursor:"pointer",outline:"none"}}><title>{thing.station.label}</title><rect x="-36" y="-86" width="72" height="108" rx="8" fill="transparent" pointerEvents="none"/><Station station={thing.station}/></g>:<g key={thing.key} transform={`translate(${pt.x} ${pt.y})`} style={{pointerEvents:"none",transition:"transform 160ms linear"}}><Person person={thing.person!}/></g>;})}
      <Plant x={iso(-.6,height+.7).x} y={iso(-.6,height+.7).y}/>
      <Plant x={iso(width+1,height+.3).x} y={iso(width+1,height+.3).y} small/>
      {customers.slice(0,5).map((customer,i)=>{const pos=iso(width+.7-i*.8,height+.8);const patience=Math.max(0,Math.min(1,customer.patience/customer.maxPatience));return <g key={customer.id} transform={`translate(${pos.x} ${pos.y})`} aria-hidden="true"><ellipse cy="3" rx="11" ry="5" fill="#667150" opacity=".13"/><path d="M-5-10-6 1M6-10 7 1" stroke="#76634e" strokeWidth="5" strokeLinecap="round"/><path d="M-10-31q10-8 20 0l2 23q-12 7-24 0Z" fill={["#d89076","#8aabc0","#d9b36f","#a79bc3","#79a186"][i]} stroke={INK}/><ellipse cy="-40" rx="11" ry="13" fill={i%2?"#bf8b64":"#e3b991"} stroke={INK}/><path d="M-11-43q-2-14 12-11 11 0 10 15l-10-9-6 6Z" fill={i%2?"#655143":"#a9794d"}/><circle cx="-4" cy="-39" r="1.2" fill="#544432"/><circle cx="5" cy="-39" r="1.2" fill="#544432"/><path d={patience>.6?"M-3-35q4 5 8-1":patience>.3?"M-2-34h4":"M-3-32q4-5 8 0"} fill="none" stroke="#8d5e45" strokeWidth="1.2" strokeLinecap="round"/>{patience<.3&&<path d="m-7-43 5 1m5 0 5-1" stroke="#6b513d" strokeWidth="1.3" strokeLinecap="round"/>}<g transform="translate(-23 -94)"><rect width="46" height="34" rx="12" fill="#fffcef" stroke="#cbbd98"/><path d="m20 34 4 5 5-5" fill="#fffcef"/><g transform="translate(4 0)"><TruckDishArt dish={customer.dish} size={38}/></g><rect x="5" y="29" width="36" height="3" rx="1.5" fill="#e6ddc5"/><rect x="5" y="29" width={36*patience} height="3" rx="1.5" fill={patience<.3?"#d67a58":"#87a36a"}/></g></g>;})}
      {customers.length>5&&<text x={iso(width-3.5,height+1.4).x} y={iso(width-3.5,height+1.4).y-40} fill="#76674c" fontSize="12" fontWeight="700">+{customers.length-5} waiting</text>}
    </g>
    {paused&&<g><rect x={sceneWidth/2-56} y="28" width="112" height="34" rx="17" fill="#fff9e8" stroke="#d7c6a1"/><text x={sceneWidth/2} y="50" textAnchor="middle" fill="#6d7054" fontSize="14" fontWeight="700">Taking a breath</text></g>}
  </svg>;
}

export function TruckBadgeArt({size=56,color="#7eaa8b"}:{size?:number;color?:string}) { return <svg width={size} height={size*.78} viewBox="0 0 90 70" aria-hidden="true"><ellipse cx="46" cy="61" rx="38" ry="5" fill="#786344" opacity=".1"/><path d="M8 19h48l5 9h14l10 18v10H8Z" fill={color} stroke={INK} strokeWidth="2"/><path d="M61 29h12l7 13H61Z" fill="#bfd9ce" stroke={INK}/><path d="M13 14h41v26H13Z" fill="#fff1d0" stroke={INK} strokeWidth="2"/><path d="M9 12h49v8H9Z" fill="#fff2d9" stroke={INK}/>{[0,1,2,3].map(i=><path key={i} d={`M${13+i*12} 12h6v8h-6Z`} fill={color}/>)}<path d="M14 41h41" stroke="#96764b" strokeWidth="3"/><circle cx="22" cy="56" r="9" fill="#60675b"/><circle cx="70" cy="56" r="9" fill="#60675b"/><circle cx="22" cy="56" r="4" fill="#d9dbca"/><circle cx="70" cy="56" r="4" fill="#d9dbca"/></svg>; }
