import * as T from 'three';
import {decodeBanner} from '../../../src/lib/bots/workshop8/banner-storage';
export {readBanner,saveBanner,decodeBanner,cropBanner,bannerCanvasBlob} from '../../../src/lib/bots/workshop8/banner-storage';
function emblem(){const c=document.createElement('canvas');c.width=512;c.height=768;const x=c.getContext('2d')!;x.fillStyle='#173e47';x.fillRect(0,0,512,768);x.strokeStyle='#d5ba7e';x.lineWidth=14;x.strokeRect(30,30,452,708);x.fillStyle='#dfc58a';x.font='bold 145px Georgia';x.textAlign='center';x.fillText('MK',256,410);return c}
/** Pure presentation: no collision proxies, GP, combat RNG or equipment slots. */
export function createBanner(){
 const texture=new T.CanvasTexture(emblem());texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;
 const material=new T.MeshStandardMaterial({map:texture,roughness:.92,metalness:0,side:T.DoubleSide}),poleMat=new T.MeshStandardMaterial({color:'#6f7370',roughness:.45,metalness:.85});
 const standard=new T.Group(),garage=new T.Group(),cloth=new T.Mesh(new T.PlaneGeometry(.48,.72,8,12),material),large=new T.Mesh(new T.PlaneGeometry(.96,1.44,8,12),material);
 cloth.position.set(.27,.13,0);large.position.set(.51,2.5,0);standard.add(cloth);garage.add(large);
 const pole=new T.Mesh(new T.CylinderGeometry(.019,.022,1.25,10),poleMat);standard.add(pole);const tall=new T.Mesh(new T.CylinderGeometry(.025,.030,3.40,10),poleMat);tall.position.y=1.7;garage.add(tall);const foot=new T.Mesh(new T.CylinderGeometry(.24,.30,.08,16),poleMat);foot.position.y=.04;garage.add(foot);garage.position.set(-2.8,0,-1);
 const base=Float32Array.from(cloth.geometry.attributes.position.array),big=Float32Array.from(large.geometry.attributes.position.array);
 function drape(mesh:T.Mesh<T.PlaneGeometry>,original:Float32Array,t:number,small:boolean){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const edge=(original[i*3]+(small?.24:.48))/(small?.48:.96);p.setZ(i,Math.sin(edge*5+original[i*3+1]*4-t*1.3)*.035*edge+(1-edge)*.01)}p.needsUpdate=true;mesh.geometry.computeVertexNormals()}
 let current:ImageBitmap|null=null;
 return {standard,garage,attach(model:T.Group){const chest=model.getObjectByName('chest')!;standard.position.set(.62,.78,-.53);standard.rotation.set(0,0,0);chest.add(standard)},setCanvas(canvas:HTMLCanvasElement){texture.image=canvas;texture.needsUpdate=true},async load(blob:Blob|null){const next=blob?await decodeBanner(blob):null;current?.close();current=next;texture.image=next??emblem();texture.needsUpdate=true},pose(seconds:number,reduced:boolean){drape(cloth,base,reduced?0:seconds,true);drape(large,big,reduced?0:seconds,false)},visible(value:boolean){standard.visible=value;garage.visible=value},dispose(){standard.removeFromParent();garage.removeFromParent();for(const group of [standard,garage])group.traverse(o=>{if((o as T.Mesh).isMesh)(o as T.Mesh).geometry.dispose()});material.dispose();poleMat.dispose();texture.dispose();current?.close()}};
}
