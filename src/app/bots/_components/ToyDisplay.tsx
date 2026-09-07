"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Build, Part, Slot, PaintId } from "../_engine/parts";
import type { Socket } from "@/lib/bots/fixtures";
import type { BotLook } from "../_view/look";
import { createToyStage, photographToy, retainToyPhotographs, type ToyStage, type ToyStageVariant } from "../_view/toy-stage";

export interface ToyDisplayHandle {
  hitSocket(clientX:number,clientY:number,kind?:Slot,radius?:number):Socket|null;
}
export interface ToyDisplayProps {
  build:Build;
  look?:BotLook;
  mode?:"static"|"interactive";
  variant?:ToyStageVariant;
  selectedSocket?:Socket|null;
  partSocket?:Socket;
  onSocketSelect?:(socket:Socket)=>void;
  onReady?:()=>void;
  onCapture?:(picture:string)=>void;
  rotation?:number;
  ariaLabel?:string;
  className?:string;
  style?:CSSProperties;
}

/** A complete toy appears in one frame. Gallery instances own no WebGL context. */
export const ToyDisplay=forwardRef<ToyDisplayHandle,ToyDisplayProps>(function ToyDisplay({
  build,look={},mode="static",variant="cream",selectedSocket=null,partSocket,onSocketSelect,onReady,onCapture,
  rotation=-0.12,ariaLabel="Your robot",className,style,
},ref){
  const wrap=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  const stage=useRef<ToyStage|null>(null);
  const latest=useRef({build,look,variant,selectedSocket,partSocket,rotation,onSocketSelect,onReady,onCapture});
  latest.current={build,look,variant,selectedSocket,partSocket,rotation,onSocketSelect,onReady,onCapture};
  const [failed,setFailed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [readyKey,setReadyKey]=useState("");
  const readyRef=useRef(false);
  const completedKey=useRef("");
  const drawRef=useRef<()=>void>(()=>{});
  const captureRef=useRef<()=>void>(()=>{});
  const sceneKey=JSON.stringify({build,look,variant,partSocket,rotation});
  const requestedKey=useRef("");requestedKey.current=mode+"|"+sceneKey;
  const currentPicture=readyKey===requestedKey.current;
  const backdrop=variant==="workshop"?"#4d3826":variant==="dark"?"#302a26":"#ece3d3";
  const lightCopy=variant!=="cream";
  useImperativeHandle(ref,()=>({
    hitSocket(clientX,clientY,kind,radius){
      const rect=canvas.current?.getBoundingClientRect();
      return rect&&readyRef.current&&completedKey.current===requestedKey.current?stage.current?.hitSocket(clientX-rect.left,clientY-rect.top,kind,radius)??null:null;
    },
  }),[]);

  useEffect(()=>{
    const element=canvas.current,container=wrap.current;
    if(!element||!container)return;
    let dead=false;
    let owned:ToyStage|null=null;
    const releasePhotographs=mode==="static"?retainToyPhotographs(()=>{drawnKey="";draw();}):()=>{};
    let drawnKey="";
    let sizeKey="";
    let revision=0;
    let pendingKey="";
    let capturedKey="";
    let captureOwner:ToyDisplayProps["onCapture"];
    let animation=0,lastFrame=0,visible=true;
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
    const animate=(now:number)=>{
      animation=0;
      if(dead||mode!=="interactive"||!visible||document.hidden||reduced.matches||!readyRef.current)return;
      if(now-lastFrame>=66){
        try{owned?.render(now/1000);lastFrame=now;}catch{readyRef.current=false;setFailed(true);return;}
      }
      animation=requestAnimationFrame(animate);
    };
    const schedule=()=>{
      if(animation){cancelAnimationFrame(animation);animation=0;}
      if(!dead&&mode==="interactive"&&readyRef.current){
        if(!visible||document.hidden||reduced.matches){if(visible&&!document.hidden){try{owned?.render(0);}catch{readyRef.current=false;setFailed(true);}}}
        else animation=requestAnimationFrame(animate);
      }
    };
    const wanted=()=>{const p=latest.current;return JSON.stringify({build:p.build,look:p.look,variant:p.variant,partSocket:p.partSocket,rotation:p.rotation});};
    const capture=()=>{
      const callback=latest.current.onCapture;
      if(!callback){captureOwner=undefined;return;}
      const key=drawnKey+sizeKey;
      if(dead||!readyRef.current||!drawnKey||drawnKey!==wanted()||(capturedKey===key&&captureOwner===callback))return;
      // A late first-meeting callback can capture the existing picture without
      // waiting for a part or colour change. Refresh reusable WebGL buffers first.
      try{
        if(mode==="interactive")owned?.render();
        callback(element.toDataURL("image/png"));
        capturedKey=key;captureOwner=callback;
      }catch(error){
        container.dataset.artReady="false";
        readyRef.current=false;
        console.error("[toy capture]",error);setFailed(true);
      }
    };
    captureRef.current=capture;
    const draw=()=>{
      if(dead)return;
      const width=container.clientWidth,height=container.clientHeight;
      if(width<2||height<2)return;
      const props=latest.current;
      const nextKey=wanted();
      const nextSize=`${width}:${height}:${window.devicePixelRatio||1}`;
      if(drawnKey===nextKey&&sizeKey===nextSize&&!pendingKey)return;
      const requestKey=nextKey+nextSize;
      if(pendingKey===requestKey)return;
      const needsToy=drawnKey!==nextKey||!!pendingKey;
      const ticket=++revision;
      pendingKey=requestKey;
      readyRef.current=false;container.dataset.artReady="false";setLoading(true);setFailed(false);
      const accept=()=>!dead&&ticket===revision&&wanted()===nextKey&&container.clientWidth===width&&container.clientHeight===height;
      void (async()=>{try{
        if(mode==="interactive"){
          owned ??= createToyStage(element,props.variant);
          stage.current=owned;
          if(needsToy&&!await owned.setToy(props.build,props.look,props.selectedSocket,props.rotation,props.partSocket,props.variant))return;
          if(!accept())return;
          owned.setVariant(props.variant);
          owned.resize(width,height,window.devicePixelRatio||1);
          owned.render();
        }else if(!await photographToy(element,props.build,props.look,props.variant,width,height,props.rotation,props.partSocket,accept))return;
        if(!accept())return;
        drawnKey=nextKey;sizeKey=nextSize;
        completedKey.current=mode+"|"+nextKey;setReadyKey(completedKey.current);
        container.dataset.artReady="true";readyRef.current=true;
        setFailed(false);setLoading(false);
        latest.current.onReady?.();
        capture();
        schedule();
      }catch(error){
        if(!accept())return;
        container.dataset.artReady="false";
        readyRef.current=false;console.error("[toy portrait]",error);setFailed(true);setLoading(false);
      }finally{if(ticket===revision)pendingKey="";}})();
    };
    drawRef.current=draw;
    const onLost=(event:Event)=>{event.preventDefault();if(!dead){revision++;pendingKey="";readyRef.current=false;container.dataset.artReady="false";setFailed(true);setLoading(false);}};
    const onRestored=()=>{drawnKey="";pendingKey="";if(!dead)draw();};
    element.addEventListener("webglcontextlost",onLost);
    element.addEventListener("webglcontextrestored",onRestored);
    const observer=new ResizeObserver(draw);
    const intersection=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);schedule();});
    observer.observe(container);
    intersection.observe(container);
    window.addEventListener("resize",draw);
    document.addEventListener("visibilitychange",schedule);
    reduced.addEventListener("change",schedule);
    draw();
    return ()=>{
      dead=true;revision++;readyRef.current=false;observer.disconnect();intersection.disconnect();drawRef.current=()=>{};captureRef.current=()=>{};
      if(animation)cancelAnimationFrame(animation);
      window.removeEventListener("resize",draw);
      document.removeEventListener("visibilitychange",schedule);reduced.removeEventListener("change",schedule);
      element.removeEventListener("webglcontextlost",onLost);element.removeEventListener("webglcontextrestored",onRestored);
      owned?.dispose();releasePhotographs();if(stage.current===owned)stage.current=null;
    };
  },[mode]);
  useEffect(()=>{drawRef.current();},[sceneKey]);
  useEffect(()=>{captureRef.current();},[onCapture]);

  return <div ref={wrap} className={className} data-art-ready={!loading&&!failed&&currentPicture?"true":"false"} style={{position:"relative",width:"100%",height:"100%",overflow:"hidden",background:backdrop,...style}}>
    <canvas key={mode} ref={canvas} role="img" aria-label={ariaLabel} aria-busy={loading||!currentPicture} style={{display:"block",width:"100%",height:"100%",cursor:onSocketSelect?"pointer":"default"}}
      onClick={event=>{
        if(!readyRef.current||completedKey.current!==requestedKey.current)return;
        const rect=event.currentTarget.getBoundingClientRect();
        const socket=stage.current?.hitSocket(event.clientX-rect.left,event.clientY-rect.top,undefined,32);
        if(socket)latest.current.onSocketSelect?.(socket);
      }}/>
    {(loading||!currentPicture)&&!failed?<span role="status" aria-label="Loading robot picture" style={{position:"absolute",inset:0,display:"grid",placeItems:"center",background:backdrop,color:lightCopy?"#eadfca":"#75624a",fontSize:mode==="interactive"?14:12,pointerEvents:"none"}}>{mode==="interactive"?"Putting your robot together…":"…"}</span>:null}
    {failed?<span role="status" aria-label="Robot picture unavailable" style={{position:"absolute",inset:0,display:"grid",placeItems:"center",padding:mode==="interactive"?24:4,textAlign:"center",background:backdrop,color:lightCopy?"#eadfca":"#534e42",fontSize:14}}>
      {mode==="interactive"?"The robot picture could not open. Your parts are ready below.":<span aria-hidden style={{fontSize:22,opacity:.55}}>◇</span>}
    </span>:null}
  </div>;
});

/** The same physical piece seen on a robot, photographed on its own. */
export function PartDisplay({part,paint,ariaLabel="Robot part",...display}:Omit<ToyDisplayProps,"build"|"partSocket"|"selectedSocket"|"mode"|"look">&{
  part:Part&{slot:Slot;color?:PaintId};paint?:PaintId|null;
}){
  const build=useMemo<Build>(()=>{
    const empty=(slot:Slot):Part=>({id:`empty.${slot}`,s:[0,0,0]});
    const value:Build={head:empty("head"),torso:empty("torso"),arms:empty("arms"),legs:empty("legs"),weapon:empty("weapon")};
    const color=paint??part.paint??part.color;
    value[part.slot]={id:part.id,s:[...part.s],...(part.slot!=="weapon"&&color?{paint:color}:{})};
    return value;
  },[part.id,part.slot,part.s[0],part.s[1],part.s[2],part.paint,part.color,paint]);
  const socket:Socket=part.slot==="arms"?"armR":part.slot==="legs"?"legR":part.slot;
  return <ToyDisplay {...display} build={build} partSocket={socket} ariaLabel={ariaLabel} mode="static"/>;
}
