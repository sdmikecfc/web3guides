/** Export the original score, never a recording of third-party generated music. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('../node_modules/typescript/lib/typescript.js');
const source=fs.readFileSync(path.join(__dirname,'../src/lib/chef/diner/music-score.ts'),'utf8'),moduleScore={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleScore,exports:moduleScore.exports});
const score=moduleScore.exports.DINER_MUSIC_SCORE,rate=48000,repeats=2,length=score.melody.length*score.noteSeconds*repeats+2;
const destination=path.resolve(__dirname,'../public/diner-audio/reference');fs.mkdirSync(destination,{recursive:true});
function render(melodyOnly){
 const samples=new Float64Array(Math.ceil(length*rate));
 function note(midi,time,duration,volume){const hz=440*2**((midi-69)/12),start=Math.round(time*rate),count=Math.ceil(duration*rate);for(let n=0;n<count&&start+n<samples.length;n++){const t=n/rate,env=t<.025?.0001*(volume/.0001)**(t/.025):volume*(.0001/volume)**((t-.025)/(duration-.025));samples[start+n]+=(2/Math.PI)*Math.asin(Math.sin(2*Math.PI*hz*t))*env;}}
 for(let i=0;i<score.melody.length*repeats;i++){note(score.melody[i%24],i*score.noteSeconds,.56,.24);if(!melodyOnly&&i%3===0)note(score.bass[Math.floor(i/6)%4],i*score.noteSeconds,1.4,.18);}
 let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));const scale=.707/peak;
 const out=Buffer.alloc(44+samples.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]*scale))*32767),44+i*2);return out;
}
function variable(value){const bytes=[value&127];while(value>>=7)bytes.unshift((value&127)|128);return bytes;}
function midi(){const events=[{tick:0,bytes:[0xff,0x51,3,0x06,0xb6,0xc0]},{tick:0,bytes:[0xff,0x58,4,3,2,24,8]},{tick:0,bytes:[0xc0,4]}];for(let i=0;i<score.melody.length*repeats;i++){events.push({tick:i*480,bytes:[0x90,score.melody[i%24],85]},{tick:i*480+611,bytes:[0x80,score.melody[i%24],0]});}events.sort((a,b)=>a.tick-b.tick);let tick=0,bytes=[];for(const event of events){bytes.push(...variable(event.tick-tick),...event.bytes);tick=event.tick;}bytes.push(0,255,47,0);const head=Buffer.from([77,84,104,100,0,0,0,6,0,0,0,1,1,224]),chunk=Buffer.alloc(8);chunk.write('MTrk');chunk.writeUInt32BE(bytes.length,4);return Buffer.concat([head,chunk,Buffer.from(bytes)]);}
fs.writeFileSync(path.join(destination,'diner-original-reference.wav'),render(false));fs.writeFileSync(path.join(destination,'diner-melody-only.wav'),render(true));fs.writeFileSync(path.join(destination,'diner-melody.mid'),midi());
console.log(`Exported two ${length.toFixed(2)}s mono 48kHz/16-bit WAVs and original melody MIDI to ${destination}.`);
