"use client";

import type { ReactNode } from "react";
import css from "./workshop-lesson.module.css";

export type LessonTopic = "build" | "styles" | "special" | "season";
const lessons: Record<LessonTopic, { title: string; text: string; steps: [string, string, string] }> = {
  build: { title: "Seven parts. One of a kind.", text: "Pick each side separately. Try parts until you like your robot. Pay when you finish.", steps: ["Choose a body", "Mix seven parts", "Name it and finish"] },
  styles: { title: "How will yours fight?", text: "Your body gives you a special move. The other parts shape how you fight.", steps: ["Tank: tough, but slow", "Speed: quick, but lighter", "Ranged: shoots from farther away"] },
  special: { title: "Watch the meter. Pick your moment.", text: "Your robot moves and fights by itself. Press Special when the meter is full. You choose when.", steps: ["Let the meter fill", "Wait for your chance", "Press Special"] },
  season: { title: "A fresh season. Your old robots stay.", text: "Join with a new budget and up to five season robots. Your older robots stay in your collection.", steps: ["Build your season crew", "Play for daily coins", "Keep your collection"] },
};

function Robot({ x, y, style = "tank", small = false }: { x: number; y: number; style?: "tank" | "speed" | "ranged"; small?: boolean }) {
  const fill = style === "tank" ? "#cf9360" : style === "speed" ? "#d9af61" : "#95bdb0";
  return <g transform={`translate(${x} ${y}) scale(${small ? .7 : 1})`} stroke="#62432a" strokeWidth="3" strokeLinejoin="round">
    <path d="M-8-50v-10m-6 0h12" fill="none" /><rect x="-23" y="-47" width="46" height="34" rx="9" fill={fill} />
    <path d="M-12-31h5m14 0h5" strokeWidth="6" strokeLinecap="round" /><path d="M-6-22q6 5 12 0" fill="none" strokeWidth="2" />
    <rect x={style === "tank" ? -28 : -20} y="-10" width={style === "tank" ? 56 : 40} height="38" rx="9" fill={fill} />
    <path d="M-13 30v18m26-18v18M-24 1l-12 16m60-16 12 16" strokeWidth="9" strokeLinecap="round" />
    <path d="M-23 50h17m12 0h17" strokeWidth="10" strokeLinecap="round" />
    {style === "tank" ? <g transform="translate(39 4) rotate(-25)"><path d="M0 23v-33" strokeWidth="5" /><rect x="-14" y="-22" width="28" height="17" rx="3" fill="#75868a" /></g> : style === "speed" ? <path d="M38 16l10-33 6 25-12 12z" fill="#c5d3cf" /> : <g><path d="M28 7h35" strokeWidth="10" /><path d="M49 1v-10h10" fill="none" /><path d="M66 5h15" stroke="#ad6653" strokeDasharray="3 6" /></g>}
  </g>;
}

export function WorkshopCartoon({ topic }: { topic: LessonTopic }) {
  return <svg viewBox="0 0 600 158" className={css.cartoon} aria-hidden="true">
    <path d="M10 136Q200 129 302 138T590 136" fill="none" stroke="#ad8f62" strokeWidth="2" />
    {topic === "styles" ? <><Robot x={88} y={77} /><Robot x={281} y={77} style="speed" /><Robot x={471} y={77} style="ranged" /><path d="M200 56h26m-34 15h29m-20 14h22" stroke="#b0854d" strokeWidth="3" strokeLinecap="round" /></> : topic === "special" ? <><Robot x={76} y={80} style="ranged" /><path d="M166 76h47m-9-9 9 9-9 9" fill="none" stroke="#9b754a" strokeWidth="4" /><rect x="246" y="57" width="104" height="25" rx="8" fill="#9abd97" stroke="#705434" strokeWidth="3" /><path d="M363 76h47m-9-9 9 9-9 9" fill="none" stroke="#9b754a" strokeWidth="4" /><rect x="446" y="44" width="110" height="57" rx="12" fill="#dfae66" stroke="#705434" strokeWidth="3" /><path d="m500 48-15 30h15l-7 21 25-30h-17l10-21" fill="#6e4825" /></> : topic === "build" ? <><g stroke="#705434" strokeWidth="3" fill="#a6c4b1"><rect x="46" y="28" width="49" height="32" rx="8" /><rect x="40" y="75" width="62" height="45" rx="8" /><path d="m120 59 23 16-12 37m31-51 22 16-12 36" fill="none" strokeWidth="10" /></g><path d="M225 76h46m-9-9 9 9-9 9" fill="none" stroke="#9b754a" strokeWidth="4" /><Robot x={334} y={77} style="ranged" /><path d="M417 75h44m-9-9 9 9-9 9" fill="none" stroke="#9b754a" strokeWidth="4" /><path d="m486 80 17 18 34-43" fill="none" stroke="#7c995f" strokeWidth="10" strokeLinecap="round" /></> : <><Robot x={76} y={85} small /><Robot x={159} y={85} small style="speed" /><Robot x={241} y={85} small style="ranged" /><path d="M322 25v102" stroke="#c4a978" strokeWidth="2" strokeDasharray="5 7" /><rect x="379" y="44" width="160" height="84" rx="7" fill="#d2b286" stroke="#705434" strokeWidth="3" /><path d="M378 67h160m-112-8h56" stroke="#705434" strokeWidth="3" /><path d="m451 85 7-15 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11z" fill="#f0d99f" stroke="#705434" strokeWidth="2" /></>}
  </svg>;
}

export default function WorkshopLesson({ topic, compact = false, children }: { topic: LessonTopic; compact?: boolean; children?: ReactNode }) {
  const lesson = lessons[topic];
  return <section className={`${css.lesson} ${compact ? css.compact : ""}`} aria-label="Workshop guide">
    <div className={css.heading}><span className={css.face} aria-hidden><i /><i /><b /></span><div><small>WRENCH’S WORKSHOP NOTES</small><h2>{lesson.title}</h2></div></div>
    <WorkshopCartoon topic={topic} /><div className={css.steps}>{lesson.steps.map((text, i) => <p key={text}><b>{i + 1}</b>{text}</p>)}</div><p className={css.description}>{lesson.text}</p>{children}
  </section>;
}
