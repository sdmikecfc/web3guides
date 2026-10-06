import * as THREE from 'three';
import { COLLECTIBLE_BY_ID } from '../../../lib/chef/diner/collectible-packs';
import { SHOP_DECOR } from '../../../lib/chef/diner/decor-catalog';

type Kit={box:(w:number,h:number,d:number,color:string,x?:number,y?:number,z?:number,r?:number)=>THREE.Mesh;cylinder:(top:number,bottom:number,h:number,color:string,x?:number,y?:number,z?:number,sides?:number)=>THREE.Mesh;material:(color:string)=>THREE.Material;pack:(g:THREE.Group,key:string)=>THREE.Group};
const cream='#fff0cf',gold='#d8ad59',jade='#386a61',red='#bd574a',ink='#263f3e',wood='#8b6547',pink='#d998a1',mint='#9cc7b0';
const sphereGeometry=new THREE.SphereGeometry(1,16,12);
sphereGeometry.userData.sharedKitResource=true;
const hoopGeometry=new THREE.TorusGeometry(1,.075,6,32);
hoopGeometry.userData.sharedKitResource=true;

/** The same constructed miniatures are used in packs, the catalogue and rooms. */
export function createCollectionModel(kind:string,k:Kit):THREE.Group|null{
  const collectible=COLLECTIBLE_BY_ID[kind],shop=SHOP_DECOR.find(item=>item.id===kind);
  if(!collectible&&!shop)return null;
  const g=new THREE.Group();g.name=kind;
  const b=k.box,c=k.cylinder;
  const ell=(color:string,x:number,y:number,z:number,sx:number,sy=sx,sz=sx)=>{const m=new THREE.Mesh(sphereGeometry,k.material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;};
  const hoop=(color:string,x:number,y:number,z:number,r:number)=>{const m=new THREE.Mesh(hoopGeometry,k.material(color));m.position.set(x,y,z);m.scale.setScalar(r);m.castShadow=true;g.add(m);return m;};
  const bar=(x:number,y:number,z:number,w:number,h:number,d:number,color=gold,angle=0)=>{const m=b(w,h,d,color,x,y,z,.015);m.rotation.z=angle;g.add(m);return m;};
  const eyes=(y:number,z:number,width=.15)=>{for(const x of [-width,width]){ell(ink,x,y,z,.028,.036,.017);ell(cream,x-.008,y+.012,z-.016,.008);}bar(0,y-.075,z,.06,.015,.012,ink);};
  const burger=(y:number,size=1)=>{g.add(c(.29*size,.29*size,.09*size,gold,0,y,0,24),c(.31*size,.31*size,.042*size,'#87a766',0,y+.065*size,0,24),c(.30*size,.30*size,.075*size,'#724634',0,y+.12*size,0,24),b(.43*size,.035*size,.44*size,'#f0cb64',0,y+.17*size,0,.02));ell('#dda65d',0,y+.23*size,0,.32*size,.15*size,.31*size);for(let i=0;i<7;i++){const a=i*2.4;bar(Math.sin(a)*.19*size,y+.35*size,Math.cos(a)*.15*size,.014*size,.014*size,.043*size,cream,a);}};
  const feet=(y=.08)=>{for(const x of [-.20,.20])g.add(b(.24,.15,.34,jade,x,y,-.05,.05));};
  const plinth=(wide=1)=>g.add(b(.78*wide,.07,.68,jade,0,.05,0,.05),b(.74*wide,.024,.64,gold,0,.098,0,.02));
  const star=(x:number,y:number,z:number,size=.13)=>{for(const angle of [0,Math.PI/2,Math.PI/4,-Math.PI/4])bar(x,y,z,.022,size,.022,gold,angle);};

  if(collectible){
    const shape=collectible.shape;
    if(shape==='cat'){
      plinth();burger(.23);ell(cream,0,.69,0,.25,.23,.23);for(const x of [-.17,.17]){g.add(c(0,.10,.16,gold,x,.91,0,3));ell(pink,x,.93,-.025,.034,.05,.02);}eyes(.71,-.218,.105);ell(cream,.34,.67,0,.09,.16,.09);g.add(c(.085,.085,.027,gold,0,.4,-.31,20));
    }else if(shape==='diver'){
      plinth();ell('#789751',0,.40,0,.20,.31,.20);ell('#b98858',0,.73,0,.28);hoop(gold,0,.75,-.247,.20);ell('#83b6b4',0,.75,-.258,.17,.17,.02);eyes(.76,-.283,.07);bar(.3,.70,0,.15,.10,.1,wood);feet();
    }else if(shape==='rocket'){
      plinth();g.add(c(.17,.23,.57,'#e8bd56',0,.51,0,24),c(0,.17,.24,red,0,.916,0,24));hoop(cream,0,.60,-.205,.10);ell(jade,0,.60,-.215,.076,.076,.02);for(const x of [-.26,.26])bar(x,.33,0,.16,.32,.10,red,-x);for(const x of [-.10,0,.10])ell(gold,x,.16,0,.055,.16,.055);
    }else if(shape==='robot'){
      feet();g.add(b(.45,.40,.30,red,0,.40,0,.055),b(.48,.30,.31,cream,0,.78,0,.07));eyes(.8,-.166,.10);bar(0,.99,0,.025,.16,.025,jade);ell(gold,0,1.08,0,.052);for(const x of [-.32,.32]){bar(x,.45,0,.09,.31,.1,jade,x);ell(gold,x,.30,0,.07);}bar(0,.43,-.23,.48,.035,.29,jade);
    }else if(shape==='radio'){
      plinth();g.add(c(.32,.21,.31,jade,0,.35,0,24),c(.34,.34,.06,cream,0,.53,0,24));for(let i=0;i<5;i++)bar(-.16+i*.064,.36,-.293,.023,.16,.018,gold);ell(gold,.22,.38,-.24,.058,.058,.02);for(const x of [-.14,.14])bar(x,.80,0,.027,.49,.027,wood,-.25);for(let i=0;i<3;i++)hoop(gold,(i-1)*.11,.55,0,.08).rotation.x=Math.PI/2;
    }else if(shape==='clock'){
      for(let i=0;i<3;i++){const face=c(.39,.39,.07,i%2?cream:gold,0,1.49,.37+i*.025,32);face.rotation.x=Math.PI/2;g.add(face);}for(let i=0;i<12;i++)ell(wood,Math.sin(i*Math.PI/6)*.31,1.49+Math.cos(i*Math.PI/6)*.31,.28,.014);bar(0,1.58,.27,.025,.20,.025,jade);bar(.085,1.49,.26,.20,.023,.025,jade);ell(gold,.22,1.76,.27,.10,.065,.03);g.userData.wallMountPlane=.49;
    }else if(shape==='lantern'){
      plinth();ell(cream,0,.45,0,.33,.29,.28);for(let i=0;i<7;i++)bar((i-3)*.065,.66,0,.024,.11,.28,gold,(i-3)*-.12);eyes(.45,-.267,.11);hoop(wood,0,.84,0,.10);bar(0,.19,-.10,.033,.17,.033,red);
    }else if(shape==='crown'){
      plinth();ell('#8e4353',0,.22,0,.34,.13,.27);g.add(c(.25,.25,.12,gold,0,.37,0,24));for(let i=0;i<8;i++){const a=i*Math.PI/4;bar(Math.sin(a)*.23,.57,Math.cos(a)*.23,.065,.34+(i%2)*.08,.065,gold);ell(i%2?red:jade,Math.sin(a)*.251,.38,Math.cos(a)*.251,.035);}
    }else if(shape==='globe'){
      plinth();burger(.43,.65);hoop(gold,0,.57,0,.43).rotation.y=.4;hoop(mint,0,.57,0,.40).rotation.x=.6;bar(0,.26,0,.06,.3,.06,gold);star(.29,.91,0,.11);
    }else if(shape==='sign'||shape==='moon'){
      g.add(b(.86,.76,.055,jade,0,1.49,.455,.09));hoop(shape==='sign'?red:gold,0,1.49,.411,.30);if(shape==='sign'){for(const [y,w,color] of [[1.6,.40,gold],[1.5,.48,mint],[1.40,.40,gold]] as const)bar(0,y,.382,w,.057,.029,color);}else{ell(gold,-.075,1.56,.39,.18,.24,.024);ell(jade,-.02,1.61,.36,.155,.20,.03);bar(.18,1.34,.35,.28,.09,.035,cream);for(const x of [.13,.20])bar(x,1.49,.35,.02,.24,.02,gold,-.25);star(-.23,1.27,.38,.08);}g.userData.wallMountPlane=.49;
    }else if(shape==='train'||shape==='express'){
      g.add(b(1.88,.13,.65,jade,0,.12,0,.035));
      for(const x of [-.72,-.39,.28,.65])for(const z of [-.29,.29]){const wheel=c(.13,.13,.06,ink,x,.22,z,20);wheel.rotation.x=Math.PI/2;g.add(wheel);ell(gold,x,.22,z*1.11,.044,.044,.02);}
      if(shape==='train'){
        bar(-.42,.48,0,.70,.39,.50,red);bar(.13,.59,0,.30,.68,.50,jade);bar(.13,.97,0,.44,.06,.61,gold);bar(.13,.7,-.26,.18,.22,.025,mint);burger(.57,.62);bar(-.65,.87,0,.15,.38,.15,wood);
        // A separate, open fry wagon trails the little locomotive.
        bar(.67,.35,0,.48,.15,.50,red);for(const z of [-.23,.23])bar(.67,.52,z,.48,.28,.055,red);
        for(let i=0;i<6;i++)bar(.54+(i%3)*.12,.65+Math.floor(i/3)*.025,(Math.floor(i/3)-.5)*.19,.065,.45+(i%2)*.08,.065,gold,(i-2)*.06);
        g.scale.setScalar(.65);
      }else{
        // A brass-lined emerald streamliner: a distinct silhouette from the toy train.
        const boiler=c(.23,.23,.91,jade,-.24,.55,0,24);boiler.rotation.z=Math.PI/2;g.add(boiler);
        for(const x of [-.61,-.18,.17])hoop(gold,x,.55,0,.237).rotation.y=Math.PI/2;
        ell(gold,-.73,.56,0,.025,.19,.19);ell(cream,-.76,.60,-.01,.023,.075,.075);
        bar(.56,.66,0,.55,.79,.53,jade);bar(.56,1.09,0,.66,.08,.64,gold);
        for(const z of [-.275,.275]){bar(.56,.79,z,.34,.27,.018,'#e7bf77');bar(.56,.79,z*1.04,.024,.28,.014,jade);bar(-.10,.38,z*1.07,1.37,.035,.016,gold);star(.56,.51,z*1.08,.12);}
        g.add(c(.10,.065,.25,gold,-.50,.91,0,16));ell(cream,-.5,1.10,0,.075,.06,.075);ell(cream,-.42,1.22,0,.06,.05,.06);
        bar(-.80,.27,0,.15,.09,.53,gold);burger(.82,.45);
      }
    }else if(shape==='spatula'){
      plinth();g.add(b(.53,.76,.15,jade,0,.51,.12,.07),b(.45,.69,.024,gold,0,.51,.031,.05));bar(0,.48,-.025,.07,.54,.07,wood,-.16);bar(-.06,.80,-.025,.24,.26,.06,gold,-.16);for(const x of [-.1,-.045,.01])bar(x,.82,-.061,.017,.12,.007,wood,-.16);star(.28,.81,0,.13);
    }else if(shape==='mech'||shape==='king'){
      feet();if(shape==='king'){bar(0,.66,.17,.79,1.25,.15,jade);for(const x of [-.37,.37])bar(x,.60,0,.12,.70,.55,gold);for(let i=0;i<3;i++)star((i-1)*.21,1.27,.06,.14);}
      burger(.48,1.12);eyes(.77,-.34,.14);for(const x of [-.42,.42]){bar(x,.43,0,.12,.4,.13,shape==='king'?red:jade,-x);bar(x,.7,-.05,.18,.07,.18,gold);}if(shape==='mech'){bar(-.46,.93,0,.07,.42,.07,wood);bar(-.46,1.17,0,.25,.22,.07,cream);}else{g.add(c(.24,.24,.11,gold,0,.99,0,24));for(const x of [-.18,0,.18])g.add(c(0,.055,.20,gold,x,1.12,0,4));}
    }else if(shape==='dragon'){
      plinth();g.add(c(.31,.2,.30,cream,0,.32,-.05,24));for(let i=0;i<9;i++){const a=i*.6;ell(jade,Math.sin(a)*.30,.40+i*.042,Math.cos(a)*.27,.13,.12,.13);}ell(jade,-.25,.96,0,.21,.16,.15);ell(mint,-.32,.9,-.13,.15,.08,.12);for(const x of [-.35,-.16])g.add(c(0,.06,.20,gold,x,1.16,0,4));ell(ink,-.32,1,-.13,.025);for(let i=0;i<4;i++)bar((i-1.5)*.09,.49,-.05,.023,.027,.32,gold,.2);
    }else if(shape==='octopus'){
      plinth();for(let i=0;i<8;i++){const a=i*Math.PI/4;ell(pink,Math.sin(a)*.28,.29,Math.cos(a)*.28,.13,.22,.13);}ell(pink,0,.60,0,.3,.29,.28);eyes(.61,-.267,.12);g.add(c(.24,.24,.07,cream,0,.88,0,24));for(const x of [-.14,0,.14])ell(cream,x,.99,0,.13,.16,.12);for(const x of [-.39,.39])g.add(c(.13,.13,.027,gold,x,.5,-.12,20));
    }else if(shape==='ufo'){
      plinth();g.add(c(.08,.22,.48,mint,0,.36,0,24),c(.43,.22,.13,gold,0,.69,0,32));ell(pink,0,.79,0,.30,.18,.29);for(let i=0;i<8;i++){const a=i*Math.PI/4;ell(cream,Math.sin(a)*.37,.71,Math.cos(a)*.37,.038);}ell(red,0,1.01,0,.075);bar(.018,1.12,0,.02,.12,.02,jade,-.3);
    }else if(shape==='disco'){
      bar(0,2.49,0,.025,.52,.025,gold);ell(jade,0,2.03,0,.34);for(let y=-2;y<=2;y++)for(let i=0;i<10;i++){const a=i*Math.PI/5,r=Math.sqrt(.34**2-(y*.10)**2);ell((i+y)%2?gold:mint,Math.sin(a)*r,2.03+y*.10,Math.cos(a)*r,.032,.031,.018);}for(let i=0;i<7;i++){const a=i*Math.PI/3.5;bar(Math.sin(a)*.24,2.4,Math.cos(a)*.24,.06,.26,.06,gold);}
    }else if(shape==='capsule'){
      g.add(b(.69,.46,.56,red,0,.29,0,.06),b(.72,.09,.60,gold,0,.56,0,.03),b(.62,.53,.45,mint,0,.87,.03,.10),b(.72,.07,.56,red,0,1.17,0,.04));for(let i=0;i<7;i++)ell([cream,gold,pink,jade][i%4],((i%3)-1)*.17,.71+Math.floor(i/3)*.14,-.195,.075);hoop(gold,.16,.34,-.291,.08);bar(-.11,.20,-.3,.23,.11,.025,ink);
    }else if(shape==='aquarium'){
      for(const y of [.1,1.13])g.add(b(1.80,.08,.69,jade,0,y,0,.04));g.add(b(1.65,.94,.035,'#659e9d',0,.61,.28,.025));for(const x of [-.84,.84])bar(x,.62,0,.055,1.01,.62,gold);for(let i=0;i<3;i++){const x=(i-1)*.48,y=.65+(i%2)*.2;ell(i%2?pink:cream,x,y,-.04,.19,.12,.15);for(const dx of [-.1,0,.1])bar(x+dx,y-.23,-.04,.013,.31,.013,i%2?pink:cream,dx*2);}for(let i=0;i<5;i++)ell(gold,(i-2)*.3,.19,.10,.08,.04,.07);
    }else if(shape==='phoenix'){
      plinth();burger(.40,.72);for(const side of [-1,1])for(let i=0;i<5;i++){const feather=ell(i%2?gold:red,side*(.21+i*.053),.67+i*.085,.08,.065,.30,.065);feather.rotation.z=-side*(.2+i*.13);}ell(gold,0,.87,-.01,.10,.13,.1);g.add(c(0,.065,.12,red,0,1.035,0,3));
    }else if(shape==='portal'){
      plinth();bar(0,.79,.09,.83,1.3,.17,jade);bar(0,.80,-.016,.64,1.08,.015,'#343655');for(const x of [-.36,.36])bar(x,.78,-.035,.055,1.25,.04,gold);bar(0,1.39,-.04,.77,.055,.05,gold);for(let i=0;i<7;i++)star(Math.sin(i*2.4)*.25,.42+(i%4)*.23,-.04,.048);bar(0,.48,-.11,.47,.21,.22,red);bar(0,.61,-.11,.51,.033,.28,cream);ell(gold,.18,1.13,-.05,.08,.08,.02);
    }
    if(shape==='mech'||shape==='king')g.scale.setScalar(.88);
    if(shape==='phoenix')g.scale.setScalar(.82);
    g.userData.collectible=true;g.userData.rarity=collectible.rarity;
    return k.pack(g,`collection-v1:${kind}`);
  }

  if(kind.startsWith('half_wall')){
    const color=kind.endsWith('walnut')?wood:kind.endsWith('deco')?jade:cream;
    g.add(b(1,.78,.22,color,0,.40,0,.015),b(1,.065,.30,kind.endsWith('deco')?gold:wood,0,.824,0,.015),b(1,.07,.26,wood,0,.047,0,.015));
    for(const x of [-.34,0,.34])bar(x,.39,-.119,.021,.57,.014,kind.endsWith('deco')?gold:color);
  }else if(kind==='slatted_screen'){
    for(const x of [-.43,.43])bar(x,.86,0,.065,1.68,.10,wood);for(let i=0;i<7;i++)bar((i-3)*.115,.86,0,.038,1.49,.055,gold);for(const y of [.08,1.65])bar(0,y,0,.92,.075,.16,wood);
  }else if(kind.startsWith('display_counter')||kind.startsWith('display_corner')){
    const color=kind.endsWith('red')?red:kind.endsWith('oak')?wood:jade;
    const w=kind.startsWith('display_corner')?1:2,stone=kind.endsWith('deco')?'#e5e0d1':cream,trim=kind.endsWith('deco')?gold:'#b7c9bf';
    // Recessed base and a substantial rounded top connect without projecting feet.
    g.add(b(w-.12,.14,.66,ink,0,.08,0,.035),b(w,.73,.79,color,0,.465,0,.058),b(w,.035,.85,trim,0,.87,0,.020),b(w,.07,.89,stone,0,.905,0,.046));
    for(const side of [-1,1])g.add(b(.045,.57,.76,trim,side*(w/2-.046),.48,0,.016));
    const panels=kind.startsWith('display_corner')?1:2;
    for(let n=0;n<panels;n++){const x=panels===1?0:n-.5;g.add(b(.82,.55,.035,trim,x,.47,-.406,.035),b(.77,.49,.035,color,x,.47,-.428,.030));if(kind.endsWith('deco'))for(let rib=0;rib<5;rib++)bar(x+(rib-2)*.135,.47,-.451,.018,.41,.012,gold);else{bar(x,.73,-.455,.30,.022,.015,trim);bar(x,.22,-.454,.65,.018,.012,trim);}}
    // Back shelving makes the furniture readable from either side of the room.
    g.add(b(w-.15,.46,.03,wood,0,.44,.411,.018),b(w-.15,.04,.24,stone,0,.37,.40,.014));
    if(kind.startsWith('display_corner')){g.add(b(.025,.57,.72,trim,.47,.47,0,.020),b(.025,.50,.65,color,.482,.47,0,.022));}
  }else if(shop!.waitingSeats){
    const color=kind.endsWith('red')?red:kind.endsWith('oak')?mint:jade;
    for(const x of [-.77,.77])for(const z of [-.24,.24])bar(x,.21,z,.075,.39,.075,wood);
    g.add(b(1.83,.18,.70,color,0,.48,0,.07),b(1.86,.42,.16,color,0,.80,.27,.07));for(const x of [-.86,.86])g.add(b(.15,.26,.72,wood,x,.64,0,.04));
    for(const x of [-.44,.44])g.add(b(.70,.08,.54,color,x,.59,-.018,.06));
  }else if(kind==='lobby_table'){
    g.add(c(.40,.40,.065,wood,0,.49,0,24));for(const x of [-.25,.25])for(const z of [-.25,.25])bar(x,.23,z,.065,.46,.065,jade);
  }else if(kind==='magazine_rack'){
    for(const y of [.24,.58])g.add(b(.63,.16,.28,wood,0,y,0,.025));for(const x of [-.28,.28])bar(x,.34,.08,.05,.66,.05,jade);
    for(let i=0;i<5;i++){const x=(i-2)*.10;bar(x,.67,-.02,.087,.28,.07,[cream,red,mint,gold,cream][i]);bar(x,.72,-.061,.05,.03,.008,jade);}
  }else if(kind.startsWith('wall_')){
    g.add(b(.88,.73,.055,wood,0,1.49,.458,.025),b(.80,.65,.014,cream,0,1.49,.419,.02));g.userData.wallMountPlane=.49;
    if(kind==='wall_records')for(const [x,y]of [[-.21,1.6],[.20,1.6],[0,1.32]]){hoop(ink,x,y,.390,.145);ell(ink,x,y,.393,.139,.139,.008);ell(red,x,y,.38,.043,.043,.01);}
    else if(kind==='wall_skateboard'){bar(0,1.49,.37,.19,.57,.05,red,.20);for(const y of [1.3,1.68])for(const x of [-.10,.10])ell(cream,x,y,.33,.042,.042,.036);}
    else if(kind==='wall_fan'){for(let i=0;i<11;i++){const angle=(i-5)*.22;bar(Math.sin(angle)*.14,1.40+Math.cos(angle)*.14,.38,.045,.46,.035,i%2?jade:gold,-angle);}}
    else if(kind==='wall_botanical'){for(const x of [-.25,0,.25]){bar(x,1.49,.39,.18,.45,.019,mint);bar(x,1.48,.37,.012,.31,.009,jade);for(const d of [-1,1])ell(jade,x+d*.035,1.52+d*.035,.36,.05,.02,.01);}}
    else if(kind==='wall_sunrise'){ell(gold,.16,1.64,.39,.15,.15,.018);for(let i=0;i<3;i++)ell(i%2?red:wood,(i-1)*.21,1.30+i*.04,.35-i*.02,.29,.16,.025);}
    else {for(const [x,color]of [[-.25,gold],[0,red],[.25,mint]] as const){bar(x,1.5,.38,.16,.25,.025,color);for(let i=0;i<3;i++)bar(x+(i-1)*.034,1.69,.38,.02,.13,.02,gold);}}
  }else if(kind==='terrarium'){
    plinth();for(const x of [-.27,.27])for(const z of [-.20,.20])bar(x,.42,z,.025,.61,.025,gold);for(const x of [-.13,.13]){ell(jade,x,.34,0,.14,.21,.12);ell(mint,x,.50,0,.10,.13,.10);}for(const side of [-1,1])bar(side*.135,.78,0,.025,.37,.44,gold,side*.82);
  }else if(kind==='cafe_candles'){
    g.add(c(.36,.36,.032,gold,0,.025,0,24));for(let i=0;i<3;i++){const x=(i-1)*.19,h=.30+i*.10;g.add(c(.068,.068,h,cream,x,h/2+.05,0,20));ell(gold,x,h+.1,0,.027,.065,.027);}
  }else if(kind==='ceramic_fox'){
    ell(red,0,.22,0,.34,.19,.25);ell(red,-.19,.36,-.1,.16,.14,.14);for(const x of [-.27,-.12])g.add(c(0,.062,.15,red,x,.52,-.07,3));ell(cream,-.19,.30,-.21,.1,.075,.025);for(const x of [-.25,-.13])bar(x,.38,-.23,.049,.012,.008,ink);ell(cream,.22,.22,-.18,.16,.08,.07);
  }else if(kind==='soda_crates'){
    for(const y of [.15,.43])g.add(b(.63,.23,.50,wood,0,y,0,.03));for(let i=0;i<6;i++){const x=(i%3-1)*.18,z=Math.floor(i/3)*.2-.1;g.add(c(.045,.052,.29,i%2?jade:red,x,.63,z,12),c(.025,.025,.12,gold,x,.81,z,12));}
  }else if(kind==='floor_lamp'){
    g.add(c(.29,.32,.06,ink,0,.04,0,24),c(.22,.29,.035,gold,0,.084,0,24),c(.032,.038,1.22,gold,0,.70,0,16),c(.21,.35,.38,cream,0,1.46,0,32),c(.218,.218,.025,gold,0,1.66,0,32),c(.35,.35,.023,gold,0,1.265,0,32));for(let i=0;i<16;i++){const a=i*Math.PI/8;bar(Math.sin(a)*.28,1.46,Math.cos(a)*.28,.014,.34,.014,'#ddcea9');}ell(gold,0,1.72,0,.055,.075,.055);
  }else if(kind==='planter_divider'){
    g.add(b(1.83,.47,.64,wood,0,.26,0,.055),b(1.69,.03,.53,'#574737',0,.505,0,.03));for(let i=0;i<5;i++){const x=(i-2)*.32;bar(x,.68,0,.025,.37,.025,jade);for(const side of [-1,1]){const leaf=ell(i%2?mint:jade,x+side*.09,.78,0,.09,.23,.065);leaf.rotation.z=side*.5;}}
  }
  return k.pack(g,`shop-expansion-v2:${kind}`);
}
