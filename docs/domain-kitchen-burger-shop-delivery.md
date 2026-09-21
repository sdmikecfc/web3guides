# Burger shop, diner and restaurant

This implementation changes the standalone Three.js diner at `/chef/diner-preview`. It does not replace existing saved layouts on load. Existing owners find the included burger-shop conversion at **Decorate → Renovations → Preview burger shop**. They may cancel, or confirm the new layout while keeping their coins, mastery, purchased finishes and furnishings. New accounts start with the burger shop.

## Playing and building

- The 10×8 shop starts with a cook, cashier and server, a connected counter/lift gate, three wall-console stools, and a bathroom with two reserved toilet and basin positions. One of each is installed.
- The 12×10 diner adds the serving hatch, six-seat chef bar and table ordering with tips. The cashier becomes a second server. The 14×12 restaurant separates the kitchen and includes three two-seat tables and their chairs. Earlier furnishings remain owned.
- Counters, gates and bathroom fixtures use real grid footprints, seating anchors and role-aware routes. Dishes travel through reserved handoff slots; used plates travel back to the dishwashing sink. Handwashing basins cannot wash kitchen plates.
- In Decorate, **Counters & bathroom** opens a reversible room draft. Select a module or an entire kitchen/bathroom area, tap a new tile, rotate individual pieces, then confirm. Red footprints and error text explain blocked arrangements. New fixtures are purchases into storage; cancelling their placement keeps the purchased fixture owned.
- Small planters can switch between floor and counter placement. Wall art snaps to supported wall segments. Moving the supporting module carries its ornament with it. Cashier and meal positions remain clear.
- Style previews show floor/wall, counter, worktop, seat and sign colors in the room. Previewing and cancelling do not spend coins. Buying applies one finish and records permanent ownership.
- Bathrooms wear through actual use, including bounded offline operation. Select the fixture and hold the nearby control briefly to wipe it or pay for a repair. Possessions and mastery are never removed by poor condition.
- Public visits share the physical room adapter, including architecture, furniture and seated characters. They exclude private upkeep/parcel interactions.

The starter stools now face the opposite wall from the bathroom. The server spawns and waits on public floor in a cherry apron; the cashier stays at the till. The bathroom entrance keeps its full door frame and WC sign, and the first stall has its missing side partition. New shops include six owned decorations: a burger mascot, radio, condiment caddy, daisy pot, burger print and walkable welcome mat. These can be moved or stored; stored decorations can be sold for the displayed resale amount. Existing staged saves receive the collection once in storage, preserving customized layouts. Only an exact untouched earlier starter is repositioned automatically. Reloading, restoring a saved layout or repeating a command cannot replace a sold copy.

The development-only `/chef/room-review` shows all three rooms and live service without loading or writing any account.

## Pavement and dining furniture polish

- All three staged rooms have a supported three-row concrete apron. Ingredient parcels and neighbour deliveries use separate exterior positions clear of the entrance. Planters frame the frontage; the starter daisy pot is a larger floor planter, with a smaller version when mounted on a counter. The restaurant's actual name appears on the back wall above the bathroom wing.
- The diner has a fluted oak counter, cream worktop, chrome foot rail and upholstered stools. Renovation includes a two-seat booth and oak/teal finishes. Previously purchased finish choices are preserved. Existing diners receive their once-only booth in storage, leaving their layouts intact; more booths are available in the diner and restaurant furniture shop.
- Booth benches are fixed parts of the furnishing, with explicit rotated seat cells and serving access. They cannot silently move to another side to accommodate an obstruction. Invalid placement previews retain their bench outlines. Booths never enter truck shops or loadouts.
- Restaurant tables have linen cloths, placemats, folded napkins, cutlery and small flower arrangements. Plate positions and place settings follow the actual seats after rotation. Staff doors keep a full-height opening at every camera angle; kitchen partitions now match the doorway height instead of leaving a short wall beside a tall frame.
- Verification covers booth grants/purchases/save migration, seating and service, rotated placement, terrace grounding and gestures, camera projections and geometry. Art checks pass 431 kit cases and 75 room/table cases; 140 placement-model previews pass. Desktop and 390px viewport reviews check all three stages; these are visual checks, not new device-performance measurements.

## Growth and music

The measured initial calibration is 100 qualifying services per renovation, with only twelve introductory lunches contributing, plus the approved recipe, route, difficulty and coin requirements. This is a calibration, not a completed-player timing claim. See `domain-kitchen-restaurant-career.md` for the measured 2.98-minute slow and 3.85-minute medium samples, finite ingredient bundles and save/authority details.

`public/diner-audio/domain-kitchen-music-reference.zip` contains the original clean melody+bass WAV, melody-only WAV, MIDI and both approved Suno briefs. These are original synth reference exports, not finished Suno recordings.

The new player accepts home/truck tracks with synchronized harmony, bass, percussion and optional lift stems. All layers use one audio clock, loop boundaries and phrase transitions; scene changes crossfade. Music and effects have separate volume/toggle controls. Music suspends in hidden tabs and retains the original synth when files fail to load. The current manifest intentionally contains no production recordings, so the existing tune continues until the selected Suno files are supplied and edited.

## Verification and remaining release checks

- 275 engine, service, authority, migration, wallet-sync, social, placement and other regression groups passed across 27 scripts; additional staged-room, room-editor, public projection, camera and art suites passed.
- Six new music integration groups passed: shared clock, phrase crossfade, stale-download cancellation, fallback, background/mute lifecycle and reference file integrity. Existing synth lifecycle checks also passed.
- Local browser checks covered legacy conversion preview/cancel/confirm, preserved storage, second-toilet purchase/placement/reload, counter-finish preview/cancel/purchase and mounted planter placement. Reviewed desktop and 390×844 CSS-pixel layouts. The desktop review displayed 60 FPS; a desktop browser resized to phone dimensions is not a representative-phone performance certification.
- Full campaign pacing, a populated real midrange phone, live database concurrency and production authentication still require release checks. Local account-service setup reported unavailable, so browser tests used the explicit development sandbox on the separate `127.0.0.1` origin.
- Final Suno track selection, musical loop edits, source/license records and repeated listening remain pending those recordings. The shipped fallback is intentionally playable in the meantime.

No database migration or production deployment is part of this change. Existing canonical JSON and command transactions carry the additive fields; server-load migration does not alter state revisions or active truck timers.
