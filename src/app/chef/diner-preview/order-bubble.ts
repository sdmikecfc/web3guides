import * as THREE from 'three';
import { createFoodModel } from './models';

/** A camera-facing thought, with one continuous outline rather than a card. */
function cloud() {
  const s=new THREE.Shape();
  s.moveTo(-.35,-.19);
  s.bezierCurveTo(-.53,-.16,-.54,.045,-.405,.105);
  s.bezierCurveTo(-.435,.28,-.23,.35,-.12,.27);
  s.bezierCurveTo(.01,.405,.225,.35,.25,.24);
  s.bezierCurveTo(.43,.30,.535,.12,.445,.015);
  s.bezierCurveTo(.555,-.12,.40,-.265,.28,-.22);
  s.bezierCurveTo(.15,-.32,.02,-.285,-.055,-.24);
  s.bezierCurveTo(-.18,-.31,-.32,-.28,-.35,-.19);
  return s;
}
function ink(color:string,opacity=1){return new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false,toneMapped:false});}
function disc(radius:number,color:string,x:number,y:number,z:number){
  const m=new THREE.Mesh(new THREE.CircleGeometry(radius,24),ink(color));m.position.set(x,y,z);return m;
}
function pill(width:number,height:number,color:string){
  const r=height/2,s=new THREE.Shape();s.moveTo(-width/2+r,-r);s.lineTo(width/2-r,-r);
  s.absarc(width/2-r,0,r,-Math.PI/2,Math.PI/2,false);s.lineTo(-width/2+r,r);s.absarc(-width/2+r,0,r,Math.PI/2,Math.PI*1.5,false);
  return new THREE.Mesh(new THREE.ShapeGeometry(s,8),ink(color));
}
export function createOrderBubble(recipeId:string,needsClear=false){
  const root=new THREE.Group();root.name='customer-thought-bubble';
  const outline=new THREE.Mesh(new THREE.ShapeGeometry(cloud(),16),ink('#bea586'));
  const fill=new THREE.Mesh(outline.geometry,ink('#fff9ec'));fill.scale.set(.972,.958,1);fill.position.z=.006;
  const shadow=new THREE.Mesh(outline.geometry,ink('#695540',.11));shadow.position.set(.008,-.022,-.012);
  root.add(shadow,outline,fill);
  // Diminishing circles lead down to the person, clear of their hair/hat.
  for(const [x,y,r] of [[-.16,-.35,.062],[-.09,-.465,.035]]){
    root.add(disc(r,'#bea586',x,y,.002),disc(r-.01,'#fff9ec',x,y,.009));
  }
  const food=createFoodModel({recipeId,kind:'dish'});food.name='thought-dish';food.rotation.x=Math.PI*.30;
  const bounds=new THREE.Box3().setFromObject(food),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=Math.min(.84,.64/Math.max(.01,size.x),.43/Math.max(.01,size.y));food.scale.setScalar(scale);
  food.position.set(-center.x*scale,.025-center.y*scale,.025-bounds.min.z*scale);
  food.traverse(part=>{part.castShadow=false;part.receiveShadow=false;});root.add(food);
  const base=pill(.53,.032,'#d9dfcc'),bar=pill(.51,.025,'#76915f');base.position.set(0,-.195,.016);bar.position.set(0,-.195,.020);
  root.add(base,bar);root.userData.bar=bar;
  if(needsClear){
    const badge=new THREE.Group();badge.name='dirty-vessel-badge';badge.position.set(.39,.20,.12);
    badge.add(disc(.116,'#b9654c',0,0,0),disc(.084,'#fff3d8',0,0,.005),disc(.052,'#e6d1ae',0,0,.008),disc(.022,'#936344',.014,-.005,.012));root.add(badge);
  }
  return root;
}
export function updateOrderBubble(root:THREE.Group,patience:number){
  const bar=root.userData.bar as THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>,value=Math.max(0,Math.min(1,patience));
  bar.scale.x=Math.max(.01,value);bar.position.x=-.255+.255*value;
  bar.material.color.set(value<.25?'#bf7157':'#76915f');
}
