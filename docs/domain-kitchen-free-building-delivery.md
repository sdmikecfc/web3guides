# Build your own restaurant — delivery checkpoint

Updated 26 September 2026. Source remains in the existing checkout; generated work, screenshots, preview cache and production-build output are on D:. Production remains exclusively the owner's `vercel --prod`. No deployment, Git commit or push was performed. Packs remain private.

## Implemented locally

### Editor review follow-up (26 September)

- Rehearsal and Apply now use the same priced room command and preview inventory. A purchased table can be confirmed from rehearsal; this was also reproduced in the browser (720 coins deducted once).
- Chair editing retains its exact table/seat identity, highlights only the selected chair, names it and offers a return to its table. Chairs remain part of their table set; the nonfunctional individual Store action was removed.
- The editor uses one navigation row, an inline selection card and a single scrolling content area. At 360×640 with large controls enabled, measured content height increased from 56 to 138 pixels without reducing the room viewport. Tools replace the content area rather than adding a second cramped scrolling strip. Category/selection changes reset scrolling.
- Build choices have visual symbols; fixtures and stored pieces use the actual model thumbnails, prices and brief purpose labels. Stored furnishings remain usable when an additional purchase would exceed ownership limits.
- Floor/wall finishes, counter fronts, worktops, seats and signs preview within Finishes. Purchases, undo and confirmation share the room draft and total; cancelling grants/spends nothing. Named designs are available directly in Storage → Saved rooms, with preview/save/replace and owned-finish restoration. Unpaid previews can be kept as unfinished drafts but cannot grant ownership through named saves.
- `dk-diner-editor-review-check.mts` passes purchase/rehearsal parity, finish/cart persistence, once-only spending, malformed finish rejection, saved designs and exact chair movement. Free-room and room-design regression checks also pass.
- Browser interaction verified at 360×640 and 390×844; landscape 667×375 has 188 pixels of editor content with no horizontal overflow. Desktop reviewed at 1280×800. These are browser layout checks, not physical-device performance tests.
- The final isolated Next.js production build, including type checking and the category-scroll fix, exited 0. Source Next.js and TypeScript dependencies remain intact. Evidence: `D:/Temp/domain-kitchen-editor-improved-mobile-20260926.png` and `D:/Temp/domain-kitchen-editor-improved-desktop-20260926.png`. Release-check log: `D:/Temp/dk-editor-review-release-check-20260926.log`.

- Table clicks can walk without queuing a later interaction. Exact seats and held food remain intact.
- Upward circular truck map; version-seven three-corridor generation, local forks and committed paths. Legacy runs keep their saved graphs. Eight services and the first Downtown fries market are preserved.
- Frozen, persisted roadside gifts: forecast-based coins and eligible permanent recipes/equipment/upgrades, necessary supplies and once-only claims. No gacha items or automatic menu additions.
- RoomPlan v2 surfaces, structural edges, entrances, exact chair positions, service assignments and shared physical navigation. The three legacy starters retain their starting possessions and positions.
- Decorate opens the room editor directly: Furniture, Build, Finishes and Storage. Wall drawing supports drag or two taps; floors support tiles/rectangles; doors, windows, screens, partitions and the entrance can be edited. Isometric and overhead views share the same layout.
- Furniture, counter and bathroom-fixture previews include an authoritative purchase total. Applying purchases and the validated layout is atomic. Removing previews trims the cart; cancelling changes neither ownership nor coins. Stool previews use the existing prices and owned inventory.
- Selected items have visible outlines. Mounted pieces use actual compatible surfaces; groups carry attached decorations. Removing supports stores owned attachments. Menu/name/window reservations remain enforced after converting the starter shell into editable edges.
- Undo/redo, unfinished saved drafts, owned-piece starter restoration and renovation choice between retaining the layout or using the new starter are integrated. Existing saved arrangements and finish-purchase tools remain available through the editor's tools.
- Waiter, customer pickup and chef-side service operate in the same simulation. Cooks can handle ordering, washing, clearing and messes without a waiter. Staff shifts use hired identities; zero-server shifts require compatible seating.
- Disposable food boxes are discarded, never washed. Opposing customers yield on narrow paths; busy or inaccessible work must not stall unrelated reachable work.
- Applying a new layout holds arrivals while accepted meals and cleanup finish in the old world, including across reloads. Quiet preview does not alter that work, fixtures or earnings.
- Starter counter colours, signs, wood floors and terrazzo survive conversion to editable construction. Per-area finishes use the same scene materials. Pickup seating shows its counter connection while selected.

## Local checks passed

- `dk-diner-open-road-check.mts`: 1,000 route seeds and 1,000 gift samples; eight services, reachable finale, branch differences, first-market guarantee, frozen/reloaded gifts and duplicate claims. Discovery samples: 603/1,000 (248 recipes, 225 equipment, 130 upgrades). Movement-only table clicks checked in all rotations.
- `dk-diner-free-room-check.mts`: atomic purchases, insufficient funds, duplicate submissions, unfinished drafts, ownership/hydration, attached-preview removal, server-free shifts, three starter migrations, central island, pickup cafe, U-shaped chef counters, enclosed kitchen/pass, courtyard, pending-layout reload and keep-layout renovation.
- `dk-diner-free-room-dishes-check.mts`: all 32 dishes across waiter/pickup/chef-side arrangements, mid-service reload, food uniqueness and disposable boxes. Mixed-service 30-meal fixture includes multiple preparation and washing stations. Ordering works with a cashier or a cook.
- Existing room editor/design, home traffic, home simulation and all 16 renovation/career regression groups passed.
- `dk-diner-room-art-check.mjs`: 94 fixture/table rotations, door geometry, seat and food contacts, non-intercepting previews, cutaways and retained editable-room finishes. The test loader now handles the shared pure layout-module cycle without emitting files.
- Full TypeScript checks and isolated Next.js production builds passed. Final build exited 0 after all runtime changes: `D:/Temp/dk-free-building-release-check-20260926.log`. A later revision needs its own verification.
- Browser fixture review at 360x640, 390x844, 667x375 and 1280x800: direct editor entry, furniture preview/removal, visible total, two-tap partition, undo/redo and application. No browser console errors were observed in these checks. This is layout emulation, not physical-device performance evidence.

## Measured economy scope

`dk-diner-free-room-economy.mts` compares the same level-three burger, tier-one equipment and two seats over one simulated hour. Continuous simulation and twelve chunks with a reload produce identical worlds, including income and cleanup. Food earns exactly the normal recipe price in every style.

| Demand setting | Service | Staff | Meals | Food income | Tips |
|---|---|---:|---:|---:|---:|
| 90 | Waiter | 2 | 72 | 2,376 | 288 |
| 90 | Pickup | 1 | 72 | 2,376 | 288 |
| 90 | Chef-side | 1 | 72 | 2,376 | 288 |
| 240 | Waiter | 2 | 160 | 5,280 | 640 |
| 240 | Pickup | 1 | 116 | 3,828 | 464 |
| 240 | Chef-side | 1 | 164 | 5,412 | 656 |

These are specific layout comparisons, not promised player earnings or proof of the six-to-eight-hour renovation target. Full campaign measurement including stronger gifts, discretionary purchases, recipe discovery and renovation gates remains outstanding.

## Placement review follow-up · 26 September

- `Find in room` and placement-error `Show` frame the exact object, including individual chairs, in 3D and overhead views. Editing preserves the chosen camera position instead of resetting it whenever room geometry rebuilds.
- The editor and layout validator now share one problem report containing the message, object/seat identity and affected cells. Blocked cells get a red marker and an X; the selected problem object gets a red outline. Apply remains disabled until the operating layout is valid.
- New fixtures search all four orientations. When another unfinished edit prevents the room from validating, the preview still starts at a low-overlap position inside the plot instead of dropping onto occupied tile zero.
- Counter labels distinguish stool spaces from purchased stools. Unpurchased fixtures say `Remove preview`; removing them removes their quoted cost without spending coins. Local scrollbar colours replace the site's dark scrollbar in editor instructions.
- Passed: full source TypeScript check; placement-feedback regression (exact overlap/chair/work/entrance targets, alternate fixture orientation, invalid-draft fallback, immutability and duplicate identity); existing editor review, free-room and three-stage room-design regressions.
- Browser review used the disposable development fixture: 390px and 360px frames, 3D/overhead selection, blocked grill feedback, Show, Undo, counter preview and removal. Browser viewport control timed out, so the existing review page's size controls provided the responsive checks. These are browser layout checks, not physical-device results.
- Screenshot: `D:/Temp/domain-kitchen-placement-mobile-20260926.png` (360×640 fixture).
- Final isolated Next.js production build passed with exit code 0. Log: `D:/Temp/dk-editor-placement-release-check-20260926.log`. Source Next.js, TypeScript and Three.js dependencies remain present; no deployment was run.

## Acceptance still outstanding

- Physical Android Chrome/Brave and iOS Safari interaction; sustained populated 30-FPS phone and 60-FPS development-desktop measurements.
- Five unfamiliar-player observations, including building a partition, changing seating service and making the next map choice without instruction.
- Complete populated visual review of all three editable restaurant styles, every finish/mount combination and player-made layouts; geometry checks alone do not establish art approval.
- Full renovation campaign economy, including gifts and optional decoration spending.
- Broader adversarial mixed-room stress cases beyond the completed fixtures: multiple simultaneous pickup/return points, unusual doorway arrangements and crowded long-running services.

Do not describe the entire plan's acceptance gates as complete. Use the remaining items above as the next work queue; preserve completed implementation and tests across interruptions.

## Build and preview notes

Preview: `http://127.0.0.1:3010/chef/diner-preview/mobile-review?frame=1&room=1`, using a disposable development save. Cache junction `.next-dk-mobile-review` points to `D:/Temp/domain-kitchen-mobile-next`; source dependencies remain intact.

Build workspace: `D:/Temp/domain-kitchen-routes-build-20260923`. Dependencies are outside output at `D:/Temp/domain-kitchen-routes-deps-20260923/node_modules`; there are no dependency links inside `.next-routes`. Missing files in this isolated dependency copy were restored by copying the working installation; source dependencies were not deleted or replaced.

Non-fatal build messages include the existing optional WalletConnect `pino-pretty` warning, old Browserslist data and unrelated site API/static-data diagnostics. Do not mistake these for a failed compiler when the build exits zero.

Saved visual evidence: D:/Temp/domain-kitchen-free-building-mobile-20260926.png and D:/Temp/domain-kitchen-free-building-desktop-20260926.png. Browser viewport override was reset after review.
