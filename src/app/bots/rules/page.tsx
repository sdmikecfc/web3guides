import { InfoPage } from "../_components/InfoPage";
import css from "../info.module.css";

export const metadata = { title: "Rules | Model Kombat", description: "The complete Model Kombat competition and game rules." };

const trading = {
  weekly: [60, 35, 25, 20, 10],
  final: [200, 120, 80, 60, 40],
};
const battles = {
  weekly: [30, 20, 12, 8, 5],
  final: [100, 60, 40, 30, 20],
};

function PrizeTable({ title, weekly, final }: { title: string; weekly: number[]; final: number[] }) {
  return <div className={css.tableWrap}><table className={css.table}><caption>{title}</caption><thead><tr><th>Period</th><th>1st</th><th>2nd</th><th>3rd</th><th>4th</th><th>5th</th></tr></thead><tbody><tr><td>Each week</td>{weekly.map((n, i) => <td key={`${n}-${i}`}>${n}</td>)}</tr><tr><td>Two-week final</td>{final.map((n, i) => <td key={`${n}-${i}`}>${n}</td>)}</tr></tbody></table></div>;
}

export default function RulesPage() {
  return <InfoPage eyebrow="The official competition" title="Two weeks in the ring." intro="Build a robot, put a Doma strategy to work, and compete for $2,000 across trading skill and robot battles." art="/bots-art/plates/arena-evening.png">
    <h2>Prize pool</h2>
    <p>The $2,000 prize pool is divided into three independent categories: <strong>$800 for the best ROI percentage</strong>, <strong>$800 for the most realized profit in USD</strong>, and <strong>$400 for battle points</strong>.</p>
    <PrizeTable title="$800 ROI percentage pot" {...trading} />
    <PrizeTable title="$800 realized profit pot" {...trading} />
    <PrizeTable title="$400 battle points pot" {...battles} />
    <p className={css.note}>There are five paid places in each category for Week 1, Week 2, and the two-week final. That creates 45 scheduled prize places. A player may place in more than one category or period.</p>

    <h2>How the three scores work</h2>
    <h3>ROI percentage</h3>
    <p>ROI is realized trading profit divided by actual starting capital and qualifying added funds, expressed as a percentage. Unsold gains do not count. A score cannot be ranked until the starting-capital snapshot is known and greater than zero.</p>
    <h3>Realized profit in USD</h3>
    <p>This score is the realized profit from qualifying positions sold during the period, measured in USD. Open-position gains are excluded until realized.</p>
    <h3>Battle points</h3>
    <p>Battle points come from eligible real fights during the period. Practice fights do not add points. Each robot may make up to two attacks per day, subject to repair and other game limits shown in the garage.</p>

    <h2>Eligibility</h2>
    <ul>
      <li>Complete at least one verified automated trade on <strong>three different days</strong> in a week to qualify for that week&apos;s prizes.</li>
      <li>Meet the three-day requirement in both weeks to qualify for the two-week final.</li>
      <li>Only verified activity inside the published competition period counts.</li>
      <li>More trades on the same day do not improve eligibility.</li>
      <li><strong>Trading volume does not determine any cash prize.</strong></li>
    </ul>

    <h2>Results, ties, and checks</h2>
    <p>Live standings are provisional. Results become final after the relevant trades, balances, fights, and eligibility records are checked. If players tie, they share equally the total prizes for the places occupied by the tie. Any undistributed fraction may be rounded to the nearest cent.</p>
    <p>Model Kombat may exclude manipulated, duplicated, automated-abuse, self-dealing, or otherwise unverifiable activity. It may pause or correct a leaderboard when data is incomplete or wrong. Material rule or date changes will be published clearly before they take effect whenever reasonably possible.</p>

    <h2>Playing and prizes</h2>
    <p>You must be at least 18 years old and legally allowed to participate where you live. The competition is void where prohibited. You are responsible for taxes, wallet access, and any information reasonably required to verify eligibility and deliver a prize.</p>
    <p>Robot parts, game coins, decorations, practice results, and other in-game items have no cash value and cannot be redeemed or transferred unless Model Kombat states otherwise in writing.</p>
  </InfoPage>;
}

