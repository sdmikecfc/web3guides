# Model Kombat launch review — 21 September 2026

## Decision

**Not ready to launch the full connected game today.** The current workshop has a functioning local build–fight–earn–shop loop. It is not yet the wallet-connected, competitive game described in the approved plans. Publishing another visual update would not close that gap.

This review covers the current workshop, its connection to the classic game, the shipped version-8 rules evidence, responsive room layouts and local build checks. It is not a security audit of unrelated applications in this repository. No production deployment, Git push, account transaction, Reporter change or shared-accounting change was performed.

## Changes completed in this pass

- Replaced the brown/cream contrast with charcoal surfaces, muted teal selections, copper primary actions and soft off-white text. The welcome, builder, shop, garage controls, fight setup, Community controls, Progress and dialogs use the same palette.
- Regenerated all 264 part/weapon previews with transparent backgrounds. Medium-grey studio panels make both dark and light parts readable without recolouring the equipment. Original assets remain available.
- Reduced the height of phone and short-landscape fight setup controls to keep the main action in view.
- Kept robot paint, arena art and combat signal colours independent of the interface palette.

The new theme is local. Production remains the existing published version until Mike runs `vercel --prod` himself.

## Launch blockers

| Priority | Finding | Evidence and required completion |
|---|---|---|
| Critical | Workshop ownership and rewards are browser-local. | `ConnectedWorkshop.tsx` reads and writes `localStorage`; `changeWorkshop` settles purchases, assembly and fight rewards locally. `BotsRouteProviders.tsx` skips wallet providers on `/bots/workshop`. Finish authenticated server persistence and idempotent authoritative transactions before treating these balances or results as competitive. |
| Critical | Desktop and mobile do not share the same workshop garage. | Connecting a wallet does not migrate/sync this workshop. The help correctly discloses this, but the planned connected experience is absent. Complete validated save linking, conflicts, reconnects and cross-device recovery without replacing existing wallet inventories. |
| High | The new combat loop is not connected to ranked play, challenges or seasonal competition. | The current workshop starts house fights and stores its own history. Legacy wallet/competition routes still exist separately. Complete server-owned sessions, accepted inputs, matchmaking, protection and atomic settlement for the intended new league. |
| High | Trading, Community and workshop progression are separate experiences. | Progress links to the classic trading dashboard. Community reads `/api/bots/battles`, while workshop results are local; `campaign={null}` supplies no standings and replay/score actions navigate to classic routes. Connect these to the same authoritative game records and approved seasonal trading rule. Do not alter Reporter or shared accounting. |
| High | Current weapon balance fails the agreed targets. | The version-matching T3 report below shows large kit differences. Fix the actual mechanics, then test all tiers, mixed bodies, mirrored sides and separate held-out seeds. Equal GP alone does not prove fairness. |
| High | Release verification is incomplete. | Physical-phone performance and real cross-device wallet flows have not been demonstrated. The full local production build passes, but compilation does not establish competitive readiness. |

## Room and player-experience review

| Area | Current assessment |
|---|---|
| Welcome | Explains the build/fight/earn loop, offers building or watching, states that coins are game points and saves stay on this device. Fresh/returning flows and one starter grant pass. No wallet discovery or wallet requests occur just by entering. |
| Build | Separate Style → Parts → Finish steps work. Seven choices remain editable; reload preserves selections and Finish keeps the exact robot. Parts have readable backgrounds. Phone preview and comparison popups work. |
| Shop | All 16 daily items fit on desktop; phone uses six readable tiles per page. Filters, pagination and popup closing preserve a usable position. Purchases become spare parts, not silent changes to finished robots. |
| Garage | Five stands, selection, next-build pointers and recycling information work. Approved models are present. The large static workshop wall remains visually quiet; cosmetic room polish is less urgent than connecting ownership. |
| Fight | Real saved build reaches the version-8 simulation; reload resumes its checkpoint. Results settle once locally and replay reproduces recorded events. The initial house-fight selection is not player matchmaking. No new claim of spectator-quality approval is made from automated tests. |
| Community | Loads recorded public fights; all three viewport sizes keep lower navigation. On a simulated feed failure it retains retry and practice actions. It does not reflect new workshop fights or provide current-workshop standings. |
| Progress | Shows local coins, fights, wins, daily allowance and replay history. Long history intentionally scrolls inside the room. A single combined wallet/trading/battle dashboard is still missing. |
| Sharing | The workshop has local replay history. A public share/export journey for these new workshop fights is not wired into this shell. |

## Balance evidence

Audited existing report: `.bots-preview/tank-bible-rebuild/review/balance-guard12-t3.json`. It matches the current source and publicly served release versions: rules `e97da3b4ef5a1fd9`, motion `4794f129a19e81cd`. This was **not a newly run balance sweep today**.

288 equal-GP T3 fights cover 144 ordered pairings on two seeds. All finish without timeouts. Each kit appears 48 times:

| Kit | Win rate |
|---|---:|
| Hammer | 50.00% |
| Greatsword | 62.50% |
| Axe | 60.42% |
| Flail | 62.50% |
| Sword and buckler | 18.75% |
| Spear and shield | 52.08% |
| Two-handed spear | 33.33% |
| Dual blades | 68.75% |
| Rifle | 45.83% |
| Precision rifle | 41.67% |
| Rotary cannon | 43.75% |
| Arm cannon | 60.42% |

First/second-side wins are 157/131: 54.51% versus 45.49%, a 9.03 percentage-point gap. These results do not meet the 40–60% overall reference target or the below-five-point side-gap target. Two seeds are diagnostic evidence, not reliable probabilities for each pairing. There is no current all-tier/mixed-build/manual-attacker versus defender certification.

## Verification performed

| Check | Result |
|---|---|
| Workshop strict types, dependency isolation and state checks | PASS: authoritative catalogue imports resolve without `art-src`; local starter, assembly, purchase, recycle, reward and repair checks pass. |
| Route checks | PASS: Model Kombat root reaches workshop; classic collection remains accessible. |
| Introduction browser checks | PASS: fresh and returning visitors, example fight without rewards, single starter grant, resumed draft, preserved existing robots, keyboard dismissal, reduced motion. No wallet requests, discovery or wallet network calls in the instrumented profile. |
| Builder/shop responsive checks | PASS at 1280×720, 928×930, 390×844 and 844×390: card bounds, images, seven choices, reload/Finish, pagination and popup behaviour. |
| Complete local gameplay browser check | PASS: build, garage, shop, fight, checkpoint reload/resume, exactly one 75-coin reward, identical replay events/result, spare-part purchase. No runtime page errors. |
| Six-room audit | PASS against the final local production build for document bounds and persistent navigation at desktop, phone and short landscape. The compact Fight setup has no internal scrolling at those sizes. Progress and recent-fight lists retain internal scrolling. |
| Community failure | PASS: simulated HTTP 503 retains retry, practice and lower navigation. |
| New preview alpha | PASS: 480×480 test image has zero-alpha corner; colour comes from CSS. Receipt records all 264 assets. |
| Public read-only smoke checks | Root, workshop, battle feed and renderer release manifest returned HTTP 200. The feed returned one recorded fight. This verifies availability, not launch completeness or new deployment. |
| Physical-mobile / GPU performance | NOT TESTED. Browser runs used headless Chromium with software WebGL and emulated viewports. They do not establish 60 FPS desktop or 30 FPS physical-phone performance. |
| Real wallet and server persistence | NOT VERIFIED for the new workshop; integration is missing rather than merely untested. |
| Full project production build | PASS: full Next.js build, type/lint stage, page generation and build traces completed with exit code 0. See environment notes below. |

Evidence: `.bots-preview/workshop-intro-check/results.json`, `.bots-preview/workshop-layout-check-ranged/results.json`, `.bots-preview/workshop-browser-check/results.json`, `D:\Temp\modelkombat-launch-review-production\audit.json` (final production-build room audit), and `public/bots-playtest/part-previews-studio-v2/receipt.json`. Room screenshots are alongside the final audit; the initial development audit is preserved in `.bots-preview/launch-review`.

## Order to reach launch

1. Connect the approved workshop to authenticated ownership and server-owned fight/reward settlement. Prove a robot built on desktop appears unchanged on mobile.
2. Join trading rewards, Community results and seasonal competition to that same record. Preserve old garages and keep the accounting boundary explicit.
3. Correct weapon balance, then run the agreed tier, mixed-build and held-out seed checks.
4. Finish public replay/sharing and review uninterrupted fights on real desktop and phone hardware.
5. Produce and verify the exact complete release package. Mike runs `vercel --prod`; check the resulting public site afterwards. A Git push alone is not a release.

There is no credible same-day full-launch promise while these integration and balance gates remain open.

## Final build result

**PASS.** Full Next.js production build completed with exit code 0. Output uses `.bots-preview/launch-audit-next`, a verified junction to `D:\Temp\modelkombat-launch-20260921-build`. Log: `D:\Temp\modelkombat-launch-20260921-build.log`.

The initial attempt exhausted the C drive. Only that attempt's disposable cache was removed. A subsequent D-drive attempt exposed Node resolving dependencies from the junction target; supplying this process's `NODE_PATH` to the checkout's `node_modules` resolved it. No dependency or production configuration change was needed. The final build reports non-fatal warnings for the existing optional `pino-pretty` dependency and stale Browserslist data.

The successful build is served locally on port 3162 for review. No production deployment or Git push was made. Production remains exclusively Mike's `vercel --prod` workflow.
