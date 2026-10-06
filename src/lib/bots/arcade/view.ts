import {Application,Container,Graphics,Rectangle,Sprite} from 'pixi.js';
import {ArcadeEngine,crouching,strikePoint} from './engine';
import {FLOOR,type Build} from './types';
import {fighterSheets,fighterArtKey} from './art';
import {animationFrame} from './presentation';
import {moveFor} from './moves';
import {arenaDefinition,type ArenaId} from './arenas';
import {loadArcadeAtlases} from './atlas-loader';

export type ViewOptions={reduced:boolean;flashes:boolean;shake:number;hitboxes:boolean;low:boolean;arena?:ArenaId};
export async function createArcadeView(host:HTMLElement,progress:(n:number)=>void,options:ViewOptions,builds:Build[]){
 const app=new Application();await app.init({width:1280,height:720,background:'#11171c',antialias:true,resolution:Math.min(window.devicePixelRatio,options.low?1:1.5),autoDensity:true,autoStart:false,preference:'webgl'});
 host.appendChild(app.canvas);app.canvas.style.width='100%';app.canvas.style.height='100%';app.canvas.style.objectFit='contain';
 let loaded:Awaited<ReturnType<typeof loadArcadeAtlases>>|undefined;
 try {
 const keys=[...new Set(builds.flatMap(fighterSheets))];
 const arena=arenaDefinition(options.arena);
 loaded=await loadArcadeAtlases(keys,arena.file,progress);
 const {atlas,textures,background}=loaded;
 const world=new Container();app.stage.addChild(world);
 const bg=new Sprite(background);bg.width=1280;bg.height=720;world.addChild(bg);
 const ambience=new Graphics(),shadows=new Graphics();world.addChild(ambience,shadows);
 const sprites=[new Sprite(),new Sprite()];for(const s of sprites)world.addChild(s);
 const fx=new Graphics(),debug=new Graphics();world.addChild(fx,debug);
 let dead=false,cameraX=640,zoom=1.2;
 function render(e:ArcadeEngine){
  if(dead)return;
  const tick=e.tick;ambience.clear();
  if(!options.reduced){
   // Atmosphere is behind the fighters, above the rail. The fighting floor is fixed.
   if(arena.id==='reactor'){
    ambience.ellipse(650,290,102,170).fill({color:0xffa331,alpha:.026+.013*Math.sin(tick*.025)});
    for(let i=0;i<(options.low?4:9);i++){const y=425-((tick*.33+i*37)%210),x=180+i%3*390;ambience.ellipse(x+Math.sin(tick*.02+i)*15,y,17+(425-y)*.1,8).fill({color:0xbbc5ce,alpha:.027});}
   }else if(arena.id==='salvage'){
    for(let i=0;i<(options.low?16:42);i++){
     const x=210+(i*83)%855-((tick*.32+i*7)%38),y=30+(tick*3.1+i*61)%365;
     ambience.moveTo(x,y).lineTo(x-4,y+11).stroke({color:0x9ed9f0,width:1,alpha:.09});
    }
    for(const x of [194,1068])ambience.rect(x,62,5,282).fill({color:0xff6ac4,alpha:.09+.04*Math.sin(tick*.025)});
    ambience.ellipse(690,385,265,23).fill({color:0x2cbecb,alpha:.024+.009*Math.sin(tick*.018)});
   }else{
    ambience.ellipse(680,180,180,115).fill({color:0x85d4fc,alpha:.025+.008*Math.sin(tick*.018)});
    for(let i=0;i<(options.low?8:21);i++){
     const x=300+(i*73+tick*.27)%650,y=35+(i*53+tick*.13)%340;
     ambience.circle(x,y,1+i%2*.5).fill({color:0xd4efff,alpha:.16});
    }
    for(const x of [165,1115]){const y=414-(tick*.35)%95;ambience.ellipse(x,y,26,10).fill({color:0xb6d3e4,alpha:.045});}
   }
  }
  shadows.clear();
  for(const [i,f] of e.fighters.entries()){
   shadows.ellipse(f.x,FLOOR+3,76-f.y*.05,12).fill({color:0x07090c,alpha:.55});
   let selected=animationFrame(f);
   const finishing=e.phase==='finisher',age=300-e.phaseFrames;
   if(finishing){const key=fighterArtKey(f.build);selected=e.winner===i?{sheet:`${key}-special`,frame:age<65?6:age<180?7:0}:{sheet:`${key}-motion`,frame:age<140?6:7};}
   const a=atlas[selected.sheet],tex=textures[selected.sheet]?.[selected.frame];
   if(!a||!tex)throw Error('This fighter artwork has not passed the animation review.');
   const frame=a.frames[selected.frame],s=sprites[i],scale=244/a.referenceHeight;
   s.texture=tex;s.anchor.set(frame.pivotX/frame.w,frame.pivotY/frame.h);s.scale.set(scale*f.facing,scale);s.position.set(f.x,FLOOR-f.y);
   const recent=e.events.findLast(event=>event.kind==='hit'&&event.side!==i&&tick-event.tick<3);
   s.tint=options.flashes&&recent?0xffc8a0:0xffffff;
   s.alpha=finishing&&e.winner!==i&&age>175?0:1;s.rotation=0;
   if(finishing&&e.winner===i){const rival=e.fighters[1-i],destination=rival.x-f.facing*180;s.x=f.x+(destination-f.x)*Math.min(1,age/55);}
  }
  fx.clear();debug.clear();
  for(const f of e.fighters){
   if(f.move&&['special','advance','ground','super'].includes(f.move)){
    const m=moveFor(f.move,f.build),charge=Math.min(1,f.frame/m.startup),colour=f.build.boss?0xff713a:f.build.style==='speed'?0x67eaff:f.build.style==='ranged'?0xa5dcff:0xffb55d;
    const p=strikePoint(f,m),x=p.x,y=FLOOR-p.y;
    if(f.frame<m.startup)fx.circle(x,y,8+charge*18).stroke({color:colour,width:2,alpha:charge*.7});
    else if(f.frame<m.startup+m.active+7){
     if(f.move==='ground'&&f.build.style!=='ranged')fx.ellipse(f.x+f.facing*90,FLOOR,35+(f.frame-m.startup)*8,12).stroke({color:colour,width:4,alpha:.6});
     else if(!m.projectile)fx.moveTo(f.x,FLOOR-145).lineTo(x,y).stroke({color:colour,width:f.move==='super'?12:5,alpha:.5});
    }
   }
  }
  if(e.phase==='finisher'&&e.winner!==null){
   const age=300-e.phaseFrames,target=e.fighters[1-e.winner],winner=e.fighters[e.winner],x=target.x,y=FLOOR-142;
   if(age>65&&age<205){const progress=(age-65)/140,colour=winner.build.style==='speed'?0x7df1ff:0xffad51;
    for(let n=0;n<(options.low?12:26);n++){const angle=n*2.399,radius=progress*(100+n*7);fx.moveTo(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius).lineTo(x+Math.cos(angle)*(radius+16),y+Math.sin(angle)*(radius+16)).stroke({color:colour,width:3,alpha:1-progress});}
    if(options.flashes)fx.circle(x,y,25+progress*55).fill({color:0xffefbb,alpha:(1-progress)*.5});
   }
   if(age>140){const time=(age-140)/60;for(let n=0;n<10;n++){const direction=n%2?1:-1,px=x+direction*(20+n*9)*time,py=Math.min(FLOOR-6,y-(95+n*7)*time+130*time*time);fx.rect(px,py,7+n%4*3,5+n%3*2).fill({color:n%2?0x8b9aa4:0x374552,alpha:1});}}
  }
  for(const p of e.projectiles){fx.ellipse(p.x,FLOOR-p.y,p.mine?31:p.radius*1.5,p.mine?9:p.radius*.6).fill({color:0x80eaff,alpha:.8});fx.circle(p.x,FLOOR-p.y,Math.max(4,p.radius*.3)).fill(0xf3ffff);}
  const recent=e.events.slice(-24);
  for(const event of recent){const age=tick-event.tick;if(age<0||age>19)continue;const fade=1-age/20;
   if(event.kind==='hit'||event.kind==='block'||event.kind==='break'){
    const colour=event.kind==='block'?0x80d8ec:0xffbd61,x=event.x,y=FLOOR-event.y;
    for(let n=0;n<8;n++){const angle=n*Math.PI/4+event.tick,inner=6+age*1.8,outer=inner+16*fade;fx.moveTo(x+Math.cos(angle)*inner,y+Math.sin(angle)*inner).lineTo(x+Math.cos(angle)*outer,y+Math.sin(angle)*outer).stroke({color:colour,width:3*fade,alpha:fade});}
    if(event.kind==='block')fx.arc(x,y,34+age*.6,-1.2,1.2).stroke({color:colour,width:4*fade,alpha:fade});
   }
   if(event.kind==='land'){fx.ellipse(event.x,FLOOR,15+age*3,3+age*.4).stroke({color:0xc6af8d,width:2,alpha:fade*.4});}
   if(event.kind==='escape')fx.circle(event.x,FLOOR-event.y,40+age*8).stroke({color:0x80eaff,width:4,alpha:fade});
   if(event.kind==='shot'&&age<5){
    const direction=e.fighters[event.side].facing,x=event.x,y=FLOOR-event.y,r=event.move==='super'?37:18;
    fx.poly([x,y-r*.45,x+direction*r*.8,y-r*.7,x+direction*r*1.8,y,x+direction*r*.8,y+r*.7,x,y+r*.45]).fill({color:0xffcf7d,alpha:(1-age/5)*.8});
    fx.circle(x+direction*9,y,5).fill({color:0xfff4cc,alpha:1-age/5});
   }
  }
  if(options.hitboxes)for(const f of e.fighters){debug.rect(f.x-39,FLOOR-f.y-(crouching(f)?174:244),84,crouching(f)?162:232).stroke({color:0x5cf8ca,width:1});if(f.move){const m=moveFor(f.move,f.build);if(f.frame>=m.startup&&f.frame<m.startup+m.active){const p=strikePoint(f,m);debug.circle(p.x,FLOOR-p.y,m.radius).stroke({color:0xff5d54,width:2});}}}
  const separation=Math.abs(e.fighters[0].x-e.fighters[1].x),wantedZoom=Math.min(1.4,1060/(separation+400));
  zoom+=(wantedZoom-zoom)*.05;cameraX+=((e.fighters[0].x+e.fighters[1].x)/2-cameraX)*.06;
  cameraX=Math.max(640/zoom,Math.min(1280-640/zoom,cameraX));
  const shake=!options.reduced&&e.hitstop?options.shake*2:0;world.scale.set(zoom);world.position.set(640-cameraX*zoom+Math.sin(tick*2.1)*shake,FLOOR-FLOOR*zoom+Math.cos(tick*1.7)*shake*.4);
  app.render();
 }
 return{canvas:app.canvas,render,capture:()=>app.renderer.extract.canvas({target:app.stage,frame:new Rectangle(0,0,1280,720),resolution:1}) as HTMLCanvasElement,setOptions:(next:Partial<ViewOptions>)=>Object.assign(options,next),destroy(){if(dead)return;dead=true;app.destroy(true,{children:true,texture:false,textureSource:false});loaded?.release();}};
 }catch(error){app.destroy(true,{children:true,texture:false,textureSource:false});loaded?.release();throw error;}
}
