// Strip only texture payloads from approved GLBs. Positions, normals, topology,
// attachment transforms and collision surfaces remain byte-identical.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'server-assets/bots8');fs.mkdirSync(out,{recursive:true});
const entries=['catalogue-2','weapon-kits-1'].flatMap(group=>JSON.parse(fs.readFileSync(path.join(root,'public/bots-playtest/assets',group,'manifest.json'))).entries);
const files=[...entries.map(e=>({id:e.id,file:path.join(root,'public',e.url),hash:e.sha256})),{id:'__support',file:path.join(root,'public/bots-playtest/assets/warden-support-hand.glb')},{id:'__special',file:path.join(root,'public/bots-playtest/assets/weapon-kits-1/special-equipment.glb')}];
const receipt={assets:{},bytes:0};
for(const {id,file,hash} of files){
 const original=fs.readFileSync(file),sourceHash=crypto.createHash('sha256').update(original).digest('hex');if(hash&&sourceHash!==hash)throw Error('Source hash changed: '+id);
 const jsonSize=original.readUInt32LE(12),json=JSON.parse(original.subarray(20,20+jsonSize).toString()),bin=original.subarray(28+jsonSize);
 const used=new Set();for(const a of json.accessors??[]){if(a.bufferView!==undefined)used.add(a.bufferView);if(a.sparse){used.add(a.sparse.indices.bufferView);used.add(a.sparse.values.bufferView);}}
 const views=[],chunks=[],map=new Map();let offset=0;
 for(const index of [...used].sort((a,b)=>a-b)){const view=json.bufferViews[index],pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}map.set(index,views.length);const chunk=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);views.push({...view,buffer:0,byteOffset:offset});chunks.push(chunk);offset+=chunk.length;}
 for(const a of json.accessors??[]){if(a.bufferView!==undefined)a.bufferView=map.get(a.bufferView);if(a.sparse){a.sparse.indices.bufferView=map.get(a.sparse.indices.bufferView);a.sparse.values.bufferView=map.get(a.sparse.values.bufferView);}}
 delete json.images;delete json.textures;delete json.samplers;json.materials=(json.materials??[]).map(m=>({name:m.name}));json.bufferViews=views;json.buffers=[{byteLength:offset}];
 const raw=Buffer.from(JSON.stringify(json)),jsonChunk=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),binary=Buffer.concat([...chunks,Buffer.alloc((4-offset%4)%4)]),output=Buffer.alloc(28+jsonChunk.length+binary.length);
 output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);output.writeUInt32LE(jsonChunk.length,12);output.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(output,20);output.writeUInt32LE(binary.length,20+jsonChunk.length);output.writeUInt32LE(0x004e4942,24+jsonChunk.length);binary.copy(output,28+jsonChunk.length);
 const compressed=require('node:zlib').gzipSync(output,{level:9});
 fs.writeFileSync(path.join(out,id+'.glb.gz'),compressed);if(fs.existsSync(path.join(out,id+'.glb')))fs.unlinkSync(path.join(out,id+'.glb'));
 receipt.assets[id]={sourceHash,sha256:crypto.createHash('sha256').update(output).digest('hex')};receipt.bytes+=compressed.length;
}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(`${files.length} exact-geometry assets, ${(receipt.bytes/1048576).toFixed(1)} MB; no texture data.`);
