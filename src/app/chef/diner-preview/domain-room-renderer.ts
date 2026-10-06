import * as THREE from 'three';
import {domainKitAsset,DOMAIN_KIT_ASSETS,type DomainKitPart} from '@/lib/chef/diner/domain-room-kit-defs';
import type {DomainId} from '@/lib/chef/diner/domain-worlds';
import type {RoomPlan} from '@/lib/chef/diner/room-plan';
import {createDomainStudy} from './domain-assets';
import {box} from './models';

export function domainRoomPiece(domain:DomainId,part:DomainKitPart,width=1){
 const g=new THREE.Group();
 for(let i=0;i<(part==='counter'?width:1);i++){const piece=createDomainStudy(domainKitAsset(domain,part));if(piece){piece.position.x=part==='counter'?i-(width-1)/2:0;if(['counter','chair','stool','table'].includes(part))piece.rotation.y=Math.PI;g.add(piece);}}
 // Art follows the existing contact planes. Food and seated bodies must not float.
 for(const piece of g.children){if(part==='counter')piece.scale.y=1.11/1.195;if(part==='table')piece.scale.y=.85/.905;if(part==='chair')piece.scale.y=.48/.605;}
 g.userData.surfaceHeight=part==='table'?.85:1.11;return g;
}
export function domainDecoration(kind:string){
 if(process.env.NODE_ENV!=='development'||!DOMAIN_KIT_ASSETS.has(kind))return null;
 const piece=createDomainStudy(kind);if(!piece)return null;
 const root=new THREE.Group();piece.rotation.y=Math.PI;root.add(piece);
 if(kind.endsWith('_sign'))root.userData.wallMountPlane=.035;
 return root;
}
/** Uses the real plan's individual surfaces and boundaries. No baked room shell. */
export function domainRoomShell(plan:RoomPlan){
 const root=new THREE.Group(),theme=plan.appearance?.floor;if(!theme)return root;
 const accent=theme==='gochujang'?'#b52d25':theme==='smoothie'?'#e59a76':'#503026';
 root.add(box(plan.w+.16,.18,plan.h+.16,'#d0bfa4',(plan.w-1)/2,-.09,(plan.h-1)/2,.04));
 const floors:{x:number;y:number;z:number;color:string;plank:boolean}[]=[];
 for(const tile of plan.surfaces??[]){
  const color=tile.kind==='garden'?'#789562':tile.kind==='patio'?'#cabaa1':theme==='gochujang'?((tile.x+tile.y)%2?'#333237':'#26262b'):theme==='smoothie'?((tile.x+tile.y)%3?'#ecdfc5':'#f6edda'):((tile.x*7+tile.y*3)%3?'#996a4a':'#a27353');
  if(theme==='wines'&&tile.kind==='indoor')for(let j=0;j<3;j++)floors.push({x:tile.x,y:tile.y,z:tile.y-.333+j*.333,color,plank:true});
  else floors.push({x:tile.x,y:tile.y,z:tile.y,color,plank:false});
 }
 // The same tile identity drives floor picking and painting. Instancing keeps
 // hundreds of oak planks from becoming hundreds of separate draw calls.
 for(const plank of [false,true]){
  const cells=floors.filter(t=>t.plank===plank);if(!cells.length)continue;
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.986,.045,plank?.322:.986),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.82}),cells.length),matrix=new THREE.Matrix4();
  mesh.name='room-supported-floor';mesh.userData.tiles=cells;mesh.receiveShadow=true;
  cells.forEach((cell,i)=>{matrix.makeTranslation(cell.x,.025,cell.z);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(cell.color));});root.add(mesh);
 }
 for(const e of plan.edges){
  const g=new THREE.Group();g.name=`room-wall:${e.id}`;g.position.set((e.a.x+e.b.x)/2,.05,(e.a.y+e.b.y)/2);g.userData.pick={id:`edge:${e.id}`};
  const vertical=e.a.x!==e.b.x,outRight=Math.max(e.a.x,e.b.x)===plan.w;
  g.rotation.y=vertical?(outRight?-Math.PI/2:Math.PI/2):0;
  if(e.kind==='door'||e.kind==='staff_gate'){
   for(const x of [-.46,.46])g.add(box(.075,1.9,.15,accent,x,.95,0,.02));g.add(box(1,.08,.16,accent,0,1.91,0,.02));
  }else{
   const skin=plan.appearance?.pieces[e.id];
   if(skin?.part==='wall'){const wall=domainRoomPiece(skin.domain,'wall');wall.scale.y=(e.height??2.4)/3.4;g.add(wall);}
   else {const h=e.height??1.9;g.add(box(1,h,.14,accent,0,h/2,0,.025),box(1.04,.07,.21,'#dbb46c',0,h,0,.015));}
  }
  if((e.height??0)>2.5){g.userData.dkRoomWallX=vertical?(outRight?1:-1):0;g.userData.dkRoomWallZ=vertical?0:-1;}
  root.add(g);
 }
 return root;
}
