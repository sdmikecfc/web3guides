# New places, new crowds, bigger batches

Implementation and local verification: September 23, 2026. Source stays in the active diner-preview application; generated output and build workspaces stay on D:. Production remains exclusively the owner's own `vercel --prod`.

## Implemented

- Five destinations: Downtown → Music Festival → Business Center → Boardwalk → Night Market. Eight real services, scheduled markets after three/six, explicit next-destination travel, and independent truck rewards through tier four. Versioned definitions carry environment, customer pool, discovery pool, unlock, rewards and optional seasonal dates.
- Old saves retain route/truck access and qualifying Boardwalk renovation credit. Active runs keep saved services and legacy finale rewards. New restaurant progression uses Business Center. Existing wealth, mastery, furnishings and layouts remain owned.
- First Downtown market guarantees missing fries (140), fryer (160) and included boxes through rerolls. The actual first-three-service route fixture can afford them. Fries practice returns to exactly the same market after cancel, completion and reload; it never awards progress or changes the real menu.
- Finite boiler batches: one/two/three simultaneous pots with two/three/four portions. Mixed pots have individual selection, manual noodle draining, conserved identities and inherited warmth. Tomato and mushroom soups bring the cookbook to 32 dishes, with bowl-before-ladling and physical toppings.
- Festival environment, original stage/tents/bunting, party outfits and restrained dancing; business plaza and office guests. Community identities use the canonical 100-handle roster. Reduced motion suppresses dancing.
- Festival premium (35%), bounded seeded messes (15%, maximum four, minimum 15 seconds apart), three-second interrupted/resumable mopping and closing cleanup. Business guests walk 25% faster, eat 30% faster, have 20% less patience, choose expensive dishes with diversity and have a 22% base tip rate.
- Customers panel supports 0–100% proportions, ownership checks, an even mix and future-arrival application. Named regulars stay independent. When these audiences are used, live and offline settlement run the same physical staff/customer/bathroom/cleanup simulation. Existing earnings settle before mix changes.
- Trip boosts have exact descriptions and trip duration, exclude unsupported/duplicate effects, and appear on map/service briefings. Discovered roadside encounters retain their actual names.
- Mobile batch selection remains accessible; preparation controls and the four-button home dock fit phone widths. The advanced boiler can load another batch while two finished pots are waiting.
- Dedicated Domain Kitchen Open Graph/Twitter metadata, canonical domain, truck icon and a public 1200×630 illustrated PNG. No wallet, external image/font request or game boot is required to generate a link preview. Main Web3Guides metadata is unchanged.

## Automated evidence

| Check | Result |
|---|---|
| New-route early pacing | 100 seeds × three early services × two routes: **600/600** clear with a prepared burger cook, actual movement/cleanup and one-second decisions |
| Complete route chain | All five routes × eight actual services; rewards/unlocks remain unique; later legacy routes use explicitly advanced gear and the existing cosy mode |
| Physical recipes | All 32 dishes cooked and served; shared preparation, selected-menu assembly, finite portions, bowls, warmth and heat lamps checked |
| Boiler/cleanup regression | Mixed soup pots, exact chosen portion, loading the third pot beside ready batches, four-mess cap, interrupted cleaning and checkpoint reload pass |
| Audience settlement | Locals/party/business/mixed ownership, actual income deltas, persistent maintenance, active regular visits, and offline protection pass |
| Compatibility | Legacy route/service checks, renovation receipts, preservation of ownership and stage continuity pass |
| Sharing | Actual crawler-style HTTP requests for apex and www return Kitchen metadata; public PNG returns 200 and validates at 1200×630 |
| Build | The reported `held?.kind` TypeScript failure is repaired. Full combined local production build passes, including lint/types and 259 static pages. The sharing image is prerendered. Existing optional logging/dependency warnings and unrelated season-data read warnings remain nonfatal. |

Relevant commands use `scripts/dk-check-runner.cjs` with the destination, audience-batches, route-chain, shared-prep, renovation, stage-continuity, legacy-service, and sharing checks. No test reads a real player's wallet save. Browser fixtures use the disposable all-zero review wallet.

## Balance calibration and its limits

The new mixed-menu samples use actual movement/cooking/serving/washing, level-three recipes, tier-two appliances and a tier-three boiler for the three-batch menu, with one-second decisions:

| Menu | Festival minutes / coins | Business minutes / coins |
|---|---:|---:|
| Burger + fries | 6.57 / 563 | 6.64 / 522 |
| Two soups | 6.72 / 733 | 6.51 / 657 |
| Pesto pasta + vegetable ramen + tomato soup | 7.37 / 1,212 | 7.19 / 1,051 |

All six clear their 14 guests without misses. Repeating this measured stream for seven active hours gives identical results for **14×30 minutes**, **7×60 minutes**, and continuous play: 61 clears, 45,543 truck coins after a 2,400-coin optional-purchase allowance, and 13 eligible complete ingredient sets. There is no session-length credit advantage. From zero, that covers the first renovation's nine ingredient sets; the full restaurant's 22 sets need later achievements or ordinary ingredients.

The mean is 6.83 cooking minutes per service. Both major renovation service contributions are now **60 verified clears** (the second counts since the diner renovation), approximately 6.83 sampled cooking hours before setup/shopping. Coin contributions remain 25,000/60,000, with mastery, difficulty, actually-served variety and route accomplishments still required. Introductory lunches remain capped. Earlier 70/100-clear estimates in the ten-improvement notes are superseded by this calibration.

New-route queue/seated baselines were calibrated to 180/150 seconds before customer traits; business retains its 20% patience penalty and feasibility floor. Initial schedules use fixed seeded rush/recovery windows plus declared menu workload. This does not adapt to a player's performance. Full queues defer admission without catch-up bursts.

These are **measured workload samples and an extrapolated session comparison**, not an entire randomized human campaign. Owned equipment/mastery are fixture assumptions; recipe discovery, shopping choices, upgrade timing, home income, bonuses and human retries are not all simulated together. End-to-end six-to-eight-hour renovation timing still requires campaign playtesting. Do not describe it as certified.

## Review and external gates

Reviewed the business preparation view at 360×640, festival at 390×844, and the Customers panel/dock at 390×844, including scroll reachability, even mix and confirmed persistence. At 390×844, physically loaded two soup pots, fetched a bowl and selected the second pot; only the mushroom batch lost a portion and the correct soup was carried. Pot names remain readable beside their individual Ladle actions. Desktop rendering, scene controls and source dependencies have also been checked locally. Replaced speckled variance shadows with filtered depth shadows; the corrected festival was visually checked on desktop and at phone width. These checks are layout/browser evidence only.

Still required before accepting the entire two-plan programme:

- Physical Android Chrome/Brave and iOS Safari interaction, safe areas/orientation and wallet flow.
- Sustained populated-scene 30 FPS phone / 60 FPS development-desktop measurements on named hardware. Browser width is not device performance evidence.
- Five first-time players, at least four completing the first service and identifying their next goal without help.
- Complete mixed-menu renovation campaigns measuring discovery, ingredient shortages, discretionary purchases and the last blocking requirement.

## Local artifacts / recovery

- Isolated build: `D:/Temp/domain-kitchen-routes-build-20260923`.
- Separate copied build dependencies: `D:/Temp/domain-kitchen-routes-deps-20260923/node_modules` (outside disposable output).
- Final build log: `D:/Temp/domain-kitchen-routes-final-build.log`.
- Sharing-card proof: `D:/Temp/domain-kitchen-share-preview.png`.
- Preview output junction: `.next-dk-mobile-review` → `D:/Temp/domain-kitchen-mobile-next`; source node_modules remains an ordinary, intact directory. No dependency link exists inside the Next output folder.

No paid generation, production deployment or dependency deletion was performed. Git changes are repository changes only. Existing social platforms may keep an older cached preview until they fetch the new deployment.
