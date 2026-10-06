# Restaurant and cooking loop reset

## Implemented locally

The restaurant keeps Food truck, Decorate, Menu & recipes and People. Goals is optional. Truck goals, recipe upgrading, helper promotions, readiness scores, rush banners and the choice-card feed have been removed. Recipe upgrades and the daily ingredient shop require being at home.

Truck preparation is one remembered setup: Menu, Equipment, Layout, Help, then Prep food or Open for lunch. Today's dishes remain visible and open the matching instructions. Loading required equipment previews owned pieces without buying or replacing valid placements. Layout rehearsal is optional inside the layout tools. All four collapsed setup summaries fit together at 360px; expanded sections scroll independently. Missing-equipment errors stay beside the start buttons. Loadout confirmation replaces the long equipment list until accepted or cancelled. The first-market fries offers come first, name the free potatoes and boxes, and offer direct menu selection.

New map-version-six trips have committed two/three-stop corridors and eight lunches on every path. The first Downtown market stays guaranteed; later markets can be missed. Old maps remain saved. Mystery types and unreached stock remain hidden.

New services use independent round helpers, 20% each of food plus tips. Bonuses are excluded. Preparation locks staffing. Cumulative accounting handles reload, failure, early exit and banking. Pause offers an explicit confirmed early exit under the existing half-haul rule. Existing service rules are preserved.

Demand-version-one services use seeded 12–18-second eating, usable-seat fallback and grouped finales. Party quotas guarantee an early Festival guest. No demand adjustment depends on player success or seating purchases.

Decorate exposes Furniture, Build, Finishes and Storage. Real wall/counter/ceiling picking retains invalid previews on the chosen surface, reserves built-in signs/windows, outlines drafts and requires a visible valid preview. Find in room, placement undo/redo, structure undo/redo and confirmed placed-item sales are available. Attached ornaments return to storage on sale. New-sale browsing is focused on coordinated room-building pieces; unfinished ornaments retain their IDs, prices and existing ownership in Storage.

The public furniture pass includes framed counters and corners, upholstered booth backs, substantial plants and a pleated brass floor lamp. Three furnished room fixtures use the gameplay assets and placement validation. Remaining ornament and collectible art is not represented as release-ready.

Festival scenery has connected paths, stalls, picnic pockets, tents and a stage crowd. Background people have articulated limbs and follow travel direction; dancers remain planted. Other destinations share articulated background movement. Panning reveals scenery, and Back to truck resets the view. Portrait cooking is framed closer; landscape separates camera and work controls. No new scenery audio.

## Local verification (2026-09-25)

- 100 map seeds: every path has eight services, the guaranteed first market, meaningful committed corridors and a reachable finale.
- 100 third-service seeds with real movement/cooking/washing and one-second decisions: 100 completed (729/800 guests served).
- 100 upgraded compact solo finale seeds: 94 completed, 1,989/2,200 served. All 100 had multiple unserved orders and repeated three-occupied-seat rushes. Ready-food waiting measured 0.45% of total simulation time.
- 600 new-version branch seeds using equivalent upgraded four-seat loadouts: prepared and reactive slow/medium/busy profiles all completed. Prepared rush earnings per active minute were 1.248 times relaxed earnings; reactive ratio approximately 1.230. Preparation and clearing time included.
- 1,200 additional comparisons vary burger-only/mixed menus, preparation and 0/1/2 helpers. These deliberately expose layout effects: the longer tier-two burger-only solo layout completed 39% of prepared seeds, while its mixed menu completed 98%; helpers completed 100%. These results do not imply every valid layout is efficient.
- Three furnished room benchmarks remain valid and served seven meals each in a five-minute live-routing simulation.
- Atomic placed-counter sale, child storage, save reload, wrong-target rejection and duplicate sale rejection pass.
- Surface picking, wage retries/reload/failure/early exit, owned-only loadout previews and inaccessible-first-seat fallback pass.
- Scenery checks cover all five destinations, four camera orientations and three quality levels. Additional scenery budgets: low at most 21 draw calls / 30,540 triangles; medium 26 / 49,948; high 31 / 59,524.
- The 29-script simulation regression sweep passed, including the updated home-only upgrade expectations. The separate 12-group cooking-guide/rally UI suite also passed; its old expectations for truck upgrade links were replaced with assertions that those links are absent.
- TypeScript checking and the final isolated production build passed (exit 0; 266 static pages). Final build log: `D:\Temp\dk-loop-reset-delivery-build-20260925.log`. The build retains existing non-fatal optional `pino-pretty` and unrelated season-data warnings; no build checks were disabled.
- Browser review has covered 360×640, 390×844 and landscape controls, actual wall placement, blocked menu-board placement, confirmation, undo/redo, Find in room, populated Festival seats and scenery panning/reset. The first-market walkthrough bought both fries parts for 300 coins, selected fries, previewed and loaded the owned equipment, obtained free pantry potatoes and cooked a basket. Delays while inspecting the browser burnt the manual test basket; portion conservation and successful serving are covered by the physical-cooking and batch regression suites. The phone-sized confirmation, selected-map action, and landscape camera/work controls were inspected visually. All three furnished room benchmarks were reviewed; the latest restaurant palm was also checked in-room. This is layout testing, not phone-device performance certification.

## Economy bounds and remaining review

The measured new-rule upgraded solo profiles imply approximately 6.59 / 6.36 / 6.80 active cooking hours for 60 relaxed / steady / busy clears, respectively. Corresponding gross service earnings including clear bonuses are approximately 22,378 / 23,608 / 28,799 coins, before market/decorating purchases. Wages are deducted in the separate 0/1/2-helper comparison and receipt checks. These figures explain the service-count pacing; they do not certify the complete renovation economy.

The public catalogue is deliberately restricted to the current room-building collection. Existing owners retain unfinished ornaments in Storage. Human art approval and a full remaining-ornament remaster have not been claimed.

## Explicitly outstanding acceptance

Five unfamiliar players have not been observed. Actual Android Chrome/Brave and iOS Safari testing and sustained populated-device 30/60 FPS measurements have not been performed. Browser width and a short development FPS sample do not satisfy these gates.

The complete renovation campaign including randomized purchases, dish discovery, mastery timing and discretionary decorating still needs end-to-end economy validation; measured service-time bounds are not a complete player campaign.

Packs remain private. All generated output stays on D:. Source dependencies and unrelated changes are preserved. No production deployment has been performed. Only the user runs `vercel --prod`.

## Follow-up fixes (2026-09-25)

- Starter trucks now allow three explicitly selected dishes; menu capacities are 3/3/4/4. Recipes and equipment must still be owned, and active-service menus remain unchanged. All seven capacity/save-migration groups pass.
- Preparation uses four compact cards. Kitchen help describes the actual service snapshot, with named legacy helpers or the new percentage wage; unavailable hiring explains when it becomes available.
- Holding-counter contents now open as labelled item buttons in the bottom action area. The previous 190px information card clipped its choices on phones; a mixed counter required choosing an item there instead of picking one automatically. Each new button requests the exact stored object. Hands-full feedback, put-down and close controls stay explicit.
- Fourteen cooking/UI regression groups and ten holding-counter groups pass, including all three counter tiers, exact second-slot pickup after reload, finite vessels, dirty dishes, warmth and duplicate requests. Browser controls verified pickup/put-down of both slots at 360×640, 667×375 and 1280×800, including direct scene taps. These are browser layout checks, not physical-device testing.
- Latest isolated production build passed (exit 0), including these follow-ups and its lint/type checks: `D:\Temp\dk-counter-release-build-20260925.log`. A missing runtime file in the isolated dependency copy was restored from the intact source dependencies before building. No source dependencies were removed and nothing was deployed.

## Serving containers follow-up (2026-09-25)

- Clearing a used fries or cheese-fries carton now puts that exact carton in the player's hand for the bin. Clear-and-wash helpers take cartons to the bin too; cartons cannot enter the sink or replenish reusable vessel stock. Plates, cups and bowls still need washing, including legacy fries served on plates.
- Finished food can collect its vessel directly from its supply. The original vessel-first workflow and combining food with a clean vessel at prep still work. A raised plain-fries portion can be boxed when fries are on the selected menu; cheese-only menus still require their topping. Wrong vessels, depleted racks and unfinished food cannot bypass preparation or create plates. Plating preserves warmth.
- Updated interaction cues, held-item text, coaching and recipe instructions. The development-only mobile review has a **Food first · plate second** fixture, constructed through cooking commands in the disposable test save.
- Eight new serving-container regression groups pass, alongside physical cooking (8), exact table service (4), holding counters (10), controls (12), cooking/rally UI (14), service simulation (19), shared-preparation cooking for all 32 recipes, and audience/batch regressions. Browser controls at 360×640 verified burger → plate rack and fries portion → box supply. This is not physical-device testing.
- These container changes were checked with TypeScript and the local development renderer; the isolated production build referenced above predates them. Production remains the user's own `vercel --prod`.
