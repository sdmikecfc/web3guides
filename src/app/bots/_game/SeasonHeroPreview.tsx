"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import V6ToyDisplay from "../_components/V6ToyDisplay";
import { presetV6, type StyleV6 } from "@/lib/bots/v6";
import { fightRoomHref } from "@/lib/bots/fight-navigation";
import css from "./season-workshop.module.css";

/** One actual authored model, clearly labeled as an example rather than a starter grant. */
export default function SeasonHeroPreview({ active = true, fightLobby = false }: { active?: boolean; fightLobby?: boolean }) {
  const [style, setStyle] = useState<StyleV6>("tank");
  const build = useMemo(() => presetV6(style, 3, { signature: true }), [style]);
  return <section className={css.heroExample} aria-label="Preview the three fighting styles"><div className={css.heroCanvas}><V6ToyDisplay key={style} build={build} active={active} title={`Tier 3 ${style} example`} /></div><div className={css.sockets} role="group" aria-label="Choose a practice example">{(["tank", "speed", "ranged"] as const).map(value => <button key={value} aria-pressed={style === value} onClick={() => setStyle(value)}>{value === "tank" ? "Tank · tough" : value === "speed" ? "Speed · quick" : "Ranged · shooter"}</button>)}</div><p>Tier 3 practice example. Your own robot uses the parts you choose.</p><Link className={fightLobby ? css.primary : undefined} href={fightRoomHref(6, { robot: JSON.stringify(build.appearanceBuild) })}>Try this robot in the ring →</Link></section>;
}
