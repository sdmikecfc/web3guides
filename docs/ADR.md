# Architecture Decision Records

Decisions that were **expensive to learn** and would be re-broken by anyone who
did not live through them. Numbers continue from ADR-0083, the highest
referenced in code at the time of writing; no register file existed in this
repo, so if one lives elsewhere these may need merging.

Each record states what was tried, what was measured, and what must not be
undone. A decision with no evidence behind it does not belong here.

---

## ADR-0084 — The world map is the front door

**Date:** 2026-07-29 · **Status:** accepted

`/s5` is the world map. The previous season landing is preserved whole at
`/s5/landing`; `/s5/world`, where the map was staged while its art was made,
permanently redirects to `/s5`.

**Why.** The map is the season's highest-traffic page and the thing players are
meant to live in. Staging it on a second route while the art was produced let
every commit ship and be verified against real season data without touching
what players saw.

**Consequences.**
- The swap reverses by moving one file body back, not by rebuilding from git.
- `/s5` renders **static** (12–13 kB). It must never call `getLocale()`: that
  reads cookies and silently opts the route into dynamic rendering. English
  renders on the server and the cookie locale is applied client-side on mount.
- `/s5/map` is now a strictly worse duplicate — same `BuyPanel` props, same
  guards, same fallback link. Retiring it is a routing change, not a refactor.

---

## ADR-0085 — Building placement is AUTHORED, never solved

**Date:** 2026-07-29 · **Status:** accepted · **Supersedes** `map-fit.py`'s
placement half

Positions live in `map-layout.txt`, one line per building, applied by
`python map-manual.py`. `map-manual.py --grid` draws a numbered coordinate grid
over the plate so a position is *read off*, not guessed.

**Why.** Eight rounds of automatic placement produced, verbatim, "a fucked up
menu bar with random shit everywhere". The measured ceiling on the final plate
was **22 structures crammed / 19 decent / 16 well-spaced** against a roster of
19 — every rule added to fix one complaint cost a building somewhere else.

A snapping solver was tried once more and failed the same way for a subtler
reason worth recording: when no platform exists near an authored coordinate,
"nearest legal anchor" quietly becomes "anywhere". One stronghold moved **1.067
across a board 2.04 wide**. Snapping preserves LEGALITY while destroying
COMPOSITION, which is exactly what made every earlier map look scattered.

**Consequences.**
- The tool CHECKS and never overrides: off the board, in water, overlapping,
  off a platform — stated in plain words. The layout is the authority.
- Hand placement takes ~10 minutes once per season and has no ceiling.
- The checker earns its keep: it caught a stronghold nudged onto grass
  (8/35 sample cells) that looked fine to the eye.

---

## ADR-0086 — Roads are PAINTED; tank routes are separate data, never drawn

**Date:** 2026-07-29 · **Status:** accepted

The plate carries its own roads, river and bridges. `S5_WORLD.roads` — the
network the engine DRAWS — stays empty. Tank routes live in `FIT_PATHS`, are
traced by hand in `map-layout.txt`, and are followed without ever being
rendered.

**Why.** Automatic road extraction was attempted three times and failed three
times for one reason: **a road and the ground beside it are the same paint.**
Measured on the plate — road `h 0.133 v 0.637`, sunlit lawn `h 0.135 v 0.638`.

1. *By colour* — impossible, see above.
2. *Smooth ground minus platforms* — 836 fragments, largest holding 13% of the
   network.
3. *Verified straight segments* — passed lines running across grass, trees and
   the river, because a third of the board classifies as road.

**Consequences.**
- Feeding routes to `WorldTerrain` paints a second, disagreeing road network
  over the painting. This happened: one edit replaced `roads=` at two call
  sites and the map was visibly drawn over. **`WorldTerrain` takes
  `S5_WORLD.roads`; `WorldCanvas` takes `S5_WORLD_PATHS`.** They are not
  interchangeable.
- A season whose plate has NO painted roads should author them in
  `S5_WORLD.roads`, where they are drawn AND driven, in agreement by
  construction.

---

## ADR-0087 — Two canvases: ground below the sprites, sky above

**Date:** 2026-07-29 · **Status:** accepted

`WorldCanvas` (smoke, weather, light, cloud shadows, armour) sits **below** the
buildings. `SkyLayer` (flights only) sits **above** them at `z-index: 30`.
Labels sit above both at `z-index: 50`.

**Why.** Planes must pass IN FRONT of a fort or they look like they are flying
through it. Smoke must pour from BEHIND one or it hides the wall it comes from.
One canvas can only be on one side of the sprites.

Lifting the single alive layer above the sprites fixed the planes and
immediately buried braking.io behind its own smoke.

**Consequences.**
- `SkyLayer` is its own ~40-line component, not a flag on `WorldCanvas`. A
  `sky` flag was tried: the second instance sized its canvas correctly and then
  never ran. Proven by painting a rectangle into it by hand and watching it
  survive — nothing was clearing it. No exception, no console error. Do not
  re-merge them to save a file.
- Labels escape their sprite's stacking context because `.wm-site` is
  `position:absolute` with `z-index:auto` and therefore creates none. This is
  what stopped a later sibling's artwork covering the Power Station's label.

---

## ADR-0088 — Pointer capture is deferred until a drag actually starts

**Date:** 2026-07-29 · **Status:** accepted

`usePanZoom` takes `setPointerCapture` in `onMove`, the moment the 8px slop
threshold is crossed — never in `onDown`.

**Why.** Capturing on press retargets every subsequent pointer event to the
viewport, so `pointerup` never reaches the button that was pressed and the
browser never synthesises a `click` on it. **Every building on the map was
unclickable with a real mouse.**

**This survived verification twice, and that is the important part.** Synthetic
`PointerEvent`s do not trigger pointer capture, so every scripted test passed
while a real mouse failed. It was found in one attempt by driving an actual
browser click.

**Consequences.**
- **A pointer interaction is not verified until a real click has driven it.**
  Synthetic dispatch proves the handler exists, nothing more.
- Two related guards, same bug family: drag distance is measured from the PRESS
  POINT (per-event deltas get slow drags and decisive clicks backwards), and
  `draggingRef` resets on every press — a missed `pointerup` used to leave a
  stale pointer, so the flag never cleared and the map became permanently dead
  with nothing visibly wrong.
- Anything overlaying the map must carry `data-wm-nodrag`, or pressing a
  control inside it starts a pan and the click is swallowed. This is why the
  base menu opened and nothing inside it responded.

---

## ADR-0089 — Damage states are EDITS of the intact render

**Date:** 2026-07-29 · **Status:** accepted

Each fort's sieged / breaching / breached art is generated by editing that
fort's own intact render (`gen-fort-damage.js`), never by prompting for a
damaged fort from scratch.

**Why.** A player has to read the ladder as the SAME building taking damage.
Three independent generations of "a damaged keep" produce three different
keeps, and the map then looks like the fort was swapped rather than shelled.
Editing pins silhouette, palette, camera and framing, so a wall always falls
apart into ITSELF.

**Consequences.**
- The identity block is repeated verbatim on every edit. Without pinning all of
  it the model re-frames or re-colours and the ladder stops reading as one
  structure.
- **The intact crop sets the frame for the whole ladder.** Cropping each state
  to its own bounding box shrinks the fort the instant it takes damage — a ruin
  has a smaller bbox — so it visibly jumps.
- White is flooded inward FROM THE BORDER, never keyed globally: these walls
  are sun-bleached bone and a global white test eats their lit faces. It also
  correctly cuts sky seen through a breached roof.
- `gpt-image-2` rejects `background:"transparent"` outright (HTTP 400).

---

## ADR-0090 — Platform detection is TEXTURE at the grass-tuft scale

**Date:** 2026-07-29 · **Status:** accepted

`map-anchors.py` finds building platforms by local contrast in the **3–14px
band**, not by colour. Measured: platforms 5.4–9.2, lawn 11.0–30.6, foliage
16.3.

**Why.** The first version asked "is this cell NOT tree, water or shadow?" and
called everything else open. 76% of the plate came back open, so the distance
transform found the widest gaps in the **lawn and the road junctions** and
missed the platforms the plate was generated to provide.

Colour cannot fix it — sunlit lawn and a sand platform are the same paint. Two
scales of texture were tried before the right one: measured against a 2px blur,
a platform's dry-brush grain (13.8–16.4) is indistinguishable from foliage
(16.7), which ate the platforms from the inside and left **0 anchors**.

**Consequences.**
- Roads pass the test — they are smooth and bare — and are excluded by
  GEOMETRY: a painted road is ~2 grid cells wide, so `MIN_R` rejects it.
  Nothing about a road's appearance distinguishes it from a plaza; only width.
- Two masks, two jobs: `open_mask` answers WHERE A BUILDING BELONGS (strict);
  `clear_mask` answers HOW BIG IT MAY BE (permissive). Using the strict mask
  for both undersizes every anchor.
- **Re-measure the thresholds when the biome changes.** They are exposed on the
  command line for exactly this reason.

---

## ADR-0091 — The people are ON the board

**Date:** 2026-07-29 · **Status:** accepted · **Restores** the S3/S4 behaviour

Commanders are drawn on the world map at the stronghold they hold the most of,
with their own tank, linking to their garage.

**Why.** Locked twice in S4: *"the standings don't show the individuals like
S3, people love this."* The world map shipped showing the war and not the
people fighting it — other commanders existed only as a link and a list. Mike
caught the regression by asking what the old map did that this one didn't.

**Consequences.**
- Crowding on one wall uses a **golden-angle ring**, elliptical rather than
  circular: y is compressed on a 16:9 board, so a circle reads as an egg
  standing on end. Successive figures can never land on each other and the ring
  grows with the crowd.
- Anyone holding nothing musters beside the staging area rather than vanishing.
  "Nobody is playing" and "I hold nothing yet" must not look the same.
- The staging block **grows away from the nearest edge**. Stepping downward
  from a muster field at y 0.87 ran off the board and clamped every row to the
  same y — 7 stacked pairs, worse than no spreading at all.

---

## ADR-0092 — Popup cards, and localisation lands in one commit

**Date:** 2026-07-29 · **Status:** accepted

Destinations open as cards over the map rather than as pages. Every string they
render lives in the `world` block of `lib/s5/strings.ts`.

**Why.** The plate holds ~19 well-spaced buildings, not 24. Five facility huts
(Upgrade, Kit, Trophies, News, How To Play) came off the board and became tabs
on the base card. Crowding them back on to hit a count is the "menu bar with
random shit everywhere" look this rebuild exists to end.

**Consequences.**
- `S5Dict = typeof en`, so a key present in `en` and missing from `ko` or `zh`
  is a **compile error**. A strings block must land in all three languages in a
  SINGLE commit. The build is the proof of completeness.
- Placeholders go through `fill()` (`{n}`, `{points}`, `{cap}`) so word order
  stays translatable instead of being concatenated.
- The garage panels are imported from the HQ page unchanged — they already take
  exactly `{ me, patchMe, dict }`. Any fix to the real garage lands on the map
  for free, which is the only reason duplicating the surface is acceptable.
- The funding wizard hands off to `/s5/hq#funding` on purpose: it carries real
  money and is not something to reimplement inside a card.

---

## ADR-0093 — Never run a production build while the dev server is up

**Date:** 2026-07-29 · **Status:** accepted

**Why.** `next build` and `next dev` share `.next`. Building while the dev
server serves from it overwrites the dev chunks mid-flight. The symptom is a
page with the CORRECT `<title>` and an EMPTY body, `webpack.js` returning 200
and `main-app.js` returning 404 — which looks exactly like broken application
code and cost two debugging detours in one session.

**Consequences.**
- If the app looks dead, check `/_next/static/chunks/main-app.js` for a 404
  BEFORE suspecting code. Recovery is `rm -rf .next` and a dev restart.
- A 0×0 `.wm-world` with correctly-set CSS variables is the same corruption
  presenting differently, not a camera bug.
