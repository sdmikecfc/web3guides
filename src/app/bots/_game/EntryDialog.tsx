"use client";
import { useEffect, useRef, type ReactNode } from "react";
import css from "./entry.module.css";

export default function EntryDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current, previous = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); }; }, []);
  return <dialog ref={ref} className={css.dialog} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}><div className={css.card}><button type="button" aria-label="Close dialog" onClick={onClose} style={{position:"absolute",top:8,right:10,width:36,minHeight:36,padding:0,borderRadius:18,background:"#392b20",color:"#fbe6bf",border:"1px solid #9b7c56",cursor:"pointer"}}>×</button><small className={css.brand}>MODEL KOMBAT · A DOMA GAME</small><h1>{title}</h1>{children}</div></dialog>;
}
