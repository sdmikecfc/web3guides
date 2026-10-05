## What

A new Doma campaign game at `/bots`, Week 1 of a four-week build. Mike's spec is the law (recorded in `Documents/Doma/BATTLE_BOTS_GAME_GUIDE.md` and ADR-0140): build a clay-toy robot from five part cards, watch deterministic auto-battles, earn coins from real Doma strategy volume times an ROI bonus. The game only tracks; it never trades.

- **Fight engine** (`src/app/bots/_engine`): pure TS resolver with integer state and seeded forked RNG, hangman body-part damage with readable effects, commentary templates, a 40-part hand-authored catalog, canonical fighters, nine house-bot shapes, a frozen replay baseline.
- **Gates**: `scripts/bots-harness.ts` (merge gate) and `scripts/bots-massim.ts` (10,000-seed balance). Both green: tiers decide, luck lives inside a tier, fights run 33 to 48 s, no dominant archetype, challenging up pays best.
- **Build screen** on grey-clay placeholders at 1440 and 390: drag or tap to socket, live stats, tier badge, fixed name tables, paint masks. UI kit, page shell and nav in `src/app/bots/_ui` and `_components`.
- **Art pipeline**: SVG placeholder bake with rig points, an art check, a screenshot tool, and the gpt-image prop lane (18 keyed cutouts and two background plates under `public/bots-art`). Raw magenta plates are not committed.

## Why

The campaign rewards Doma strategy use with a game people will share; the tracking premise (keeper-submitted strategy fills visible on the token axis, including sells) was verified on chain during this week's build.

## Reviewer notes

- This repo's `main` is four seasons behind production (Vercel deploys from the working tree). `src/app/s7/games/_shared/pixi.ts` is included because the bots views import it; `package.json` gains `pixi.js` and `@resvg/resvg-js`, which the deployed tree already used. The S6/S7 changes from the same session (run-nonce TTL raised to 3 h, the S7 flat-share copy) are not here; they sit inside uncommitted season code and deserve a separate catch-up commit.
- Week 2 (style families and the matched-set bonus, the garage and shop on the real props, the vector fight viewer) is in progress and will land as further commits on this branch.
- Verify: `npx tsc --noEmit`, `npx tsx scripts/bots-harness.ts`, `npx tsx scripts/bots-massim.ts`, `npx tsx scripts/bots-fight.ts 7 T2 T2`, then `/bots/garage/build` on the dev server.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
