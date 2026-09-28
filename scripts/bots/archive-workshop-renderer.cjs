const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),site=path.join(root,'public/bots-playtest');
const release=JSON.parse(fs.readFileSync(path.join(site,'release.json'),'utf8'));
const version=JSON.parse(release.versions.match(/PREVIEW_VERSIONS=(\{[^\n]+?\}) as const/)[1]);
const id=version.presentation,destination=path.join(site,'releases',id),prefix=`/bots-playtest/releases/${id}/`;
fs.mkdirSync(destination,{recursive:true});
for(const name of fs.readdirSync(site).filter(n=>/\.(js|css|html|json)$/.test(n)&&n!=='releases.json')){
 const output=path.join(destination,name);if(fs.existsSync(output))continue;
 const text=fs.readFileSync(path.join(site,name),'utf8').replaceAll('/bots-playtest/viewer.js',prefix+'viewer.js').replaceAll('/bots-playtest/styles.css',prefix+'styles.css').replaceAll('n.p="/bots-playtest/"',`n.p="${prefix}"`).replaceAll('r.p="/bots-playtest/"',`r.p="${prefix}"`);
 // Dynamic chunks must resolve to the archived code as well as the entry script.
 const pinned=name.endsWith('.js')?text.replace(/([A-Za-z_$][\w$]*)\.p="\/bots-playtest\/"/g,`$1.p="${prefix}"`):text;
 fs.writeFileSync(output,pinned);
}
const file=path.join(site,'releases.json'),registry=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
registry[`mk8-personal-toys-${id}`]=prefix+'index.html';fs.writeFileSync(file,JSON.stringify(registry,null,2));
console.log('Archived renderer '+id+' for historical replay playback.');
