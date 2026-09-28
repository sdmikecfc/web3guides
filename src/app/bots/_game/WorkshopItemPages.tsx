"use client";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import css from "./workshop-builder.module.css";

/** Size complete cards to the available room, then page the rest. */
export default function WorkshopItemPages<T>({items, resetKey, render, compact=false}: {
 items:T[]; resetKey:string; render:(item:T)=>ReactNode; compact?:boolean;
}) {
 const area=useRef<HTMLDivElement>(null);
 const [layout,setLayout]=useState({columns:2,rows:2}),[page,setPage]=useState(0);
 useEffect(()=>{
  const node=area.current;if(!node)return;
  const observer=new ResizeObserver(([entry])=>{
   const {width,height}=entry.contentRect;
   const columns=Math.max(1,Math.min(compact?8:4,Math.floor((width+10)/(compact?(height<160?220:130):175))));
   const rows=Math.max(1,Math.min(3,Math.floor((height+10)/(compact?154:170))));
   setLayout(old=>old.columns===columns&&old.rows===rows?old:{columns,rows});
  });observer.observe(node);return()=>observer.disconnect();
 },[compact]);
 useEffect(()=>setPage(0),[resetKey,layout.columns,layout.rows]);
 const size=layout.columns*layout.rows,total=Math.max(1,Math.ceil(items.length/size)),current=Math.min(page,total-1);
 return <div className={css.pages}>
  <div ref={area} className={css.itemArea}>
   <div className={css.itemGrid} data-testid="item-grid" style={{"--columns":layout.columns,"--rows":layout.rows} as CSSProperties}>
    {items.slice(current*size,(current+1)*size).map(render)}
   </div>
   {!items.length&&<p className={css.empty}>No parts match. Try another style or tier.</p>}
  </div>
  <div className={css.pager} aria-label="Item pages">
   <button aria-label="Previous items" disabled={current===0} onClick={()=>setPage(current-1)}>← Previous</button>
   <span role="status">{items.length?`${current*size+1}–${Math.min(items.length,(current+1)*size)} of ${items.length}`:"0 items"}</span>
   <button aria-label="Next items" disabled={current+1>=total} onClick={()=>setPage(current+1)}>Next →</button>
  </div>
 </div>;
}
