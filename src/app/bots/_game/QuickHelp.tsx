'use client';
import {useState} from 'react';
import Link from 'next/link';
import EntryDialog from './EntryDialog';
import css from './entry.module.css';
// Verified against Doma's live help index. Keep the full choice of strategies.
const strategyGuides = [
 ['Buy low, sell high','strategies-buy-low-sell-high'],
 ['Build a position','strategies-build-a-position'],
 ['Grid trading','strategies-grid-trading'],
 ['Custom trading through MCP','strategies-custom-trading-through-mcp'],
] as const;
export default function QuickHelp({topic='home'}:{topic?:'home'|'trading'|'play'}){const [open,setOpen]=useState(false);return <><button type="button" onClick={()=>setOpen(true)} aria-label="Help">Help ?</button>{open&&<EntryDialog title={topic==='play'?'Choose your kind of fight.':'How it works.'} onClose={()=>setOpen(false)}>
 {topic==='play'?<><p><strong>Arcade:</strong> you control the fighter. Free practice, with no rewards.</p><p><strong>Build:</strong> choose seven parts, name and paint your robot. Your first build is free.</p><p><strong>Automatic battles:</strong> your robot fights; you time its Special. Finish fights to earn game coins for parts.</p></>:<><p>Trade Doma domain tokens using Strategies or MCP. ETH/USDC pairs don’t count.</p><p>Enter the competition before trading for prize credit.</p></>}
 {topic!=='play'&&<><details><summary>Doma Strategies · all 4 guides</summary><ul className={css.helpLinks}>{strategyGuides.map(([name,slug])=><li key={slug}><a href={`https://app.doma.xyz/help/${slug}`} target="_blank" rel="noopener noreferrer">{name} ↗</a></li>)}</ul><a href="https://app.doma.xyz/help#help-category-trade" target="_blank" rel="noopener noreferrer">Browse all Doma trading help ↗</a></details>
 <p><a href="https://docs.doma.xyz/agentic-commerce/mcp-server/connect" target="_blank" rel="noopener noreferrer">Connect Doma MCP to your AI app ↗</a></p></>}
 <details><summary>How are token rewards split?</summary><p><strong>60% volume:</strong> 40% of this category goes to the top three; 60% is shared by the other qualifying traders, based on their volume.</p><p><strong>15% profit in dollars · 15% ROI percentage · 10% battle points:</strong> each category pays its top three, split 50% / 30% / 20%.</p><p>Automatic battle wins can earn prize points. Arcade practice earns no points. To qualify for any token prize, trade on 3 separate UTC days in one competition week.</p></details>
 <details><summary>Coins or token prizes?</summary><p>Game coins buy robot parts and cannot be withdrawn. Token prizes depend on qualifying trading activity, unlocked zones and your final rank. Playing does not guarantee a prize.</p></details><p><Link href="/bots/rules">Full competition rules →</Link></p><p>Need a person? <a href="https://discord.gg/doma" target="_blank" rel="noopener noreferrer">Discord ↗</a> · ask @sdmike, or <a href="https://x.com/sdmikecm" target="_blank" rel="noopener noreferrer">@sdmikecm on X ↗</a>.</p><button className={css.primary} onClick={()=>setOpen(false)}>Got it</button></EntryDialog>}</>}
