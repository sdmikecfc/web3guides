# Rewarding first session: implementation record

Implementation follows the owner's September 24 plan. Source stays in the active
diner-preview application. Production is exclusively the owner's `vercel --prod`.
All generated build and review output remains on D:.

## Delivery gates

- First-session loop is implemented: one-time style rewards, draft application,
  next goals, between-stop home visits and explicit menus. Local cooking/receipt
  and migration checks pass; novice observation remains open.
- Challenge and mastery are implemented with version-five route branches,
  disclosed forecasts, readiness advice, pressure cues and service breakdowns.
  The reference-cook balance results below cover specified loadouts, not every
  player strategy or a complete renovation campaign.
- Restaurant ownership is implemented: scrapbook displays, coordinated styles,
  group movement with attachments, undo/redo and named designs retaining finishes
  and appearance assignments. Local ownership and layout checks pass.
- Competition has separate server replay, time credit, receipts, standings,
  wallet-scoped retries and a first-completion trophy. The SQL migration is
  prepared but has **not** been applied to the live database. Public ranked entry
  stays gated pending that setup and real database/wallet integration checks.
- Profiles and player-initiated postcards have an independent room preview,
  camera controls and up to three selected earned displays. Desktop composition
  has been reviewed. Download/device interaction still needs the checks below.
- The collector entrance and disposable fixture are implemented. Public packs
  remain unavailable even if their release environment flag is accidentally set:
  paid settlement is an explicit unshipped prerequisite.

## First-trip assistance (September 24 feedback)

Before their first Downtown trip, players choose **Cosy** (recommended for
learning) or **Regular**. Both retain the protected Old Pete lesson. Cosy retains
the existing 50% extra effective patience, five-strike allowance and 20% lower
truck income; these tradeoffs are explained before selection.

New trips persist their assistance choice. Only Downtown can start Cosy; Festival,
Business Center, Boardwalk and Night Market use Regular. Settings describes this
as a Downtown preference and cannot change a running trip. Legacy active trips
retain their saved rules. Cancelling before opening preserves the choice without
counting a run.

The actual physical reference cook cleared the first three lunches in each mode:
494 carried coins in Cosy and 614 in Regular, enough for the 300-coin fries setup.
The chooser was reviewed at 360×640 and 390×844 in browser fixtures, and its Cosy
action opened the first lunch correctly. This is not physical-device testing.

## Recorded local checks

- `dk-diner-cosy-choice-check.mts`: both choices, first three physical services,
  reload, route restrictions, legacy trips and cancellation — pass.
- `dk-diner-first-shift-check.mts`: protected serve/wash lesson and reload at each
  step; skip/replay; 100 seeds per opening service for prepared and reactive cooks
  with one-second decisions — all three prepared profiles cleared 100/100.
  Preparation reduced waiting by 60.5%, 33.6% and 42.8% respectively.
- `dk-diner-pressure-rewards-check.mts`: 600 measured services, 100 each across
  relaxed/steady/rush and prepared/reactive play with starter burger equipment.
  Prepared rush earned 25.1% more per active minute than relaxed; reactive rush
  earned 24.1% more. All measured profiles cleared 100/100. Broader menus,
  assistance settings and complete campaign economies still need calibration.
- Rewarding-session, first-shift receipt, progression, authority, recipe-policy,
  audience/batch, physical-cooking and collection UI checks — pass.
- Shared-preparation checks physically prepare and serve all 32 dishes; finite
  portions, shared item identity, selected recipes and inherited warmth — pass.
- Renovation checks — 16 groups pass, including explicit saved-room stage
  validation. Rehearsal checks pass for all four truck sizes and all three
  restaurant stages, including blocked layouts and isolated unfinished orders.
- `dk-diner-route-chain-check.mts`: eight real services on each of all five
  routes, unique finale receipts, retained unlocks and optional customer crowds
  — pass. Later destinations use Regular. The last two use an explicitly owned
  two-seat table and tier-three fries equipment; this zero-decision-delay
  progression fixture is not a human balance or renovation-economy result.
- `dk-diner-room-design-check.mts`: group rotations with countertop attachments
  across all three stages, invalid-move rollback, exact purchase quotes,
  duplicate-charge rejection, named replacement and finish reload — pass.
- `dk-diner-ranked-check.mts`: real legal cooking input replay to a 2,059-point
  weekly result; forged scores/configuration/inventory, accelerated time and stale
  revisions rejected; long gaps pause; grace-period boundaries, trophy retries,
  durable storage retry and initial clock handshake — pass. Database concurrency
  and an actual wallet remain untested.
- Browser review caught and fixed preview camera margins and overlapping sticky
  controls. The phone style preview now keeps the room and scrolling controls in
  separate areas. A fixture café purchase charged the displayed 950 coins and
  applied the three decorations and finish.
- Full source type checking passed after the final presentation refinements.
- Isolated production build on D: — pass, including compilation, lint/type
  checking and generation of all 265 static pages. The existing optional
  WalletConnect logger warning about `pino-pretty` remains non-fatal. The build
  uses the existing Supabase settings in its process for other applications'
  normal page reads; no deployment or database migration was performed.
  Log: `D:\Temp\domain-kitchen-rewarding-build.log`.
  Source `node_modules`, the Next runtime and Three.js were verified intact.

An exploratory `dk-onboarding-check.mts` run failed an existing recipe expectation
in the **older `chef/game/_engine` application** (`software_noodles` versus null).
That module was not changed in this work; active diner onboarding checks pass.

## Ranked database setup (not performed)

Apply `supabase/migrations/20260924_domain_kitchen_ranked_rally.sql` in the intended
database, then exercise the signed-wallet flow and SQL concurrency/receipt tests
before enabling `DINER_RANKED_RALLY_ENABLED=true`. It also requires the existing
wallet account service configuration (`DINER_PREVIEW_SERVER_ENABLED` and its
server settings). Do not switch the connection-only beta save into an account
save. Ranked attempts use their own tables and never import the beta restaurant.

The migration creates attempts, command receipts, weekly bests and trophy
entitlements with RLS and service-role-only RPC access. There is one active
attempt per player, a best score per wallet/week, equal-rank ties and Monday UTC
week boundaries with a 30-minute finishing grace period. No ranking prizes or
gameplay advantage are attached.

## External acceptance

Physical Android/iOS interaction, sustained device FPS and observation of five new
players require actual devices/participants. Browser emulation and deterministic
reference-cook results must be reported separately and never stand in for these gates.

Also outstanding: full randomized-market renovation campaigns using 14×30-minute,
7×60-minute and continuous play, recording shortages and the last blocking
requirement; broader multi-menu earnings comparisons; complete private collector
fixture interaction; postcard download/device checks; and live ranked SQL/auth
integration. The previous aggregate session-profile estimate does not complete
the campaign acceptance requirement.
