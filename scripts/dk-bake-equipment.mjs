/** Original isometric equipment; shared art for catalog and restaurant. */
import {Resvg} from '@resvg/resvg-js';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=new URL('../public/chef-art/equipment/',import.meta.url);mkdirSync(out,{recursive:true});
const path=(d,fill,stroke='#826b56',width=2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const ellipse=(x,y,rx,ry,c)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
for(const machine of ['fryer','drinks'])for(const back of [false,true]){
 const top=machine==='fryer'?'#e0cb8f':'#bfdbc9',left=machine==='fryer'?'#c69061':'#85ac9e',right=machine==='fryer'?'#a9704e':'#658d82';
 let b=ellipse(96,189,64,18,'#89745425')+path('M40 168 44 193 54 198 55 179Z','#8e7360')+path('M143 168 141 193 132 198 131 181Z','#785f4f')+path('M36 105 96 135 96 192 36 161Z',left)+path('M96 135 156 105 156 163 96 192Z',right)+path('M34 103 94 73 157 103 96 135Z',top);
 if(machine==='fryer'){
  b+=path('M47 101 92 80 140 101 96 123Z','#777c70')+path('M55 100 93 85 131 101 95 117Z','#b58b40')+path('M58 97 91 81 130 99 96 116Z','#d5b65a','#f0d083',2.5);
  for(let i=0;i<8;i++){const x=69+(i*11)%45,y=96+(i*7)%13;b+=path(`M${x} ${y}l3-17 5 1-3 19Z`,'#efc870','#c79b45',1);}
  b+=path(back?'M116 97 145 81 146 73':'M107 112 136 128 146 123','none','#624e40',7)+path('M36 119 95 149 156 119','none','#eed8ad',5);
  if(!back)b+=ellipse(115,153,4,5,'#eabc5f')+ellipse(135,143,4,5,'#eee6c9')+path('M104 174 145 154','none','#684c3b',2);
 }else{
  b+=path('M56 93 58 56 94 37 137 58 135 94 96 114Z','#d6e8d9')+path('M62 63 95 47 130 63 128 85 96 103 63 87Z','#efd771','#a5b9a0',1.5)+ellipse(96,60,35,13,'#f8e7a7')+path('M57 56 94 37 137 58 99 77Z','#f1e3bc')+path('M94 37V76','none','#fff6da',2)+path('M88 100v13l14 7v-8','none','#71867a',5)+ellipse(99,132,14,6,'#edf1da')+path('M86 130 90 149Q100 157 111 149L112 130Z','#fbf6dd')+ellipse(99,130,13,5,'#f3d272');
  if(!back)b+=path('M111 159 143 143 143 162 111 178Z','#f3e8c7')+path('M118 159 136 150','none','#a6b683',3);
 }
 const name=machine+(back?'-back':'');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="224" viewBox="0 0 192 224">${b}</svg>`;
 writeFileSync(new URL(name+'.svg',out),svg);writeFileSync(new URL(name+'.png',out),new Resvg(svg).render().asPng());
}
console.log('Baked fryer and lemonade equipment in both orientations.');
