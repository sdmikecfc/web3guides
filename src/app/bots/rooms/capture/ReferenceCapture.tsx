"use client";
import { useEffect, useRef, useState } from "react";
import { createLivingRoom } from "../../_view/living-room";
import type { RoomActor } from "../../_game/LivingRoomScene";
import type { Build } from "../../_engine/parts";
import type { BotLook } from "../../_view/look";
import { seedState } from "@/lib/bots/garage-state";
import { engineBuild } from "@/lib/bots/fixtures";
import identity from "./identity.json";

/** Cinematic stills only: no accounts, wallets, player saves, or API writes. */
export default function ReferenceCapture() {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    if(!canvas.current) return;
    const value=new URLSearchParams(window.location.search).get("shot");
    const shot=value === "key" || value === "street" ? value : "hero";
    const scene=createLivingRoom(canvas.current,shot === "street" ? "community" : "garage",shot);
    // These checked-in showcase snapshots contain fixed three-value stat tuples;
    // JSON imports widen those tuples to number arrays at the TypeScript boundary.
    const named=(who:"hero"|"opponent",bay:number):RoomActor=>({id:who,bay,build:identity[who].build as unknown as Build,look:identity[who].look as BotLook});
    let actors:RoomActor[]=[named("hero",3)];
    if(shot === "street") {
      const fixture=seedState(0), builds=Object.values(fixture.builds);
      actors=[named("hero",2),named("opponent",4),...builds.slice(0,3).map((build,i)=>({id:`visitor-${i}`,bay:[1,3,5][i],build:engineBuild(build,fixture.parts),look:{}}))];
    }
    let dead=false;
    const resize=()=>{scene.resize(window.innerWidth,window.innerHeight,1);scene.render(0);};
    void scene.setActors(actors).then(()=>{if(!dead){resize();setReady(true);}}).catch(console.error);
    window.addEventListener("resize",resize);
    return()=>{dead=true;window.removeEventListener("resize",resize);scene.dispose();};
  },[]);
  return <div data-trailer-reference-ready={ready} style={{position:"fixed",inset:0,zIndex:2147483646,background:"#251c13"}}><canvas ref={canvas} style={{display:"block",width:"100%",height:"100%"}} /></div>;
}
