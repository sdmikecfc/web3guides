"use client";
import { useEffect, useId, useRef, useState } from "react";
import archivedRenderers from "../../../../public/bots-playtest/releases.json";

/** The host owns inventory. The isolated renderer receives a copy and reports practice events. */
export default function ConnectedModelRoom({ view = "display", payload, onEvent, title }: { view?: "display" | "practice"; payload: unknown; onEvent?(type: string, value: any): void; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null), id = useId(), latest = useRef(onEvent);
  latest.current = onEvent;
  const [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const data = JSON.stringify(payload), channel = `mk8-${id}-${attempt}`;
  const value = payload as {id?:string;room?:string;robots?:{id:string;choices:unknown;career?:{pose?:string;showMarks?:boolean;marks?:unknown[]}}[];replay?:boolean;server?:boolean;seekTick?:number;endTick?:number;presentationRevision?:number;versions?:{presentation?:string}};
  const renderer=view==='display'?'/bots-display/v2/index.html':value.versions?.presentation?(archivedRenderers as Record<string,string>)[value.versions.presentation]||'/bots-playtest/index.html':'/bots-playtest/index.html';
  // Equipment and paint travel through the update bridge; only changing rooms rebuilds the scene.
  const identity = view === "practice" ? `${value.id}:${!!value.replay}:${value.seekTick??0}:${value.endTick??0}:${value.presentationRevision??0}` : JSON.stringify({room:value.room,presentationRevision:value.presentationRevision});
  const ready = useRef(false), initial = useRef(data);initial.current=data;
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === "ready") {ready.current=true;frame.current.contentWindow?.postMessage({ channel, type: "init", payload: JSON.parse(initial.current) }, location.origin);}
      else if (event.data.type === "error") setError(String(event.data.payload?.message || "The picture could not load. Your robot is saved."));
      else latest.current?.(event.data.type, event.data.payload);
    };
    window.addEventListener("message",listener);return ()=>window.removeEventListener("message",listener);
  }, [channel]);
  useEffect(()=>{if(ready.current&&(view==="display"||value.server))frame.current?.contentWindow?.postMessage({channel,type:"update",payload:JSON.parse(data)},location.origin)},[data,channel,view,value.server]);
  return <div style={{position:"relative",width:"100%",height:"100%",minHeight:0}}>
    <iframe key={`${identity}-${attempt}`} ref={frame} title={title} src={`${renderer}?view=${view}&embedded=1&channel=${encodeURIComponent(channel)}`} allow="autoplay" style={{width:"100%",height:"100%",border:0,display:"block",background:"transparent",colorScheme:view==="display"?"light":"dark"}} onError={()=>setError("The picture could not load. Your robot is saved.")}/>
    {error && <div role="alert" style={{position:"absolute",bottom:20,left:20,padding:16,background:"#30261f",color:"#fff0d4",borderRadius:12}}>{error} <button onClick={()=>{setError("");setAttempt(n=>n+1)}}>Try again</button></div>}
  </div>;
}
