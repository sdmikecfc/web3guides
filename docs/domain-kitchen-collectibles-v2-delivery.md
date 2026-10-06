# Extraordinary collectibles and living destinations

Local implementation and automated verification completed on 24 September 2026. Human acceptance gates below remain open. No production deployment or promotion was performed; production is exclusively the owner's `vercel --prod`.

## Delivered in source

- Version-two catalogue: 12 Regular and 12 Super; six rarity levels; integer weights total 10,000 per pack. Legacy definitions and receipt validation remain available.
- Seven ownership-backed equipment appearances with preview/apply/remove, one saved machine per owned copy across home and truck, and safe release when storing a machine. No cooking or earnings modifiers.
- Original Blender meshes for all 24 designs. Hero assets use the authorized cinematic designs. No paid generation used. Canonical packages, provenance and admission receipts live under `D:/Doma/DomainKitchenAssets/collection-v2`.
- Shared GLB loading for gameplay and thumbnails; actual machine baskets and a loading-failure fallback retained.
- Isolated `/chef/collection-review` development fixture; no player save, wallet or rewards.
- Seventeen decorations use floor, wall, countertop or ceiling attachments, including centered multi-slot pieces. All 24 designs have low-detail variants and bounded animation. The playable meshes use the game's miniature style; the hero reference comparison is available for creative approval, not a claim of cinematic fidelity.
- Five layered 3D destinations with independent presentation clocks: Downtown, Music Festival, Business Center, Boardwalk and Night Market. Near details, background activity and distant geometry preserve gameplay camera scale and never enter navigation or target selection.
- Version-two catalogue migration: `supabase/migrations/20260924_domain_kitchen_collection_v2.sql`. It preserves old receipt definitions, has not been applied remotely and does not enable paid transactions.

## Film and source package

### Corrected film: version 3

The film in `D:/Doma/DomainKitchenMedia/collectible-packs-v3-closeups` supersedes the version-two film below. The original wide room shot failed the visual review: the collectibles were too small, floor clutter distracted from them, and the jukebox faced away. Version three replaces seconds 17–31 with three independently framed close-ups, all facing the viewer. Each subject occupies roughly half the picture height. A closed-shop fixture uses the actual runtime assets and validated placement/appearance commands, with no customers, orders, incident spills or parcels. The entrance canopy and counter no longer obstruct the subjects.

The four generated shots, existing captions, 55-second timing, prices, odds, leaderboards and soundtrack are preserved. The audio is copied from version two without re-encoding. The new folder contains `Domain-Kitchen-Collectibles-Team-Concept-v3.mp4`, `Domain-Kitchen-Collectibles-Editable-v3.zip`, original close-up captures and review frames. No new video generation was used. The development-only capture page is `/chef/collection-film-review`; its camera override is ignored in production.

Folder: `D:/Doma/DomainKitchenMedia/collectible-packs-v2-2026-09-24`.

- `Domain-Kitchen-Collectibles-Team-Concept-v2.mp4`: 55 seconds, 1920×1080, 30 FPS, H.264/AAC.
- `Domain-Kitchen-Collectibles-Editable-v2.zip`: editable native composition, authoring script, the four existing cinematic shots, game capture, font and prepared soundtrack.
- `Domain-Kitchen-Source-Captures-v2.zip`: 24 catalogue close-ups, 48 populated-room captures, 90 destination captures and the original game showcase capture.
- `Production-notes.md`: this delivery record.
- `review/`: hero-reference comparison, collection/destination contact sheets, editorial frames, audio measurements, full-file decode verification and test records.

The film reuses the four existing generated shots and Sunlit Groove. It required zero additional Higgsfield video generations. TEAM CONCEPT remains visible; leaderboard examples are labelled illustrative. It makes no prize, rarity-scoring, live-sales or financial-guarantee claim.

| Time | Content |
|---|---|
| 0–5s | Regular 5 USDC / Super 10 USDC introduction |
| 5–17s | Dragonfire Grill, Disco Burger Jukebox and Lucky Cat Soda Fountain reveals |
| 17–31s | Real restaurant footage: equipment appearances and décor placement |
| 31–39s | 12 Regular / 12 Super; six rarity levels and per-item odds |
| 39–46s | Separate illustrative Regular / Super opening-count leaderboards |
| 46–53s | Keep the NFT and use the collectible, or proposed redemption at 4.99 / 9.98 USDC |
| 53–55s | Domain Kitchen closing card and address |

Per-item odds are Common 16%, Uncommon 8.5%, Rare 1.19%, Epic 0.5%, Legendary 0.3% and Mythic 0.01%. Each pack has four Common, four Uncommon and one of each remaining rarity.

The full export decoded successfully: 1,650 frames and 55.000 seconds. Thirteen editorial frames were inspected, including repaired caption layering over game footage. Audio measures approximately −17 LUFS integrated and −5.4 dBFS true peak, with entry/exit fades. `review/film-verification.json` records the master SHA-256. Complete human watching/listening remains outstanding.

Editable composition: `native-project/dk-packs-v2/project.json`. Reproducible authoring/finishing tools are `scripts/dk-gacha-film-v2.mjs`, `scripts/dk-finish-gacha-film-v2.py` and `scripts/dk-review-film-v2.py`.

## Living destinations

The controller exposes scene root, presentation update, quality, statistics and disposal. Static geometry is merged; animated parts have separate pivots. Backgrounds do not consume gameplay randomness or expand camera framing.

- Downtown: brick fronts, windows, awnings, trees, café details, laundry, cyclist, rooftop cat and confused delivery robot.
- Music Festival: grass, tents, stalls, stage instruments, bunting, dancers, slow stage lights and a burger-costume guest.
- Business Center: glass façades, plaza, fountain, planted seating, commuters, flying paperwork and a Bear Market teddy.
- Boardwalk: stone promenade, sand, ocean, umbrellas, deckchairs, coastal plants, dogs, birds, waves and occasional dolphins/whale.
- Night Market: stocked lantern stalls, warm windows, canal, boat, steam and delivery cat.

At most one prominent event plays at once, with 100 seconds between event windows. Boardwalk uses three dolphin appearances per rarer whale appearance. Hidden/paused scenes stop the presentation clock. Reduced motion removes prominent movement/dancing. Foreground buildings fade when rotating. No scenery audio was added.

| Quality | Maximum primary scenery draws | Maximum scenery triangles | Agreed ceiling |
|---|---:|---:|---|
| Low | 12 | 26,116 | 25 draws / 40,000 triangles |
| Medium | 15 | 33,228 | 45 draws / 90,000 triangles |
| High | 18 | 44,556 | 70 draws / 180,000 triangles |

Counts exclude extra shadow passes and the existing gameplay scene. They are not sustained device-performance measurements. Low/high switching exposed a stale rectangular shadow projection; disabling the light's shadow participation alongside the map fixed it. Local contact shadows remain on low quality.

## Verification recorded

- Browser: hero catalogue thumbnails load; Dragonfire appearance applies to the real restaurant grill; jukebox placement succeeds through the ordinary validated placement command.
- Ownership checks cover all seven skins, retries, compatible equipment, reload, forged ownership, releasing assignments and unchanged equipment/coins/layout.
- GLB audit caught the carousel extending beyond its one-tile depth. Its revision uses an elliptical orbit contained within its two-by-one envelope.
- Production deployment previously reported “Not authorized” was inspected as Ready; the live domain and Domain Kitchen metadata/image were verified without deploying or promoting anything.
- All 21 simulation regression groups passed: first shift/receipts, pacing, table service, shared preparation, audience/batches, batch conservation, legacy noodles/cooking, regular stories, rehearsal, route chain, destinations, migration, renovation, room plan/editor, public scene, social, packs and placement.
- A prepared reference cook with one-second decisions cleared 100/100 seeds for each of the first three Downtown profiles and the first three Festival and Business profiles. Preparation reduced waiting pressure; these checks do not substitute for first-time-player observation.
- All 32 dishes were physically prepared and served by simulation checks, including portion conservation, vessels, warmth inheritance and heat lamps. Existing active-service fixtures retain their saved cooking rules.
- All seven skins were checked in home/truck configurations for compatibility, copy conservation, retry, forged-save rejection, reload, storage/replacement release, tier upgrades and unchanged cooking outcomes. All 17 decorations were placed, reloaded and stored through validated commands; wide mounts, overlap, boundaries and rotations were checked.
- All 48 main/low GLBs load. Low variants have vertex shading and less than 45% of main triangle counts. Sixty animation samples across 120 seconds fit placement widths/depths. The main 24 assets total 326,830 triangles, each below 30,000.
- All 60 destination/size/quality combinations passed four-direction, private-event timing, pause, reduced-motion, budget and disposal checks. Captures cover 60 default views, 15 other camera directions and 15 phone/landscape frames. All 24 collectibles have catalogue and populated desktop/phone captures.
- Real UI checks covered preview/cancel/apply/remove, copy-use display and jukebox placement.
- Type checks and the isolated production build on D: passed. Existing optional WalletConnect logger and dynamic-route/static-generation warnings did not fail the build. Source Next/Three dependencies remain present.

The collection/destination review pages and capture endpoint are development-only, return 404 in production and grant no real ownership or rewards. Generated artifacts, caches and build output remain on D:; admitted runtime GLBs live in `public/chef/collectibles-v2`.

## Human/device gates still outstanding

1. Actual Android Chrome/Brave and iOS Safari touch, memory and sustained populated-service performance checks. Targets remain 30 FPS on a representative midrange phone and 60 FPS on the development desktop. Browser-width captures do not satisfy this gate.
2. Five first-time-player observations and the four-out-of-five onboarding usability target.
3. Campaign/economy acceptance across the requested session patterns and final creative approval of meshes/scenery. The six-to-eight-hour renovation target is not yet certified; passing progression/receipt tests does not establish that pacing.
4. Human full-film viewing with and without sound, phone text readability and repeated listening.
5. Separate paid settlement, minting and redemption integration. Remote application of the catalogue migration belongs to that controlled rollout.

Paid purchasing, minting and redemption remain disabled; beta samples remain separate from NFT ownership. No new paid generation or Vast server was required. No production release was performed.
