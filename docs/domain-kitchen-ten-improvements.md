# Domain Kitchen ten-improvement delivery record

Updated September 23, 2026. Work is in the active diner-preview application and shared diner modules. This is an implementation and evidence record, not a claim that human/device acceptance has finished.

Production remains the owner's own `vercel --prod`. No production deployment was performed. The preview output junction points to D:\Temp\domain-kitchen-mobile-next. Source dependencies remain intact.

## Implemented

| Improvement | Implementation | Evidence and remaining gate |
| --- | --- | --- |
| Protected first lunch | Versioned Old Pete lesson through physical serving and washing; sequential packing, starter-layout shortcut, skip and reward-free replay; one-time complete burger ingredient set | Real actions, reload checkpoints, protection ending after wash, reward replay rejection; full pointer-controlled lesson at phone size. First-time-player observation remains. |
| Interaction intent | Seat-aware intent, action/reason/recovery metadata, compatible destination cues, contextual blocked-action callouts and supply selection while walking | Two-seat delivery in all rotations, finite vessels, missing-plate/dirty-seat recovery, 1,254 crew-occluded station rays. |
| Early pressure | Persisted seeded schedules, queue admission limits, patience floors and third-service rush/recovery | 100 seeds per early profile, both prepared and reactive reference cooks with one-second decisions: all clear. Third service reaches two waiting guests. |
| Route decisions | Shared forecast/service factory, market and promotion countdowns, chosen/passed paths, banking explanation and cancellation before opening | Forecast matches actual service, scheduled markets and receipt checks. Corrected the passport: finale completion grows the truck; collecting every recipe is optional. |
| Shared cooking | 30 dishes; patty/fries/pasta/noodle components; final recipe choice at prep; deduplicated supplies; finite three-portion baskets; separately grilled ramen chicken | All 30 physically cooked and served. Item identity, portion depletion, vessels, save validation, 90-second components, 45-second dishes, cold inheritance and heat-lamp conservation pass. |
| Regular stories | Eight regulars with three chapters at 3/8/15, optional requests, active named meal plus greeting, round-robin eligibility, preserved 25/40 entitlements | All eight arcs complete via actual simulated meals; authoritative receipt retry/offline exclusion/reload and old-friendship checks pass. Pete's greeting and progress checked in the mobile UI. |
| Mobile flow | Explicit modes, compact service/placement controls, supply/assembly chooser focus, safe hold interruption, contextual action clamping | 360×640, 390×844, 667×375 and desktop browser review; 1,176 action-placement cases. Physical Android/iOS checks remain. |
| Layout rehearsal | Cloned home/truck simulation, three orders, 120-second bound, 4× ghost playback, previous/proposed walking and congestion comparison; existing validated placement confirmation | All four truck tiers and three restaurant stages; blocked/no-sink layouts, unchanged input and deterministic output. Home/truck UI checked; corrected embedded camera framing. Full adversarial helper/queue/fixture combinations remain. |
| Character acting | Bounded pickup/set-down/clearing/acknowledgement gestures, speed-linked walking and carrying turns, seated contacts, existing gate/hatch actions, reduced motion | 11,520 pose samples, 336 tool/palm contacts and 432 face probes. Presentation does not change ownership or authoritative outcomes. |
| Visual refinement | Shared material/lighting library, counter/gate/hatch/booth details, distinct new food and sauce models; daylight/evening/rainy windows; automatic/manual quality budgets | 30 distinct dishes, 37 ingredient models, 27 equipment types, 83 decorations; 1,002 geometry/pose cases and 91 room fixture/table rotations. Populated starter reviewed. Sustained physical-device FPS and full populated-stage artistic sign-off remain. |

## Balance evidence

The first, second and third services cleared 100/100 deterministic seeds each, with a one-second decision delay. Preparation reduced cumulative queue waiting by 60.5%, 33.6% and 42.8%. These are deterministic reference-cook results, not novice-player results.

**Later calibration:** the new destination workload and updated 60-clear renovation contributions are documented in [routes delivery](domain-kitchen-routes-delivery.md). The following numbers record the earlier Downtown-only baseline.

The separate session fixture measures actual Downtown day-five slow/medium/busy cooking with a three-dish menu and one-second decisions. Each clears without misses: 361.55, 312.25 and 349.40 seconds. Their 5.684-minute mean made the old first-renovation requirement of 100 clears exceed nine hours of cooking alone. The first gate is now **70 verified services** (about 6.63 hours of sampled cooking), retaining the coin, mastery, route, medium-service and actual two-dish requirements. Existing progress is preserved.

14×30-minute, 7×60-minute and one continuous seven-hour profile produce the same 73 clears, 16,958 truck coins after a 2,800-coin discretionary purchase allowance, and 18 complete ingredient sets. The ingredient gate is not the final blocker in this fixture. Real starter-home settlement during those seven hours adds 6,352–9,216 coins for a burger at level 0–3 throughout, giving a combined range of 23,310–26,174. The final blocker depends on mastery timing and the unmodelled route/discovery path.

This repeats measured services; it does not simulate an entire randomized campaign, market decisions or a novice's retries. The second renovation's 100-service calibration is unchanged and still needs an experienced-crew campaign profile. The six-to-eight-hour end-to-end renovation acceptance gate is **not certified** by these numbers.

## Compatibility and authority

New services receive the new cooking/pacing versions. Saved active services keep their old versions. Balances, layouts, furniture, recipe mastery and friendship remain owned. Story timing uses server-observed active intervals and server-created simulation configurations; malformed visits are rejected. No rehearsal result, presentation event or browser-supplied score becomes reward evidence. The first-lunch and regular keepsake/scrap receipts reject repeats. Free beta samples and paid-pack preparation remain separate.

Scoped TypeScript validation returns zero diagnostics. Existing service (19), controls (12), authority (10), service migration (13), renovation (16), table-service (4), collection UI (6), home-traffic (4), physical-cooking (8), noodles (9), batches (8), recipe-policy (7), scheduled-market (6) and progression (22) groups were checked during this work. Local browser review shows no runtime errors.

## Reproduce locally

Use the installed Node runtime and keep output on D:. The checks below do not write a player's save or start a production build.

~~~powershell
& 'D:\Tools\node-game-dev\node.exe' --max-old-space-size=512 --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-first-shift-check.mts
~~~

Use that runner for `dk-diner-first-shift-receipts-check.mts`, `dk-diner-shared-prep-check.mts`, `dk-diner-regular-stories-check.mts`, `dk-diner-rehearsal-check.mts`, `dk-diner-session-profiles.mts` and `dk-diner-presentation-check.mts`. Run the existing art/room/acting/picking `.mjs` checks directly with Node and a 768 MB heap. Do not pass `--render` to legacy rendering scripts unless their output location has been verified on D:.

Development-only UI fixture: `/chef/diner-preview/mobile-review`. It uses a disposable zero-address save, with starter home, truck and shared-preparation controls. It is disabled in production.

## Remaining release acceptance

- Observe five new players; at least four should finish without outside instruction and identify a next goal.
- Test physical Android Chrome/Brave and iOS Safari, including orientation, interrupted holds and safe areas.
- Measure sustained 30 FPS on a representative midrange phone and 60 FPS on the development desktop. Browser-width emulation is not this evidence.
- Run the complete randomized renovation economy for both stages, with ingredient discovery, purchases, helper choices and retries.
- Complete populated diner/restaurant visual review and adversarial rehearsal combinations before broad rollout.
