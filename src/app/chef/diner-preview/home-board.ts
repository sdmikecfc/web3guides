import * as THREE from 'three';
import { homeSpatial, HOME_INTERIOR_ELEVATION, HOME_TERRACE_ELEVATION } from '../../../lib/chef/diner/home-spatial';
import { box, PALETTE } from './models';

/** Actual shared foundation and supported floors; also used by geometry checks. */
export function createHomeBoard(width:number,height:number,floor='checker'){
  const space=homeSpatial(width,height),depth=height+space.terrace.h,root=new THREE.Group();
  root.name='home-board';
  // One foundation joins the raised restaurant to its welcome terrace.
  root.add(box(width+.26,.14,depth+.26,'#526d60',(width-1)/2,-.11,(depth-1)/2,.045));
  root.add(box(width+.14,.055,height+.14,'#967350',(width-1)/2,-.0075,(height-1)/2,.022));
  const colors=floor==='terracotta'?['#cb8c72','#dca68b']:floor==='cream'?['#f2ece0','#eee7da']:['#8eaf9b','#f5f0e6'];
  const cells:Array<{x:number;y:number;h:number;color:string}>=[];
  for(let y=0;y<depth;y++)for(let x=0;x<width;x++)cells.push({x,y,h:y<height?HOME_INTERIOR_ELEVATION:HOME_TERRACE_ELEVATION,color:y<height?colors[(x+y)%2]:x===space.door.x||x===space.door.x-1?'#ebd9c2':(Math.floor(x/2)+y)%2?'#c8ccbe':'#d2d6c9'});
  // Touch targets remain individual cells. Their seams are not an always-on editor grid.
  const geometry=new THREE.BoxGeometry(1,.075,1),material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.84}),tiles=new THREE.InstancedMesh(geometry,material,cells.length),matrix=new THREE.Matrix4();
  tiles.name='home-supported-tiles';tiles.receiveShadow=true;tiles.userData.tiles=cells;
  cells.forEach((cell,index)=>{matrix.makeTranslation(cell.x,cell.h-.0375,cell.y);tiles.setMatrixAt(index,matrix);tiles.setColorAt(index,new THREE.Color(cell.color));});tiles.instanceMatrix.needsUpdate=true;if(tiles.instanceColor)tiles.instanceColor.needsUpdate=true;root.add(tiles);
  const gridVertices:number[]=[];
  for(let x=0;x<=width;x++)gridVertices.push(x-.5,HOME_INTERIOR_ELEVATION+.008,-.5,x-.5,HOME_INTERIOR_ELEVATION+.008,height-.5);
  for(let y=0;y<=height;y++)gridVertices.push(-.5,HOME_INTERIOR_ELEVATION+.008,y-.5,width-.5,HOME_INTERIOR_ELEVATION+.008,y-.5);
  const gridGeometry=new THREE.BufferGeometry();gridGeometry.setAttribute('position',new THREE.Float32BufferAttribute(gridVertices,3));
  const grid=new THREE.LineSegments(gridGeometry,new THREE.LineBasicMaterial({color:'#365f55',transparent:true,opacity:.42,depthWrite:false}));grid.name='decoration-grid';grid.userData.editorGrid=true;grid.visible=false;grid.raycast=()=>{};root.add(grid);
  const step=box(1.12,HOME_INTERIOR_ELEVATION-HOME_TERRACE_ELEVATION,.16,PALETTE.oak,space.door.x,(HOME_INTERIOR_ELEVATION+HOME_TERRACE_ELEVATION)/2,height-.42,.008);step.name='home-doorstep';root.add(step);
  // A continuous low edging makes the whole miniature read as one board.
  root.add(box(width+.24,.06,.065,'#7a9585',(width-1)/2,-.0025,depth-.42,.012));
  for(const x of [-.595,width-.405])root.add(box(.065,.06,space.terrace.h+.09,'#7a9585',x,-.0025,height+(space.terrace.h-1)/2,.012));
  return root;
}
