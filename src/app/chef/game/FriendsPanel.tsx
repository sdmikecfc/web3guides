"use client";
import { useEffect, useState } from "react";
import { AUTHORITY_ENABLED, type CloudSave, type KitchenSnapshot } from "./_chain/useCloudSave";
import type { KitchenCommand } from "@/lib/chef/authority";
import { NeighborsIcon, IngredientArt } from "./RestaurantUI";
import css from "./_ui/restaurant.module.css";

export function FriendsPanel({cloud,onAccount,onChanged}:{cloud:CloudSave;onAccount:()=>void;onChanged:(save:KitchenSnapshot)=>void}) {
 const [data,setData]=useState<KitchenSnapshot|null>(cloud.authorityRef.current),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[handle,setHandle]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{let dead=false;if(cloud.status==="on"&&AUTHORITY_ENABLED){setLoading(true);void cloud.social().then(j=>{if(!dead){setData(j);setLoading(false);}});}return()=>{dead=true;};},[cloud.status,cloud.social]);
 async function act(command:KitchenCommand) {
  if(busy)return;setBusy(true);setMessage("");const j=await cloud.command(command);
  if(j){setData(j);onChanged(j);if(j.ok)setMessage(command.type==="sendGift"?"A little parcel is on its way.":command.type==="requestFriend"?"Your invitation is on its way.":"Your neighborhood is up to date.");}
  setBusy(false);
 }
 return <>
  <div className={css.hero}><div className={css.eyebrow}>Good food brings us together</div><h3>Meet the neighborhood.</h3><p>Visit a kitchen, lend a hand, and bring a little surprise home.</p><div className={css.heroArt} style={{display:"grid",placeItems:"center",color:"#6a875c"}}><NeighborsIcon size={75}/></div></div>
  {cloud.status!=="on"||!AUTHORITY_ENABLED?<><div className={css.note}>Save your restaurant to connect with other chefs. Your kitchen and its ingredients stay yours.</div><button className={css.buy} onClick={onAccount}>Your restaurant account</button><p><a className={css.secondary} href="/chef/board">Explore the best tables in town</a></p></>:<>
   <div className={css.note} style={{display:"flex",gap:12,alignItems:"center"}}><IngredientArt id="tomato"/><span>{data?.authority.socialRemaining??0} ingredients left to discover today across all your neighbor visits and gifts.</span></div>
   <form className={css.form} onSubmit={e=>{e.preventDefault();if(handle.trim())void act({type:"requestFriend",targetHandle:handle.trim()});}}><input aria-label="Restaurant handle" placeholder="A friend's restaurant handle" value={handle} onChange={e=>setHandle(e.target.value)} maxLength={64}/><button className={css.secondary} disabled={busy||!handle.trim()}>Invite</button></form>
   {loading&&<p className={css.note}>Opening the neighborhood…</p>}
   <div className={css.sectionTitle}>Your neighbors<small>{data?.neighbors.filter(n=>n.status==="friend").length||0} kitchens</small></div>
   {!loading&&!data?.neighbors.length&&<p className={css.note}>Every neighborhood starts with one hello. Invite a chef or discover a restaurant below.</p>}
   {data?.neighbors.map(n=><div className={css.friend} key={n.handle}><span className={css.avatar}><NeighborsIcon/></span><div style={{flex:1,minWidth:0}}><strong>{n.name||"A little kitchen"}</strong><small>{n.status==="incoming"?"Invited you to be neighbors":n.status==="outgoing"?"Invitation sent":n.status==="blocked"?"Blocked":n.handle}</small><div className={css.inlineActions}>{n.status==="friend"?<><a className={css.secondary} href={`/chef/visit/${encodeURIComponent(n.handle)}`}>Visit</a><button className={css.secondary} disabled={busy} onClick={()=>void act({type:"sendGift",targetHandle:n.handle})}>Send a parcel</button></>:n.status==="incoming"?<button className={css.secondary} disabled={busy} onClick={()=>void act({type:"acceptFriend",targetHandle:n.handle})}>Accept invitation</button>:n.status==="blocked"?<button className={css.secondary} disabled={busy} onClick={()=>void act({type:"unblock",targetHandle:n.handle})}>Unblock</button>:null}{n.status!=="blocked"&&<details><summary style={{cursor:"pointer",fontSize:11,padding:8}}>Manage</summary><button className={css.secondary} disabled={busy} onClick={()=>void act({type:"removeFriend",targetHandle:n.handle})}>Remove</button><button className={css.secondary} disabled={busy} onClick={()=>void act({type:"block",targetHandle:n.handle})}>Block</button></details>}</div></div></div>)}
   {(data?.discover?.length??0)>0&&<><div className={css.sectionTitle}>Around the corner</div>{data?.discover?.filter(n=>!data.neighbors.some(f=>f.handle===n.handle)).map(n=><div className={css.friend} key={n.handle}><span className={css.avatar}><NeighborsIcon/></span><div style={{flex:1}}><strong>{n.name||"A little kitchen"}</strong><a href={`/chef/visit/${encodeURIComponent(n.handle)}`} style={{fontSize:12,color:"#5c7b50"}}>Take a look inside</a></div><button className={css.secondary} disabled={busy} onClick={()=>void act({type:"requestFriend",targetHandle:n.handle})}>Say hello</button></div>)}</>}
  </>}
  {message&&<p className={css.note} role="status">{message}</p>}{cloud.error&&<p className={css.error} role="alert">{cloud.error}</p>}
 </>;
}
