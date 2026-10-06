/** Original articulated cartoon cast. 128px cells; planted feet at y=116.
 * Sprite poses are authored from one rig per character, never image-warped.
 * Run: node scripts/dk-bake-cast-v2.mjs
 */
import {Resvg} from '@resvg/resvg-js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const out=join(process.cwd(),'public/chef-art/chars');
const source=join(process.cwd(),'public/chef-art/source-v2/chars');
mkdirSync(out,{recursive:true});mkdirSync(source,{recursive:true});
const ink='#514b43';
const path=(d,f='none',s=ink,w=2)=>`<path d="${d}" fill="${f}" stroke="${s}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
const ellipse=(x,y,rx,ry,f,s='none',w=2)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" stroke="${s}" stroke-width="${w}"/>`;
const rect=(x,y,w,h,f,r=3,s='none')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" stroke="${s}" stroke-width="2"/>`;
const line=(x,y,xx,yy,c,w)=>path(`M${x} ${y}L${xx} ${yy}`,'none',c,w);
const skins=['#f1c7a1','#dbac7e','#b67e58','#896346'];
const hairs=['#6b5144','#bc8054','#443f3b','#a77c55','#dac184','#67566a'];
const shirts=['#cf7863','#8aaf9c','#79a8b8','#d4ab64','#a697b9','#b97a8c','#74a5a0','#a69c70'];
const pants=['#65716a','#736758','#60677d'];
function rig(v,anim,k){
  const back=anim.endsWith('_b')||anim==='cook';
  const walking=anim.startsWith('walk')||anim.startsWith('carry');
  const carrying=anim.startsWith('carry');
  const sitting=anim==='sit'||anim==='eat'||anim==='z_sit_b'||anim==='z_eat_b';
  const cleaning=anim==='z_clean'||anim==='z_repair';
  const greeting=anim==='z_greet';
  const celebrating=anim==='z_celebrate';
  // Leave room below the hips for bent legs inside the same 128px cell.
  // The seated contour ends at y96; scene.ts registers it on the cushion.
  // Moving the upper body and its registration together preserves its world
  // position. The foot anchor remains y116 for every animation.
  const sitRaise=sitting?18:0;
  const phase=walking?Math.sin(k*Math.PI/2):0;
  const bob=walking?(k%2)*2:anim==='cook'?k*2:celebrating?k*3:0;
  const hx=back?63:65, hy=(sitting?61-sitRaise:cleaning?59:46)-bob;
  const ty=(sitting?83-sitRaise:cleaning?85:75)-bob;
  const eating=anim==='eat'||anim==='z_eat_b';
  // One shared hand target drives the arm and utensil. Frame zero rests at
  // table height; frame one brings the fork tip to the mouth, below the eyes.
  const mealHand=k===0?[85,ty+21]:[hx+12,hy+30];
  const mealTip=k===0?[85,ty+9]:[hx+5,hy+17];
  let b=ellipse(64,sitting?99:117,23,5,'#6a655122');
  // Two independently posed legs and softly rounded shoes. A walking cycle
  // moves joints while the contact foot stays at its authored baseline.
  if(!sitting){
    b+=line(55,97-bob,53+phase*7,111-Math.max(0,-phase)*5,v.pants,11);
    b+=line(73,97-bob,74-phase*7,111-Math.max(0,phase)*5,v.pants,11);
    b+=rect(46+phase*7,109-Math.max(0,-phase)*5,15,7,'#5e5148',3,ink);
    b+=rect(67-phase*7,109-Math.max(0,phase)*5,15,7,'#5e5148',3,ink);
    b+=line(48+phase*7,111-Math.max(0,-phase)*5,56+phase*7,111-Math.max(0,-phase)*5,'#e6d9bb',1.5);
  }else{
    // Thigh → knee → calf, with the shoes hanging over the seat's front edge.
    // The far leg is painted first. Rear poses bend toward the far side of
    // the chair; the renderer then puts its real backrest in front of us.
    const seatedLeg=(hip,knee,ankle)=>{
      const joints=`M${hip[0]} ${hip[1]}Q${knee[0]-3} ${knee[1]-1} ${knee[0]} ${knee[1]}L${ankle[0]} ${ankle[1]}`;
      return path(joints,'none',ink,12)+path(joints,'none',v.pants,9)+
        path(`M${ankle[0]-5} ${ankle[1]-2}L${ankle[0]+3} ${ankle[1]-2}Q${ankle[0]+6} ${ankle[1]+2} ${ankle[0]+12} ${ankle[1]+3}Q${ankle[0]+15} ${ankle[1]+8} ${ankle[0]+9} ${ankle[1]+9}L${ankle[0]-5} ${ankle[1]+9}Q${ankle[0]-8} ${ankle[1]+4} ${ankle[0]-5} ${ankle[1]-2}Z`,'#5e5148',ink,1.7)+
        line(ankle[0]-4,ankle[1]+6,ankle[0]+10,ankle[1]+6,'#e6d9bb',1.4);
    };
    b+=seatedLeg([72,91],[85,back?94:101],[87,111]);
    b+=seatedLeg([53,92],[62,back?96:103],[63,114]);
  }
  const sleeve=v.chef?'#f8f1d9':v.shirt;
  const arm=(sx,sy,ex,ey)=>line(sx,sy,ex,ey,ink,11)+line(sx,sy,ex,ey,sleeve,8)+ellipse(ex,ey,5,5,v.skin,ink,1.3);
  let left=[43-phase*5,94-bob],right=[84+phase*5,94-bob];
  if(carrying){left=[46,84-bob];right=[85,84-bob];}
  if(sitting){left=[48,101-sitRaise-bob];right=eating?mealHand:[83,101-sitRaise-bob];}
  if(anim==='cook'){left=[43,84-k*4];right=[92,78+k*6];}
  if(cleaning){left=[47,102];right=[92+k*5,94-k*3];}
  if(greeting)right=[93,hy-2-k*8];
  if(celebrating){left=[35,hy+7-k*3];right=[93,hy+7-k*3];}
  b+=arm(80,ty+5,...right);
  b+=path(`M48 ${ty-8}Q64 ${ty-13} 81 ${ty-5}L86 ${ty+25}Q65 ${ty+35} 44 ${ty+25}Z`,sleeve,ink,2);
  if(v.chef){
    b+=path(`M48 ${ty+8}L82 ${ty+8}L83 ${ty+27}Q64 ${ty+34} 46 ${ty+26}Z`,v.apron,ink,1.5);
    b+=ellipse(57,ty,1.7,1.7,ink)+ellipse(72,ty,1.7,1.7,ink)+line(49,ty-6,66,ty+3,'#d7d3bb',1.2);
    if(back)b+=path(`M48 ${ty+9}L80 ${ty+16}M48 ${ty+17}L80 ${ty+9}`,'none','#d8dac0',2);
  }else if(v.waiter){
    b+=path(`M48 ${ty+6}L80 ${ty+6}L82 ${ty+27}Q63 ${ty+33} 47 ${ty+26}Z`,'#f5ecd5',ink,1.5);
    b+=rect(60,ty+14,13,7,'#dedabe',1)+path(`M57 ${ty-7}L65 ${ty-3}L73 ${ty-7}L73 ${ty}L65 ${ty-3}L57 ${ty}Z`,v.apron,'none');
  }else if(v.i%3===0)b+=line(47,ty+10,82,ty+10,'#f7e6cb',4)+line(47,ty+19,83,ty+19,'#f7e6cb',4);
  b+=arm(48,ty+5,...left);
  // Neck + ears + head silhouette: larger faces readable on a phone.
  b+=rect(58,hy+19,14,15,v.skin,4,ink)+ellipse(hx-25,hy+5,6,8,v.skin,ink,1.3)+ellipse(hx+25,hy+5,6,8,v.skin,ink,1.3);
  b+=path(`M${hx-24} ${hy-9}Q${hx-24} ${hy-29} ${hx} ${hy-29}Q${hx+25} ${hy-28} ${hx+25} ${hy-7}L${hx+23} ${hy+13}Q${hx+18} ${hy+29} ${hx} ${hy+27}Q${hx-23} ${hy+26} ${hx-24} ${hy+9}Z`,v.skin,ink,2);
  if(v.chef){
    b+=path(`M${hx-21} ${hy-19}L${hx-23} ${hy-30}Q${hx-33} ${hy-36} ${hx-16} ${hy-36}Q${hx-10} ${hy-44} ${hx} ${hy-38}Q${hx+13} ${hy-44} ${hx+22} ${hy-36}Q${hx+35} ${hy-35} ${hx+23} ${hy-29}L${hx+22} ${hy-18}Z`,'#fff9e9',ink,1.7);
    b+=line(hx-21,hy-23,hx+21,hy-23,'#dfdac2',2);
  }else if(back){
    b+=path(`M${hx-24} ${hy-6}Q${hx-28} ${hy-30} ${hx} ${hy-31}Q${hx+29} ${hy-30} ${hx+25} ${hy+6}L${hx+17} ${hy+19}Q${hx} ${hy+26} ${hx-21} ${hy+15}Z`,v.hair,ink,2);
  }else{
    b+=path(`M${hx-24} ${hy+1}Q${hx-33} ${hy-26} ${hx-7} ${hy-30}Q${hx+8} ${hy-38} ${hx+26} ${hy-22}L${hx+26} ${hy-4}Q${hx+15} ${hy-7} ${hx+12} ${hy-18}Q${hx-2} ${hy-4} ${hx-17} ${hy-9}L${hx-20} ${hy+2}Z`,v.hair,ink,2);
    b+=path(`M${hx-17} ${hy-17}Q${hx-3} ${hy-26} ${hx+10} ${hy-22}`,'none','#f7ddb738',3);
  }
  if(!v.chef&&v.i%4===2)b+=ellipse(hx-9,hy-32,12,10,v.hair,ink,1.5);
  if(!back){
    b+=ellipse(hx-14,hy+12,6,3.5,'#d6867055')+ellipse(hx+17,hy+12,5,3.5,'#d6867055');
    if((anim==='idle_f'&&k===1)||celebrating)b+=path(`M${hx-14} ${hy+3}q3 -4 6 0M${hx+5} ${hy+3}q3 -4 6 0`,'none',ink,2.4);
    else b+=ellipse(hx-11,hy+3,3,4,ink)+ellipse(hx+9,hy+3,3,4,ink)+ellipse(hx-12,hy+1,1,1,'#fff8e4')+ellipse(hx+8,hy+1,1,1,'#fff8e4');
    b+=path(`M${hx} ${hy+7}q4 1 3 4`,'none','#b67d5d',1.5);
    b+=path(`M${hx-5} ${hy+17}q7 6 12 -1`,'none','#8b5a46',1.7);
    if(v.i%5===4)b+=ellipse(hx-11,hy+3,8,8,'none',ink,1.8)+ellipse(hx+9,hy+3,8,8,'none',ink,1.8)+line(hx-3,hy+3,hx+1,hy+3,ink,1.8);
  }
  if(carrying)b+=ellipse(67,83-bob,25,8,'#f8efd9',ink,1.5)+ellipse(68,79-bob,15,6,'#dfad65')+ellipse(72,76-bob,7,4,'#81a36e');
  if(anim==='eat'){
    b+=line(...mealHand,mealTip[0],mealTip[1]+3,'#7c8075',2)+line(mealTip[0]-2,mealTip[1]+3,mealTip[0]+2,mealTip[1]+3,'#7c8075',1.3);
    for(const tine of[-2,0,2])b+=line(mealTip[0]+tine,mealTip[1]+3,mealTip[0]+tine,mealTip[1],'#7c8075',1.1);
  }
  if(anim==='cook')b+=line(92,78+k*6,104,66+k*6,'#987b51',3)+ellipse(105,65+k*6,5,3,'#c5a86e',ink,1);
  if(cleaning)b+=line(92+k*5,94-k*3,101+k*5,114,'#aa8f65',3)+rect(92+k*5,111,20,6,anim==='z_repair'?'#8eacac':'#d9b774',2,ink);
  return b;
}
const base={guest:{idle_f:2,walk_f:4,walk_b:4,sit:1,eat:2},chef:{idle_b:2,walk_f:4,walk_b:4,cook:2},waiter:{idle_f:2,walk_f:4,walk_b:4,carry_f:4,carry_b:4}};
for(const [family,count]of [['guest',16],['chef',6],['waiter',6]])for(let i=0;i<count;i++){
  const name=family+i,v={i,skin:skins[(i+Math.floor(i/4))%4],hair:hairs[i%6],shirt:shirts[i%8],pants:pants[i%3],apron:shirts[(i+2)%8],chef:family==='chef',waiter:family==='waiter'};
  const anims={...base[family],z_clean:2,z_repair:2,z_greet:2,z_celebrate:2,...(family==='guest'?{z_sit_b:1,z_eat_b:2}:{})};
  const entries=Object.entries(anims).sort(([a],[b])=>a.localeCompare(b)).flatMap(([a,n])=>Array.from({length:n},(_,k)=>({a,k})));
  const w=640,h=Math.ceil(entries.length/5)*128,frames={},animations={};
  let body='';
  entries.forEach(({a,k},i)=>{
    const x=(i%5)*128,y=Math.floor(i/5)*128,key=`${a}_${k}`;
    // Clip each cell so chef hats and energetic gestures never bleed into the
    // adjacent animation frame on a texture atlas.
    body+=`<clipPath id="clip${i}"><rect x="${x}" y="${y}" width="128" height="128"/></clipPath><g clip-path="url(#clip${i})"><g transform="translate(${x} ${y})">${rig(v,a,k)}</g></g>`;
    frames[key]={frame:{x,y,w:128,h:128},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:128,h:128},sourceSize:{w:128,h:128}};
    (animations[a]??=[]).push(key);
  });
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  writeFileSync(join(source,name+'.svg'),svg);
  writeFileSync(join(out,name+'.png'),new Resvg(svg,{font:{loadSystemFonts:false}}).render().asPng());
  writeFileSync(join(out,name+'.json'),JSON.stringify({frames,animations,meta:{app:'Domain Kitchen original articulated cast',version:'2',image:name+'.png',format:'RGBA8888',size:{w,h},scale:'1'}},null,2));
}
console.log('Baked 28 character rigs with walk, carry, cook, eat, clean, repair, greet and celebrate poses.');
