"use client";

import { useMemo, useState } from "react";
import LivingRoomScene, { type RoomAnchor, type RoomActor } from "./LivingRoomScene";
import type { BattlesView } from "../_server/types";
import type { CampaignView } from "@/lib/bots/campaign-view";
import { communityVisitors } from "@/lib/bots/community-room";
import { rigLookOf } from "../_view/look-view";
import css from "./community.module.css";

export interface CommunityRoomProps {
  battles: BattlesView | null; state: "loading" | "ready" | "failed"; campaign: CampaignView | null;
  seasonScores?: { state: "loading" | "ready" | "unavailable"; period: string; message: string; rows: { rank: number; name: string; rating: number }[] };
  onWatch: (id: string) => void; onPractice: () => void; onScores: () => void; onRetry: () => void;
}

/** Real replay snapshots populate the street; recorded fights imply no online presence. */
export default function CommunityRoom({ battles, state, campaign, seasonScores, onWatch, onPractice, onScores, onRetry }: CommunityRoomProps) {
  const { visitors, featured } = useMemo(() => communityVisitors(battles), [battles]);
  const actors = useMemo<RoomActor[]>(() => visitors.map(visitor => ({ id: visitor.id, bay: visitor.bay, build: visitor.build, look: rigLookOf(visitor.look, visitor.paint), activity: visitor.bay === 5 ? "inspect" : visitor.bay === 3 ? "arrive" : "wave" })), [visitors]);
  const [anchors, setAnchors] = useState<RoomAnchor[]>([]), [selectedId, setSelectedId] = useState<string>();
  const recent = (battles?.recent ?? []).slice(0, 6);
  const standings = seasonScores ? seasonScores.rows.slice(0, 3).map(row => ({ rank: row.rank, name: row.name, score: row.rating })) : campaign?.source === "available" ? campaign.standings.battles.slice().sort((a, b) => a.rank - b.rank).slice(0, 3) : [];
  const status = state === "loading" ? battles ? "Checking for new fights…" : "Finding recent fights…"
    : state === "failed" ? battles ? "Could not refresh. Showing the last fights we loaded." : "Recent fights could not load. Practice is still ready."
    : !recent.length ? "No player fights yet. Meet the practice robots below." : "Recorded fights. Tap a robot to watch its replay.";
  const period = seasonScores ? seasonScores.state !== "ready" && standings.length ? seasonScores.state === "loading" ? "Updating season scores…" : "Scores could not refresh" : seasonScores.period : campaign?.period.key === "week1" ? "Week 1" : campaign?.period.key === "week2" ? "Week 2" : "Two-week final";

  return <section className={css.room} aria-label="Community room">
    <div className={css.stage}>
      <div className={css.scene}><LivingRoomScene actors={actors} selectedId={selectedId} variant="community" onAnchors={setAnchors} /></div>
      <header className={css.heading}><p className={css.eyebrow}>SPROCKET ROW · THE COMMUNITY ROOM</p><h1>Meet the neighbourhood.</h1><p>{seasonScores ? "Watch public collection replays. These are separate from the current league." : "Watch fights. Meet rivals. Find your next idea."}</p></header>
      <div className={css.streetControls} aria-label="Robots on the street">
        {visitors.map(visitor => {
          const anchor = anchors.find(value => value.bay === visitor.bay);
          return <button key={visitor.id} className={css.visitor} data-practice={!visitor.fightId} data-helper={visitor.bay === 5}
            style={anchor ? { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height } : { left: `${visitor.bay * 18 - 4}%`, top: "76%", width: "17%", height: "40%" }}
            onFocus={() => setSelectedId(visitor.id)} onMouseEnter={() => setSelectedId(visitor.id)}
            onClick={() => visitor.fightId ? onWatch(visitor.fightId) : onPractice()}
            aria-label={visitor.fightId ? `Watch ${visitor.name}'s recorded fight` : `${visitor.name}, ${visitor.label.toLowerCase()}. Watch a practice fight`}>
            <span className={css.visitorLabel}><small>{seasonScores && visitor.fightId ? "Collection replay" : visitor.label}</small><strong>{visitor.name}</strong><span>{visitor.fightId ? "Watch replay" : visitor.bay === 5 ? "Try a practice fight" : "Practice preview"}<b aria-hidden>↗</b></span></span>
          </button>;
        })}
      </div>
      <aside className={css.scoreboard} aria-label={seasonScores ? "Season rating leaders" : "Battle points leaders"}><span className={css.boardPin} aria-hidden /><p className={css.boardEyebrow}>{period}</p><h2>{seasonScores ? "Season rating" : "Battle points"}</h2>
        {standings.length ? <ol>{standings.map((row, index) => <li key={`${row.rank}:${index}`}><b>{row.rank}</b><span>{row.name}</span><strong>{row.score.toLocaleString("en-US", { maximumFractionDigits: 0 })}<small>{seasonScores ? "rating" : "pts"}</small></strong></li>)}</ol> : <p className={css.boardEmpty} role={seasonScores ? "status" : undefined}>{seasonScores?.message ?? (campaign?.source === "available" ? campaign.campaign?.status === "draft" || campaign.period.status === "upcoming" ? "The first scores arrive after launch." : "No battle scores yet." : "Scores are not available yet.")}</p>}
        <button onClick={onScores}>See all scores <span aria-hidden>→</span></button>
      </aside>
      <div className={css.spotlight}>{featured ? <><span>{seasonScores ? "COLLECTION REPLAY" : "JUST FOUGHT"}</span><strong>{featured.names[0]} <i>vs</i> {featured.names[1]}</strong><button onClick={() => onWatch(featured.id)}>Watch their fight <span aria-hidden>▶</span></button></> : <><span>PRACTICE IS ALWAYS OPEN</span><strong>Pull up a seat at the arena.</strong><button onClick={onPractice}>Watch a practice fight <span aria-hidden>▶</span></button></>}</div>
    </div>
    <section className={css.fightBoard} aria-labelledby="community-fights-title">
      <div className={css.fightHeading}><div><h2 id="community-fights-title">{seasonScores ? "Collection replays" : "Recent fights"}</h2><p role="status">{seasonScores ? `Separate from current league fights. ${status}` : status}</p></div>{state === "failed" ? <button className={css.retry} onClick={onRetry}>Try again</button> : <button className={css.practice} onClick={onPractice}>Practice fight <span aria-hidden>↗</span></button>}</div>
      <div className={css.tickets} role="region" aria-label={seasonScores ? "Public collection replays" : "Recent fight replays"} tabIndex={0}>
        {recent.length ? recent.map(fight => <button key={fight.id} className={css.ticket} onClick={() => onWatch(fight.id)}><span className={css.ticketStamp}>{seasonScores ? "COLLECTION FIGHT" : fight.mode === "pvp" ? "PLAYER FIGHT" : "ARENA CHALLENGE"}<small>{fight.seconds}s</small></span><strong>{fight.names[0]} <span>vs</span> {fight.names[1]}</strong><span className={css.ticketResult}>{fight.winnerName} won <b aria-hidden>▶</b></span></button>) : <button className={`${css.ticket} ${css.practiceTicket}`} onClick={onPractice}><span className={css.ticketStamp}>PRACTICE FIGHT</span><strong>{state === "loading" ? "Try a fight while we look." : "The arena is ready for you."}</strong><span className={css.ticketResult}>No coins or points needed <b aria-hidden>▶</b></span></button>}
      </div>
    </section>
  </section>;
}
