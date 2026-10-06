# Three worlds worth collecting: delivery record

Current phase: all 72 private collectible studies authored; domain gameplay implemented and locally release-checked. This file is a continuation record, not release approval. The October 6 entry supersedes earlier remaining-work lists.

## Current direction, September 30

The user approved the revised benchmark and authorized expansion at that standard. **A complete domain restaurant now requires discovering all 24 distinct collectibles for that domain at least once across its Regular and Super packs.** This supersedes the earlier journey-finale restaurant reward everywhere below. Duplicate pulls do not fill another slot. Redeeming, selling or transferring a legitimately opened NFT does not remove discovery credit. Ownership reconciliation still removes a sold NFT's placed visual.

The implementation derives progress from canonical finalized opening history, across seasons of catalogue v3. Pending requests, samples, invalid/refunded openings and other wallets/domains do not count. A legitimate redemption is not an opening refund: the future indexer must retain its original opening record. The room grant checks actual history and uses a stable once-only collection receipt. Existing earned rooms and possessions are preserved. Journeys retain their separate cooking badge, recipes, equipment and milestone décor.

These functions are locally tested. They are **not a live wallet-history/indexing service**; developer settlement integration is still required before account unlocks can launch.

New art batches: nine additional Regular Commons and nine Super Commons, bringing the local model inventory to **27 of 72**. The remaining **45** are still concepts, not finished assets. The eighteen new pieces have original editable Blender sources, GLBs, provenance and individual validation receipts in `D:/Doma/DomainKitchenAssets/three-worlds-v1/common-set-v1` and `super-common-v1`. They remain private review assets; technical validation is not the user's visual approval.

### September 30 batch and verification

- Gochujang: Pepper Lantern Trio, Mandu Mountain and Seoul Spice Cabinet.
- Smoothie: Papaya Conservatory, Citrus Solar Mobile and Fruit Market Cruiser.
- Wines: The Cork Garden, Harvest Moon Lamp and The Tasting Library.
- Super Commons: Captain of the Night Shift, Cloud Mandu Steamer, Pepper Soda Works, Pineapple Cabana, Berry Glasshouse Fridge, Coconut Espresso Club, The Limestone Hearth, After-Dinner Espresso and The Vineyard Cooler.
- In-room visual review caught and corrected hidden cabinet jars, obscured dumplings/terrace vines and tricycle wheel clearance. The tricycle's movement is now attached fabric, with no invisible vendor or self-operating hand crank.
- The second batch's review corrected obscured soda taps, floating boiler/cooler supports, and the fruit fridge's glass roof. Equipment effects run only while working; the host's small head movement leaves its feet planted.
- Final in-room refinements replaced the cooler's blank front with a recessed bottle display and oak cask fittings. The berry fridge has glazed sides and a connected, solid-thickness glass canopy. Final exports and all nine validation receipts were regenerated from the retained source; updated captures are in the D: review directory.
- Every new GLB passes all eight local asset checks: valid geometry, normals, UVs, dimensions and the 75k triangle/24 material limits. Actual range: 3,084–59,128 triangles, 5–17 materials. These are local review models, not performance-approved production assets.
- `dk-domain-common-set-check.mjs` checks all eighteen new models over 60 seconds of actual runtime animation, fixed supports, attached moving geometry, bounded placement envelopes, idle/working effects and reduced-motion rest poses.
- `dk-domain-discoveries-check.mts` passes for all three domains: missing items, repeated pulls, combined domain history, wrong wallets, samples, pending/refunded/invalid evidence, season carryover, reload and idempotent grants.
- `dk-domain-room-kits-check.mts` passes all nine working layouts and ownership/backup checks. Seven existing domain foundation checks, including 60,000 catalogue tickets, pass.
- Desktop close-ups reviewed for all eighteen. Representative 390×844 and 360×640 browser layouts reviewed with no horizontal overflow; visible action controls are at least 44px. Actual phone performance and participant testing remain outstanding.
- Isolated production build passed, including type checks: `D:/Temp/dk-domain-collection-expansion-build.log`. No deployment occurred.
- Final eighteen-piece build also passed: `D:/Temp/dk-domain-expanded-commons-build-retry.log`. The first final-build attempt exhausted local memory; pausing only the Kitchen preview and limiting the isolated build to two workers resolved it. The source deployment configuration was not changed.

## September 30: C: storage incident and in-progress Uncommons

The user reported zero free bytes on C:. Current process TEMP/TMP and the active `.next-dk-mobile-review` junction point to D:. Older inactive Kitchen build directories remained on C:. Twelve verified, link-free cache/snapshot targets were moved into `D:/Temp/domain-kitchen-recovered-c-cache-20260930`, with file counts and byte totals checked before and after. The archive's `move-manifest.json` records the exact moves. Source dependencies, Git, player saves, active previews and other projects were preserved. C: recovered 6.18 GiB immediately; the latest reading is 5.20 GiB. Windows' `C:/pagefile.sys` grew from 8,599,694,336 to 9,628,127,232 bytes during the turn, independently of D: asset storage. No paging settings were changed. Avoid concurrent heavy jobs; a new full production build was not run during this storage investigation.

Twelve Regular Uncommon models have been authored in `scripts/dk-build-domain-uncommon-set.py` and exported to `D:/Doma/DomainKitchenAssets/three-worlds-v1/uncommon-set-v1`. This brings built geometry to 39/72, but this batch is **still in review**, not complete or approved. Its initial twelve exports passed local asset validation and the thirty-piece runtime animation suite. Catalogue descriptions now match their actual motion. Domain rules and collection-discovery regressions pass.

Desktop review covered all twelve and prompted corrections to the miniature cook's floor, watermelon slices, garden planter openings, and birdhouse mounting. Private wall-art close-ups now support a foreground cutaway; ordinary cameras reset to their normal clipping distance. Remaining work before accepting this batch: inspect the final revised Gochujang/Smoothie captures, regenerate all twelve from the final retained builder so provenance snapshots match, refresh validation receipts, repeat the changed-art checks, perform phone-width checks and run type/release checks with adequate memory headroom. Existing prior-batch production-build results do not verify this new batch. Current Wines and earlier Gochujang/Smoothie captures are in the D: review folder. Packs remain private and no deployment occurred.

## Constraints

- Gochujang.com, Smoothie.com and Wines.xyz are one coordinated launch.
- Preserve legacy collection versions 1/2 and player saves. Domain catalogue v3 is separate.
- No production publishing. The user alone runs `vercel --prod`.
- All generated assets, previews and build output stay on D:.
- Purchases, redemption, minting and token-shop checkout stay closed.
- The revised nine-asset benchmark is user-approved for expansion. Names, mascots and treatment still need brand-owner approval before launch.

## Delivery checklist

- [x] Three furnished room studies and nine locally authored hero studies in the existing renderer. This is a visual benchmark, not the nine earned operating layouts.
- [x] Complete 72-item concept roster, six skins per domain, exact 100% odds per pack.
- [x] Private domain hub and gated direct-entry routes; no automatic home/gameplay promotion.
- [x] Domain/season configuration, opening-record validation, six-board aggregation, milestone eligibility and exclusive-appearance reconciliation. These are tested functions, not a connected settlement/indexing service.
- [x] Author all 72 private collectible studies with retained Blender sources. Final collection/brand approval and aggregate phone performance remain open.
- [x] Nine physically cooked recipes, four specialized machine types, and all three eight-service journeys with authoritative replay and isolated local database checks.
- [ ] Deploy the journey migration to approved staging and complete signed-wallet end-to-end acceptance before enabling its verification gate.
- [x] Private editable kits for all nine room sizes; ownership-preserving grants, layout application and backup restoration tested with existing cooking.
- [x] Complete the nine domain-specific kitchens and locally verify their cuisine, ownership and collection-history grants. Production ownership indexing remains a separate launch gate.
- [ ] Actual developer purchasing/randomness/minting/redemption/ownership integration and token shop.
- [ ] Combined simulation, compatibility, economy and production-build verification.
- [ ] Physical Android/iOS performance and five unfamiliar-player observations.

## Benchmark brief

Use sculpted silhouettes, rounded construction and readable materials. Semantic fronts face the camera. No clutter, trash, player chores or promotional UI in the art-review scenes. Show both close-up craft and normal room scale. Do not substitute a floating art render for actual placement evidence.

Gochujang: red enamel, charcoal, steel and glazed ceramics. A bustling midnight ramyeon counter. Review Fireant Kitchen Brigade, Volcano Ramyeon Boiler and Midnight Ramyeon Express.

Smoothie: fruit colour, terrazzo, glass, curved counters and planting. Review Toucan Tasting Bar, Fruit Orbit Blender and Mango Lagoon.

Wines: walnut, burgundy, limestone, brass and clear glass. Review Midnight Decanter, Sommelier’s Tasting Carousel and Vineyard in a Bottle. The carousel is a supported bottle shelf on a wine-serving cabinet; its future machine workflow is separate from this visual benchmark.

Canonical provisional assets: `D:/Doma/DomainKitchenAssets/three-worlds-v1`. Local original geometry only, no provider spending. Per-asset metadata records dimensions, semantic front, pivots, triangle count and source hash. No art is marked approved by a successful build.

## External inputs outstanding

Gochu contract/backend handoff, deployed addresses, exact settlement/token/fee configuration, randomness encoding and test vectors, season dates, token-shop prices and approved prize funding. None is invented from the old proposal. Approximately $4k in vault assets is not an authorized prize allocation.

## Local review

Run the existing local development preview and open `/chef/domain-review`. Select Gochujang, Smoothie or Wines. Each room offers nine model selections, a close-up, a room view and a working-motion preview for machine studies. The postcard button writes only to `D:/Doma/DomainKitchenAssets/three-worlds-v1/review`.

The art route, model-file route and capture endpoint are development-only. Public pack gates are unchanged and remain closed. The provisional GLBs stay outside `public/`, are loaded only by an allowlisted development endpoint, and are not part of a production asset release. No wallet, gameplay save, paid generation or deployment was used for the review.

The Blender source is `scripts/dk-build-domain-heroes.py`. All nine `.blend`, `.glb` and provenance `.json` files are in the D: `heroes` directory. Desktop and phone close-ups exist for each hero, plus one furnished-room capture per domain. Inspect the images and motion in the app before approving expansion to the other 63 objects.

## Previous benchmark verification

- Nine GLBs pass the asset CLI's mesh validation, including normals and UVs. First validation exposed missing UVs on procedural curved surfaces; the authoring script now unwraps every study before export.
- Catalogue/season checks: seven groups pass, including exhaustive 60,000-ticket odds, all-domain fail-closed configuration, season expiry/grace boundaries, tied ranks, duplicate/conflicting events, refunds, samples, malformed input, milestones and ownership reconciliation.
- Legacy pack/decor checks: seven groups pass. Collection UI checks: six groups pass. Presentation ownership, finite gestures, reduced motion and bounded quality regression passes.
- TypeScript `--noEmit --incremental false` passes. The final isolated production build on D: passes after the review-screen changes. Logs: `D:/Temp/dk-three-worlds-build-final.log`. Existing optional `pino-pretty` and stale Browserslist warnings remain; neither failed the build.
- Started that build locally with both pack flags set to true: `/packs`, all three `/packs/[domain]` routes, `/chef/domain-review`, the provisional GLB endpoint and capture POST all return 404. The hard settlement gate and development-only art routes remain effective in production mode. No deployment was performed.
- Browser layout checks at 360×640, 390×844 and 844×390 show no horizontal overflow and all visible buttons are at least 44px high. No browser console errors observed during the room review. These are layout checks only, not physical-device performance results.
- Preview output remains a junction to D:, and the original source Next.js dependency remains intact.

## Art observations and remaining gates

Corrected item framing that did not follow selection, an entrance awning obstructing close-ups, moving details disappearing while idle, an overhead rack intersecting the railway display and sparse miniature landscapes. Added two bowl carriages, softened the mango silhouette and dressed the miniature island and vineyard. Room studies now use appropriate plants or wine cabinets instead of displaying burger patties behind unrelated cuisines.

These are first-pass sculpted studies, not approved release artwork. Further review should focus on recognizable Fireant faces, material richness at phone size, miniature-landscape density, and whether the three room identities are distinctive enough. The landscapes and general furniture arrangement do not yet replace the nine authored, validated reward layouts. Phone LODs, bounded aggregate placement budgets, actual machine integration and real-device measurements remain outstanding.

At this initial benchmark stage, no art/brand approvals had been recorded. See the later approval and kit-conversion record below. Actual on-chain evidence, payment interruptions/reorgs, token-shop receipts, journey replay, specialized recipes, placement/transfer UI, five first-time players and physical Android/iOS tests remain separate unfinished work. Do not describe this delivery as the complete three-domain launch.

Continuation: obtain feedback on the nine visible studies, refine the approved art direction, then expand content. In parallel, the next independent engineering increment is verified seasonal-journey attempts and the nine actual cooking workflows, reusing existing authoritative rally machinery. Payment integration waits for the developers' real protocol; do not infer its message encoding or contracts.

## September 30: full restaurant directions and believable movement

User feedback supersedes the generic furnished backdrops. The new `scripts/dk-build-domain-restaurants.py` authors three complete, original room studies on D:, using the existing renderer:

- **The Fireant Ramyeon Club:** red glazed walls, charcoal floors, gold latticework, a lacquer noodle counter, fermentation jars, pepper lanterns and expressive Fireant-inspired hosts/cooks. The official site's red/black/gold palette and Fireant identity informed this direction. Owner approval remains pending.
- **The Tropical Fruit Club:** a waterfront orangery, peach fluted bar, pale stone, produce displays, planted corners, supported hanging garden and bamboo ceiling fan.
- **The Velvet Cellar:** oak planks, walnut bottle walls, brass lighting and stemware rails, burgundy upholstered seating and a limestone tasting bar. Actual bottle geometry fills both tall walls.

These studies represent the proposed **exclusive earned architectural kit**, not ordinary catalogue recolours or a pack-opening entitlement. The intended pieces remain rearrangeable after unlocking. They do not yet implement all nine operating layouts, movable kit grants or completion receipts. Architecture embedded in these review models must be converted to authored movable definitions before gameplay integration.

The room review now defaults to the complete restaurant with **Show pack pieces** as an explicit optional toggle. Postcards label room art separately from collectible close-ups. There is no silent grant, local-save write or promotion of the current pieces as approved NFTs.

Animation rules for this direction:

- Moving objects have recognizable joints, tracks, supports or a containing vessel. Feet stay planted during stationary gestures.
- Gochu ants attend real pots. Smoothie fruit remains inside the blending glass and moves only with the working preview. The room fan is attached to a supported beam.
- Wine rests inside a decanter. A small nearby candle supplies restrained motion; wine is not a floating ribbon. The tasting machine turns a mechanically supported bottle shelf. The miniature harvest cart is parked instead of sliding around a vineyard without a track.
- Reduced motion restores the designed rest pose. Hidden-tab handling and simulation outcomes remain in the existing renderer. No new soundtrack or effects audio.
- Keep concepts connected to the domain. Replaced unrelated airship/bear/planet-style ideas with fermentation, fruit-market and wine-cellar craft while preserving provisional item IDs and pack odds.

Technical boundaries: room GLBs are development-only, fixed-path allowlisted files under `D:/Doma/DomainKitchenAssets/three-worlds-v1/rooms`. Wall groups cut away when viewed from outside. Static geometry is merged by material and support group; animation joints remain independent. High-detail art review is not a measured phone-performance result. All-stage kit conversion, low-detail variants, physical-device review and owner approval remain outstanding.

Local validation: catalogue/season checks and presentation regressions pass. An isolated production build on D: passed (`D:/Temp/dk-domain-restaurants-build.log`). It also exposed two pre-existing type inconsistencies in the separate workshop music hook; the small correction keeps suspension in the hook state and passes only supported soundtrack configuration fields. No production deployment was performed.

Final art validation: all three room GLBs and the four changed hero GLBs pass the asset validator's eight checks, including UVs and normals. Room triangle counts: Gochujang 182,420; Smoothie 193,480; Wines 185,638. Repeated bottle geometry first exposed a duplication bug, then an over-budget architectural detail pass; independent source meshes, reduced bevel detail and material consolidation corrected both. The wine room now uses 16 materials and stays inside the existing 200,000-triangle validation limit. Inspector advisories about untextured solid-colour materials and optional clearcoat-reader support remain; these are intentionally shared colour materials, not texture-based assets.

The final build was started locally with both public pack flags set. `/packs`, all three domain pack paths, `/chef/domain-review` and the new room-GLB endpoint returned 404. That temporary test server was stopped. The development review remains running on port 3010 with output on D:, and source dependencies remain intact. Final desktop captures and 390px layout captures are in the D: review folder; browser emulation is not physical-device performance evidence. The last review-only phone framing margin and postcard changes were checked in the development preview after the build, with a passing focused TypeScript check including the renderer, review and asset/capture endpoints. Capture testing found that a loaded GLB was not sufficient evidence of a rendered frame: the Save control now waits for rendered scene telemetry, preventing blank initial postcards.

## September 30: approved room direction converted into editable kits

The user approved the complete restaurant direction ("nailed it boss, excellent work") and authorized continuation ("do it baby"). This records approval of the room direction, not external brand approval, paid launch approval or approval of every unproduced collectible.

`dk-build-domain-room-kit.py` derives 27 original modular assets from the approved room geometry: wall bays, counters, tables, chairs, stools, signs, lamps, plants and a domain-specific feature for each domain. Sources and all `.blend`, `.glb`, metadata and validation output remain under `D:/Doma/DomainKitchenAssets/three-worlds-v1/kit`. No paid generation was used. All 27 exports pass the asset validator.

The private review now has **Try the editable room**, with small-restaurant, diner and full-restaurant layouts. It uses the real RoomPlan v2 editor, placement rules and inventory validation. Furniture can move, rotate, store and restore; walls and flooring can be edited; undo/redo and confirmation use isolated in-memory test ownership. No player save is imported or modified. The original approved furnished-room study remains the default art view.

The earned kit foundation includes versioned entitlements, one-time quantity grants, higher-tier preservation, later-stage top-ups, an application command and a restorable design backup. Applying a kit preserves menus and possessions and uses the existing accepted-order transition. No browser command accepts a finale receipt or manufactures completion credit. The pure grant function is currently exercised only by development fixtures and tests; verified journey settlement must call it in a future increment.

Large signs now occupy four real contiguous wall supports. Removing any support returns the sign to storage, rather than leaving it floating. Sign, lamp and feature orientations match the game's placement conventions. Table, counter and chair art follows existing food/body contact heights. Saved appearance data is validated when loaded.

Local verification:

- All nine layouts pass physical placement and access checks and finish six actual staff-served burger orders, including clearing, washing and a mid-service serialized reload.
- Kit claims preserve coins, menus, equipment tiers and existing possessions. Repeated claims, including after selling a piece, do not regrant it. Unowned styles and malformed saved appearance data are rejected.
- Apply/reload/restore, spanning-sign collision, support removal and storage checks pass.
- Existing room-design, free-building, mixed-service and all-32-existing-dish regressions pass. These do **not** prove the nine future domain recipes.
- Browser verification covers wine-room storage/confirmation/restoration, actual floor clicks moving furniture, two-tap partition construction, undo, size switching and selection. The 390px layout has no horizontal overflow and a 44px minimum control height. All three themes were inspected at all three room sizes; desktop captures are in the existing D: review folder. This is not physical-phone performance evidence.
- Actual raycast regression checks select every physical floor tile and oak plank in all nine layouts. This caught and fixed missing floor-picking metadata. Floor rendering now uses at most two instanced batches instead of hundreds of separate plank draws. This does not establish a device FPS result.
- Full source TypeScript check passes; the final post-fix isolated production build on D: also passes (`D:/Temp/dk-domain-room-kits-build-final.log`). Existing optional `pino-pretty` and Browserslist warnings remain nonfatal.
- Started the final build locally with both pack flags enabled: `/packs`, all three domain pack paths, `/chef/domain-review`, a kit GLB, a room GLB and capture POST all returned 404. The temporary check server was stopped. No deployment was performed.

Remaining larger delivery: nine domain recipes and specialized machines, three verified journeys, finalized authored kitchen arrangements, aggregate rendering/phone budgets, remaining 63 collectible assets, actual developer settlement and ownership indexing, brand-owner approvals and participant/device acceptance. The workshop kitchens currently use the existing grill/prep/sink workflow to test operation; they are not presented as finished ramyeon, smoothie or wine workflows. Private assets are not shipped in `public/` and paid features remain closed. The original approved furnished-room art remains separate from these operating-layout prototypes until their full cuisine and art dressing are complete.

## September 30: collectible quality rejected; three Common replacements

The user judged most pack pieces 5–6/10 and some 3/10, not worth collecting. This explicitly rejects the collectible benchmark. Approval of the restaurant architecture does not extend to pack pieces. Do not expand the remaining 63 based on the rejected standard.

The first corrective pass rebuilds one Common per domain in `scripts/dk-refine-domain-commons.py`, preserving the original studies. New editable Blender sources, GLBs and provenance are in `D:/Doma/DomainKitchenAssets/three-worlds-v1/heroes-r2/`. The private allowlisted endpoint selects those three files only; whole-room and modular-kit geometry is unchanged.

- Fireant Kitchen Brigade: cutaway glazed jar, open hinged lid, tiled kitchen, hanging peppers, recognizable apron-clad ants and a genuinely open pot. Only the stirring forearm moves; spoon and broth occupy the same workspace.
- Toucan Tasting Bar: lofted bill, folded wings and tapered feathers, branch-gripping toes, a fluted fruit bar, recognizable citrus sections and separate tasting drinks. Only the head nods.
- Midnight Decanter: fluted crystal, resting garnet wine, supporting brass grapevines, handled walnut tray and velvet lining. Candle motion is confined to its flame.

Runtime review caught a ceiling fan crossing the Smoothie close-up and a spoon missing its pot. The private close-up camera now avoids the fan; the pot is positioned beneath the spoon. These are actual game-renderer captures, not generated marketing images.

All three GLBs pass eight asset checks with UVs and normals. Actual triangle counts are 52,680 / 35,480 / 32,472. These are still solid-material studies: the inspector notes the absence of image textures. The real runtime animation check samples twelve seconds, verifies one localized gesture per asset, one-tile movement bounds, stationary supports and reduced-motion restoration. Domain catalogue/closed-gate checks and focused TypeScript checks pass.

This is a revised **three-piece benchmark**, not final approval of these pieces, the other six heroes, or all 72 concepts. Richer material/texture work, further art critique, aggregate asset budgets and actual phone performance remain necessary before release. No provider credits were spent and no production deployment was performed.

Final local verification: all three revised pieces were inspected in their actual themed room at desktop and measured 390px CSS width; close-ups are saved in the existing D: review directory. The preview browser had 80% zoom, so its viewport override was compensated and the actual `innerWidth` verified rather than claiming the requested override was the rendered width. No horizontal overflow or browser rendering errors were observed. The override was reset afterward. The isolated production build passed (`D:/Temp/dk-domain-commons-r2-build.log`); existing optional dependency warnings remain nonfatal. Physical-device performance and human art approval remain outstanding.

## September 30: Fireant approved as the benchmark; five companion revisions

The user singled out Fireant Kitchen Brigade as the desired standard, found the boiler acceptable and Mango Lagoon close, and rejected the Express, Toucan and Blender. Preserve the Brigade and approved room architecture. The remaining collection does not inherit that approval.

`scripts/dk-refine-domain-companions.py` now produces five revised, original Blender studies in `D:/Doma/DomainKitchenAssets/three-worlds-v1/heroes-r3`, alongside editable sources and provenance. Earlier study folders remain intact. No provider credits were spent.

- **Midnight Ramyeon Express:** a tiled noodle station, ribbed lanterns, Fireant cook and conductor, copper locomotive and two ramyeon wagons. Vehicles follow one continuous railway at constant travel speed, with their noses following the track through bends.
- **Toucan Tasting Bar:** a closed, shaped bill, joined neck, folded wings and actual toes gripping a perch. A restrained head gesture leaves its body, feet and bar still.
- **Fruit Orbit Blender:** fitted glass pitcher, spout, braced handle, sealed lid, peach-and-jade cabinet, controls and citrus detailing. Its internal rotor and fruit move only in the working preview.
- **Mango Lagoon:** complete fruit hut, deck, feathered palms, rock-backed waterfall, layered shore and moored boat. The boat rocks locally instead of circling through the scenery.
- **Volcano Ramyeon Boiler:** original cauldron silhouette with a temperature gauge, fittings and improved display basket. In equipment form, that display basket and its decorative noodles are hidden; the existing simulation-controlled basket is fitted to the basin and retains its real lift. Cooking food uses the adjusted surface height.

Review caught room geometry hiding the Express and Lagoon, and a duplicate basket above the boiler. Final review positions clear the nearby pole, tables and fan. This changes only the private display composition; approved whole-room assets and player layouts are unchanged.

Local verification:

- All five exported assets pass eight CLI asset checks. Maximum triangles remain 75,000; two-tile items use an explicit 2.1 m maximum extent. Triangle counts: Express 71,364; Toucan 33,336; Blender 22,044; Lagoon 67,988; Boiler 14,848. Solid-colour material and optional clearcoat-reader advisories remain.
- The actual renderer's animation checks cover continuous railway travel, tangent-facing vehicles, movement bounds, stationary supports, reduced-motion restoration, idle blender behavior and the real equipment-appearance basket/lift assembly. The approved Common checks and domain catalogue/closed-release checks also pass.
- All 21 groups in the collection simulation regression suite pass; logs are under `D:/Temp/dk-domain-companions-r3-regression`.
- Focused TypeScript and the final isolated production build pass (`D:/Temp/dk-domain-companions-r3-build-final.log`). Existing optional dependency warnings remain nonfatal.
- One additional legacy synchronous art script (`dk-diner-art-check.mjs`) stops at `collect_lucky_cat_soda: empty model`: it inspects that asynchronously loaded GLB before loading finishes. This script is not recorded as passing; the new checks load and inspect real exported assets explicitly.
- All five revisions were inspected in the game at desktop and measured 390px CSS width, with no horizontal overflow or browser rendering errors. Captures are in the existing D: review directory. The temporary viewport was reset, and source dependencies remain present.

The five revisions await the user's art judgment. This is not completion of the remaining 63 models, aggregate asset optimization, brand approval or physical-phone performance testing. Private pack gates are unchanged; no production deployment was performed.

## September 30 follow-up: readable prep, work controls and actor support

User review retained the revised train, blender and Toucan bird. Mango Lagoon remains an acceptable study. This pass changes only the Toucan's stand: rounded oak counter, open basket storage, a planted perch, citrus crate and a single smoothie tasting tray. The bird and its restrained neck animation are preserved. Editable Blender/GLB sources are in `D:/Doma/DomainKitchenAssets/three-worlds-v1/heroes-r4`; older revisions remain intact. The local asset route serves r4 only for this item. Packs remain private.

Gameplay repairs:

- Prep rendering and thumbnail keys now include actual assembly components. Adding the bun refreshes the patty's model, with both visible on the board until assembly finishes. The work control also identifies `Bun + cooked patty`.
- During guided work, the instruction itself is the work button. Mouse/touch holding and the desktop E shortcut are explicit. The tap alternative stays inside the instruction card instead of floating across the button. Release, pointer cancellation, focus loss and hidden-tab handling remain in place.
- Walking follows actual rendered displacement, not a saved walking intention or a target beyond a bend. Seated support overrides residual movement and carrying poses; hips and legs adopt the correct chair/stool pose together.

Verified locally:

- Real button handlers advance a manual cooking job without E; pointer release/cancel, lost capture, blur, hidden tabs, keyboard, tap mode and disabled state pass (`dk-hold-action-check.cjs`).
- Actual bun meshes, component cache invalidation, bounded preparation footprint, finished-food conservation and seated poses pass (`dk-prep-visibility-motion-check.mjs`).
- All three starter stages pass seated-pose checks; crowded home traffic and live/offline consistency checks pass. No stationary guest stood on a seat in 1,576 seated samples across the three starters.
- Twelve controls groups, eight physical-cooking groups, all 32 recipe workflows and shared-preparation conservation pass.
- Toucan r4 passes eight CLI asset checks: 36,316 triangles, 19 materials, 0.892 × 1.014 × 0.594 m. Optional clearcoat-reader / solid-colour-material inspector advisories remain. All five companion animation/envelope checks pass.
- The actual guided button completed preparation via tap in the development fixture. Measured 390×844 and 360×640 iframe layouts keep the work target visible, above 44px, and separate from the tap alternative.
- Final isolated production build and type checking pass: `D:/Temp/dk-prep-motion-production-final.log`. Existing optional `pino-pretty` warning remains nonfatal. Missing files in the separate D: dependency copy were restored from the intact source dependencies before building.
- Revised in-room image: `D:/Doma/DomainKitchenAssets/three-worlds-v1/review/domain_smoothie_toucan_bar-closeup-desktop.png`.

Physical Android/iOS interaction and performance, participant observation, and approval of the revised stand remain outstanding. No production deployment was performed.

## October 6: remaining artwork and domain gameplay

The user asked to start remaining artwork immediately, then proceed straight into the three journeys, nine dishes and four specialized machine types. Both implementation passes are now present in the private review. This is not public activation or final visual approval.

### Artwork

The remaining 33 original studies are exported in `D:/Doma/DomainKitchenAssets/three-worlds-v1/`: twelve `super-uncommon-v1` pieces and seven each in `rare-gochujang-v1`, `rare-smoothie-v1`, and `rare-wines-v1`. Together with the previous 39, all 72 catalogue items now have local geometry. The Fireant benchmark and approved heroes remain intact. Each new item has its own Blender source, GLB, provenance and isolated render; the four batch contact sheets were inspected and refined. No paid generation was used.

All 33 pass the asset CLI's eight validation checks, with a maximum of 71,736 triangles. Original sources were packaged as private review assets and package integrity verified. See `remaining-33-validation.json` and `remaining-33-packages.json` in that D: asset root. Runtime animation checks cover 70 seconds, placement envelopes, fixed supports, machine-idle behavior and reduced motion. This does not substitute for owner judgment, brand approval, aggregate populated-room budgets, final materials/LOD work or actual phone performance.

Blender's embedded Python created three adjacent bytecode caches despite process environment settings. Those three files (140,280 bytes total) were moved to `python-cache-recovered-20261006` on D:. New builders now explicitly disable bytecode writes before importing local helper modules. Older unrelated caches were left untouched. All exported geometry, renders, packages and build output are on D:.

### Cooking and journeys

The shared cooking engine now has 41 recipes: the original 32 plus spicy ramyeon, steamed mandu, kimchi fried rice, mango smoothie, berry smoothie bowl, citrus cooler, house red, cheese-and-fruit board and baked tartine. New station types are the steamer, griddle, citrus juicer and wine-serving station; existing boilers, blenders, prep counters and ovens supply the remaining steps.

Mandu baskets contain three finite portions. Wine bottles contain six finite glasses, requiring actual clean cups and washing. Recipes reuse shared noodles, assembly and existing vessels. Remaining portions and warmth survive serialization; taking a portion does not refill a batch or restart its heat. New supply models, recipe instructions, station details and food/vessel models accompany the real workflows. The original legacy-cooking fixture now explicitly tests legacy recipes only; all 41 are covered separately under current cooking rules.

Each domain has an isolated eight-service journey, upward branching map, supplied tier-three truck, fixed recipe levels, a complete kitchen and an optional free Clear & wash helper. Early services use one dish, then two, then all three. Practice goes directly into the full-menu kitchen for three guests and grants no rewards. Workshops improve loaned equipment or patience for this journey only. New scenery, domain outfits, upfront seeded demand and longer Wines seating behavior use presentation and simulation definitions separately.

Server-created attempts retain ordered command replay, real-time credit, revision checks, retries, disconnect pausing, one active attempt per wallet and the season's 24-hour finish window. The migration is `20261011_domain_kitchen_seasonal_journeys.sql`. It has not been applied to production. Live entry requires both `DINER_DOMAIN_JOURNEYS_ENABLED=true` and `DINER_DOMAIN_JOURNEYS_VERIFIED=true`, plus approved season dates and the existing diner backend. None was enabled for this work.

Milestones grant sign/furnishing/light rewards at services 2/4/6, then a completion badge, the domain's recipes and their basic machines/supplies at the finale. Entitlements attach from authenticated server receipts without replacing the local beta restaurant. Repeated claims, resale and imported client totals cannot manufacture another reward. Menus remain explicitly selected. Borrowed gear, trip money and challenge progress do not leak into the ordinary trip.

**The complete restaurant still requires all 24 distinct collectible discoveries.** Journey completion does not grant that room. All nine themed layouts now contain their domain kitchens while retaining the starter burger stations and existing menu. Older private kit entitlements receive missing cuisine machines once without moving furniture or replenishing sold possessions.

### Local evidence

- `dk-domain-cooking-check.mts`: all nine actual ingredient/cook/serve/wash flows, one-second decisions, reload, finite mandu/wine portions, exact slots, exhausted vessels and forged batch rejection.
- `dk-diner-shared-prep-check.mts`: all 41 physically prepared and served recipes, shared preparation and warmth conservation.
- `dk-domain-journey-check.mts`: all 24 services completed through ordered replay, rewards, loan-only layout validation, current/future map forecast depth, practice, accelerated-time rejection, interruption and expiry.
- `dk-domain-journey-balance.mts`: 100 seeds for each domain's opening and finale, 600 services total. All cleared using the supplied washer and one-second decisions. Opening averages were 164/196/176 seconds; finales 603/621/628 seconds for Gochujang/Smoothie/Wines. These are reference-cook results with a helper, not measured solo or first-time-player difficulty.
- `dk-domain-home-check.mts`: each of nine layouts cooks all three domain dishes, with clearing, washing, finite batches, reload/live-offline agreement and pending-layout draining. Reward conservation and wallet mismatch checks pass.
- `dk-domain-journey-postgres-check.mts`: migration applied only to disposable in-memory PGlite; private table privileges, one active attempt, duplicate requests, stale revisions, wrong reward domains and transactional rollback pass.
- `dk-domain-journey-sync-check.mts`: interrupted post-commit responses retry the same request, reload resumes the action tape, clock-start waits for acknowledgement, gaps pause and stopped wallet clients cannot continue sending.
- Domain catalogue/discoveries/room-kit tests and original physical-cooking, home, crowded-home and control regressions pass.
- `dk-domain-scenery-check.mjs`: three qualities and four rotations for each destination; disposal, reduced motion and non-interactive scenery pass. Low scenery geometry is approximately 12k/20k/34k triangles; structural draw counts 14/9/8, with up to six additional browser text planes. These are geometry budgets, not device FPS measurements.
- Browser review covered all three domain scenes, desktop, 360px/390px and 844x390 landscape. Fixed oversized camera HUD padding, made the complete supplied kitchen visible on phones, and put landscape actions beside the scene. Practice entry, supplies and persistence were exercised. Viewport override was reset. These were private fixtures and did not modify the beta restaurant.
- Full source TypeScript check passed before the final presentation-only refinements. A final isolated production build is being recorded separately below.

Private review URLs: `/chef/journey-review?domain=gochujang`, `?domain=smoothie`, and `?domain=wines`. The real gated destinations are `/chef/journeys/<domain>`. Packs, payments and review-only assets remain closed to public production browsing.

Outstanding acceptance: final collectible and brand review, populated asset optimization/device performance, five unfamiliar-player observations, approved seasons, the real signed-wallet/Supabase deployment exercise and the separate paid-settlement release gates. The 600-seed helper result does not certify solo finale calibration. No production deployment or external transaction was performed.


Final local release verification: the isolated production build on D: passes after all journey UI and accessibility changes, including lint/type validation (`D:/Temp/dk-domain-gameplay-accessibility-build.log`). The first attempt exhausted system memory; stopping only this task's preview and limiting build workers resolved it. Existing optional `pino-pretty` and Browserslist warnings remain nonfatal. Both source and D: dependency directories remain intact.

The built application was started only on localhost for gate tests. `/packs`, all three pack paths, the art/pack/journey review pages, all three closed journey entries and a valid new collectible GLB returned 404. Journey status reported disabled; current/rewards and both start/commands endpoints returned 503. See `D:/Temp/dk-domain-gameplay-production-gates.json`. Both temporary production-mode test servers were stopped. No production deployment or cloud database write occurred.

The private preview is restored on port 3010 using `.next-collection-review` on D:. A rendered page was verified after restart. A 390px check with 150% text and larger controls showed no horizontal overflow, 18px dish labels and at least 56px buttons; left-handed placement was applied. Original settings and viewport were restored. The reviewed phone screenshot is `D:/Doma/DomainKitchenAssets/three-worlds-v1/review/journey-wines-phone.jpg`. Existing five-destination scenery checks also pass across 60 destination/size/quality combinations, four orientations, reduced motion and disposal.

## October 6: distinct Smoothie and Wines destinations

The user found the seasonal scenery too similar. Removed the shared storefront composition from Smoothie and Wines; Gochujang retains its original geometry, colours, transforms and animation configuration. A pre-change geometry fingerprint verifies Gochu across all three qualities.

- **Smoothie:** curved timber waterfront promenade, open lagoon, leaf-sail fruit pavilion, citrus sign, carved pineapple marker, moored produce boat, palms and beach picnic pockets. Gentle ripples and boat movement stay separate from service simulation.
- **Wines:** stepped vineyard terraces, connecting stairs, limestone cellar with actual open arches and bottle racks, terracotta roof, vine pergola, harvest cart, barrel tasting tables, lavender beds, lanterns and a restrained courtyard fountain.
- Both use distance-driven articulated pedestrians with smooth turns, preserve the existing truck framing and leave scenery outside interaction/navigation targets. No recipes, arrival schedules, rewards, saves or release gates changed.

Local verification: 36 domain/size/quality builds and the existing 60 ordinary-route combinations pass resource budgets, four camera orientations, reduced motion, pause and disposal checks. Tall landmarks and walking paths remain outside the service area. Maximum additional triangles are 23,211/39,755/41,515 for Smoothie and 38,944/77,640/121,128 for Wines (low/medium/high), at 13 and 12 structural draws respectively. These are geometry budgets, not physical-device frame rates.

Actual browser review covers desktop, 390px, 360px and landscape, with rotation and normal kitchen selection controls. The temporary viewport override was reset. Screenshots are `dk-smoothie-waterfront-desktop.jpg`, `dk-wines-vineyard-desktop.jpg`, `dk-smoothie-waterfront-phone.jpg` and `dk-wines-vineyard-phone.jpg` in `D:/Doma/DomainKitchenAssets/three-worlds-v1/review/`. Phone-device performance and the user's visual judgment remain separate acceptance checks.

The isolated production build passes, including type checking, in `D:/Temp/dk-domain-landscapes-build.log`. Its first attempt found an unrelated arcade atlas absent from the D: snapshot; copying the existing source atlas resolved that workspace omission. Optional `pino-pretty` and Browserslist warnings remain nonfatal. Production was not deployed; the private preview uses the D: cache on port 3010.
