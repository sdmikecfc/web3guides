/** Original scene architecture. Static vector batches, no per-frame allocations. */
import { Container, Graphics, Text } from "pixi.js";
import { isoX, isoY, WALL_H } from "../_engine/iso";
import { FLOOR_FINISHES, WALL_FINISHES, type RestaurantDesign } from "../_engine/building";
import type { RoomDef } from "../_engine/world";
import { storefrontGeometry, type FacadePoint } from "./storefront";

const hex = (c: string): number => parseInt(c.replace("#", ""), 16);
type Point = [number, number];
function polygon(g: Graphics, points: Point[], color: number, stroke?: number): void {
  g.poly(points.flat()).fill(color);
  if (stroke !== undefined) g.stroke({ color: stroke, width: 1, alpha: 0.65 });
}
function ground(g: Graphics, x: number, y: number, w: number, h: number, color: number, z = 0): void {
  polygon(g, [[isoX(x,y),isoY(x,y)+z],[isoX(x+w,y),isoY(x+w,y)+z],[isoX(x+w,y+h),isoY(x+w,y+h)+z],[isoX(x,y+h),isoY(x,y+h)+z]],color);
}

export function drawFloor(g: Graphics, room: RoomDef, design: RestaurantDesign): void {
  g.clear();
  for(let x=0;x<room.w;x++)for(let y=0;y<room.h;y++){
    const id=design.tiles[`${x},${y}`]||design.floor;
    const f=FLOOR_FINISHES.find(f=>f.id===id)??FLOOR_FINISHES[0];
    const px=isoX(x,y),py=isoY(x,y);
    const color=hex(id==='checker'&&(x+y)%2?f.accent:f.color);
    polygon(g,[[px,py],[px+32,py+16],[px,py+32],[px-32,py+16]],color);
    g.moveTo(px-32,py+16).lineTo(px,py+32).lineTo(px+32,py+16).stroke({color:hex(f.accent),width:.7,alpha:.6});
    g.moveTo(px-31,py+15).lineTo(px,py+.5).lineTo(px+31,py+15).stroke({color:0xfff7de,width:.65,alpha:.4});
    if(id==='oak')g.moveTo(px-16,py+8).lineTo(px+16,py+24).stroke({color:hex(f.accent),width:.7,alpha:.65});
    if(id==='terracotta')g.circle(px,py+16,1.1).fill({color:hex(f.accent),alpha:.55});
  }
}

export function drawWalls(g: Graphics, room: RoomDef, design: RestaurantDesign): void {
  g.clear();
  for(const side of ['left','right']as const){
    const count=side==='left'?room.h:room.w, dir=side==='left'?-1:1;
    const project=(u:number,v:number):Point=>[dir*u,u*.5+v-WALL_H];
    const quad=(u:number,v:number,w:number,h:number,c:number,s?:number)=>polygon(g,[project(u,v),project(u+w,v),project(u+w,v+h),project(u,v+h)],c,s);
    for(let n=0;n<count;n++){
      const f=WALL_FINISHES.find(f=>f.id===(design.wallTiles[`${side},${n}`]||design.wall))??WALL_FINISHES[0],u=n*32;
      quad(u,0,32,96,hex(f.color));
      quad(u,64,32,32,hex(f.accent));
      quad(u,62,32,3,0xfff3d9);
      quad(u+4,72,24,15,hex(f.accent),0xfff3d9);
      quad(u,91,32,5,0xba9870);
      quad(u,0,32,4,0xb9956c);
      quad(u,4,32,1.5,0xf1d5a7);
    }
    for(let n=1.3;n<count-1;n+=2.8){
      const u=n*32;
      quad(u-2,13,43,40,0xb99a73);
      quad(u,15,39,35,0xc7e0db);
      quad(u,35,39,15,0xb8c99d);
      polygon(g,[project(u,43),project(u+12,31),project(u+27,40),project(u+39,30),project(u+39,50),project(u,50)],0xa2bd8e);
      quad(u+18,15,2.5,35,0xfff4da);quad(u,31,39,2,0xfff4da);
      polygon(g,[project(u-1,13),project(u+11,13),project(u+7,29),project(u-1,37)],0xce8873);
      polygon(g,[project(u+28,13),project(u+40,13),project(u+40,37),project(u+32,29)],0xce8873);
      quad(u-4,52,47,4,0xb68e66);
      quad(u+5,52,13,6,0xce8873);
      const [px,py]=project(u+11,50);g.ellipse(px,py,8,4).fill(0x79946c);
    }
    quad(0,0,3,96,0xb18c64);quad(count*32-3,0,3,96,0xb18c64);
  }
}

export interface Neighborhood {
  back: Container;
  front: Container;
  setAppearance: (design: RestaurantDesign) => void;
  setSign: (name: string) => void;
  sync: (time: number, dark: number) => void;
}
export function buildNeighborhood(room: RoomDef): Neighborhood {
  const back=new Container(),front=new Container(),land=new Graphics(),facade=new Graphics(),lamps=new Graphics();
  back.addChild(land);front.addChild(facade,lamps);
  // A neighborhood block gives the cutaway room a real place to belong.
  ground(land,-2,-1.4,room.w+4,room.h+4.9,0xd1d6b0,15);
  ground(land,-1.3,-.7,room.w+2.6,room.h+3.1,0xe5ddc5,11);
  ground(land,-.6,-.2,room.w+1.2,room.h+1.3,0xf4e8ce,7);
  ground(land,-2,room.h+2,room.w+4,1.5,0xc9c9b9,18);
  for(let n=-1;n<room.w+1;n+=.8){
    ground(land,n,room.h+.1,.7,.75,0xe2d2b3,9);
    ground(land,n,room.h+1,.7,.75,0xece0c6,9);
  }
  ground(land,0,0,room.w,room.h,0xc6a67c,8);
  // Front edge of the building plinth; the dining floor stays unobstructed.
  polygon(land,[[isoX(0,room.h),isoY(0,room.h)],[isoX(room.w,room.h),isoY(room.w,room.h)],[isoX(room.w,room.h),isoY(room.w,room.h)+10],[isoX(0,room.h),isoY(0,room.h)+10]],0xb89d79);
  polygon(land,[[isoX(room.w,0),isoY(room.w,0)],[isoX(room.w,room.h),isoY(room.w,room.h)],[isoX(room.w,room.h),isoY(room.w,room.h)+10],[isoX(room.w,0),isoY(room.w,0)+10]],0xcab18a);
  function tree(gx:number,gy:number,size:number){
    const x=isoX(gx,gy),y=isoY(gx,gy)+10;
    land.ellipse(x,y,23*size,10*size).fill({color:0x72816a,alpha:.16});
    land.moveTo(x,y-4).lineTo(x,y-37*size).stroke({color:0xa28861,width:6*size});
    [[-12,-43,18],[9,-52,21],[18,-35,16],[-5,-28,20]].forEach(([dx,dy,r],i)=>{
      land.circle(x+dx*size,y+dy*size,r*size).fill(i%2?0xaabc83:0x91aa78);
      land.circle(x+(dx-4)*size,y+(dy-6)*size,r*size*.38).fill({color:0xccd69c,alpha:.5});
    });
  }
  tree(-1.1,room.h*.52,1.2);tree(room.w+1,.3,1.1);tree(room.w+1,room.h-1,.8);
  const sign=new Text({text:'The Little Kitchen',style:{fontFamily:'Georgia, serif',fontSize:10.5,fontWeight:'600',fill:0xfff3da}});
  sign.anchor.set(.5,.5);front.addChild(sign);
  // The text follows the same 2:1 wall plane as its mounted nameboard.
  const wallAngle=Math.atan(.5);
  sign.skew.y=wallAngle;
  let restaurantName='The Little Kitchen',customSign='',labelWidth=87;
  let parcelPoint:FacadePoint=[0,0];
  const fitSign=()=>{
    sign.text=customSign||restaurantName;
    sign.scale.set(1);
    const fit=Math.min(1,labelWidth/Math.max(sign.getLocalBounds().width,1));
    sign.scale.set(fit/Math.cos(wallAngle),fit);
  };
  const setSign=(name:string)=>{restaurantName=name.trim()||'The Little Kitchen';fitSign();};
  const setAppearance=(design:RestaurantDesign)=>{
    const geometry=storefrontGeometry(room,design.storefront.awning);
    facade.clear();
    for(const shape of geometry.shapes){
      if(shape.kind==='polygon')polygon(facade,shape.points,shape.fill,shape.stroke);
      else if(shape.kind==='ellipse')facade.ellipse(...shape.center,shape.rx,shape.ry).fill(shape.fill);
      else {
        facade.moveTo(...shape.points[0]);
        for(const point of shape.points.slice(1))facade.lineTo(...point);
        facade.stroke({color:shape.stroke,width:shape.width});
      }
    }
    labelWidth=geometry.labelWidth;parcelPoint=geometry.parcel;
    customSign=design.storefront.sign.trim();
    sign.position.set(...geometry.label);fitSign();
  };
  const sync=(time:number,_dark:number)=>{
    lamps.clear();
    lamps.circle(...parcelPoint,1.4).fill({color:0xfff4c2,alpha:.25+.15*Math.sin(time)});
  };
  return{back,front,setAppearance,setSign,sync};
}
