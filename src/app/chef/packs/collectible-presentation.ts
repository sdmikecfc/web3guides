import * as THREE from 'three';

/** Shared lighting and framing for the collection cards and animated close-up. */
export function configureCollectibleRenderer(renderer: THREE.WebGLRenderer) {
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.3;
}

export function disposeCollectible(root: THREE.Object3D) {
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 root.traverse(object=>{if(object instanceof THREE.Mesh){
  geometries.add(object.geometry);
  (Array.isArray(object.material)?object.material:[object.material]).forEach(material=>{
   materials.add(material);
   Object.values(material).forEach(value=>{if(value instanceof THREE.Texture)textures.add(value);});
  });
 }});
 geometries.forEach(geometry=>geometry.dispose());
 materials.forEach(material=>material.dispose());
 textures.forEach(texture=>texture.dispose());
}

export function createCollectiblePresentation() {
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,40),rig=new THREE.Group();
 scene.add(rig,new THREE.HemisphereLight(0xfff7e7,0x738875,3));
 const key=new THREE.DirectionalLight(0xffe6c2,4);key.position.set(-3,5,5);scene.add(key);
 const rim=new THREE.DirectionalLight(0xa2dbd1,2);rim.position.set(4,2,-2);scene.add(rim);
 const base=new THREE.Mesh(new THREE.CylinderGeometry(.68,.72,.075,64),new THREE.MeshStandardMaterial({color:0x263c34,metalness:.3,roughness:.4}));
 base.position.y=-.04;scene.add(base);
 let center=.55;
 return {
  scene,camera,rig,
  attach(model: THREE.Group) {
   const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
   model.position.set(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2);
   rig.add(model);center=size.y*.49;
   base.scale.set(Math.max(size.x,size.z)*.8,1,Math.max(size.x,size.z)*.8);
  },
  fit(width: number,height: number) {
   camera.position.set(.36,center+2.8,7);camera.lookAt(0,center,0);camera.updateMatrixWorld();
   let spanX=1.3,spanY=1.3;
   if(rig.children.length){
    const bounds=new THREE.Box3().setFromObject(rig).expandByObject(base),right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
     const point=new THREE.Vector3(x,y,z);minX=Math.min(minX,point.dot(right));maxX=Math.max(maxX,point.dot(right));minY=Math.min(minY,point.dot(up));maxY=Math.max(maxY,point.dot(up));
    }
    spanX=maxX-minX;spanY=maxY-minY;
    const target=new THREE.Vector3(0,center,0);
    camera.position.addScaledVector(right,(minX+maxX)/2-target.dot(right));
    camera.position.addScaledVector(up,(minY+maxY)/2-target.dot(up));
    camera.updateMatrixWorld();
   }
   const vertical=Math.max(spanY*1.18,spanX*1.18/(width/height),.7);
   camera.top=vertical/2;camera.bottom=-vertical/2;camera.left=-vertical*width/height/2;camera.right=vertical*width/height/2;camera.updateProjectionMatrix();
  },
  dispose() {disposeCollectible(scene);scene.clear();},
 };
}
