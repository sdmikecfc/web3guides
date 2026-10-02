// The server runs exactly the shipped pose/contact engine, without browser UI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'art-src/bots/personal-v8'),out=path.join(root,'src/lib/bots/workshop8/runtime');
fs.mkdirSync(out,{recursive:true});
const names=['v8-engine.ts','parts-assembly.ts','equipment-pose.ts','weapon-actions.ts','special-equipment.ts','asset-versions.ts'];
const receipt={source:'art-src/bots/personal-v8',files:{}};
for(const name of names){const original=fs.readFileSync(path.join(source,name),'utf8');const text=original.replaceAll("'../../../src/lib/bots/workshop8/equipment-types'","'../equipment-types'").replaceAll("'./equipment-stats'","'../equipment-stats'").replaceAll("'./paint'","'../appearance'");fs.writeFileSync(path.join(out,name),text);receipt.files[name]=crypto.createHash('sha256').update(original).digest('hex');}
fs.writeFileSync(path.join(out,'source-receipt.json'),JSON.stringify(receipt,null,2));
console.log('Server pose/contact runtime synchronized; rules unchanged.');
