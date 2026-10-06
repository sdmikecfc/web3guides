"use client";
import { useEffect, useId, useRef } from "react";
import { DinerIcon } from "./DinerIcon";
import css from "./diner.module.css";

export function DinerModal({title,eyebrow,children,onClose,wide=false,footer,dismissible=true,bodyClassName,roomVisible=false,interactiveRoom=false}:{title:string;eyebrow?:string;children:React.ReactNode;onClose:()=>void;wide?:boolean;footer?:React.ReactNode;dismissible?:boolean;bodyClassName?:string;roomVisible?:boolean;interactiveRoom?:boolean}) {
  const id=useId(), ref=useRef<HTMLDivElement>(null), close=useRef(onClose); close.current=()=>{if(dismissible)onClose();};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const focusables=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')??[]).filter(el=>el.offsetParent!==null);
    focusables()[0]?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'&&!interactiveRoom){
        const elements=focusables(),first=elements[0],last=elements[elements.length-1];
        if(!first){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===first||!ref.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',onKey,true);
    return()=>{document.removeEventListener('keydown',onKey,true);previous?.isConnected&&previous.focus();};
  },[]);
  return <div className={`${css.scrim} ${roomVisible?css.roomScrim:''}`} style={interactiveRoom?{pointerEvents:'none'}:undefined} onPointerDown={event=>{if(!interactiveRoom&&event.target===event.currentTarget)close.current();}}><section ref={ref} role="dialog" aria-modal={interactiveRoom?undefined:true} aria-labelledby={id} style={interactiveRoom?{pointerEvents:'auto'}:undefined} className={`${css.panel} ${wide?css.panelWide:''}`}>
    <header className={css.panelHeader}><div>{eyebrow&&<span className={css.eyebrow}>{eyebrow}</span>}<h2 id={id}>{title}</h2></div>{dismissible&&<button className={css.iconButton} aria-label={`Close ${title}`} onClick={onClose}><DinerIcon name="close"/></button>}</header>
    <div className={`${css.panelBody} ${bodyClassName??''}`}>{children}</div>{footer&&<footer className={css.panelFooter}>{footer}</footer>}
  </section></div>;
}
