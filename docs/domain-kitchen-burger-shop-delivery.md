# Burger shop, diner and restaurant

This implementation changes the standalone Three.js diner at `/chef/diner-preview`. It does not replace existing saved layouts on load. Existing owners find the included burger-shop conversion at **Decorate → Renovations → Preview burger shop**. They may cancel, or confirm the new layout while keeping their coins, mastery, purchased finishes and furnishings. New accounts start with the burger shop.

## Playing and building

- The 10×8 shop starts with a cook, cashier and server, a connected counter/lift gate, three wall-console stools, and a bathroom with two reserved toilet and basin positions. One of each is installed.
- The 12×10 diner adds a serving hatch, chef bar with six available stool positions, one wall-side two-seat booth and table ordering with tips. The player's owned stools carry forward: a normal starter brings its three classic stools, not six new upholstered seats. The cashier becomes a second server. The 14×12 restaurant separates the kitchen and includes three two-seat tables and their chairs. Earlier furnishings remain owned.
- Counters, gates and bathroom fixtures use real grid footprints, seating anchors and role-aware routes. Dishes travel through reserved handoff slots; used plates travel back to the dishwashing sink. Handwashing basins cannot wash kitchen plates.
- In Decorate, **Counters & bathroom** opens a reversible room draft. Select a module or an entire kitchen/bathroom area, tap a new tile, rotate individual pieces, then confirm. Red footprints and error text explain blocked arrangements. New fixtures are purchases into storage; cancelling their placement keeps the purchased fixture owned.
- Small planters can switch between floor and counter placement. Wall art snaps to supported wall segments; the chandelier mounts overhead without blocking walking space. Moving the supporting module carries its ornament with it. Cashier and meal positions remain clear.
- Style previews show floor/wall, counter, worktop, seat and sign colors in the room. Previewing and cancelling do not spend coins. Buying applies one finish and records permanent ownership.
- Bathrooms wear through actual use, including bounded offline operation. Select the fixture and hold the nearby control briefly to wipe it or pay for a repair. Possessions and mastery are never removed by poor condition.
- Public visits share the physical room adapter, including architecture, furniture and seated characters. They exclude private upkeep/parcel interactions.

The starter stools now face the opposite wall from the bathroom. The server spawns and waits on public floor in a cherry apron; the cashier stays at the till. The bathroom entrance keeps its full door frame and WC sign, and the first stall has its missing side partition. New shops include six owned decorations: a burger mascot, radio, condiment caddy, daisy pot, burger print and walkable welcome mat. These can be moved or stored; stored decorations can be sold for the displayed resale amount. Existing staged saves receive the collection once in storage, preserving customized layouts. Only an exact untouched earlier starter is repositioned automatically. Reloading, restoring a saved layout or repeating a command cannot replace a sold copy.

The development-only `/chef/room-review` shows all three rooms and live service without loading or writing any account.

## Pavement and dining furniture polish

- All three staged rooms have a supported three-row concrete apron. Ingredient parcels and neighbour deliveries use separate exterior positions clear of the entrance. Planters frame the frontage; the starter daisy pot is a larger floor planter, with a smaller version when mounted on a counter. The restaurant's actual name appears on the back wall above the bathroom wing.
- The burger-shop counter reaches the window wall, with matching worktop thickness and finished ends. The diner bar aligns with the kitchen/food-hatch boundary rather than projecting into the dining room. Its bathroom entrance sits at the outer-wall end, away from the kitchen door; the included booth sits against the dining-room wall.
- The diner has a fluted oak counter, cream worktop and chrome foot rail. Owned stools retain their classic or upholstered construction, and the selected seat finish remains the player's choice. Renovation offers an oak counter finish without forcing teal upholstery. Existing diners receive their once-only booth in storage, leaving their layouts intact; more booths are available in the diner and restaurant furniture shop.
- Booth benches are fixed parts of the furnishing, with explicit rotated seat cells and serving access. They cannot silently move to another side to accommodate an obstruction. Invalid placement previews retain their bench outlines. Booths never enter truck shops or loadouts.
- Restaurant tables have linen cloths, placemats, folded napkins, cutlery and small flower arrangements. Plate positions and place settings follow the actual seats after rotation. Staff doors keep a full-height opening at every camera angle; kitchen partitions now match the doorway height instead of leaving a short wall beside a tall frame.
- The earlier pavement-and-booth pass verified grants/purchases/save migration, seating and service, rotated placement, terrace grounding and gestures, camera projections and geometry: 431 kit cases, 75 room/table cases and 140 placement-model previews. Its desktop and 390px viewport reviews were visual checks, not device-performance measurements. These historical counts do not stand in for the current revision's checks.

## Small-town and art-deco collections

The September 21 revision adds **13 purchasable decoration designs**: six small-town pieces and seven art-deco pieces. The catalogue now contains **35 decor designs: 27 purchasable decorations and eight earned friendship keepsakes**, excluding working equipment and finish variants.

- **Small-town diner:** oversized wall clock, carved bear, woodland trophy, pie display, coffee sign and decorative jukebox. The diner renovation includes the clock, bear, trophy and pie display once.
- **Art-deco restaurant:** wine cabinet, sunburst mirror, brass palm planter, overhead chandelier, pearl wall light, velvet rope and brass menu stand. The restaurant renovation includes the chandelier, wine cabinet, mirror and palm planter once.
- **Finishes:** the diner's proposed default guest area uses worn oak with timber panelling; the restaurant uses terrazzo and art-deco wall panels. Kitchens and bathrooms retain practical flooring. Explicit renovation advances untouched stage finishes, grants the new finishes permanently and preserves individually purchased choices. Existing saved rooms receive the stage's missing finish ownership and four gifts in storage without silently restyling or rearranging their rooms.
- **Browse:** Decorate keeps its Furnish, Storage and Style tabs. One collection selector offers Everything, Kitchen, Seating, Burger shop, Small-town diner, Art deco, Garden and Keepsakes. Collections can be mixed. Item cards distinguish wall, floor/counter and ceiling objects and avoid implying that decorative pie displays, wine cabinets or jukeboxes add unimplemented production or sound features.
- **Stools:** Seating shows classic and upholstered ownership, installed counts and stored copies. A classic stool costs 350 coins; a new upholstered stool costs 650; replacing one installed classic stool costs 450 and returns the classic to storage. Each installed stool can be stored, and owned spares can be installed free in the next open counter position. Buying does not silently multiply the seats supplied by a renovation. Stored stools also appear under Storage and contribute to its count.

The free packs have persisted grant receipts. Reopening a preview, restoring a room or selling a gift does not make the pack renewable. This cosmetic catalogue work is separate from the noodle progression added below. The source audit, implemented scopes and future content proposals are in `domain-kitchen-recipes-and-style-roadmap.md`.

Current catalogue validation: the focused presentation TypeScript check passed, and a read-only source audit verified the 35/27/8 item counts, all 13 new prop descriptions, eight filters, four stool command bindings, stage-pack IDs and the four new finish previews. This source audit does not claim browser interaction or visual approval; the current production build is recorded separately.

## Roadside recipe and equipment discoveries

The cookbook contains 24 dishes, including tomato pasta and vegetable ramen. New trips use independent roadside discoveries: the first visited market sells machines and upgrades; recipe offers join the seeded stock from the second visited market. Equipment can appear before a useful recipe, and a recipe can be bought before its equipment. The early recipe pool includes fries, pasta and ramen. Shops show owned and missing requirements; they do not silently select or install purchases.

Both noodle dishes use real dry ingredients, boiling and explicit draining, followed by sauce or broth/vegetable assembly at prep. Bowls have an independent finite washable stock, with rack upgrades to four and six. Pantry/fridge supplies and opening checks follow selected dishes, so a pasta-only truck can leave burger equipment in storage. New machine discoveries grant a truck unlock and one restaurant copy; serving supplies remain truck utilities. Further copies are separate purchases.

At home, installed reachable boiler/prep equipment automatically enables learned noodle dishes. Existing recipes retain their current home-menu selection behavior. Stored or blocked equipment cannot generate noodle sales; production-appliance wear remains future work, separate from the implemented bathroom condition system.

Fixed pasta/ramen kits and universal recipe sales are retired. Existing kit receipts, recipes, equipment, mastery and home copies remain owned. Newly started trips no longer force a tutorial defeat or grant a tutorial fryer/finale recipe; saved older trips retain their promised behavior and rewards. Purchases use the authoritative command receipt and frozen offer list, so retrying a purchase cannot mint another machine. Route completion grows the truck without requiring every recipe from the route.

The starter truck is seven tiles long and three deep. Its burger/fries tools and serving supplies fit inside around a clear aisle. Larger trucks allow three, then four selected recipes and helpers. Old layouts and larger saved menus remain usable. Tier-two grills cook faster; tier-three sinks wash deposited vessels automatically; tier-three fryers lift their ready fries baskets while retaining finite batch portions. A saucier and other unimplemented machines are not advertised as available equipment.

The holding counter is an optional roadside equipment find with two storage spaces for ingredients, prepared food, clean serving vessels or dirty dishes. It does not cook, plate or wash items automatically. Its warming upgrade adds heat lamps and four spaces; the final upgrade has six. Lamps preserve warm finished food without reheating already-cold dishes. Players can choose an individual stored item to collect. Earlier heat-lamp owners and their active-service checkpoints keep their purchased warmth through an additive migration, without extra charges or duplicate equipment.

Regression coverage includes actual noodle cooking and washing, independent shop purchases, old-save ownership, optional menus, home noodle output, finite automation, lost responses and authority replay. Human first-run and mobile interaction review remain distinct from these engine checks.

## Growth and music

The measured initial calibration is 100 qualifying services per renovation, with only twelve introductory lunches contributing, plus the approved recipe, route, difficulty and coin requirements. This is a calibration, not a completed-player timing claim. See `domain-kitchen-restaurant-career.md` for the measured 2.98-minute slow and 3.85-minute medium samples, finite ingredient bundles and save/authority details.

`public/diner-audio/domain-kitchen-music-reference.zip` contains the original clean melody+bass WAV, melody-only WAV, MIDI and both approved Suno briefs. These are original synth reference exports, not finished Suno recordings.

The new player accepts home/truck tracks with synchronized harmony, bass, percussion and optional lift stems. All layers use one audio clock, loop boundaries and phrase transitions; scene changes crossfade. Music and effects have separate volume/toggle controls. Music suspends in hidden tabs and retains the original synth when files fail to load. The soundtrack manifest now selects Café Swing for the restaurant and Sunlit Groove for the truck. These are user-supplied full mixes: silent tails are trimmed, levels matched, and loop/scene boundaries crossfaded. The original tune remains a loading-failure fallback.

## Verification and remaining release checks

- 275 engine, service, authority, migration, wallet-sync, social, placement and other regression groups passed across 27 scripts; additional staged-room, room-editor, public projection, camera and art suites passed.
- Twenty music integration groups passed: synchronized stems, full-mix loop overlap, scene crossfades, rapid-switch cancellation, fallback silence after loading, hidden/mute/decode races, separate recording and legacy synth/stem gain, manifest and reference integrity. Existing synth lifecycle checks also passed. Mastered mixes retain 0.8 maximum gain (0.65 during truck preparation); the volume slider no longer applies the synth's additional 0.32 attenuation to recordings.
- Local browser checks covered legacy conversion preview/cancel/confirm, preserved storage, second-toilet purchase/placement/reload, counter-finish preview/cancel/purchase and mounted planter placement. Reviewed desktop and 390×844 CSS-pixel layouts. The desktop review displayed 60 FPS; a desktop browser resized to phone dimensions is not a representative-phone performance certification.
- Full campaign pacing, a populated real midrange phone, live database concurrency and production authentication still require release checks. Local account-service setup reported unavailable, so browser tests used the explicit development sandbox on the separate `127.0.0.1` origin.
- Café Swing and Sunlit Groove have been supplied and integrated as crossfaded full mixes. Source IDs and processing are recorded in public/diner-audio/README.md; the owner retains subscription records. Long listening sessions remain a subjective playtest, not a unit-test claim.

No database migration or production deployment is part of this change. Existing canonical JSON and command transactions carry the additive fields; server-load migration does not alter state revisions or active truck timers.
