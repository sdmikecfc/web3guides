/** Real miniature geometry, support contact and staff readability checks. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {deflateSync} from 'node:zlib';
import ts from 'typescript';
const require=createRequire(import.meta.url),threeURL=pathToFileURL(resolve('node_modules/three/build/three.module.js')).href,T=await import(threeURL);
let source=readFileSync('src/app/chef/diner-preview/models.ts','utf8');
source=source.replaceAll("from 'three'",`from '${threeURL}'`).replaceAll("from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'",`from '${pathToFileURL(resolve('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href}'`);
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,kit=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const kinds=['burger_mascot','retro_radio','condiment_caddy','welcome_mat'];let cases=0;
for(const kind of kinds){
 const model=kit.createModel(kind);assert.equal(model.userData.unsupportedModel,undefined,`${kind} fell back to a generic box`);let meshes=0;
 model.traverse(part=>{if(!part.isMesh)return;meshes++;assert(part.geometry.getAttribute('position').array.every(Number.isFinite),`${kind} has invalid vertices`);});assert(meshes<=14,`${kind} adds too many draw calls`);
 model.updateMatrixWorld(true);const native=new T.Box3().setFromObject(model),nativeSize=native.getSize(new T.Vector3());assert(native.min.y>=-.001&&native.min.y<.035,`${kind} does not meet its support`);
 assert(nativeSize.x<.9&&nativeSize.z<.7,`${kind} protrudes into another tile`);
 if(kind==='welcome_mat'){assert(native.max.y<.04,'mat is a raised obstacle');assert(nativeSize.x>.8&&nativeSize.z>.6,'floor mat has been scaled as a counter ornament');}
 else for(let rotation=0;rotation<4;rotation++){
   model.rotation.y=Math.PI-rotation*Math.PI/2;kit.configureRoomMount(model,{kind,rotation,mount:{kind:'counter',targetId:'test-counter',surfaceHeight:1}});model.updateMatrixWorld(true);
   const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());assert(size.x<=.40&&size.z<=.40&&size.y<=.41,`${kind}/${rotation} is too big for its real counter slot`);assert(bounds.min.y>=-.001&&bounds.min.y<.020,`${kind} floats above the counter`);cases++;
 }
 cases++;
}
const waiter=kit.createModel('waiter',{color:kit.PALETTE.sage}),chef=kit.createModel('chef',{color:kit.PALETTE.sage});
assert(waiter.getObjectByName('server-towel')&&waiter.getObjectByName('server-badge'),'server has no identifiable working outfit');
assert(!chef.getObjectByName('server-towel'),'chef inherited server props');
const colors=model=>{const result=new Set();model.traverse(part=>{if(part.isMesh)result.add(part.material.color.getHexString());});return result;};
assert(colors(waiter).has('b94f43'),'default server still blends into sage kitchen crew');
assert(colors(kit.createModel('waiter',{color:'#5566aa'})).has('5566aa'),'custom server uniforms no longer work');
for(const pose of ['idle','walk','takeOrder','serve','wash']){kit.animateCharacter(waiter,1.2,pose,pose==='serve',pose==='walk');waiter.updateMatrixWorld(true);assert(new T.Box3().setFromObject(waiter).max.y<1.85,'server acquired a chef hat or broken pose');cases++;}
console.log(`Starter trinket art PASS: ${cases} bounds, rotations, support contacts, low-draw-call models and distinct server outfit cases.`);
if(process.argv.includes('--render')){
 const {Resvg}=require('@resvg/resvg-js'),sun=new T.Vector3(-.5,.8,1).normalize();
 function png(size,pixels){const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([length,type,data,sum]);};const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;const rows=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++)Buffer.from(pixels.buffer,y*size*4,size*4).copy(rows,y*(size*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
 function project(model){
  model.rotation.y=Math.PI;model.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),extent=Math.max(size.x*.70,size.y*.68,size.z*.8,.40),focus=bounds.getCenter(new T.Vector3()),camera=new T.OrthographicCamera(-extent,extent,extent,-extent,.01,100);camera.position.copy(focus).add(new T.Vector3(3.5,4.4,7));camera.lookAt(focus);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);const resolution=600,pixels=new Uint8ClampedArray(resolution*resolution*4),depth=new Float64Array(resolution*resolution).fill(Infinity);
  model.traverse(part=>{if(!part.isMesh)return;const pos=part.geometry.getAttribute('position'),index=part.geometry.index;for(let i=0;i<(index?.count??pos.count);i+=3){const pts=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(pos,index?index.getX(i+k):i+k).applyMatrix4(part.matrixWorld)),normal=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();if(normal.dot(camera.position.clone().sub(pts[0]))<=0)continue;const paint=part.material.color.clone().multiplyScalar(.76+Math.max(0,normal.dot(sun))*.27).getHex(),rgb=[paint>>>16,(paint>>>8)&255,paint&255];pts.forEach(p=>{p.project(camera);p.x=(p.x+1)*resolution/2;p.y=(1-p.y)*resolution/2;});const[a,b,c]=pts,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-8)continue;const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(resolution-1,Math.ceil(Math.max(a.x,b.x,c.x))),minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),maxY=Math.min(resolution-1,Math.ceil(Math.max(a.y,b.y,c.y)));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x+.5,py=y+.5,u=((b.y-c.y)*(px-c.x)+(c.x-b.x)*(py-c.y))/den,v=((c.y-a.y)*(px-c.x)+(a.x-c.x)*(py-c.y))/den,w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;const z=u*a.z+v*b.z+w*c.z,at=y*resolution+x;if(z>depth[at])continue;depth[at]=z;pixels[at*4]=rgb[0];pixels[at*4+1]=rgb[1];pixels[at*4+2]=rgb[2];pixels[at*4+3]=255;}}});
  return `<image width="240" height="240" href="data:image/png;base64,${png(resolution,pixels).toString('base64')}"/>`;
 }
 const items=[...kinds,'waiter','chef'];let body='<rect width="900" height="610" fill="#f7eee0"/><text x="24" y="31" fill="#694a35" font-size="22" font-weight="700">Little burger-shop keepsakes · actual geometry</text>';
 items.forEach((kind,i)=>{const x=(i%3)*300,y=50+Math.floor(i/3)*272,model=kit.createModel(kind,{color:kit.PALETTE.sage});body+=`<g transform="translate(${x+30} ${y})">${project(model)}</g><text x="${x+30}" y="${y+253}" fill="#694a35" font-size="17">${kind.replaceAll('_',' ')}</text>`;});
 mkdirSync('.dk-preview',{recursive:true});writeFileSync('.dk-preview/starter-trinkets.png',new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="610" font-family="Segoe UI,sans-serif">${body}</svg>`).render().asPng());console.log('Rendered .dk-preview/starter-trinkets.png (triangle projection, not WebGL approval).');
}
