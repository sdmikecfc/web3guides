import type { CSSProperties } from "react";

export type DinerIconName = "truck" | "home" | "coin" | "book" | "friends" | "decorate" | "close" | "pause" | "play" | "arrow" | "star" | "leaf" | "sound" | "mute" | "rotate" | "hand" | "plate" | "gift" | "clock" | "check" | "settings" | "heart" | "store";
const paths: Record<DinerIconName, React.ReactNode> = {
  truck: <><path d="M2 6h13v12H2zM15 10h4l3 4v4h-7"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M4 9h8v5H4"/></>,
  home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></>,
  coin: <><circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/></>,
  book: <><path d="M12 6v15M3 4q5-1 9 2 4-3 9-2v15q-5-1-9 2-4-3-9-2z"/></>,
  friends: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 5a3 3 0 0 1 0 6m2 3q4 1 4 7"/></>,
  decorate: <><path d="m4 20 9-9m-5-6a6 6 0 0 0 8 8l5-5-5 1-2-2 1-5-5 4M3 17l4 4"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>, pause: <><path d="M8 5v14M16 5v14" strokeWidth="4"/></>,
  play: <path d="m7 4 14 8-14 8z"/>, arrow: <path d="M4 12h16m-7-7 7 7-7 7"/>,
  star: <path d="m12 2 3 6.5 7 1-5 5 1 7-6-3.5L6 21l1-6.5-5-5 7-1z"/>,
  leaf: <><path d="M20 3C3 1 1 14 8 18S22 15 20 3ZM4 22 16 8"/></>,
  sound: <><path d="m3 9 5 0 5-5v16l-5-5H3zM16 8q4 4 0 8m3-11q7 7 0 14"/></>,
  mute: <><path d="m3 9 5 0 5-5v16l-5-5H3zM17 9l5 6m0-6-5 6"/></>,
  rotate: <><path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/></>,
  hand: <><path d="M7 12V7a2 2 0 0 1 4 0v5-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 8-9 9-12 4l-4-6q-1-4 2-2l2 1"/></>,
  plate: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/></>,
  gift: <><path d="M3 10h18v4H3zM5 14v7h14v-7M12 10v11M12 10C0 10 6-2 12 10c12 0 6-12 0 0"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v7l4 2"/></>,
  check: <path d="m4 12 5 5L20 6"/>,
  settings: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></>,
  heart: <path d="M12 21 3 12C-2 5 7 0 12 7c5-7 14-2 9 5z"/>,
  store: <><path d="M3 8h18l-2-5H5zM4 8v13h16V8M8 21v-7h8v7M2 8v3q2 4 5 0 2 4 5 0 2 4 5 0 3 4 5 0V8"/></>,
};
export function DinerIcon({name,size=22,style}:{name:DinerIconName;size?:number;style?:CSSProperties}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0,...style}}>{paths[name]}</svg>;
}
