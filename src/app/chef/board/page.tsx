import type { Metadata } from "next";
import Link from "next/link";
import { topRooms } from "@/lib/chef/board";
import { SERVICE_TIERS } from "../game/_engine/campaign";
import { IconChefHat, IconStar } from "../game/_ui/icons";
import { CheerButton } from "./CheerButton";
import css from "./board.module.css";

export const metadata: Metadata = {
  title: "Domain Kitchen: the best tables in town",
  description: "Meet the neighborhood, discover community restaurants, and find your next favorite table.",
  robots: { index: false, follow: false },
};
export const revalidate = 60;

// Service descriptions are independent of campaign or award copy.
const milestones: Record<number, string> = {
  0: "The doors are open. Every restaurant starts somewhere.",
  60: "A tidy room and a steady rhythm in the kitchen.",
  70: "Thoughtful service and dishes worth coming back for.",
  80: "Warm welcomes, polished service, and memorable plates.",
};

function NeighborhoodMark() {
  return <svg viewBox="0 0 210 170" aria-hidden="true" focusable="false">
    <ellipse cx="108" cy="155" rx="92" ry="12" fill="#d8d9bd"/>
    <path d="M32 151V64h146v87" fill="#eee0bd" stroke="#a78e65" strokeWidth="3"/>
    <path d="M44 151V92h39v59M131 105h35v-26h-35z" fill="#afc9b0" stroke="#a78e65" strokeWidth="3"/>
    <path d="M55 94v25h16V94M137 80v24m10-24v24" fill="none" stroke="#fff3d8" strokeWidth="3"/>
    <path d="M96 151V84h27v67" fill="#839a78" stroke="#a78e65" strokeWidth="3"/>
    <circle cx="116" cy="122" r="2" fill="#fff0c9"/>
    <path d="m25 62 15-35h128l20 35v13H25z" fill="#fff1ce" stroke="#b09062" strokeWidth="3" strokeLinejoin="round"/>
    <path d="m40 27-15 35v13h23V62l9-35m23 0-4 35v13h23V27m24 0v48h24V62l-5-35m24 0 20 35v13h-22V62l-12-35" fill="#c67d61"/>
    <path d="M49 40h111v22H49z" fill="#c67d61"/>
    <path d="M89 48h33m-26 7h20" stroke="#fff0cf" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M17 146h23l-4-25H20zM172 145h23l-4-25h-15z" fill="#c9956d"/>
    <path d="M28 124V99m-5 11q-23-16-10-24 17 2 17 21m2 4q22-18 27-4-6 15-27 11M182 124v-24m-3 12q-23-18-10-25 16 0 16 21m0 7q20-22 26-8-4 15-25 13" fill="#8fa66e" stroke="#769261" strokeWidth="2"/>
  </svg>;
}

export default async function BoardPage() {
  const rows = await topRooms(25);
  // Match topRooms' actual query mode: new visuals do not confer verification
  // on legacy records.
  const verified = process.env.NEXT_PUBLIC_DK_AUTHORITY_ENABLED === "true";
  const recordLabel = verified ? "Server-recorded service" : "Saved restaurant records";

  return <main className={css.page}><div className={css.wrap}>
    <header className={css.nav}>
      <Link href="/chef" className={css.brand}><span className={css.crest}><IconChefHat size={25}/></span><span>Domain Kitchen<small>The neighborhood</small></span></Link>
      <Link href="/chef" className={css.back}>Back to your kitchen</Link>
    </header>
    <section className={css.hero}>
      <div className={css.heroCopy}><span className={css.eyebrow}>A seat at the table</span>
        <h1>The best tables<br/>in town.</h1>
        <p>Meet your neighbors, peek inside their restaurants, and find a little inspiration for your own.</p>
      </div>
      <div className={css.heroArt}><NeighborhoodMark/></div>
    </section>

    <section aria-labelledby="records-heading">
      <div className={css.sectionHeading}><h2 id="records-heading">Around the neighborhood</h2><span className={css.recordBadge}>{recordLabel}</span></div>
      <p className={css.recordNote}>{verified
        ? "These service records come from server-validated restaurant progress. Earlier saved scores are kept separately."
        : "Explore community kitchens and their saved best service scores. These legacy records are not verified competitive results."}</p>
      {rows.length === 0 ? <div className={css.empty}>
        <span className={css.emptyIcon}><IconChefHat size={36}/></span>
        <h3>There’s room for a new favorite.</h3>
        <p>{verified ? "No server-recorded restaurants are available to show yet. Keep caring for your kitchen and check back soon." : "No saved restaurants are available to show right now. Your own kitchen is a lovely place to start."}</p>
        <Link href="/chef" className={css.primary}>Open your kitchen</Link>
      </div> : <ol className={css.rooms} aria-label={recordLabel}>
        {rows.map(r=><li key={r.handle} className={css.room+" "+(r.topTier?css.featured:"")}>
          <span className={css.rank}>{r.rank}</span>
          <Link href={"/chef/visit/"+encodeURIComponent(r.handle)} className={css.roomLink}>
            <span className={css.roomIcon}><IconChefHat size={27}/></span>
            <span className={css.roomName}><strong>{r.name||r.handle}{r.topTier&&<span className={css.star}><IconStar size={15}/></span>}</strong><small>{r.tier} · {r.seats} seat{r.seats===1?"":"s"}</small><span className={css.visit}>Come on in <span aria-hidden="true">→</span></span></span>
          </Link>
          <span className={css.score}><strong>{r.quality}</strong><small>{verified?"Recorded best":"Saved best"}</small></span>
          <CheerButton handle={r.handle}/>
        </li>)}
      </ol>}
    </section>

    <section className={css.ladder} aria-labelledby="ladder-heading">
      <div className={css.sectionHeading}><h2 id="ladder-heading">THE LADDER</h2><span className={css.eyebrow}>Little milestones, lasting pride</span></div>
      <p className={css.recordNote}>Good food, clean tables, and a welcoming room give your service room to grow.</p>
      <div className={css.tiers}>{[...SERVICE_TIERS].reverse().map(t=><div key={t.name} className={css.tier}>
        <span className={css.tierIcon}><IconStar size={20}/></span><div><strong>{t.name}</strong><p>{milestones[t.minQuality]||"Keep building your restaurant’s service."}</p></div><span className={css.threshold}>{t.minQuality}+</span>
      </div>)}</div>
    </section>
    <footer className={css.footer}>Scores show each restaurant’s best recorded service, rather than its current live condition. Cleaning and repairs help today’s restaurant feel welcoming again.</footer>
  </div></main>;
}
