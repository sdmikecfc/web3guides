# Restaurant stages and earned renovations

This pass extends only the separate diner preview. It changes neither the legacy Domain Kitchen namespace nor its saves. No database migration or deployment was performed; diner state continues to use the existing canonical JSON checkpoint and command receipt transaction.

## Rooms and ownership

New diners start in a 10 × 8 burger shop: chef, waiter and cashier; a display counter and lift gate; a three-stool console; one toilet and one handwashing sink, with two reserved bays for each fixture kind. The next plans are a 12 × 10 diner with a six-stool chef bar and the cashier converted to a second waiter, then a 14 × 12 restaurant with three included two-seat tables and four bathroom bays.

Existing square rooms remain exactly arranged as saved. Canonical server loads add missing career and palette defaults without changing the revision, clock, active truck service or stored record. The next successful command persists these defaults through the usual compare-and-swap transaction. Missing career metadata starts at zero. Old coins, recipe levels, route wins and stamps do not become invented service receipts. A legacy owner may explicitly preview and confirm the included burger-shop plan; loading a save never performs this conversion.

`getRenovationPreview` returns the proposed plan, furnishings, staff, included copies, retained storage, current room and confirmation token. `renovateHome` requires that token and checks the current gates again. It first settles the old restaurant, then charges once, saves its room snapshot and installs the plan atomically. Owned furniture, decorations, recipes, finishes and coins already earned remain. Extra hired staff stay active; blueprint crew counts are minima, with a cashier converted to a waiter when the diner opens. Displaced pieces enter storage through existing ownership counts. Included restaurant tables are granted once, even after restoring an earlier room and renovating again.

`restoreRenovation` restores a saved arrangement and dimensions; it does not refund a renovation, reverse career progress, duplicate included furniture or restore old bathroom condition. Up to three room snapshots are retained. Named favourite layouts retain their original room context so a later renovation cannot invalidate the whole save; applying one still checks the current room and cannot change its stage. Floor and wall finishes keep their existing purchase receipts. Counter, worktop, upholstery and sign colours have independent permanent ownership through `buyRoomFinish` / `setRoomFinish`.

Room editing submits `homeRoomPlan {roomPlan, layout?}`. Modules must have owned stable IDs and the same kinds. Furniture quantities, role-aware routes, wall/counter mounting anchors and occupied slots are validated together. Buying a toilet or handwashing sink creates a stored fixture; the current stage caps the owned count to its reserved bathroom capacity. Placement never invents a new fixture or condition receipt. The final restaurant may also own one optional six-seat chef bar: its earlier diner bar remains in storage; an account without one can buy it for 3,000 coins. Buying never places it automatically.

## Career gates

Completed normal truck services create a receipt keyed by run and map node. Actual customers with a served tick provide recipe counts and multi-dish evidence. Practice, rally and failed/unfinished service do not create completion credit. UUID/revision replay protection remains in the existing authority layer. Repeating `finishService` cannot record the departed node again.

| Renovation | Price | Service requirements | Recipe and route requirements |
| --- | ---: | --- | --- |
| Burger shop → diner | 25,000 coins | 100 qualifying services; 12 medium-or-harder; 4 serving at least two different recipes | 3 recipes at level 3+, Downtown finale won |
| Diner → restaurant | 60,000 coins | 100 additional qualifying services after opening the diner; 18 busy-or-harder; 6 serving at least three different recipes | 6 recipes at level 3+, including 2 at level 5+; Boardwalk finale won |

Only twelve introductory slow lunches—the first two rows of a trip—count toward each stage's service total. Actual historical totals remain visible and unchanged. Difficulty and multi-recipe counts are taken from completed service receipts, not submitted client counters. Restaurant-stage requirements subtract the career counters saved when the diner renovation was first confirmed.

Finite ingredient milestones occur at 3, 10, 24, 45, 70, 100, 140, 180 and 200 actual completed services. They award respectively 2, 3, 4, 4, 5, 5, 5, 5 and 5 complete ingredient sets for an explicitly chosen owned recipe below level 10. Every milestone has one permanent claim receipt. These finite achievements do not consume or increase the renewable seven-unit daily allowance. Before 200 clears, 33 full chosen-recipe sets are available; reaching six level-3 dishes with two at level 5 from zero requires 22 sets if allocated for those goals. Recipe discovery and sensible allocation still matter. There is no token reward or financial payout.

## Bathroom settlement

Fixture ownership stores condition independently of layout. The engine routes actual bathroom visits and reports per-fixture hourly use. A toilet loses 0.5 condition per use; handwashing loses 0.25. At condition 20 or below the fixture is unavailable. Live simulation and authoritative settlement use these same policies. Hourly rate measurement freezes wear while counting real routed use; settlement advances condition to the next threshold, then measures the changed room. Its cache keys only the functional condition band, not every fractional wear value.

Offline settlement retains the existing 60% service multiplier and eight-hour bank limit; both output and use are multiplied consistently. Moving, storing, replacing a submitted module's condition, or restoring an old room cannot repair it. Cleaning a working fixture is free; a depleted fixture requires the explicit 75-coin repair. Both target a placed, owned bathroom fixture. An already healthy fixture cannot be claimed repeatedly for rewards; these actions grant no rewards at all.

## Measured pacing and limits

`scripts/dk-diner-career-pacing.mts` runs legal shared-engine inputs with tier-two equipment, no helpers and burger/fries/lemonade. On the current seeded fixtures:

| Actual completed sample | Guests served | Missed | Service time |
| --- | ---: | ---: | ---: |
| Normal slow preset | 8 | 0 | 2.98 minutes |
| Normal medium preset | 14 | 0 | 3.85 minutes |

The former sixty-service proposal would represent about 3.85 hours at the measured medium rate. The configured hundred-service requirement represents **6.42 hours of medium-equivalent cooking**, before map stops, setup, retries, discovery or mastery. A **seven-hour planning scenario** can be split into fourteen 30-minute visits, seven 60-minute visits, or one continuous session. Session length does not change credit, and paused time does not count as cooking. Those are extrapolations, not completed campaign measurements or a novice benchmark.

Busy and finale mixed-menu driver samples were incomplete after a waiting customer left while the driver finished cooking. They are not claimed as passed pacing samples. First-time players, efficient players, different menus, helpers and higher equipment tiers still need full-campaign playtests before a six-to-eight-hour completion claim is justified.

## Observed checks

The new renovation/career suite passes sixteen groups: fresh and legacy rooms, preview/confirmation, ownership/storage and undo, one-time table grants, forged modules and condition retention, finite ingredient claims, introductory caps, actual served-recipe receipts, palette ownership/public payloads, partitioned offline wear, atomic room/mount editing, authority rejection/replay, additive canonical-load migration and cashier capacity/role preservation and saved favourite layouts across renovation and optional bar ownership. Existing progression (22), authority (10), finishes (8), routes (6) and social (9) suites pass. The focused career TypeScript check passes. Presentation, real devices, live SQL concurrency and production authentication are separate checks.

Run locally with `node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-renovation-check.mts` and the same runner for `dk-diner-career-pacing.mts`. This runner transpiles TypeScript; it does not replace the separate type check.
