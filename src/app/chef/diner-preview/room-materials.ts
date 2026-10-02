import * as THREE from 'three';
import { box,material } from './models';
import { roomZoneAt,type RoomPlan } from '../../../lib/chef/diner/room-plan';

const GOLD='#bca474';
/** Materials stay in the public dining area: the working rooms keep washable tiles. */
export function createDiningFloorFinish(plan:RoomPlan,finish?:string){
 const root=new THREE.Group();root.name=`dining-floor:${finish}`;root.userData.inputPassthrough=true;
 if(finish!=='wood'&&finish!=='terrazzo')return root;
 const cells:Array<{x:number;y:number}>=[];for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++)if(!roomZoneAt(plan,{x,y})||roomZoneAt(plan,{x,y})?.kind==='dining')cells.push({x,y});
 const matrix=new THREE.Matrix4(),color=new THREE.Color();
 if(finish==='wood'){
  const boards=new THREE.InstancedMesh(new THREE.BoxGeometry(.992,.006,.323),material('#fff'),cells.length*3),tones=['#ad835b','#a77c52','#9d734d','#b28a64','#a67d59'];boards.name='dining-wood-planks';boards.receiveShadow=true;
  const grain:number[]=[];let i=0;for(const {x,y} of cells)for(let row=0;row<3;row++){
   const n=(x*31+y*17+row*7)%tones.length,z=y+(row-1)/3;matrix.makeTranslation(x,.099,z);boards.setMatrixAt(i,matrix);boards.setColorAt(i++,color.set(tones[n]));
   for(const offset of [-.08,.075])grain.push(x-.36,.103,z+offset,x+.20+(n%3)*.06,.103,z+offset+.008);
  }root.add(boards);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(grain,3));root.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#755233',transparent:true,opacity:.22})));
 }else{
  const base=new THREE.InstancedMesh(new THREE.BoxGeometry(1.002,.006,1.002),material('#dcd8cc'),cells.length);base.name='dining-terrazzo-field';base.receiveShadow=true;cells.forEach(({x,y},i)=>{matrix.makeTranslation(x,.099,y);base.setMatrixAt(i,matrix);});root.add(base);
  // Small flat aggregate, batched into one draw rather than a texture per tile.
  const chips=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,.001,5),material('#fff'),cells.length*18),tones=['#bbb6a7','#f1eee4','#97998d','#c9b99d'];chips.name='terrazzo-aggregate';let i=0;
  for(const {x,y}of cells)for(let n=0;n<18;n++){
   const seed=(x*199+y*89+n*37+7),px=((seed*47)%997)/997-.5,pz=((seed*83)%991)/991-.5,r=.008+(seed%5)*.002;
   matrix.compose(new THREE.Vector3(x+px*.96,.103,y+pz*.96),new THREE.Quaternion(),new THREE.Vector3(r,1,r*(.6+(seed%4)*.15)));chips.setMatrixAt(i,matrix);chips.setColorAt(i++,color.set(tones[seed%tones.length]));
  }root.add(chips);
 }
 root.traverse(object=>{object.userData.inputPassthrough=true;object.raycast=()=>{};});return root;
}

/** The wall finish is separate from the counter finish and cuts away with its wall. */
export function dressRoomWall(wall:THREE.Group,length:number,finish?:string){
 const cut=wall.userData.cutaway;if(!cut)return;
 const upper=cut.upper as THREE.Group,low=cut.low,height=cut.height,span=height-low;
 if(finish==='diner_panel'){
  for(let x=-length/2+.3;x<length/2;x+=.6)wall.add(box(.020,low-.09,.014,'#705034',x,low/2,.061,.004));
  upper.add(box(length,.045,.07,'#7b573a',0,.10,.081,.010),box(length,.04,.08,'#ac875b',0,span-.13,.081,.008));
 }
 if(finish==='deco'){
  // Quiet cream plaster over deep green paneling, framed by fine brass inlays.
  const lower=wall.children.find(child=>child instanceof THREE.Mesh) as THREE.Mesh|undefined;if(lower)lower.material=material('#294b44');
  cut.cap.material=material(GOLD);
  wall.add(box(length,.034,.022,GOLD,0,low-.035,.069,.005));
  const count=Math.max(1,Math.floor(length/1.45)),step=length/count,lines:number[]=[];
  for(let i=0;i<count;i++){
   const center=-length/2+step*(i+.5),half=step*.38;
   for(const x of [center-half,center+half])wall.add(box(.012,low-.21,.014,GOLD,x,low/2,.064,.003));
   // Rounded fan crown, drawn as a few deliberate architectural lines.
   const top=span-.16,bottom=Math.min(.18,top-.2),radius=half*.60;
   lines.push(center-half,bottom,.062,center-half,top-radius,.062,center+half,bottom,.062,center+half,top-radius,.062);
   for(let j=0;j<12;j++){const a=Math.PI*j/12,b=Math.PI*(j+1)/12;lines.push(center+half*Math.cos(a),top-radius+radius*Math.sin(a),.062,center+half*Math.cos(b),top-radius+radius*Math.sin(b),.062);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));upper.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:GOLD,transparent:true,opacity:.65})));
 }
}
