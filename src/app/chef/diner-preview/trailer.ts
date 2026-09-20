import * as THREE from 'three';
import { box, cylinder, createModel, PALETTE } from './models';

export interface EquipmentTrailerSlot { id:string;kind:string;tier:number }
export interface EquipmentTrailerLayout {
  deckHeight:number;
  columns:number;
  rows:number;
  overflow:number;
  slots:Array<EquipmentTrailerSlot&{scale:number;position:{x:number;y:number;z:number};anchor:{x:number;y:number;z:number}}>;
}

/** Merge only the fixed trailer chassis. These geometry buffers belong to this
 * trailer and are disposed by disposeObject; the shared kit paint stays alive. */
function packChassis(root:THREE.Group){
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of root.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
    const batch=batches.get(child.material)??[];batch.push(child);batches.set(child.material,batch);
  }
  for(const [paint,parts] of batches){
    if(parts.length<2)continue;
    const positions:number[]=[],normals:number[]=[],point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
    for(const part of parts){
      part.updateMatrix();normalMatrix.getNormalMatrix(part.matrix);
      const p=part.geometry.getAttribute('position'),n=part.geometry.getAttribute('normal'),index=part.geometry.index;
      for(let i=0,count=index?.count??p.count;i<count;i++){
        const v=index?index.getX(i):i;point.fromBufferAttribute(p,v).applyMatrix4(part.matrix);normal.fromBufferAttribute(n,v).applyMatrix3(normalMatrix).normalize();
        positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    const joined=new THREE.Mesh(geometry,paint);joined.castShadow=true;joined.receiveShadow=true;root.remove(...parts);root.add(joined);
  }
}

function beam(a:THREE.Vector3,b:THREE.Vector3,width:number,color:string){
  const mesh=box(width,a.distanceTo(b),width,color,0,0,0,width*.22);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return mesh;
}

/** Open roadside storage for setup only. The returned group is already in the
 * truck's world coordinates (Three Y is elevation; Z is the game's grid Y).
 * The caller owns paging beyond six slots, camera framing and selection state. */
export function createEquipmentTrailer(slots:Array<EquipmentTrailerSlot>,width:number,height:number):THREE.Group{
  const root=new THREE.Group();root.name='equipment-trailer';
  const truckWidth=Number.isFinite(width)?Math.max(1,width):4,truckHeight=Number.isFinite(height)?Math.max(1,height):3;
  // The existing road strip is centred here. A nearer position would intersect
  // the truck cab; nothing in this trailer occupies a walkable kitchen tile.
  root.position.set(truckWidth+3.15,-.009,Math.max(.8,(truckHeight-1)/2));
  const shown=slots.slice(0,6),columns=2,rows=Math.max(1,Math.ceil(shown.length/columns)),deckWidth=2.16,deckDepth=rows*1.12+.16,deckTop=.48;
  const chassis=new THREE.Group();chassis.name='trailer-chassis';root.add(chassis);

  chassis.add(box(deckWidth,.13,deckDepth,PALETTE.sage,0,.385,0,.065),box(deckWidth-.10,.055,deckDepth-.08,PALETTE.cream,0,deckTop-.0275,0,.026));
  // Quiet timber runners, metal corner caps and low rails keep the cargo in view.
  for(const x of [-.72,-.24,.24,.72])chassis.add(box(.026,.006,deckDepth-.17,'#e0d2b9',x,deckTop+.002,0,.003));
  for(const x of [-deckWidth/2+.033,deckWidth/2-.033]){
    chassis.add(box(.065,.13,deckDepth-.04,PALETTE.cream,x,.53,0,.022),box(.073,.035,deckDepth-.025,PALETTE.metal,x,.608,0,.014));
    for(const z of [-deckDepth/2+.10,deckDepth/2-.10])chassis.add(box(.092,.23,.092,PALETTE.sage,x,.53,z,.02));
  }
  chassis.add(box(deckWidth-.09,.10,.065,PALETTE.cream,0,.50,deckDepth/2-.032,.026),box(deckWidth-.09,.15,.065,PALETTE.cream,0,.525,-deckDepth/2+.032,.026));
  for(const x of [-.84,.84])chassis.add(box(.10,.045,.026,PALETTE.tomato,x,.385,deckDepth/2+.004,.012));

  // A shared axle, two little tyres and fenders physically meet the bed.
  const axle=cylinder(.036,.036,2.28,PALETTE.steel,0,.245,0,12);axle.rotation.z=Math.PI/2;chassis.add(axle);
  for(const side of [-1,1]){
    const x=side*1.115,tire=cylinder(.24,.24,.16,PALETTE.dark,x,.24,0,20),hub=cylinder(.132,.132,.171,PALETTE.metal,x,.24,0,16),cap=cylinder(.068,.068,.184,PALETTE.cream,x,.24,0,12);
    tire.rotation.z=hub.rotation.z=cap.rotation.z=Math.PI/2;chassis.add(tire,hub,cap);
    chassis.add(box(.18,.075,.63,PALETTE.sage,x,.512,0,.05));
    for(const z of [-.275,.275]){const end=box(.17,.13,.055,PALETTE.sage,x,.46,z,.02);end.rotation.x=z<0?.35:-.35;chassis.add(end);}
  }
  // The A-frame and jack identify an actual parked utility trailer.
  const hitchZ=-deckDepth/2-.67;
  for(const x of [-.61,.61])chassis.add(beam(new THREE.Vector3(x,.315,-deckDepth/2+.08),new THREE.Vector3(0,.315,hitchZ),.072,PALETTE.steel));
  chassis.add(box(.14,.10,.25,PALETTE.metal,0,.325,hitchZ-.065,.038),cylinder(.039,.048,.27,PALETTE.steel,0,.15,hitchZ+.13),box(.26,.035,.21,PALETTE.dark,0,.0175,hitchZ+.13,.027),box(.19,.024,.028,PALETTE.wood,.061,.36,hitchZ+.13,.009));
  // A small enamel badge is decorative; it is never an additional action.
  chassis.add(box(.43,.14,.018,PALETTE.sage,0,.383,deckDepth/2+.008,.033),box(.22,.025,.009,PALETTE.cream,-.025,.383,deckDepth/2+.021,.008));
  packChassis(chassis);

  const layout:EquipmentTrailerLayout={deckHeight:root.position.y+deckTop,columns,rows,overflow:Math.max(0,slots.length-shown.length),slots:[]};
  shown.forEach((slot,index)=>{
    const x=(index%columns-.5)*1.02,z=(Math.floor(index/columns)-(rows-1)/2)*1.12;
    const cargo=new THREE.Group();cargo.name=`trailer-slot:${slot.id}`;cargo.position.set(x,deckTop+.007,z);cargo.userData.pick={id:`trailer:${slot.id}`};
    // A small solid loading mat makes each selectable stored item distinct.
    cargo.add(box(.96,.009,.99,'#dce5d4',0,.002,0,.065));
    const model=createModel(slot.kind,{tier:slot.tier});model.rotation.y=Math.PI;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),scale=Math.min(1,.92/Math.max(.01,size.x),.94/Math.max(.01,size.z),1.50/Math.max(.01,size.y));
    model.scale.setScalar(scale);model.position.set(-(bounds.min.x+bounds.max.x)*scale/2,.009-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);cargo.add(model);root.add(cargo);
    layout.slots.push({...slot,scale,position:{x:root.position.x+x,y:root.position.y+cargo.position.y+.009,z:root.position.z+z},anchor:{x:root.position.x+x,y:root.position.y+cargo.position.y+.009+size.y*scale+.12,z:root.position.z+z}});
  });
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
  root.userData.layout=layout;root.userData.bounds={min:{x:bounds.min.x,y:bounds.min.y,z:bounds.min.z},max:{x:bounds.max.x,y:bounds.max.y,z:bounds.max.z}};
  return root;
}
