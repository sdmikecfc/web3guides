import type { DecorDef } from './collections';
import { ALL_COLLECTIBLES as COLLECTIBLES } from './collectible-packs';

/** Coin furniture remains available independently of paid collections. */
export const SHOP_DECOR:DecorDef[]=[
  {id:'half_wall_cream',name:'Cream half-wall',description:'Connect short panels to divide a corner. Leave a gap for people to walk through.',footprint:[1,1],price:180,setId:'build'},
  {id:'half_wall_walnut',name:'Walnut half-wall',description:'A warm timber partition with a substantial wood cap.',footprint:[1,1],price:240,setId:'build'},
  {id:'half_wall_deco',name:'Brass-trim half-wall',description:'An emerald divider with brass detailing for your lounge.',footprint:[1,1],price:380,setId:'build'},
  {id:'slatted_screen',name:'Timber privacy screen',description:'Open timber slats divide the room while keeping it airy.',footprint:[1,1],price:450,setId:'build'},
  {id:'display_counter_red',name:'Cherry display counter',description:'Two real display spots for your favourite countertop pieces. Connect counters to build a longer display.',footprint:[2,1],price:650,setId:'build',displaySurface:.94},
  {id:'display_counter_oak',name:'Oak display counter',description:'A warm two-spot display for plants and little treasures.',footprint:[2,1],price:750,setId:'build',displaySurface:.94},
  {id:'display_counter_deco',name:'Emerald display counter',description:'Two display spots on a stone top with fluted emerald fronts.',footprint:[2,1],price:1100,setId:'build',displaySurface:.94},
  {id:'display_corner_red',name:'Cherry counter corner',description:'A matching corner to turn your display counter. One real display spot on top.',footprint:[1,1],price:380,setId:'build',displaySurface:.94},
  {id:'display_corner_oak',name:'Oak counter corner',description:'Turn an oak display into a snug corner. One display spot on top.',footprint:[1,1],price:440,setId:'build',displaySurface:.94},
  {id:'display_corner_deco',name:'Emerald counter corner',description:'A rounded stone-and-brass corner for your elegant display.',footprint:[1,1],price:650,setId:'build',displaySurface:.94},
  {id:'waiting_bench_red',name:'Cherry waiting bench',description:'A cushioned bench for a welcoming entrance. Waiting furniture does not add dining seats.',footprint:[2,1],price:550,setId:'waiting',waitingSeats:2,passable:true},
  {id:'waiting_bench_oak',name:'Oak waiting bench',description:'A small-town waiting bench with a cosy green cushion.',footprint:[2,1],price:620,setId:'waiting',waitingSeats:2,passable:true},
  {id:'waiting_sofa',name:'Emerald lounge sofa',description:'A velvet sofa for guests waiting for a dining seat.',footprint:[2,1],price:1200,setId:'waiting',waitingSeats:2,passable:true},
  {id:'magazine_rack',name:'Dog-eared magazine rack',description:'A rack of well-loved magazines for your waiting nook.',footprint:[1,1],price:240,setId:'waiting'},
  {id:'lobby_table',name:'Little lobby table',description:'A low display table with one spot for a plant or collectible.',footprint:[1,1],price:350,setId:'waiting',displaySurface:.52},
  {id:'wall_menu_tiles',name:'Burger menu tiles',description:'A cheerful wall display of a burger, fries and a cold drink.',footprint:[1,1],price:280,setId:'fifties',wall:true},
  {id:'wall_skateboard',name:'Lunch-break skateboard',description:'A cherry-red deck with cream wheels, mounted on your wall.',footprint:[1,1],price:360,setId:'smalltown',wall:true},
  {id:'wall_records',name:'Three favourite records',description:'A trio of framed vinyl records for your music corner.',footprint:[1,1],price:480,setId:'smalltown',wall:true},
  {id:'wall_sunrise',name:'Desert sunrise relief',description:'Layered terracotta hills and a brass sunrise in a wood frame.',footprint:[1,1],price:520,setId:'smalltown',wall:true},
  {id:'wall_fan',name:'Jade fan relief',description:'A sculpted jade and brass fan for a polished dining room.',footprint:[1,1],price:700,setId:'deco',wall:true},
  {id:'wall_botanical',name:'Pressed-leaf triptych',description:'Three little botanical frames for a green café wall.',footprint:[1,1],price:420,setId:'garden',wall:true},
  {id:'terrarium',name:'Little glasshouse',description:'A tiny copper-framed garden for a countertop.',footprint:[1,1],price:460,setId:'garden',counter:true},
  {id:'cafe_candles',name:'Evening candle trio',description:'Three warm candle ornaments on a brass tray.',footprint:[1,1],price:320,setId:'deco',counter:true},
  {id:'ceramic_fox',name:'Sleepy ceramic fox',description:'A curled-up woodland friend for a shelf or counter.',footprint:[1,1],price:390,setId:'smalltown',counter:true},
  {id:'soda_crates',name:'Saturday soda crates',description:'Stacked wooden crates with colourful glass bottles.',footprint:[1,1],price:380,setId:'fifties'},
  {id:'floor_lamp',name:'Reading-corner lamp',description:'A brass standing lamp with a pleated cream shade.',footprint:[1,1],price:680,setId:'waiting'},
  {id:'planter_divider',name:'Fern divider',description:'A long planter to separate a waiting nook from the dining room.',footprint:[2,1],price:720,setId:'garden'},
];
export const COLLECTIBLE_DECOR:DecorDef[]=COLLECTIBLES.map(item=>({id:item.id,name:item.name,description:item.description,footprint:item.footprint,price:0,setId:'collectibles',collectible:true,wall:item.mount==='wall',counter:item.mount==='counter',ceiling:item.mount==='ceiling',passable:item.mount==='ceiling'}));
