"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ToyDisplay } from "../_components/ToyDisplay";
import { CATALOG_PARTS } from "@/lib/bots/fixtures";
import { modularBuild } from "@/lib/bots/combat-model";
import { rigLookFromBuild } from "../_view/look-view";
import type { Part, Slot, PaintId } from "../_engine/parts";

const HEADS=["Cap","Bell","Kettle","Lantern","Wedge","Visor","Helmet","Brick"];
const BODIES=["Barrel","Pear","Spool","Cabinet","Funnel","Drum","Wide brick","Shield"];
const ARMS=["Mitten","Clamp","Block fist","Piston","Two fingers","Spring","Shield","Spool fist"];
const LEGS=["Work boot","Wheel","Spring","Piston","Crescent","Track","Fork","Bell boot"];
const COLORS:PaintId[]=["mint","coral","butter","sky","lilac","moss","cream","ink"];

function choose(slot:Slot,index:number,color?:PaintId):Part {
  const p=CATALOG_PARTS.find(p=>p.slot===slot&&p.tier===Math.floor(index/2)+1&&p.design===index%2+1)!;
  return {id:p.id,s:p.s,...(color?{paint:color}:{})};
}

export function DesignClient() {
  const pictures=useRef(new Map<string,string>());
  const [ready,setReady]=useState(0),[exporting,setExporting]=useState(false),[message,setMessage]=useState("");
  const toys=useMemo(()=>HEADS.map((name,i)=>{
    const b=(i*3+1)%8,al=(i+2)%8,ar=(i+5)%8,ll=(i+1)%8,lr=(i+4)%8;
    const c=COLORS[i],second=COLORS[(i+2)%8];
    const build=modularBuild(choose("head",i,c),choose("torso",b,second),choose("arms",al,"cream"),choose("arms",ar,c),choose("legs",ll,second),choose("legs",lr,"cream"),choose("weapon",i));
    return {title:`${name} + ${BODIES[b].toLowerCase()}`,arms:`${ARMS[al]} / ${ARMS[ar]}`,legs:`${LEGS[ll]} / ${LEGS[lr]}`,build,look:rigLookFromBuild(build,"mint")};
  }),[]);
  const capture=useCallback((key:string,picture:string)=>{pictures.current.set(key,picture);setReady(pictures.current.size);},[]);
  const download=async()=>{
    setExporting(true);setMessage("");
    try {
      const canvas=document.createElement("canvas");canvas.width=1600;canvas.height=1380;
      const ctx=canvas.getContext("2d")!;ctx.fillStyle="#ede4d3";ctx.fillRect(0,0,1600,1380);
      ctx.fillStyle="#273c31";ctx.font="bold 42px Arial";ctx.fillText("Different pieces. One toy line.",48,66);
      ctx.fillStyle="#6e7462";ctx.font="22px Arial";ctx.fillText("Actual 3D game models · unlike left and right limbs · 120 px samples included",48,104);
      for(let i=0;i<8;i++) {
        const x=24+(i%4)*394,y=142+Math.floor(i/4)*604,toy=toys[i];
        ctx.fillStyle="#f7f1e4";ctx.beginPath();ctx.roundRect(x,y,376,580,20);ctx.fill();
        const load=async(key:string)=>{const img=new Image();img.src=pictures.current.get(key)!;await img.decode();return img;};
        const large=await load(`${i}:large`),small=await load(`${i}:small`);
        ctx.save();ctx.beginPath();ctx.roundRect(x+8,y+45,360,380,13);ctx.clip();ctx.drawImage(large,x+8,y+45,360,380);ctx.restore();
        ctx.fillStyle="#273c31";ctx.font="bold 23px Arial";ctx.fillText(toy.title,x+18,y+32);
        ctx.drawImage(small,x+10,y+440,120,120);
        ctx.fillStyle="#78806c";ctx.font="16px Arial";ctx.fillText("LEFT / RIGHT",x+146,y+456);
        ctx.fillStyle="#334a3b";ctx.font="17px Arial";ctx.fillText(toy.arms,x+146,y+487,216);ctx.fillText(toy.legs,x+146,y+518,216);
        ctx.fillStyle="#78806c";ctx.font="15px Arial";ctx.fillText("120 px at left",x+146,y+551);
      }
      const link=document.createElement("a");link.download="model-kombat-3d-toy-line.png";link.href=canvas.toDataURL("image/png");link.click();setMessage("Proof sheet downloaded.");
    } catch(error) {setMessage(error instanceof Error?error.message:"Could not export the sheet.");}
    finally {setExporting(false);}
  };
  return <main style={{minHeight:"100vh",background:"#ede4d3",padding:"94px 24px 36px",color:"#293e31"}}>
    <div style={{maxWidth:1560,margin:"0 auto"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:20,alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
        <div><p style={{fontSize:12,letterSpacing:2,textTransform:"uppercase",color:"#7b826d",margin:0}}>Development art review</p><h1 style={{fontSize:36,lineHeight:1.1,margin:"7px 0 9px",fontWeight:600}}>Different pieces. One toy line.</h1><p style={{margin:0,color:"#65705f"}}>Eight real 3D builds. Every left arm, right arm, left leg and right leg comes from a different part.</p></div>
        <button onClick={download} disabled={ready<16||exporting} style={{border:0,borderRadius:10,padding:"14px 19px",fontWeight:700,color:"#f7eed9",background:ready<16?"#909c88":"#31583e",cursor:ready<16?"wait":"pointer"}}>{exporting?"Making proof sheet…":ready<16?`Preparing models ${ready}/16` :"Download proof sheet"}</button>
      </div>
      {message?<p role="status">{message}</p>:null}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:18}}>
        {toys.map((toy,i)=><article key={toy.title} style={{background:"#f7f1e4",border:"1px solid #d9d2bf",borderRadius:17,overflow:"hidden"}}>
          <h2 style={{fontSize:20,fontWeight:600,margin:"17px 19px 3px"}}>{toy.title}</h2>
          <div style={{height:370}}><ToyDisplay build={toy.build} look={toy.look} mode="static" variant="cream" rotation={-.32} ariaLabel={toy.title} onCapture={picture=>capture(`${i}:large`,picture)}/></div>
          <div style={{display:"flex",gap:13,alignItems:"center",padding:12,borderTop:"1px solid #ddd4c1"}}>
            <div style={{width:120,height:120,flex:"0 0 120px"}}><ToyDisplay build={toy.build} look={toy.look} mode="static" variant="cream" rotation={-.32} ariaLabel={`${toy.title} at 120 pixels`} onCapture={picture=>capture(`${i}:small`,picture)}/></div>
            <div style={{fontSize:13,lineHeight:1.6}}><div style={{fontSize:11,letterSpacing:1,color:"#81866e"}}>LEFT / RIGHT</div><div>{toy.arms}</div><div>{toy.legs}</div><div style={{fontSize:11,color:"#81866e",marginTop:7}}>120 px at left</div></div>
          </div>
        </article>)}
      </div>
    </div>
  </main>;
}
