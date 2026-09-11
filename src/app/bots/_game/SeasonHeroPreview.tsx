"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import V6ToyDisplay from "../_components/V6ToyDisplay";
import { presetV6, type StyleV6 } from "@/lib/bots/v6";
import { HERO_COLLISION_VERSION_V6 } from "@/lib/bots/v6/hero-collision";
import { fightRoomHref } from "@/lib/bots/fight-navigation";
import css from "./season-workshop.module.css";

/** One actual authored model, clearly labeled as an example rather than a starter grant. */
export default function SeasonHeroPreview({ active = true }: { active?: boolean }) {
  const [style, setStyle] = useState<StyleV6>("tank");
  const build = useMemo(() => presetV6(style, 3, { signature: true, collisionVersion: HERO_COLLISION_VERSION_V6 }), [style]);
  return <section className={css.heroExample} aria-label="Preview the three new hero models"><div className={css.heroCanvas}><V6ToyDisplay key={style} build={build} active={active} title={`Tier 3 ${style} example`} /></div><div className={css.sockets} role="group" aria-label="Choose a practice example">{(["tank", "speed", "ranged"] as const).map(value => <button key={value} aria-pressed={style === value} onClick={() => setStyle(value)}>{value === "tank" ? "Tank · tough" : value === "speed" ? "Speed · quick" : "Ranged · shooter"}</button>)}</div><p>Tier 3 practice example. Your own robot uses the parts you choose.</p><Link href={fightRoomHref(6, { style, tier: "3" })}>Try this robot in the ring →</Link></section>;
}
