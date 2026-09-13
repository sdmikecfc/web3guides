// Read-only GLB checks; writes the explicit JSON receipt passed as the second argument.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=path.resolve(process.argv[2]),reportPath=path.resolve(process.argv[3]);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));const report={status:'passed',evidence:'Static exported GLB/manifest checks, not a gameplay or physical-device performance claim.',manifestSha256:digest(fs.readFileSync(path.join(dir,'manifest.json'))),heroes:[]};
function close(a,b,t=0.02){assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<t,`${a} differs ${b}`)}
for(const style of ['tank','speed','ranged']){
 const hero=manifest.heroes[style],file=path.join(dir,path.basename(hero.modelUrl)),b=fs.readFileSync(file);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);assert.equal(digest(b),hero.sha256);
 const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString('utf8')),byName=new Map(j.nodes.map((n,i)=>[n.name,{n,i}])),parents=new Map();j.nodes.forEach((n,i)=>(n.children||[]).forEach(child=>parents.set(child,i)));
 for(const [name,rest]of Object.entries(hero.nodes)){
  const entry=byName.get(name);assert.ok(entry,`missing rig node ${name}`);const n=entry.n;assert.ok(!n.matrix,`explicit TRS required ${name}`);close((n.translation||[0,0,0]).map(v=>v*1000),rest.position);let q=n.rotation||[0,0,0,1];if(q.reduce((s,v,i)=>s+v*rest.quaternion[i],0)<0)q=q.map(v=>-v);close(q,rest.quaternion,.00002);assert.equal(parents.has(entry.i)?j.nodes[parents.get(entry.i)].name:null,rest.parent);
 }
 let triangles=0,clay=0;const surfaceIds=new Set();
 for(const n of j.nodes){if(n.mesh===undefined)continue;assert.ok(n.extras?.mk_surface);assert.ok(n.extras.mk_surface_id);assert.ok(!surfaceIds.has(n.extras.mk_surface_id),`duplicate surface ${n.extras.mk_surface_id}`);surfaceIds.add(n.extras.mk_surface_id);
  for(const p of j.meshes[n.mesh].primitives){assert.equal(p.mode??4,4);triangles+=(p.indices!==undefined?j.accessors[p.indices].count:j.accessors[p.attributes.POSITION].count)/3;assert.ok(p.attributes.NORMAL!==undefined);assert.ok(p.attributes.TEXCOORD_0!==undefined);const mat=j.materials[p.material];if(mat.normalTexture)assert.ok(p.attributes.TANGENT!==undefined,`normal texture without tangents ${n.name}`);if(n.extras.mk_surface==='clay'){clay++;assert.ok(mat.normalTexture);assert.ok(mat.pbrMetallicRoughness?.metallicRoughnessTexture);}}
 }
 assert.equal(triangles,hero.triangles);assert.ok(triangles<=85000);assert.ok(j.materials.length<=14);assert.ok(j.images?.length>=2);assert.ok(j.images.every(i=>i.bufferView!==undefined&&!i.uri));
 for(const proxy of hero.proxies){assert.ok(hero.nodes[proxy.node]);assert.ok(proxy.half.every(v=>v>0));assert.ok(['head','torso','armL','armR','legL','legR'].includes(proxy.slot));}
 for(const marker of Object.values(hero.markers))assert.ok(hero.nodes[marker.node]);
 if(style==='ranged')for(const name of ['backpack','cannonDeploy','cannonYaw','cannonPitch','cannonRecoil','cannonMuzzle','backupGun','backupGunL','backupHolster','backupHolsterL'])assert.ok(byName.has(name));
 if(style==='speed')for(const name of ['wheelFrontL','wheelFrontR','wheelBackL','wheelBackR'])assert.ok(byName.has(name));
 report.heroes.push({style,sha256:hero.sha256,bytes:b.length,triangles,rigNodes:Object.keys(hero.nodes).length,meshNodes:surfaceIds.size,claySurfaces:clay,materials:j.materials.length,embeddedImages:j.images.length,allRestNodesMatchExport:true,allNormalMappedPrimitivesHaveTangents:true});
}
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));process.stdout.write(JSON.stringify(report,null,2)+'\n');
