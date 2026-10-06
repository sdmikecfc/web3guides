/** Original plated illustrations. One art source for world, cookbook and mastery.
 * Run node scripts/dk-bake-dishes.mjs; image registration remains 256×224. */
import {Resvg} from '@resvg/resvg-js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const INK='#80634c';
const e=(x,y,rx,ry,c,s='none',w=1.5)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}" stroke="${s}" stroke-width="${w}"/>`;
const p=(d,c,s=INK,w=1.7)=>`<path d="${d}" fill="${c}" stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const polygon=(pts,c,s=INK,w=1.7)=>p('M'+pts.map(q=>q.join(' ')).join('L')+'Z',c,s,w);
const g=(body,x=0,y=0,angle=0)=>`<g transform="translate(${x} ${y}) rotate(${angle})">${body}</g>`;
const line=(d,c,w=2)=>p(d,'none',c,w);
const defs=`<defs>
 <radialGradient id="porcelain" cx=".45" cy=".25" r=".85"><stop stop-color="#fffef6"/><stop offset="1" stop-color="#f4e7c8"/></radialGradient>
 <linearGradient id="crust" x2="0" y2="1"><stop stop-color="#f7d081"/><stop offset="1" stop-color="#d79d51"/></linearGradient>
 <linearGradient id="tomato" x2="0" y2="1"><stop stop-color="#ea7755"/><stop offset="1" stop-color="#bf4e36"/></linearGradient>
 <linearGradient id="cream" x2=".4" y2="1"><stop stop-color="#fffef0"/><stop offset="1" stop-color="#f1dbab"/></linearGradient>
 <linearGradient id="jade" x2=".5" y2="1"><stop stop-color="#a7c9ba"/><stop offset="1" stop-color="#629485"/></linearGradient>
 <linearGradient id="copper" x2=".7" y2="1"><stop stop-color="#efc091"/><stop offset=".45" stop-color="#cf9164"/><stop offset="1" stop-color="#b7764c"/></linearGradient>
 <linearGradient id="lemon" x2="0" y2="1"><stop stop-color="#f9df77"/><stop offset="1" stop-color="#edbd4e"/></linearGradient>
 </defs>`;

function leaf(x,y,scale=1,angle=0,color='#629647'){
 return g(`<g transform="scale(${scale})">${p('M0 0Q-12-3-9-15Q6-17 9-9Q10-2 0 0Z',color,'#4e713b',1.1)+line('M0-1Q1-8-7-13','#b1c780',1.2)}</g>`,x,y,angle);
}
function basil(x,y,scale=1){return leaf(x,y,scale,-46)+leaf(x+3,y+1,scale,49,'#85ae50')+leaf(x,y-1,scale*.8,4,'#588b42');}
function plate(mastered=false,tint='#91a286'){
 let b=e(128,174,95,21,'#836f4824')+e(128,151,99,37,'#ded8bf',INK,1.5)+e(128,144,102,41,'url(#porcelain)',INK,1.7)+e(128,141,84,31,'none','#e4d6b4',1.7);
 if(mastered){b+=e(128,143,97,37,'none','#c5a663',1.6)+e(128,141,87,32,'none',tint,2.2);for(const a of[.08,.23,.39,.57,.73,.90]){const t=a*Math.PI*2,x=128+94*Math.cos(t),y=143+35*Math.sin(t);b+=e(x,y,2.4,1.35,tint);}}
 else b+=line('M43 141Q54 115 93 112','#fffefa',2.8);
 return b;
}
function irregular(cx,cy,rx,ry,color,stroke=INK,width=1.7,phase=0){
 const pts=Array.from({length:32},(_,i)=>{const a=i/32*Math.PI*2,r=1+.025*Math.sin(a*5+phase)+.016*Math.cos(a*9);return[cx+rx*Math.cos(a)*r,cy+ry*Math.sin(a)*r];});
 return polygon(pts,color,stroke,width);
}
function melt(x,y,rx,ry){return irregular(x,y,rx,ry,'#fff0c4','#efcc88',.8,x*.1);}
function tomato(x,y,scale=1,angle=0){return g(`<g transform="scale(${scale})">${e(0,0,9,5,'#df6945','#b05236',1)+p('M-6 0Q0-5 6 0Q0 5-6 0Z','#f29d61','none')+e(-2,-.7,1,.8,'#f9da8e')+e(2,1,1,.8,'#f9da8e')}</g>`,x,y,angle);}
function cheese(x,y,angle=0){return g(p('M-8 0 3-6 12-2 1 5Z','#fff4ce','#dabd84',.7),x,y,angle);}
function truffle(x,y,angle=0){return g(e(0,0,11,5,'#886a55','#674f43',1)+line('M-7 0Q-2-4 3 0T8 0','#c7ad8a',1)+line('M-4 2 0-2 5 2','#b69877',.8),x,y,angle);}

function pizza(mastered){
 let b=plate(mastered,'#a4ad79')+irregular(128,137,73,31,'#c68b49')+irregular(128,130,75,33,'url(#crust)')+irregular(128,128,64,25,'url(#tomato)','#b65c3c',1);
 for(const[x,y,rx,ry]of[[98,120,17,8],[133,111,18,8],[161,126,17,8],[140,141,18,8],[106,140,15,7]])b+=melt(x,y,rx,ry);
 for(let i=0;i<15;i++){const a=i/15*Math.PI*2,rx=70+Math.sin(i)*2;b+=e(128+Math.cos(a)*rx,130+Math.sin(a)*30,2+(i%3),1.3+(i%2)*.3,i%3?'#a86d38':'#bd8040');}
 b+=line('M65 128Q72 104 106 99','#ffe5a4',2.8)+line('M144 100Q172 106 185 121','#ffdda0',1.8);
 b+=basil(119,126,.74)+leaf(151,140,.69,66)+tomato(91,134,.72,-15)+tomato(159,115,.76,12);
 if(mastered){b+=e(134,123,17,9,'#e4d1a0')+e(134,117,17,11,'url(#cream)','#dfc996',1)+p('M125 110Q135 99 143 112','#fff9e2','#e5d2a3',.8)+basil(137,109,.70);b+=line('M82 137Q107 149 135 145Q156 145 175 131','#e5b853',1.5)+leaf(164,136,.55,55);}
 return b;
}
function ribbon(d,width=7){return line(d,'#cda35d',width+2)+line(d,'#f6d898',width)+line(d,'#ffe9b6',Math.max(1.5,width*.28));}
function pasta(mastered){
 let b=plate(mastered,'#8ba27e')+e(128,138,66,27,'#dcc49766')+irregular(128,132,57,25,'#e2bb71','#c79c56',1);
 const paths=[
  'M80 136C70 118 99 116 107 104C119 89 145 103 167 113C188 124 166 142 145 146',
  'M88 143C103 123 90 114 116 111C137 108 162 129 171 121',
  'M96 145C86 131 114 126 138 133C161 140 169 122 150 111',
  'M82 127C102 140 126 146 135 131C148 109 120 98 107 116C94 133 131 132 151 138',
  'M114 146C142 155 163 141 156 130C145 111 120 125 125 115C135 101 167 116 172 129',
 ];
 paths.forEach((d,i)=>b+=ribbon(d,i%2?6:7));
 for(const[x,y,a]of[[103,119,-8],[142,119,21],[123,138,-12]])b+=cheese(x,y,a);
 for(let i=0;i<15;i++)b+=e(92+(i*17)%74,112+(i*13)%31,1.3,.85,'#796249');
 b+=leaf(159,132,.58,60);
 if(mastered){b+=ribbon('M111 113C97 101 126 87 141 98C156 109 129 120 121 110C114 99 137 97 136 108',6)+cheese(130,92,-6)+cheese(155,110,14)+truffle(97,146,-9)+truffle(114,155,12)+leaf(163,149,.67,76);}
 return b;
}
function creamDollop(x,y,s=1){return g(`<g transform="scale(${s})">${e(0,1,10,5,'#ddc8a2')+p('M-10 0Q-11-6-4-9Q1-12 2-18Q10-12 8-7Q16-1 8 3Q0 7-10 0Z','url(#cream)','#d8c299',1)+line('M-5-5Q1-2 6-7','#fffefa',1.6)}</g>`,x,y);}
function tiramisu(mastered){
 let b=plate(mastered,'#b19272');
 b+=e(131,155,55,18,'#95724925');
 const top=[[75,105],[132,77],[181,101],[124,131]];
 const layers=[['#b88a63',37,45],['#f7e9c6',27,37],['#b78a64',20,27],['#fff0d1',8,20],['#d3ae7e',0,8]];
 for(const[c,z0,z1]of layers){b+=polygon([[75,105+z0],[124,131+z0],[124,131+z1],[75,105+z1]],c,'#957253',.8)+polygon([[124,131+z0],[181,101+z0],[181,101+z1],[124,131+z1]],c,'#957253',.8);}
 b+=polygon(top,'#f8e6c3',INK,1.6)+polygon([[80,104],[132,81],[176,102],[124,127]],'#977050','#856148',1);
 b+=line('M86 108 124 125 170 103','#b98f67',1.3);
 for(let i=0;i<19;i++){const u=(i*37%100)/100,v=(i*61%100)/100;b+=e(82+u*40+v*45,105+u*19-v*20,.7,.45,'#c9a57d');}
 b+=creamDollop(120,93,.58)+creamDollop(136,98,.60)+creamDollop(151,105,.61);
 if(mastered){b+=creamDollop(100,108,.82)+creamDollop(118,116,.85)+creamDollop(138,118,.83)+p('M143 86Q143 61 163 75Q171 86 157 88Q164 80 158 77Q150 72 149 87Z','#836049','#674b3c',1.3)+basil(167,135,.62)+line('M83 152Q72 152 77 158T93 163','#b18a63',2)+e(87,157,1.5,1,'#83604b');}
 return b;
}
function noodles(mastered){
 let b=plate(mastered,'#82aba6');
 // Chopsticks rest on the far rim rather than floating over the food.
 b+=line('M105 116 191 65','#84694b',5)+line('M111 120 203 75','#84694b',5)+line('M105 114 191 63','#d2ae75',3)+line('M111 118 203 73','#dfbd83',3);
 b+=e(128,164,40,13,'#558578')+p('M63 115Q69 165 128 170Q189 163 193 115Z','url(#jade)','#577e70',1.8)+e(128,115,65,28,'#cee0cc','#577e70',1.8)+e(128,115,57,22,'#e9c778','#8f9c77',1.2);
 const paths=['M82 119C81 98 111 107 128 116S163 130 173 117','M84 121C103 142 112 102 138 107S174 122 160 128','M99 131C130 143 142 103 158 112S158 132 139 126','M95 108C112 96 122 128 149 125'];paths.forEach(d=>b+=ribbon(d,5));
 b+=leaf(88,118,.86,-55)+leaf(91,124,.75,-10,'#89ad64')+leaf(169,116,.91,45)+leaf(158,125,.74,77,'#86a66b');
 b+=p('M118 104 136 107 133 113 115 110Z','#d68158','#aa6643',.8)+p('M128 126 143 123 148 128 133 132Z','#d98358','#aa6643',.8);
 if(mastered){b+=line('M73 137Q128 176 183 137','#ddb965',2)+ribbon('M113 109C104 94 128 88 141 97C159 110 136 112 127 104',5)+leaf(122,100,.90,-40)+leaf(140,101,.84,38)+tomato(98,124,.8,17)+p('M164 112 183 109Q183 120 171 125Z','#f7d880','#b89953',1)+line('M167 115 178 113 173 121','#fff1bf',1.6);}
 return b;
}
function lemonSlice(x,y,s=1,angle=0){return g(`<g transform="scale(${s})">${p('M-14 0Q0-25 14 0Z','#efca63','#c9a24e',1.4)+p('M-10-1Q0-19 10-1Z','#fff1b0','none')+line('M0-2 0-13M-2-2-7-8M2-2 7-8','#e6b646',1.4)}</g>`,x,y,angle);}
function tart(mastered){
 let b=plate(mastered,'#c2a16a')+e(128,148,63,23,'#aa804635')+p('M66 121 68 141Q129 191 189 141L190 121Z','#d4a363','#a87b43',1.6);
 for(let i=0;i<13;i++){const a=Math.PI*i/12,x=128+59*Math.cos(a),y=125+25*Math.sin(a);b+=line(`M${x} ${y}v16`,'#b98748',1.4);}
 b+=irregular(128,122,63,28,'url(#crust)','#aa7f47',1.4)+e(128,121,55,23,'url(#lemon)','#dfb660',1)+line('M81 117Q97 103 122 102','#fff0a9',2.2);
 for(let i=0;i<20;i++){const a=i/20*Math.PI*2;b+=e(128+Math.cos(a)*61,122+Math.sin(a)*26,3,2,'#f6d8a0','#d6aa69',.6);}
 b+=creamDollop(126,115,1.08)+lemonSlice(148,111,.82,12)+leaf(149,119,.57,82);
 if(mastered){b+=creamDollop(108,126,.83)+creamDollop(145,130,.80)+lemonSlice(119,98,.73,-15)+p('M146 105Q126 77 140 73Q155 72 143 84Q133 93 151 103','#f6d160','#d4ab49',1.1)+line('M128 109q4-10 10-10M120 115q5-12 9-13M135 118q9-6 13-5','#cc8f45',1.3)+leaf(96,128,.64,-53);}
 return b;
}
function broth(mastered){
 let b=plate(mastered,'#b49467');
 b+=p('M65 119Q41 109 43 126Q45 140 67 133','none','#926a48',7)+p('M192 119Q215 109 214 126Q212 140 191 133','none','#926a48',7)+p('M65 118Q43 111 46 125Q47 135 64 131','none','#d8ad7d',4)+p('M192 118Q212 111 211 125Q209 135 193 131','none','#d8ad7d',4);
 b+=e(128,166,42,13,'#c9915f')+p('M64 115Q66 170 128 174Q190 170 192 115Z','url(#copper)','#946a46',1.8)+line('M77 141Q89 159 111 161','#efc18d',3)+e(128,115,65,28,'#f0cca0','#976c48',1.8)+e(128,115,57,22,'#b96843','#c58d59',1.2);
 b+=p('M87 113Q113 99 138 114Q156 125 177 113','none','#d68b55',3)+tomato(105,113,.9,-12)+tomato(151,121,1,8)+cheese(119,127,16)+cheese(154,107,-8)+basil(129,111,.81);
 b+=line('M102 83Q92 73 102 62Q107 55 102 48','#aeaa8d88',2.7)+line('M129 78Q139 69 130 58Q125 51 131 42','#aeaa8d88',2.7)+line('M158 82Q164 75 157 67','#aeaa8d88',2.3);
 if(mastered){b+=line('M91 120C105 98 170 111 160 122C153 132 115 130 117 121C119 115 141 116 143 122','#f5dfb0',2.5)+truffle(96,126,-10)+truffle(158,110,18)+leaf(137,102,.78,28)+p('M174 151 185 142 204 153 193 162Z','#d4a469','#a47848',1.1)+line('M179 151 193 157M184 147 198 152','#f0cc91',2);}
 return b;
}
function flatbread(mastered){
 let b=e(126,171,98,22,'#94744928')+e(128,150,99,35,'#ad794b',INK,1.5)+e(128,143,99,35,'#d9ad73',INK,1.7)+e(128,141,91,29,'none','#bd915e',1.2)+line('M55 144Q75 164 121 166M141 166Q176 163 197 150','#edc993',1.4);
 const slices=[[[70,119],[117,98],[125,141]],[[127,103],[178,115],[134,143]],[[91,147],[129,120],[171,146]]];
 if(mastered)slices.push([[130,97],[171,91],[179,111]]);
 for(const[which,pts]of slices.entries()){
  b+=polygon(pts.map(([x,y])=>[x,y+6]),'#bc8546','#936637',1.3)+polygon(pts,'url(#crust)','#a16f3b',1.3);
  const cx=pts.reduce((sum,q)=>sum+q[0],0)/3,cy=pts.reduce((sum,q)=>sum+q[1],0)/3;
  b+=p(`M${cx-15} ${cy-3}q4-8 10-7q6 4 12 1q10 3 5 10q-6 6-14 2q-10 4-13-6Z`,'#fff0c2','#e5ba6c',.8)+p(`M${cx-9} ${cy-4}l9-2 4 4-11 3Z`,'#c86e41','#a55331',.7)+leaf(cx+8,cy+4,.58,which*38-30);
  for(let j=0;j<4;j++)b+=e(cx-12+j*7,cy+9-(j%2)*10,1.8,.8,'#ab773e');
  if(mastered)b+=truffle(cx+6,cy+3,which*10-15);
 }
 b+=leaf(69,147,.76,-55)+leaf(78,155,.64,-25);
 if(mastered)b+=tomato(179,141,.95,12)+tomato(185,155,.83,-6)+basil(187,149,.62)+line('M61 145Q91 179 168 161','#ead191',1.2);
 return b;
}

function salad(mastered){let b=plate(mastered,'#85ad71')+e(128,146,67,23,'#e1d1aa');for(let i=0;i<17;i++){const x=85+(i*29)%85,y=122+(i*17)%32;b+=leaf(x,y,.8+(i%3)*.16,i*37,i%2?'#91b768':'#609b55');}for(const[x,y]of[[94,122],[146,131],[115,144],[163,149]])b+=tomato(x,y,1.25);b+=lemonSlice(164,117,.95,12);if(mastered)b+=cheese(120,116,-15)+cheese(154,140,20)+basil(128,106,.9);return b;}
function fries(mastered){let b=plate(mastered,'#bb7953')+p('M65 112 117 94 184 117 167 162 98 177Z','#fff0cd','#b79b76',1.5);for(let i=0;i<17;i++){const x=86+(i*19)%71,y=112+(i*11)%27;b+=g(p('M-4 0 1-34 8-34 3 3Z','#edbc58','#c59340',1)+line('M0-4 4-30','#ffe198',2),x,y,(i%5-2)*18);}b+=p('M67 126 124 145 176 125 165 165 99 177Z',mastered?'#537d65':'#c9664e','#985847',1.8)+line('M83 135 103 172M109 144 120 173M143 140 143 170M165 133 159 165',mastered?'#e6ce90':'#f4c795',5);if(mastered)b+=cheese(111,119,12)+cheese(143,121,-10)+leaf(132,105,.7,30)+e(186,155,20,11,'#fff3d4','#997959',1.4)+e(186,153,16,7,'#c85e40','#a44d35',1)+line('M176 152Q184 148 191 152','#f0a170',1.5)+basil(176,138,.55);return b;}
function lemonade(mastered){let b=e(126,182,55,14,'#806f4725')+p('M83 86 94 173Q128 190 162 173L173 86Z','#d8e4d0','#8aa296',1.8)+p('M89 106 99 168Q129 181 157 168L167 106Z',mastered?'#f3c65c':'#f4d771','#b9bf8c',1)+e(128,106,39,12,'#f8e69e','#b9bf8c',1)+e(128,85,45,14,'#f4f3d8','#8aa296',1.8)+line('M141 146 153 47 170 42','#ca7862',5)+line('M97 111 104 161','#ffffea',4);for(const[x,y]of[[112,107],[141,112],[124,129]])b+=p(`M${x-8} ${y}l8-5 8 6-8 5Z`,'#fffceb99','#e8e5cb',1);b+=lemonSlice(91,94,1.25,-24)+leaf(111,91,.7,-23);if(mastered)b+=lemonSlice(169,156,1.1,24)+basil(171,164,.7)+line('M101 177Q126 187 158 176','#be9a57',2)+lemonSlice(124,154,1.12,8)+leaf(141,146,.9,50)+leaf(126,119,.6,-40);return b;}
export const DISH_RENDERERS={margherita:pizza,caciopepe:pasta,tiramisu,software_noodles:noodles,software_tart:tart,boner_broth:broth,boner_feast:flatbread,tomato_pasta:(m)=>pasta(m)+tomato(116,129,1.3)+tomato(143,141,1.2)+basil(136,113,.75),garden_salad:salad,fries,lemonade};
export function bakeDishes({only}={}){
 const art=join(process.cwd(),'public/chef-art/dishes'),source=join(process.cwd(),'public/chef-art/source-v2/dishes');mkdirSync(art,{recursive:true});mkdirSync(source,{recursive:true});
 for(const[id,render]of Object.entries(DISH_RENDERERS))for(const mastered of[false,true]){
  const name=id+(mastered?'-mastered':'');if(only&&!only.includes(name)&&!only.includes(id))continue;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="224" viewBox="0 0 256 224">${defs}${render(mastered)}</svg>`;
  writeFileSync(join(source,name+'.svg'),svg);writeFileSync(join(art,name+'.svg'),svg);writeFileSync(join(art,name+'.png'),new Resvg(svg).render().asPng());
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){bakeDishes();console.log('Baked plated recipes and their mastered presentations.');}
