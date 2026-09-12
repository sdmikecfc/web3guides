"use client";

import { useEffect, useRef, type ReactNode } from "react";
import css from "./fight-room.module.css";

export interface FightRoomFrameProps {
  arena: ReactNode; special: ReactNode; setup?: ReactNode; details?: ReactNode;
  status?: ReactNode; tools?: ReactNode; title?: string; embedded?: boolean;
  onClose?: () => void; setupDisabled?: boolean;
}

/** Presentation only: clocks, combat input and settlement belong to the client. */
export default function FightRoomFrame({ arena, special, setup, details, status, tools, title = "The arena", embedded = false, onClose, setupDisabled }: FightRoomFrameProps) {
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const restore = () => trigger.current?.focus();
    element?.addEventListener("close", restore);
    return () => { element?.removeEventListener("close", restore); element?.close(); };
  }, []);
  return <section className={`${css.frame} ${embedded ? css.embedded : ""}`} aria-label="Fight room">
    <header className={css.toolbar}><div className={css.toolbarTitle}>{onClose ? <button onClick={onClose} aria-label="Leave the arena">←</button> : !embedded ? <a href="/bots?view=fight">← Fight room</a> : null}<strong title={title}>{title}</strong></div><div className={css.toolbarActions}><div className={css.toolbarTools}>{tools}</div>{(setup || details) && <button ref={trigger} aria-label="Robot & fight details" disabled={setupDisabled} onClick={() => dialog.current?.showModal()}><span className={css.detailsLong}>Robot &amp; fight details</span><span className={css.detailsShort}>Details</span></button>}</div></header>
    <div className={css.arena}>{arena}{status && <div className={css.status} aria-live="polite">{status}</div>}</div>
    <div className={css.controls}>{special}</div>
    <dialog ref={dialog} className={css.dialog} aria-label="Robot and fight details" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <header><div><small>BEFORE THE BELL</small><h2>Your robot. Your plan.</h2></div><button autoFocus aria-label="Close fight details" onClick={() => dialog.current?.close()}>×</button></header>
      <div className={css.dialogBody}>{tools && <div className={css.mobileTools}>{tools}</div>}{setup}{details}</div>
      <footer><button onClick={() => dialog.current?.close()}>Back to the ring</button></footer>
    </dialog>
  </section>;
}
