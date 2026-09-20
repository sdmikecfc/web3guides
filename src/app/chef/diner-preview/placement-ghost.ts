import * as THREE from 'three';
import { createModel, PALETTE } from './models';
import type { ScenePlacement, SceneTable } from './scene-types';

const tableCenter=(table:SceneTable)=>({x:table.x+(table.capacity!==1&&(table.capacity===4||(table.rotation??0)%2===1)?.5:0),y:table.y+(table.capacity!==1&&(table.capacity===4||(table.rotation??0)%2===0)?.5:0)});

/** One floor projection for mouse previews and clicks from mouse, touch or pen.
 * Furniture is intentionally not an obstacle to choosing an invalid draft tile. */
export function projectPlacementTile(ray:THREE.Ray,mode:'home'|'truck',width:number,height:number){
  const point=new THREE.Vector3(),raised=mode==='home'?.095:.455;
  if(!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-raised),point))return null;
  if(mode==='truck'&&(point.x<-.5||point.x>=width-.5||point.z<-.5||point.z>=height-.5)){
    if(!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.065),point))return null;
  }
  return {x:Math.round(point.x),y:Math.round(point.z)};
}

/** Actual furnishing geometry, with isolated preview materials and no pick targets.
 * Shared kit geometry stays shared; disposing this preview cannot fade the diner. */
export function createPlacementGhost(placement:ScenePlacement,floorHeight:(x:number,y:number)=>number,mode:'home'|'truck'){
  const root=new THREE.Group();root.name='placement-ghost';root.userData.inputPassthrough=true;
  const cells:Array<{x:number;y:number;chair?:boolean}>=[],color=placement.valid?'#529b72':'#cc6250';
  if(placement.object){
    const object=placement.object,facing=object.rotation??0,footprint=object.footprint??(object.kind==='pass'||object.kind==='queue_bench'?[2,1]:[1,1]);
    const width=footprint[facing%2?1:0],height=footprint[facing%2?0:1];
    const model=createModel(object.kind,{tier:object.tier,color:object.color,stock:object.stock});
    model.name='placement-object';model.position.set(object.x+(width-1)/2,floorHeight(object.x,object.y),object.y+(height-1)/2);model.rotation.y=Math.PI-facing*Math.PI/2;root.add(model);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)cells.push({x:object.x+x,y:object.y+y});
  }
  if(placement.table){
    const table=placement.table,center=tableCenter(table),facing=table.rotation??0;
    const model=createModel(`table_${table.capacity}`);model.name='placement-table';model.position.set(center.x,floorHeight(table.x,table.y),center.y);model.rotation.y=-facing*Math.PI/2;root.add(model);
    const width=table.capacity===4?2:table.capacity===2&&facing%2?2:1,height=table.capacity===4?2:table.capacity===2&&!(facing%2)?2:1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)cells.push({x:table.x+x,y:table.y+y});
    for(const seat of table.seats){const chair=createModel('chair',{color:mode==='truck'?PALETTE.tomato:PALETTE.mint});chair.name=`placement-seat:${seat.id}`;chair.position.set(seat.x,floorHeight(seat.x,seat.y),seat.y);chair.lookAt(center.x,chair.position.y,center.y);chair.rotateY(Math.PI);root.add(chair);cells.push({x:seat.x,y:seat.y,chair:true});}
  }
  const materials=new Map<THREE.Material,THREE.Material>();
  root.traverse(object=>{
    delete object.userData.pick;object.userData.inputPassthrough=true;object.raycast=()=>{};
    if(!(object instanceof THREE.Mesh))return;
    const clone=(source:THREE.Material)=>{let copy=materials.get(source);if(!copy){copy=source.clone();copy.userData={...source.userData,sharedKitResource:false};copy.transparent=true;copy.opacity=.56;copy.depthWrite=false;if('color' in copy)(copy as THREE.MeshToonMaterial).color.lerp(new THREE.Color(color),.13);materials.set(source,copy);}return copy;};
    object.material=Array.isArray(object.material)?object.material.map(clone):clone(object.material);object.castShadow=false;object.receiveShadow=false;
  });
  const footprint=new THREE.Group();footprint.name='placement-footprint';footprint.userData.inputPassthrough=true;
  const padMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}),edgeMaterial=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide});
  for(const cell of cells){
    const tile=new THREE.Mesh(new THREE.PlaneGeometry(cell.chair?.77:.94,cell.chair?.77:.94),padMaterial);tile.rotation.x=-Math.PI/2;tile.position.set(cell.x,floorHeight(cell.x,cell.y)+.017,cell.y);tile.userData.placementCell={...cell};tile.raycast=()=>{};footprint.add(tile);
    const edge=new THREE.Mesh(new THREE.RingGeometry(cell.chair?.35:.445,cell.chair?.38:.477,4,1,Math.PI/4),edgeMaterial);edge.scale.setScalar(Math.SQRT2);edge.rotation.x=-Math.PI/2;edge.position.set(cell.x,tile.position.y+.001,cell.y);edge.raycast=()=>{};footprint.add(edge);
  }
  root.add(footprint);root.userData.valid=placement.valid;return root;
}
