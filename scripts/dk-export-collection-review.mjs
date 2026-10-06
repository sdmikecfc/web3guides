/** Disposable render proof from the shipped code models; never a runtime asset. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const out=resolve(process.argv[2]??'D:/Temp/domain-kitchen-collection-review');
if(!/^D:[\\/]/i.test(out))throw new Error('Review output must stay on D:.');
await mkdir(out,{recursive:true});
globalThis.FileReader??=class {result=null;onloadend=null;readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.();});}};
const {COLLECTIBLES}=await sourceModule('src/lib/chef/diner/collectible-packs.ts');
const {SHOP_DECOR}=await sourceModule('src/lib/chef/diner/decor-catalog.ts');
const {createModel}=await sourceModule('src/app/chef/diner-preview/models.ts');
for(const [name,items] of [['regular',COLLECTIBLES.filter(i=>i.pack==='regular')],['super',COLLECTIBLES.filter(i=>i.pack==='super')],['shop',SHOP_DECOR]]){
  const scene=new THREE.Scene(),labels=[];
  for(const [i,item] of items.entries()){
    const root=new THREE.Group(),model=createModel(item.id);model.rotation.y=Math.PI+.32;
    let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=1.35/Math.max(size.x,size.y,size.z);
    model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    // Preserve the real material colours, substituting an offline PBR material.
    model.traverse(object=>{if(object.isMesh){const original=object.material;object.material=new THREE.MeshStandardMaterial({color:original.color,roughness:.68,metalness:.08});}});
    root.add(model);root.position.set((i%4-1.5)*2.4,0,(Math.floor(i/4)-(Math.ceil(items.length/4)-1)/2)*2.5);scene.add(root);
    labels.push({name:item.name,x:root.position.x,y:-root.position.z-.91});
  }
  await writeFile(resolve(out,`${name}.glb`),Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true})));
  await writeFile(resolve(out,`${name}.json`),JSON.stringify({name,labels,rows:Math.ceil(items.length/4)},null,2));
}
console.log(`Exported three proof scenes to ${out}`);
