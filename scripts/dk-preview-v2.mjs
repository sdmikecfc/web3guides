/** Static art review, not a browser capture. Uses the shipped PNGs, registered
 * exactly as scene.ts. Run: node scripts/dk-preview-v2.mjs */
import {Resvg} from '@resvg/resvg-js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const root=process.cwd(),art=join(root,'public/chef-art');
const img=(file,x,y,w,h)=>`<image href="data:image/png;base64,${readFileSync(join(art,file)).toString('base64')}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const iso=(x,y)=>[(x-y)*32,(x+y)*16];
const polygon=(pts,fill,stroke='none')=>`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>`;
const ground=(x,y,w,h,c,z=0)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([a,b])=>{const p=iso(a,b);return[p[0],p[1]+z]}),c);
const text=(x,y,s,size=18,color='#64584a',family='Arial')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="${family}">${s}</text>`;
let body=`<rect width="1440" height="1280" fill="#f5efe1"/>${text(70,70,'DOMAIN KITCHEN',18,'#a27454')}${text(70,118,'A little restaurant. A whole neighborhood.',38,'#5a5948','Georgia')}${text(70,154,'Original illustrated collection · actual shipped sprite assets at game registration · static art review',17)}`;
let room='';
room+=ground(-2,-1.4,14,12.9,'#d1d6b0',15)+ground(-1.3,-.7,12.6,11.1,'#e5ddc5',11)+ground(-.6,-.2,11.2,9.3,'#f4e8ce',7)+ground(-2,10,14,1.5,'#c9c9b9',18);
for(let n=-1;n<11;n+=.8)room+=ground(n,8.1,.7,.75,'#e2d2b3',9)+ground(n,9,.7,.75,'#ece0c6',9);
room+=ground(0,0,10,8,'#b89d79',10);
for(let x=0;x<10;x++)for(let y=0;y<8;y++)room+=ground(x,y,1,1,(x+y)%2?'#f1dfbb':'#f1e1c1');
for(let x=0;x<10;x++)for(let y=0;y<8;y++){const[p,q]=iso(x,y);room+=polygon([[p,q],[p+32,q+16],[p,q+32],[p-32,q+16]],'none','#dbc495');}
room+=img('room/trattoria/wall-left-8.png',-256,-96,256,230)+img('room/trattoria/wall-right-10.png',0,-96,320,262);
const objects=[];
function furniture(name,x,y,facing='se',theme='trattoria'){
 const cells=name.startsWith('counter')?2:1;const vertical=facing==='sw'||facing==='ne';const ax=x+(!vertical?cells-1:0),ay=y+(vertical?cells-1:0);const[px,py]=iso(ax,ay);
 const reverse=facing==='ne'||facing==='nw';const file=reverse&&['chair','counter','stove','bench'].includes(name)?name+'-back':name;
 let sprite;if(name==='rug')sprite=img(`room/${theme}/${file}.png`,px-64,py,128,64);else if(name==='doormat')sprite=img(`room/${theme}/${file}.png`,px-32,py,64,32);else sprite=`<g transform="translate(${px} ${py+32}) scale(${vertical?-1:1} 1)">${img(`room/${theme}/${file}.png`,cells>1?-104:-48,cells>1?-108:-104,cells>1?160:96,cells>1?120:112)}</g>`;
 objects.push({z:name==='rug'||name==='doormat'?-1:ax+ay,svg:sprite});
}
function character(name,anim,x,y){const sheet=JSON.parse(readFileSync(join(art,'chars',`${name}.json`),'utf8'));const f=sheet.frames[anim].frame;const[px,py]=iso(x,y);const key=`c${objects.length}`;objects.push({z:x+y+.5,svg:`<clipPath id="${key}"><rect x="${px-32}" y="${py-42}" width="64" height="64"/></clipPath><g clip-path="url(#${key})">${img(`chars/${name}.png`,px-32-f.x*.5,py-42-f.y*.5,sheet.meta.size.w*.5,sheet.meta.size.h*.5)}</g>`});}
furniture('stove',2,0);furniture('counter',5,0);furniture('plant',0,1);furniture('plant',9,1);furniture('bench',1,6);furniture('toilet',9,6);
for(const[x,y,theme]of [[2,3,'trattoria'],[5,3,'trattoria'],[7,5,'bistro']]){furniture('table',x,y,'se',theme);furniture('chair',x,y-1,'sw',theme);furniture('chair',x-1,y,'se',theme);}
furniture('rug',5,5);furniture('doormat',4,7);
character('chef0','cook_0',2,1);character('waiter0','carry_f_0',4,2);character('guest0','eat_0',1,3);character('guest3','sit_0',5,2);character('guest8','walk_f_1',4,6);character('guest5','eat_1',6,5);
objects.sort((a,b)=>a.z-b.z);room+=objects.map(o=>o.svg).join('');
const[dx,dy0]=iso(4,8.35),dy=dy0+5;
room+=`<path d="M${dx-67} ${dy+8}V${dy-61}M${dx+67} ${dy+30}V${dy-40}" stroke="#b39a75" stroke-width="5"/>`;
for(let n=0;n<10;n++){const x=dx-73+n*14,y=dy-75+n*2.3;room+=polygon([[x,y],[x+14,y+2.3],[x+27,y+26.3],[x+13,y+24]],n%2?'#fff0d5':'#bd644c')+polygon([[x+13,y+24],[x+27,y+26.3],[x+27,y+34],[x+13,y+31.7]],n%2?'#ffe6bf':'#bd644c');}
room+=polygon([[dx-63,dy-62],[dx+63,dy-41],[dx+63,dy-22],[dx-63,dy-43]],'#bd644c');
room+=`<g transform="translate(${dx-46} ${dy-45}) skewY(9)">${text(0,0,'The Little Kitchen',11,'#fff2d8','Georgia')}</g>`;
const tree=(x,y)=>`<ellipse cx="${x}" cy="${y}" rx="29" ry="10" fill="#75876122"/><path d="M${x} ${y}V${y-44}" stroke="#a28861" stroke-width="6"/>`+[[x-12,y-46,20],[x+9,y-54,24],[x+18,y-33,18],[x-5,y-28,21]].map(([x,y,r],i)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${i%2?'#aabc83':'#91aa78'}"/>`).join('');
room+=tree(-245,60)+tree(340,202);
body+=`<g transform="translate(689 375) scale(1.55)">${room}</g>`;
body+=text(70,996,'ONE SHARED ART LANGUAGE. ROOM TO MAKE IT YOURS.',16,'#95765b');
const themes=['trattoria','izakaya','taqueria','diner','bistro','neonlab','bonebronze'];
themes.forEach((theme,i)=>{const x=70+i*186;body+=`<rect x="${x}" y="1024" width="169" height="194" rx="16" fill="#fcf7ec" stroke="#e4d9c3"/>`+img(`room/${theme}/table.png`,x+14,1040,96,112)+img(`room/${theme}/chair.png`,x+80,1070,77,90)+text(x+16,1193,theme==='bonebronze'?'Bone &amp; Bronze':theme[0].toUpperCase()+theme.slice(1),14);});
body+=text(70,1252,'Illustrations and geometry are original. This contact sheet is an art review, not an interactive UI screenshot.',14,'#8c8373');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1280" viewBox="0 0 1440 1280">${body}</svg>`;
mkdirSync(join(root,'.dk-preview'),{recursive:true});
writeFileSync(join(root,'.dk-preview/v2-room-contact.png'),new Resvg(svg,{font:{loadSystemFonts:false,fontFiles:['C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/georgia.ttf'],defaultFontFamily:'Arial'}}).render().asPng());
console.log('.dk-preview/v2-room-contact.png');
