# LAUNCH WARS SEASON 2: CONQUER THE SEAS — BUILD SPEC v1 (locked 2026-06-11)

**Read with `launch_wars_build_state.md` (memory). Hard rules carry over: additive-only, degrade-gracefully, node --check/tsc before handoff, full-path deploy commands, NO em-dashes in any player-facing copy, all player copy 6th-grade and translation-friendly. Operator = Mike, ships incrementally.**

## Dates, budget, minimums
- Season: **Jun 15 to Jun 29, 2026**. 4-day build runway from lock.
- Jun 15 = triple day: S1 settles (capital frees) + S2 opens + boss event still 🔒 till ~Jun 18 (payday ~Jun 25). Staggered capital inflows by design.
- Budget: **$1,000 week-1 factions + $1,000 week-2 wave** ("Kraken Armada", 5 new boss-style domains arriving as an enemy fleet on the map horizon).
- Minimums: **$5 week 1 (join a faction) · $10 week 2 (fight world bosses)**.
- Art: ~$20 gpt-image2 (NO hyphen in model id) + Kenney CC0 pirate pack. Strategy: neutral ship classes tinted per faction via sharp; islands per faction at 5 growth stages.

## FACTIONS (Mike, verbatim — launch time 10:00, all 2026)
| Launch | Domain | BIN | Start FDV | Bond FDV |
|---|---|---|---|---|
| Mon Jun 15 | realityapps.com | $50,000 | $2,500 | $5,000 |
| Tue Jun 16 | recertify.ai | $85,000 | $3,400 | $5,900 |
| Wed Jun 17 | Warriors.xyz | $18,000 | $2,000 | $2,500 |
| Fri Jun 19 | BotToken.com | $100,000 | $2,500 | $5,000 |
| Sat Jun 20 | Rackets.xyz | $2,500 | $750 | $875 |
- STAGGERED arrivals = built-in daily content ("a new sail on the horizon"). Reuse S1 pending-team machinery (join before launch, auto-resolve at launch).
- Bond gaps: Rackets $125 and Warriors $500 bond near-instantly (early first-blood energy); recertify $2.5k, realityapps $2.5k, BotToken $2.5k.
- BIN = premium value context; deed/subdomain stake pricing scales with BIN.

## Economy (one stat sheet powers everything)
- **Hull = net held capital** (buys minus sells). Sets HP AND ship size class (dinghy→sloop→frigate→galleon→flagship; reuse card-level machinery). Money buys the boat; cannot be ground.
- **Doubloons = earned soft currency** (duties, battles, posts, quests). Buy FITTINGS: cannons (damage), sails (dodge/speed), spyglass (first strike), pumps (regen). Play buys the fittings; cannot buy hull. Sinks = cosmetics (paint, sail patterns, wake trails, fireworks).
- **Glory = the rewards bridge**: play earns Glory → (a) capped personal-points pillar (~10-15% of pie) flowing through EXISTING settlement = raises real prize share; (b) deed-raffle tickets (7-day duty streak = 1 entry). **NEVER cash directly on a game outcome** (Mike rule).
- Balance caps (guard with your life): fittings multiplier ≤ ~2x, daily duty buff ≤ ~1.3x, hold stays dominant ~50%+ of points, land tax per $ staked < hold points per $ held.
- Identity stack on every ship: faction flag (locked) + name + paint (doubloons) + figurehead (achievement-gated only) + pennant (deed holders fly their subdomain).

## Games (ALL dailies async in a 24h window; global audience, language-free)
1. **THE CHANNEL RUN (flagship arcade, replaces the beat-em-up for S2).** Paperboy-style: your ship auto-sails a scrolling channel; steer lanes, dodge whirlpools/rocks, shoot targets and enemy sloops (they shoot back) for doubloons. **Hull = HP AND hitbox size (whale tradeoff: tanky but clumsy vs nimble but fragile)**; cannons = volley/damage; sails = handling. SAME daily seeded layout for everyone, one scored run/day (practice free), 60-90s, Phaser, mobile tap/hold. Score → doubloons + Glory. **GHOST RACES (2025 async-multiplayer trend): fleet-mates' recorded runs replay as translucent ghost ships in your run** = co-presence with zero netcode. Needs only SHIP sprites (no humanoid animation = the art bottleneck deleted). Beat-em-up slides to S3/late drop.
2. **Gunnery Drill** (45s timing/shooting gallery; feeds tonight's cannon buff). Also the duel resolver.
3. **THE POWDER HOLD (Suika-style merge physics — REPLACED the generic match-3 Bilge Rush, 2026-06-11 research).** Drop cannonballs of rising caliber into your ship's hold; same-caliber balls MERGE on contact with physics chaos and chain reactions; overfill = game over; biggest = the Kraken Shot. **NO timer** (the Suika lesson: near-miss psychology + thoughtful play = the addiction loop), one thumb, language-free, streamable. Performance feeds the dodge/sails buff (same slot function). Share tile = biggest shot + score.
4. **The Heading** (daily shared puzzle, LANGUAGE-FREE: visual course-plot through a reef grid, fewest moves; emoji route-trace share tile; fastest 100 get event intel). NO word puzzles ever (Gartic lesson).
5. **The Lookout** (something spawns on the global map daily; find+click within 24h = doubloons; drives daily map opens).
6. **THE CAPTAIN'S WAGER (replaced the flavorless Merchant Run).** One tap, ten seconds, zero language: higher or lower (arrow buttons) on a REAL Doma market number over the next world tick (e.g. "payface FDV at sundown?"). Resolves at tick; doubloons scale with correct-call streak. Still the streak-saver slot, but it teaches players to watch the actual charts (prediction-market energy, points only, no money staked).
7. **Daily Naval Battle** (rumble): **12h join window** (one ⚓ react), resolve time rotates 14:00/20:00/02:00 UTC; odds = hull + fittings + tonight's buffs; narrated burst; winner fleet takes the day's plunder (doubloons + Glory, not cash).
8. **Epic Sea Battles** (2-3/wk, fixed-time spectacles, announced via map beacon; doubloon pots, NO cash).
9. **Duels**: call out a ship, doubloon wager, resolves async (best Gunnery in 24h), callout + result cards to X.
- Streak = any ONE duty/day. Underdog wind: last-place fleet gets visible storm-luck + the Black Flag cosmetic (only winnable while last).

## The map (web, the shared world)
- Pan/zoom painted sea on web3guides; islands = faction harbors + boss waters + conquered settlements; ships = players positioned by activity state (harbor default, monster waters when raiding, moored when settled). Hourly world tick repositions. Clustering for crowded harbors. ~1000 ships fine. NO realtime sim.
- **Lightly animated**: bobbing ships, water shimmer, smoke over yesterday's kill site, pulsing event beacons.
- **Event beacons**: marker appears → click → card "Epic Sea Battle, today 2PM UTC, enter in Discord →" (deep link) → after resolve, becomes a 24h RESULTS card (winner flag, named heroes, plunder split).
- **Faction islands GROW**: island level = f(subdomains staked, LP staked USD) with 5 visible stages (camp→village→port town→fortress→citadel); chronicle moment per level-up. The Doma asks (LP + subdomains) ARE the growth mechanic.
- Click a ship = public card: name, faction, class, total points, damage dealt, battles won, deeds, badges. **NEVER dollar holdings** (S1 privacy lesson).
- **Ghost ship trial**: no wallet, no Discord: hoist a flag, grey dinghy on the map 48h + one duty in-browser; join Discord to keep it. The outsider ramp.
- Map link unfurls as the CURRENT world state (OG route pattern).

## LP + subdomains (the Doma asks, in-world)
- Bond a monster → island revealed → **48h GOLD RUSH window** (LP-in bonus settler points) → LP = settlement: daily trade-income points + flag on the island; pull LP = colony abandoned (income stops, no penalty drama).
- LP reads: Doma chain 97477 = Uniswap V3 fork; positions = NFTs on NPM `0xce126ca6aceBBDCe95D7b8A3Ce637951640811E0` (addresses in Mike's lp-bot .env, C:\Users\Mike\Desktop\lp-bot). Read per-linked-wallet via RPC from the reporter (preferred) or add endpoint to lp-bot FastAPI.
- Subdomains = deeds: earned (first blood, final blow, top damage, top settler, + raffle for $10+ qualifiers). STAKEABLE per Mike; stake price scales with domain value (BIN). Staked deed = estate: daily land-tax points + name flown on the island + in-game title. Holding math untouched (separate asset).

## Profiles
- Ship card (composited: pre-gen art + sharp overlays, <100ms, DM-delivered like S1) + **Service Record career tab: S1 stats** (team, points, rank, Founder, boss damage, First Blood/Final Blow, deeds) from existing tables. S1 Founders: permanent brass plaque cosmetic. Map click shows career + season tabs.

## Outsider engines
- Daily battle POSTER auto-composed + posted to X (named winners self-retweet).
- The Heading share tiles (language-free wordle-pattern).
- Duel callout cards. Ghost ships. Map OG unfurls.
- Season finale = world event (all fleets vs the Leviathan, last 48h). Winner faction gets **NAMING RIGHTS: a permanent map landmark, survives all future seasons**. Post-settlement: every player gets an auto-composed Season Wrapped chronicle card; storm clouds render on the map edge as the S3 teaser.

## Build order (Day-1 minimum vs drops)
- **Day 1 (Jun 15):** S1 season engine reused (factions via pending-teams, $5 join, scoring, settlement) + doubloons/fittings ledger + Naval Battle v1 + ship card v1 (composited) + S2 page banner. Channel Run in test.
- **Drop 2 (~Jun 17-18):** THE MAP (with beacons + Lookout) + The Heading + Gunnery.
- **Drop 3 (~Jun 19-20):** CHANNEL RUN headline event + duels + cosmetics shop.
- **Drop 4 (Jun 22):** Kraken Armada (week-2 $1,000, boss engine reskinned, $10 min) + Gold Rush/LP settlements + deeds.
- **Finale (Jun 27-29):** Leviathan world event, naming rights, Wrapped cards.
- Discord buttons/interaction handlers = new subsystem, ship early in test mode.
- Anti-cheat: scores server-validated (seed + input replay on top runs), daily caps, cash never on raw scores.

## Engineering reuse map
S1 carries: seasons/teams/members schema + pending teams (011) + scoring tick + settlement + bond-to-win + cards/art pipeline (openai-image, ART seed conventions, SFW energy-drain rule) + SIWE wallet link + referrals (10%) + x_shares posts engine + boss module (becomes Kraken Armada) + OG route + sharp compositing (NEW dep on droplet) + Supabase storage. New tables: s2_ships(fittings/cosmetics/doubloons/glory), s2_duty_runs, s2_battles, s2_islands(level/lp/deeds), s2_deeds, s2_events. All `launch_wars_s2_*`, all degrade-gracefully.

## Infra + isolation + test mode (locked 2026-06-11)
- **No new hosting**: games = static Phaser bundles on Vercel; scores = API routes → Supabase; world = hourly bot tick; map = cached JSON + images. No websockets/game servers/Redis.
- Deltas: droplet may need 2GB RAM for sharp compositing (check `free -m`); Supabase egress → serve art through Next with CDN cache headers (build regardless), Supabase Pro $25/mo only if needed; Vercel plan already proven (30.8s OG render ran); X posting v1 = bot DMs the poster to Mike, manual post (no X API).
- **Master switch**: `s2_enabled` key in the existing config table; module + crons inert when off; web shows storm-teaser when off; private preview key shows Mike the full surface in prod pre-flip. Flip on AND off = one SQL update.
- **Isolation**: own module `modules/conquer-seas/`, own `launch_wars_s2_*` tables (all with `is_test`), reads S1 tables only for Service Record, never writes them. S1 runs + settles on the existing engine untouched.
- **Test mode (build FIRST)**: `!seas test-activate` = sandbox world (real 5 factions marked test + fake captains with random hulls/fittings to populate map/battles); cheats: `!seas grant <user> <amt>` (endless doubloons), `!seas test-tick` (advance world clock), `!seas test-battle` (instant rumble w/ fakes + testers); test output → private #s2-testing channel (ID from Mike); games at unlisted URL w/ test-flagged scores; `!seas test-wipe` cleans before flip.
- **Mike's shopping list**: Doma team subdomain issuance + staking answer (BLOCKS deeds), #s2-testing channel ID, OpenAI credit ($20), Kenney Pirate Pack (CC0), week-2 Kraken domains (~Jun 20), droplet RAM number, poster path decision (manual v1 recommended).

## UI principles (paid for in S1 confusion — binding)
- **Every question gets a picture, every moment gets a card, nobody types commands.** Buttons + select menus on every embed (interaction handlers = new subsystem, ship early in test). Commands stay as power-user shortcuts.
- **Composite rendering**: pre-generate beautiful art once per season (gpt-image2), compose personal images in code (sharp: name/stats/flags stamped on) in <100ms, cache to Supabase storage. NEVER per-player AI generation.
- The 4 surfaces: ship card (= "how am I doing", DM-delivered 📬), harbor board (= "what is happening"), nightly plunder report (= "what happened"), victory card on a kill (= the shareable). Text never exceeds ~5 lines without an image carrying the numbers.
- Status icons self-explain inline at the point of use (the Zaky lesson: nobody reads footers mid-decision). Private money ONLY in DMs; public surfaces show points/share %, never dollars.
- Light SFX in games from free packs (Kenney audio, CC0) = cheap juice.

## Free players (the funnel, inside and outside Discord)
- **Any Discord member, no wallet**: gets a starter DINGHY (tiny fixed hull). Can do duties, earn doubloons, fit it, join the Naval Battle (small odds), earn Glory-capped-small. Their ship card shows what linking + $5 would do ("your real hull awaits"). Conversion = the game itself.
- **Web stranger, no Discord**: GHOST SHIP (48h grey dinghy on the map + one duty in-browser, cookie-based). Join Discord to keep it.
- Cash prizes always require the wallet + minimum ($5 wk1 / $10 wk2). Free players earn fun, status, and doubloons, never cash share.

## Economy numbers TO SET AT BUILD (deliberately not designed yet — first build task)
- Doubloon earn rates per game/duty/battle/post; fitting price ladder + tiers (cannons/sails/spyglass/pumps); cosmetic prices (the sink).
- Glory → personal-points conversion rate + the season cap (~10-15% of a committed player's total); raffle ticket math.
- Naval battle odds formula constants (hull weight, fittings ≤2x, duty buff ≤1.3x, luck variance, underdog wind size).
- Channel Run scoring curve + daily doubloon cap; duel wager min/max; island level thresholds (deeds+LP → stages 1-5); land-tax rate (< hold per $).
- Starter dinghy hull value; ghost-ship cap.

## Final pre-build answers (2026-06-11, Mike)
- Droplet: **take the $12/mo resize (1vCPU / 2GB RAM)** — RAM is the blocker (712MB swap in use; sharp needs headroom), 1vCPU is fine (bot is I/O-bound, skip $18). If the resize page offers a "CPU, RAM and Disk" variant of $12 with bigger disk, prefer it; if it is RAM-only (disk stays 10GB), take it anyway: art lives in SUPABASE STORAGE not the droplet, so the 85%-full disk is logs/deps → managed via `pm2 flush && apt clean` + log rotation (a build-week task). Supabase Pro + Vercel paid CONFIRMED (egress/functions fine).
- Subdomains: **seas.web3guides.com** = the game/map. **deeds.web3guides.com** = the deed registry UI (view/claim/showcase). NOTE: the deed PRIZES themselves are on-chain subdomains of the CONQUERED GAME DOMAINS (e.g. firstblood.payface.ai) minted via the Doma protocol — nothing on the doma.xyz website needed; the pending Doma-team question is about protocol-level subdomain minting/staking, not their site.
- Graphics: beauty = pre-rendered gpt-image2 static assets via CDN (infra-free); old-phone support in code: 2 asset resolutions, DPR 1x on weak devices, FPS auto-detect trims particles, <5MB per scene lazy-load.
- Surface: **seas.web3guides.com** (Mike creates subdomain, same Vercel project). Testing channel: **#bot-reports** (existing const). X posters: **manual** (bot DMs image + prefilled text).
- Kenney pack at `web3guides/public/Kenny` (403 PNGs, flat vector, one ship size) = **TEST-PHASE placeholders + props only**; real ships from our pipeline (5 neutral painted hull classes, faction-tinted). Filler if needed: CraftPix free / OpenGameArt.
- **Captain's Wager = reskin of the EXISTING Doma Predictions engine** (worked well per Mike) + doubloon payout hook. Less build than spec'd.
- Kraken week-2 domain list: Mike ships before week 2.

## Anti-pile design (stop the S1 one-team stampede: 70/106 joined DISINTERMEDIATION because $400 was winner-take-most)
- **PLACEMENT PAYOUTS: every fleet pays.** $1,000 across all 5 placements (~$450/$250/$150/$100/$50, tune at build). 2nd on a 12-person fleet > 1st on a 70-person fleet per member = piling costs money.
- **Ambient dilution display**: join card + ship card show projected personal cut PER FLEET side by side ("BotToken ~$3.80 each · Rackets ~$21 each").
- **Rolling founder windows**: the stagger = five separate ×1.25 windows; every launch announcement markets "a new founder window opens today."
- **Size-blind dailies** (top-10 runs per fleet, already specced) + **underdog wind** (already specced) make small fleets competitive daily.
- **Fleet-fit nudge** at join: match capital to bond gap ("Rackets needs few hands. BotToken needs an armada.").
- REJECTED: hard member caps, earn-rate penalties for big fleets (punishment framing loses; carrots that make spreading out the greedy choice win).

## Open items
- Doma team: subdomain issuance flow + staking primitive confirmation.
- Week-2 Kraken domains list (Mike, by ~Jun 20).
- Faction art pass once domains' vibes are set (archetypes per domain name).
