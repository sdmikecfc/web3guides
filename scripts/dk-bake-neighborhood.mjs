/**
 * Domain Kitchen's original illustrated neighborhood collection, art revision 2.
 * Authored vector geometry, baked at 2x. No external image or font dependency.
 * Run: node scripts/dk-bake-neighborhood.mjs
 * Registration is the existing iso.ts contract; SVG sources are retained so
 * future artists can edit individual silhouettes without regenerating images.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'public/chef-art');
// Selective rebakes avoid rewriting unrelated images while the preview is open.
const onlyNames = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const OUTLINE = '#66544a';
const palettes = {
  trattoria: { ink:'#70594b', cream:'#fff5dc', wall:'#fff2d9', panel:'#e5b7a0', floor:'#ecd6ae', floor2:'#f5e3bf', wood:'#bb8157', dark:'#895b45', main:'#d97561', light:'#efac87', leaf:'#72986a' },
  izakaya: { ink:'#515849', cream:'#f7edd8', wall:'#f6e8ce', panel:'#b5c0a1', floor:'#d4c8a4', floor2:'#e1d8b8', wood:'#a58665', dark:'#6c6451', main:'#789b86', light:'#b6cbb1', leaf:'#76965f' },
  taqueria: { ink:'#695444', cream:'#fff2d1', wall:'#ffefd3', panel:'#92b9a2', floor:'#e9b883', floor2:'#f3cca0', wood:'#c29162', dark:'#8b6248', main:'#de9561', light:'#f2c981', leaf:'#729c69' },
  diner: { ink:'#536764', cream:'#fff9e9', wall:'#f6efdc', panel:'#99c8bc', floor:'#cae0cf', floor2:'#f8f1da', wood:'#a2c1b5', dark:'#617f79', main:'#76b9aa', light:'#b0d9c5', leaf:'#639b79' },
  bistro: { ink:'#525e51', cream:'#fff5df', wall:'#f3ead6', panel:'#a8b89b', floor:'#d8ba91', floor2:'#e6cea8', wood:'#a58a63', dark:'#65785b', main:'#7f9d77', light:'#b4c69a', leaf:'#648b64' },
  neonlab: { ink:'#53627a', cream:'#f0f4ec', wall:'#f1f2e9', panel:'#b2cdd0', floor:'#e5e7db', floor2:'#f4f1e4', wood:'#a2c7ce', dark:'#607b95', main:'#839dbd', light:'#c1d6df', leaf:'#78aaa5' },
  bonebronze: { ink:'#78614c', cream:'#faf0d5', wall:'#f7eacf', panel:'#cdbda0', floor:'#e6d4ad', floor2:'#eee2c5', wood:'#b79569', dark:'#79614c', main:'#c39b58', light:'#e9ce8d', leaf:'#8a9b75' },
};
const round = n => Math.round(n * 100) / 100;
const path = (d, fill, stroke=OUTLINE, sw=2) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
const poly = (pts, fill, stroke='none', sw=2) => `<polygon points="${pts.map(p=>p.map(round).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const ellipse = (x,y,rx,ry,fill,stroke='none',sw=2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const rect = (x,y,w,h,fill,r=0,stroke='none',sw=2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x,y,xx,yy,c=OUTLINE,w=2)=>path(`M${x} ${y}L${xx} ${yy}`,'none',c,w);
const diamond=(x,y,rx,ry,c,stroke='none')=>poly([[x,y-ry],[x+rx,y],[x,y+ry],[x-rx,y]],c,stroke);
const shadow=(x=96,y=188,rx=49,ry=15)=>ellipse(x,y,rx,ry,'#7a614526')+ellipse(x,y,rx*.7,ry*.65,'#7a61451b');
const png=(folder,name,w,h,body)=>{
  if(onlyNames && !onlyNames.includes(name))return;
  const s=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  mkdirSync(join(ROOT,folder),{recursive:true});
  writeFileSync(join(ROOT,folder,`${name}.png`),new Resvg(s,{font:{loadSystemFonts:false}}).render().asPng());
  const src=join(ROOT,'source-v2',folder);mkdirSync(src,{recursive:true});writeFileSync(join(src,`${name}.svg`),s);
};
// A single dimensional grammar shared by every collection: top is always
// lighter; the screen-right face is always darker. No texture noise.
function block(x,y,rx,ry,h,p,top=p.light,front=p.main){
  return poly([[x-rx,y-h],[x,y+ry-h],[x,y+ry],[x-rx,y]],front,p.ink)+
    poly([[x,y+ry-h],[x+rx,y-h],[x+rx,y],[x,y+ry]],p.dark,p.ink)+
    diamond(x,y-h,rx,ry,top,p.ink);
}
const leg=(x,y,h,p)=>line(x+2,y+3,x+2,y+h+3,p.dark,8)+line(x,y,x,y+h,p.wood,7);
/** Shared 3D furniture frame. u/v are tile axes, z is artwork-pixel height.
 * Rails, posts and surfaces reuse endpoints. Back views rotate the model;
 * they never reposition disconnected screen-space parts. */
function furnitureModel(p,{back=false,ox=96,oy=176}={}){
  const faces=[];
  const world=([u,v,z])=>[back?-u:u,back?-v:v,z];
  const projectWorld=([u,v,z])=>[ox+(u-v)*64,oy+(u+v)*32-z];
  const project=q=>projectWorld(world(q));
  const face=(vertices,fill,stroke=p.ink,width=1.6,bias=0,alreadyWorld=false)=>{
    const verts=alreadyWorld?vertices:vertices.map(world);
    const depth=verts.reduce((sum,[u,v,z])=>sum+64*u+64*v+z,0)/verts.length;
    faces.push({depth:depth+bias,svg:poly(verts.map(projectWorld),fill,stroke,width)});
  };
  const box=(u0,v0,z0,u1,v1,z1,colors={})=>{
    const a=world([u0,v0,0]),b=world([u1,v1,0]);
    const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);
    const bias=colors.bias??0;
    face([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],colors.right??p.dark,colors.stroke??p.ink,1.5,bias,true);
    face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],colors.left??p.wood,colors.stroke??p.ink,1.5,bias,true);
    face([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],colors.top??p.light,colors.stroke??p.ink,1.5,bias+.1,true);
  };
  const top=(u0,v0,u1,v1,z,fill,stroke='none',width=1,bias=.3)=>face([[u0,v0,z],[u1,v0,z],[u1,v1,z],[u0,v1,z]],fill,stroke,width,bias);
  const ellipsePoints=(u,v,z,ru,rv,n=64)=>Array.from({length:n},(_,i)=>[u+Math.cos(i/n*Math.PI*2)*ru,v+Math.sin(i/n*Math.PI*2)*rv,z]);
  const disk=(u,v,z,ru,rv,fill,stroke=p.ink,width=1.3,bias=.5)=>face(ellipsePoints(u,v,z,ru,rv),fill,stroke,width,bias);
  const custom=(q,svg,bias=0)=>{const[u,v,z]=world(q);faces.push({depth:64*u+64*v+z+bias,svg});};
  return{box,face,top,disk,project,ellipsePoints,custom,render:()=>faces.sort((a,b)=>a.depth-b.depth).map(f=>f.svg).join('')};
}
function table(p,theme){
  let m=furnitureModel(p);
  for(const u of[-.33,.33])for(const v of[-.33,.33])m.box(u-.045,v-.045,0,u+.045,v+.045,62);
  for(const v of[-.345,.29])m.box(-.375,v,48,.375,v+.055,62);
  for(const u of[-.345,.29])m.box(u,-.375,48,u+.055,.375,62);
  const supports=m.render();m=furnitureModel(p);
  m.box(-.44,-.44,60,.44,.44,66,{top:p.cream,left:p.main,right:p.dark});
  // Every cloth stripe is drawn on the same plane as the tabletop.
  if(theme==='trattoria'||theme==='taqueria'){
    for(const t of[-.30,-.04,.22]){
      m.top(t,-.44,t+.08,.44,66.2,p.main+'68');
      m.top(-.44,t,.44,t+.08,66.2,p.main+'68');
    }
  }else m.top(-.34,-.34,.34,.34,66.2,p.light,p.cream,1.2);
  const frame=m.render(),d=furnitureModel(p);
  for(const[u,v]of[[-.20,.17],[.20,-.17]]){
    d.disk(u,v,67,.16,.16,'#d5cbb4',p.ink,1);
    d.disk(u,v,69,.16,.16,p.cream,p.ink,1);
    d.disk(u,v,69.2,.108,.108,'none',p.light,1.1);
  }
  const[x,y]=d.project([-.23,-.24,67]);
  d.custom([-.23,-.24,75],ellipse(x,y,7,3,p.dark)+rect(x-4,y-13,8,13,p.light,2,p.ink,1)+ellipse(x,y-13,4,2,p.cream)+line(x,y-13,x-3,y-21,p.leaf,2.8)+ellipse(x-5,y-21,5,3,p.leaf)+ellipse(x+1,y-24,4,3,p.main),8);
  return shadow(96,180,47,15)+supports+frame+d.render();
}
function chair(p,back=false){
  let m=furnitureModel(p,{back});
  // The rear posts are continuous pieces, from the floor through the seat
  // frame and into the backrest. Front legs terminate inside the seat slab.
  for(const u of[-.29,.29])for(const v of[-.29,.29])m.box(u-.047,v-.047,0,u+.047,v+.047,u<0?104:47);
  m.box(-.34,-.335,36,.34,-.27,46);m.box(-.34,.27,36,.34,.335,46);
  m.box(.27,-.34,36,.335,.34,46);
  const supports=m.render();m=furnitureModel(p,{back});
  m.box(-.36,-.36,43,.36,.36,50,{top:p.wood,left:p.wood,right:p.dark});
  m.box(-.225,-.325,50,.325,.325,56,{top:p.light,left:p.main,right:p.main,bias:28});
  m.top(-.20,-.29,.29,.29,56.2,p.light,p.cream,1.2,28.3);
  m.box(-.34,-.235,67,-.245,.235,100,{top:p.light,left:back?p.wood:p.main,right:back?p.wood:p.main});
  m.box(-.35,-.36,99,-.235,.36,107,{top:p.light,left:p.wood,right:p.dark});
  // A slim upholstered inset follows the front plane of the actual panel.
  if(!back)m.face([[-.242,-.19,72],[-.242,.19,72],[-.242,.19,95],[-.242,-.19,95]],p.light,p.main,1.3,.3);
  const near=furnitureModel(p,{back});
  // In a rear view the back posts are in front of the cushion in camera
  // space. Redraw that contiguous frame after the cushion's small surfaces.
  if(back){
    for(const v of[-.29,.29])near.box(-.337,v-.047,0,-.243,v+.047,104);
    near.box(-.35,-.36,99,-.235,.36,107,{top:p.light,left:p.wood,right:p.dark});
  }
  return shadow(96,180,40,13)+supports+m.render()+near.render();
}
function stove(p,back=false){
  let b=shadow();b+=leg(50,171,18,p)+leg(140,171,18,p);
  b+=block(96,163,54,27,69,p,'#f2e9d6',p.main);
  if(!back){
    b+=path('M101 148L143 127L143 155L101 177Z','#5f6964',p.ink,2);
    b+=path('M106 151L138 135L138 151L106 167Z','#8a9990','none');
    b+=line(108,146,136,132,p.cream,3);
    b+=ellipse(118,116,4,5,p.cream)+ellipse(135,108,4,5,p.cream);
  }else for(let i=0;i<3;i++)b+=line(105,139+i*9,141,121+i*9,p.light,3);
  b+=ellipse(76,89,19,9,p.ink)+ellipse(111,106,17,8,p.ink);
  b+=ellipse(76,85,16,7,'#879b96',p.ink)+rect(60,74,32,11,'#96afa7',2,p.ink)+ellipse(76,74,16,7,'#d5e2d4',p.ink);
  b+=ellipse(76,75,10,4,'#e6b862')+line(89,72,105,63,p.dark,4);
  b+=ellipse(113,101,13,6,'#b5b8a6')+line(125,100,139,92,p.dark,5);
  return b;
}
function counter(p,back=false){
  // Two-tile cabinet: plinth, doors, countertop and objects share one frame.
  // Its center retains the existing 320×240 registration and output offset.
  const m=furnitureModel(p,{back,ox:150,oy:174});
  m.box(-.86,-.27,0,.86,.27,9,{top:p.dark,left:p.dark,right:p.dark});
  m.box(-.89,-.30,8,.89,.30,69,{top:p.wood,left:p.main,right:p.dark});
  if(!back)for(const[u0,u1]of[[-.83,-.30],[-.27,.27],[.30,.83]]){
    m.face([[u0,.305,17],[u1,.305,17],[u1,.305,61],[u0,.305,61]],p.main,p.light,1.5,50.3);
    m.face([[u0+.20,.31,51],[u0+.31,.31,51],[u0+.31,.31,54],[u0+.20,.31,54]],p.cream,p.ink,1,50.5);
  }
  m.box(-.96,-.37,69,.96,.37,77,{top:p.cream,left:p.light,right:p.wood});
  // Plates and register rest on the slab; their lower planes coincide at77.
  // Separate the surfaces from their dressing so a broad slab's average
  // depth can never incorrectly hide a small object on its rear corner.
  const cabinet=m.render(),d=furnitureModel(p,{back,ox:150,oy:174});
  for(const z of[78,82,86])d.disk(-.55,0,z,.215,.19,p.cream,p.ink,1.3);
  d.box(.40,-.22,77,.80,.15,83,{top:p.wood,left:p.dark,right:p.dark});
  d.box(.47,-.17,83,.73,.10,103,{top:p.dark,left:p.wood,right:p.dark});
  d.face([[.473,.104,88],[.727,.104,88],[.727,.104,100],[.473,.104,100]],back?p.wood:'#a8c8b7',p.ink,1.3,.3);
  const[x,y]=d.project([-.06,-.12,77]);
  d.custom([-.06,-.12,87],rect(x-5,y-15,10,15,p.main,2,p.ink,1)+ellipse(x,y-15,5,2.5,p.light)+line(x,y-16,x-3,y-24,p.leaf,2.5)+ellipse(x-4,y-25,6,3,p.leaf),12);
  return shadow(150,179,83,23)+cabinet+d.render();
}
function plant(p,theme){
  let b=shadow(96,190,37,11);
  b+=path('M68 148L75 185Q96 199 116 185L124 148Z',p.main,p.ink,2.5)+ellipse(96,148,29,14,p.light,p.ink)+ellipse(96,148,23,10,p.dark);
  b+=line(94,150,94,77,p.dark,5)+line(94,120,68,104,p.dark,3)+line(94,105,119,86,p.dark,3);
  [[68,97,20,13],[84,77,21,14],[104,63,22,17],[123,84,23,15],[108,109,21,14],[78,121,20,12]].forEach(([x,y,rx,ry],i)=>{
    b+=ellipse(x,y,rx,ry,i%2?p.leaf:'#92b575',p.ink,1.5)+path(`M${x-rx*.4} ${y+2}Q${x} ${y-5} ${x+rx*.4} ${y-3}`,'none','#d5dfa0',1.5);
  });
  if(theme==='taqueria'||theme==='trattoria')[[61,94],[111,56],[126,94]].forEach(([x,y])=>b+=ellipse(x,y,5,5,p.main));
  return b;
}
function bench(p,back=false){
  let m=furnitureModel(p,{back});
  for(const u of[-.27,.27])for(const v of[-.46,.46])m.box(u-.05,v-.05,0,u+.05,v+.05,u<0?97:44);
  m.box(.23,-.51,33,.33,.51,44);m.box(-.33,-.51,33,-.23,.51,44);
  m.box(-.33,-.51,33,.33,-.42,44);m.box(-.33,.42,33,.33,.51,44);
  const supports=m.render();m=furnitureModel(p,{back});
  m.box(-.35,-.55,41,.35,.55,48,{top:p.wood,left:p.wood,right:p.dark});
  for(const[v0,v1]of[[-.515,-.012],[.012,.515]]){
    m.box(-.21,v0,48,.315,v1,55,{top:p.light,left:p.main,right:p.main,bias:35});
    m.top(-.185,v0+.025,.285,v1-.025,55.1,p.light,p.cream,1,35.3);
  }
  m.box(-.32,-.41,63,-.22,.41,92,{top:p.light,left:back?p.wood:p.main,right:back?p.wood:p.main});
  m.box(-.33,-.55,91,-.21,.55,99,{top:p.light,left:p.wood,right:p.dark});
  if(!back)m.face([[-.217,-.37,68],[-.217,.37,68],[-.217,.37,87],[-.217,-.37,87]],p.light,p.main,1.3,.3);
  const near=furnitureModel(p,{back});
  if(back){
    for(const v of[-.46,.46])near.box(-.32,v-.05,0,-.22,v+.05,97);
    near.box(-.33,-.55,91,-.21,.55,99,{top:p.light,left:p.wood,right:p.dark});
  }
  return shadow(96,181,53,17)+supports+m.render()+near.render();
}
function toilet(p,broken,back=false){
  // Porcelain stays porcelain in every collection. Only the flush lever and
  // repair tag use the room palette. The bowl is an elliptical 3D shell,
  // joined to a tapered pedestal; the cistern overlaps its rear casting.
  const porcelain={...p,ink:'#89998e',wood:'#e8eee1',dark:'#bdcec3',light:'#fffdf1'};
  const m=furnitureModel(porcelain,{back});
  const mix=(a,b,t)=>'#'+[0,1,2].map(i=>Math.round(parseInt(a.slice(1+i*2,3+i*2),16)*(1-t)+parseInt(b.slice(1+i*2,3+i*2),16)*t).toString(16).padStart(2,'0')).join('');
  const shell=(profiles)=>{
    const n=64;
    for(let level=0;level<profiles.length-1;level++){
      const[z0,ru0,rv0,cu0]=profiles[level],[z1,ru1,rv1,cu1]=profiles[level+1];
      for(let i=0;i<n;i++){
        const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,mid=(a+b)/2+(back?Math.PI:0);
        const color=mix('#bdcec3','#fffdf1',Math.max(.1,Math.min(1,.7+.27*Math.sin(mid)-.15*Math.cos(mid))));
        m.face([[cu0+ru0*Math.cos(a),rv0*Math.sin(a),z0],[cu0+ru0*Math.cos(b),rv0*Math.sin(b),z0],[cu1+ru1*Math.cos(b),rv1*Math.sin(b),z1],[cu1+ru1*Math.cos(a),rv1*Math.sin(a),z1]],color,color,.4);
      }
    }
  };
  // Base, tapered foot, and bowl share their boundary rings exactly.
  shell([[1,.245,.185,.1],[6,.245,.185,.1],[22,.17,.125,.12],[27,.24,.18,.12],[34,.335,.25,.12],[46,.41,.29,.1],[51,.435,.30,.1]]);
  m.disk(.1,0,1,.245,.185,'#d0ddcf',porcelain.ink,1);
  m.box(-.385,-.255,47,-.17,.255,94,{top:'#fffdf2',left:'#edf2e6',right:'#d5e1d6',stroke:porcelain.ink});
  if(!broken)m.box(-.402,-.27,94,-.155,.27,99,{top:'#fffef6',left:'#e5ecdf',right:'#cbd9ce',stroke:porcelain.ink});
  else{
    // A tipped lid still rests on the far cistern edge. It exposes the blue
    // tank opening and changes the silhouette even when the bowl is hidden.
    m.top(-.367,-.234,-.185,.234,94.2,'#75b6bf','#557f88',1.5,1);
    const lid=furnitureModel(porcelain,{back});
    const a=[-.402,-.27,99],b=[-.155,-.27,99],c=[-.155,.27,119],d=[-.402,.27,119];
    const lower=q=>[q[0],q[1],q[2]-5];
    lid.face([lower(b),lower(c),c,b],'#cbd9ce',porcelain.ink,1.7);
    lid.face([lower(c),lower(d),d,c],'#e5ecdf',porcelain.ink,1.7);
    lid.face([lower(d),lower(a),a,d],'#d5e1d6',porcelain.ink,1.7);
    lid.face([a,b,c,d],'#fffef6',porcelain.ink,1.8,1);
    m.custom([-.27,0,113],lid.render(),38);
  }
  // Flush lever is physically on the front cistern plane.
  m.face([[-.165,-.14,81],[-.165,-.045,81],[-.165,-.045,85],[-.165,-.14,85]],p.light,porcelain.ink,1.1,.2);
  // The recessed opening and water sit inside a thick white seat ring.
  m.disk(.1,0,51,.435,.30,'#edf2e7',porcelain.ink,1.4);
  m.disk(.105,0,52,.32,.207,'#9cbab3','#889e95',1.2,1);
  m.disk(.13,0,52.2,.255,.148,'#b9d8d2','none',0,1.2);
  const contour=(pts)=>pts.map((q,i)=>(i?'L':'M')+m.project(q).map(round).join(' ')).join('')+'Z';
  const outer=m.ellipsePoints(.1,0,55,.45,.31),inner=m.ellipsePoints(.105,0,55.1,.32,.202).reverse();
  m.custom([.1,0,55],'<path d="'+contour(outer)+contour(inner)+'" fill="#fffef5" fill-rule="evenodd" stroke="#8f9e92" stroke-width="1.5" stroke-linejoin="round"/>',2);
  let damage='',puddle='';
  if(broken){
    const tagU=back?-.407:-.159;
    const[tx,ty]=m.project([tagU,.075,82]);
    damage+=path(`M${tx} ${ty-2}l0 9`,'none','#967450',1.7)
      +path(`M${tx-11} ${ty+4}l23 5v24l-23-5Z`,'#eeb654','#a9773e',1.6)
      +line(tx-5,ty+11,tx+6,ty+24,'#8a5b34',3.5)+line(tx+6,ty+14,tx-5,ty+22,'#8a5b34',3.5);
    // A continuous stream starts at the cistern/bowl joint and meets the
    // puddle. Strong opaque color survives downsampling to phone play size.
    const leakV=back?-.23:.23,leakU=back?-.397:-.16;
    const[lx,ly]=m.project([leakU,leakV,55]);
    const[gx,gy]=m.project([leakU,leakV,0]);
    damage+=path(`M${lx-3} ${ly}Q${lx+4} ${ly+9} ${lx+1} ${ly+19}L${gx+4} ${gy-3}Q${gx+6} ${gy+5} ${gx+10} ${gy+5}L${gx-4} ${gy+8}Q${gx-8} ${gy+2} ${gx-4} ${gy-7}L${lx-5} ${ly+17}Q${lx-8} ${ly+7} ${lx-3} ${ly}Z`,'#7ac4cc','#5a9da9',1.1)
      +path(`M${lx-2} ${ly+5}Q${lx+2} ${ly+14} ${lx-1} ${ly+21}L${gx} ${gy-7}`,'none','#d3f4ef',2.1)
      +path(`M${gx-12} ${gy+3}Q${gx-18} ${gy-9} ${gx-21} ${gy-6}M${gx+12} ${gy+4}Q${gx+19} ${gy-5} ${gx+22} ${gy-3}`,'none','#74bcc8',3.2);
    const[px,py]=m.project([.1,0,0]);
    puddle=path(`M${px-50} ${py-4}Q${px-45} ${py-15} ${px-19} ${py-13}Q${px+7} ${py-24} ${px+29} ${py-12}Q${px+61} ${py-13} ${px+61} ${py+2}Q${px+65} ${py+13} ${px+36} ${py+15}Q${px+16} ${py+28} ${px-11} ${py+18}Q${px-47} ${py+23} ${px-55} ${py+10}Q${px-64} ${py+4} ${px-50} ${py-4}Z`,'#8acbd2','#6aaeb9',1.4)
      +path(`M${px+26} ${py+10}q12-5 22-1M${px-43} ${py+5}q8 6 16 5`,'none','#d7f3eb',2.6);
  }
  return shadow(96,181,41,14)+puddle+m.render()+damage;
}
function partition(p){
  // A single continuous wall bay. Exact u±0.5 endpoints join on the grid;
  // its 0.13-tile depth leaves the furniture-sized solid footprint visually
  // light. SE/NW runs along gx; the renderer mirrors it for SW/NE along gy.
  const wall=furnitureModel(p);
  wall.box(-.5,-.065,0,.5,.065,108,{top:p.cream,left:p.wall,right:p.panel});
  const ground=furnitureModel(p);
  ground.top(-.5,-.075,.5,.14,-.5,'#796b4925');
  // Broad, quiet paint bands remain continuous across neighboring bays.
  const paint=furnitureModel(p);
  paint.face([[-.5,.067,8],[.5,.067,8],[.5,.067,43],[-.5,.067,43]],p.panel,'none',0);
  paint.face([[-.5,.068,42],[.5,.068,42],[.5,.068,45],[-.5,.068,45]],p.cream,'none',0);
  const trim=furnitureModel(p);
  trim.box(-.5,-.076,0,.5,.076,8,{top:p.light,left:p.wood,right:p.wood});
  trim.box(-.5,-.085,108,.5,.085,114,{top:p.cream,left:p.light,right:p.panel});
  return ground.render()+wall.render()+paint.render()+trim.render();
}
function wallArt(p){
  // Author a flat framed print, then project the ENTIRE illustration onto
  // the wall plane. scene.ts mirrors this plane for the left cutaway wall.
  const frame=rect(-26,-34,52,68,p.wood,1,p.ink,2)+
    rect(-22,-30,44,60,p.cream,0,p.light,1.2)+
    rect(-17,-24,34,48,'#d6e0cb')+
    ellipse(7,-12,6,6,p.light)+
    path('M-17 12L-6 -4L4 9L11 1L17 12V24H-17Z',p.leaf,'none')+
    path('M-17 19L-5 10L5 18L17 12V24H-17Z',p.main,'none');
  return `<g transform="matrix(1 .5 0 1 96 104)">${frame}</g>`;
}
function floor(p,alternate,theme){
  let b=diamond(64,32,64,32,alternate?p.floor2:p.floor);
  if(theme==='diner')b+=diamond(64,32,55,27,alternate?p.cream:p.light);
  else if(theme==='izakaya'){
    b+=line(4,32,64,62,'#a9ab85',2)+line(64,62,124,32,'#a9ab85',2);
    for(let i=0;i<3;i++)b+=line(30+i*15,18+i*7.5,82+i*15,44-i*7.5,'#b7b891',1);
  }else if(theme==='trattoria'||theme==='bistro'){
    b+=line(32,16,96,48,'#b7a28066',1)+line(64,0,0,32,'#ffffff70',1)+line(64,64,128,32,'#ad927455',1);
  }else b+=diamond(64,32,58,29,'none','#d5b58c55');
  return b;
}
function wall(p,n,left){
  const w=n*64,h=n*32+204;
  // Author a flat wall strip, then project each local point onto the isometric
  // plane. Windows, panels and paintings consequently share exact perspective.
  let b=rect(0,0,n*64,192,left?p.wall:p.cream);
  b+=rect(0,122,n*64,70,p.panel)+rect(0,119,n*64,7,p.cream)+rect(0,180,n*64,12,p.wood);
  for(let x=24;x<n*64;x+=64)b+=rect(x,137,43,31,p.panel,0,p.cream,2);
  b+=rect(0,0,n*64,10,p.wood)+rect(0,10,n*64,3,p.light);
  for(let x=78;x<n*64-60;x+=160){
    b+=rect(x-5,27,91,81,p.wood,3)+rect(x,31,81,71,'#c1dcd6',2)+rect(x,67,81,35,'#a8c99f');
    b+=path(`M${x} 83Q${x+26} 57 ${x+47} 82Q${x+66} 64 ${x+81} 75V102H${x}Z`,'#bad3a1','none');
    b+=line(x+39,32,x+39,102,p.cream,5)+line(x,66,x+81,66,p.cream,4);
    b+=path(`M${x-4} 28H${x+22}Q${x+17} 50 ${x+4} 70L${x-4} 74Z`,p.main,p.ink,1);
    b+=path(`M${x+59} 28H${x+85}V74Q${x+65} 61 ${x+59} 28Z`,p.main,p.ink,1);
    b+=rect(x-9,106,100,7,p.wood,2)+rect(x+6,105,23,9,p.main,2);
    b+=ellipse(x+16,101,14,8,p.leaf);
  }
  b+=rect(0,0,6,192,p.wood)+rect(n*64-6,0,6,192,p.wood);
  const matrix=left?`matrix(-1 .5 0 1 ${w} 0)`:'matrix(1 .5 0 1 0 0)';
  return {w,h,b:`<g transform="${matrix}">${b}</g>`};
}

for(const [theme,p] of Object.entries(palettes)){
  const folder=`room/${theme}`;
  for(const [name,fn] of Object.entries({table:()=>table(p,theme),chair:()=>chair(p),'chair-back':()=>chair(p,true),stove:()=>stove(p),'stove-back':()=>stove(p,true),plant:()=>plant(p,theme),bench:()=>bench(p),'bench-back':()=>bench(p,true),toilet:()=>toilet(p,false),'toilet-broken':()=>toilet(p,true),'toilet-back':()=>toilet(p,false,true),'toilet-broken-back':()=>toilet(p,true,true),partition:()=>partition(p),'wall-art':()=>wallArt(p)}))png(folder,name,192,224,fn());
  png(folder,'counter',320,240,`<g transform="translate(26 -2)">${counter(p)}</g>`);
  png(folder,'counter-back',320,240,`<g transform="translate(26 -2)">${counter(p,true)}</g>`);
  png(folder,'floor',128,64,floor(p,false,theme));png(folder,'floor-alt',128,64,floor(p,true,theme));
  png(folder,'dishes',96,64,ellipse(48,40,34,14,'#d9d3ba')+ellipse(48,34,35,14,p.cream,p.ink,1.5)+ellipse(48,29,34,13,p.cream,p.ink,1.5)+path('M35 30Q49 22 60 31','none',p.main,3));
  png(folder,'rug',256,128,diamond(128,64,120,58,p.main)+diamond(128,64,109,52,p.cream)+diamond(128,64,104,48,p.light)+diamond(128,64,70,32,'none',p.cream));
  png(folder,'doormat',128,64,diamond(64,32,58,27,p.wood,p.ink)+diamond(64,32,48,21,'none',p.light));
  png(folder,'trash',128,64,path('M44 30L62 24L75 32L66 40L48 37Z',p.cream,p.ink,1)+line(56,27,61,36,p.light,2));
  for(const [side,ns]of [['left',[8,9,12]],['right',[10,14,18]]])for(const n of ns){const a=wall(p,n,side==='left');png(folder,`wall-${side}-${n}`,a.w,a.h,a.b);}
}

// The cookbook and in-world plates share one original illustration source.
const { bakeDishes } = await import('./dk-bake-dishes.mjs');
bakeDishes({only:onlyNames});
console.log(onlyNames ? `Baked ${onlyNames.join(', ')} across all collections.` : 'Baked illustrated furniture, architecture, finishes and cookbook plates.');
