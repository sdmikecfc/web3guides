# Connected workshop and renderer package

The approved nine robot families, 48 weapon kits, parts workbench, painting,
local banners, version-8 practice combat and three animated arenas are packaged
in `public/bots-playtest`. `/bots/playtest` now redirects to `/bots/workshop`,
which connects building, five garage stands, the shop, fights, Community and a
progress dashboard. `/bots/workshop?view=parts` opens the shop.

The workshop currently uses a separate browser save and clearly labeled browser
coins. Finishing fights awards local progression; it cannot award wallet coins,
rank, trading bonuses or cash prizes. Existing wallet inventories and the main
`/bots` game remain intact. The wallet-backed migration is NOT complete.
Localhost choices do not automatically transfer to the website or a phone.
Balance approval and physical-phone performance testing remain open.

The standalone parts/paint/banner workbench is still available at
`/bots-playtest/index.html?view=parts`. The connected workshop currently offers
per-part painting, but its banner editor has not yet been integrated.

## Build and deployment

Normal Next.js builds serve the committed static package. No separate Vercel
project, ignored local folder, paid service or new credential is needed.
Use the project's normal Git deployment or existing `vercel --prod` workflow.

Runtime source is retained in `art-src/bots/personal-v8`. To rebuild it:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/bots/build-personal-site.cjs
```

This runs a strict type check, verifies the asset receipt, builds the browser
chunks and namespaces URLs under `/bots-playtest/`. Commit both changed source
and generated files after changes. The binary assets retain their original hashes.
The website's shared equipment types, item statistics and appearance data live
in `src/lib/bots/workshop8`. The authoring renderer re-exports these same modules.
Vercel excludes `art-src` entirely; normal site builds do not require it. The
workshop check deliberately hides that directory to catch deployment regressions.

To inspect the renderer alone locally (this does not serve the Next.js rooms):

```powershell
node scripts/bots/serve-personal-site.cjs
```

Open `http://127.0.0.1:3160/bots/playtest`.

Run the normal Next.js development server to inspect `/bots/workshop`.

## Verification, September 18

- Strict TypeScript and local state transaction checks pass with
  `node scripts/bots/workshop-check.cjs` (use the preserve-symlinks flags above
  if required by the Windows sandbox).
- A fresh automated Chromium profile completed all seven choices, named and
  finished its exact robot, opened the 16-item shop, fought, reloaded mid-fight,
  resumed at the saved tick, earned once, replayed and bought a spare part.
- The resumed fight and replay matched winner, final tick and every recorded
  event, including impact locations. The new connected mode uses immutable hand
  collision geometry for backup punches; visual dent updates cannot change it.
  This behavior is explicitly versioned with `-stable-fists-1`. Standalone v8
  retains its earlier collision behavior.
- Browser checks cover 1280×720, 390×844 and 844×390 layouts. They use software
  WebGL and accelerate the actual simulation in bounded batches for integration
  assertions. These checks are not a desktop GPU or physical-phone FPS result.
- Duplicate Finish, purchases, recycling and rewards, daily earnings limits,
  spare consumption, repair quotes and invalid-save preservation have checks.
- The renderer build verifies all 436 packaged asset receipts. No paid assets
  were generated and no production deployment was performed in this pass.

The automated checks are `scripts/bots/workshop-browser-check.cjs` and
`scripts/bots/workshop-visual-check.cjs`; set `MK_PLAYWRIGHT` to an installed
Playwright module path. They use fresh local-only profiles and no wallet.

## Production deployment, September 18

The connected workshop is deployed at
`https://www.modelkombat.xyz/bots/workshop`. Existing `/bots/playtest` links
redirect there. The original wallet collection remains available separately.

Follow-up fix: the `modelkombat.xyz` and `www.modelkombat.xyz` root addresses
now direct players to the connected workshop. `?collection=classic` preserves
the existing wallet collection. Production deployment
`dpl_ABAU1pCTSkahaVrKovW97SgwBgci` builds with `art-src` entirely absent:
the website and authoring renderer share the runtime modules under
`src/lib/bots/workshop8`. Local dependency-boundary and domain-routing checks
cover these failures explicitly.

Deployment: `dpl_HfmbTGr1PNRZYQ6ySC3AWbeNMDN9` in the existing `web3guides`
Vercel project. The release was assembled from the exact preceding production
source (`dpl_9kCwFGrwDXEzXj8NPyz6RTYgPrZd`), with only the connected-workshop
files and its build configuration overlaid. Unrelated local changes were not
used as the deployment baseline. Reporter code and shared accounting were
preserved unchanged. No migrations were applied.

The exact package passed TypeScript and Vercel's production build. Hosted checks
covered fresh onboarding, seven choices, saving the selected robot, loading the
3D garage, sixteen shop items, loaded mobile images, and a running house fight.
The renderer path permits same-origin framing; other paths retain their existing
frame protection. This workshop still uses browser saves and browser coins.

## Remaining integration work

### Welcome and wallet isolation

Published September 18 as `dpl_41SceuLTTwsX93LYTXoa3JcQcWtM` in the existing
Vercel project after production build and hosted browser checks.

The new welcome presents the game loop, the three fighting styles, a free
250-coin first build and an optional example fight. Currency is called "game
coins" and explained as non-withdrawable game points. Storage and Doma are
explained in expandable plain-language answers. Approved robot renders are
lightweight static PNGs, so entry does not start a hidden 3D scene.

`mk8.welcome.2` records only whether this introduction has been seen. It does not
grant coins or replace the workshop save. Returning players can reopen it from
Help. The example fight runs separately and never settles progression rewards.

The workshop route bypasses wallet providers altogether. Existing wallet routes
load their original providers separately; shared wallet code is unchanged.
`scripts/bots/workshop-intro-check.cjs` checks a mock injected wallet and provider
discovery, example-fight isolation, existing inventories, draft continuation,
keyboard dismissal, reduced motion and desktop/phone/short-landscape layouts.
These are browser-emulated layout tests, not physical-device performance tests.

Wallet-backed ownership and server-owned v8 rewards, ranked play, public sharing
and video export are not connected to this workshop. Do not replace production
season enrollment with its local save. The main game continues to use its
existing server-authoritative flows. New browser history pins rule, motion and
presentation versions; incompatible saved fights retain their result and show an
unavailable-replay message rather than silently reinterpreting the result.

The asset package is approximately 488 MB in total, loaded as needed. It includes
all tiers and animation backgrounds, rather than only the currently selected
robots. Physical-phone rendering performance has not yet been measured.

### Window-sized builder and shop (September 18)

Deployment `dpl_Rf4e67WTE57T7RYccNauoDpKawRS` replaces the crowded builder with
three stages: style, parts, and name/review. Style examples are labeled as upgraded
fighters; the chosen body is Tier 1. All seven choices remain editable until Finish.
Going back or reloading preserves the draft, names, owned parts and coin balance.

`WorkshopItemPages` measures available space and shows complete cards with Previous
and Next controls. Filters reset the page; closing an item popup preserves it.
The builder and shop share this paging behavior. Phone builders use an explicit
robot-preview dialog instead of a hidden running renderer beside the parts.
Dialogs include a touch-accessible Close button and restore keyboard focus.

Verification: strict TypeScript with authoring files unavailable; full isolated
production TypeScript; Vercel production build; responsive screenshots and card
containment at 1280×720, 928×930, 390×844 and 844×390; draft resume and exact Finish;
shop pagination/filter reset/popup dismissal; complete fight, checkpoint resume,
identical replay, one reward and purchase. Hosted smoke checks also cover the
fresh welcome, saved robot, mobile images and actual running house fight. These
are emulated viewport checks, not physical-phone performance measurements.

The release package started from the previous deployed source and overlaid only
the builder, shared item pages, workshop wiring and dialog close control. No
economy, simulation, wallet, Reporter or shared accounting changes are included.

### Part visibility (September 18)

`dpl_FVWMtYF5jiQqH1n1s6irxSsfXExJ` adds 264 newly rendered catalogue thumbnails
at `public/bots-playtest/part-previews-light-v1`. The existing images had an opaque
dark background; a CSS-only change could not brighten it. The capture uses the
existing parts renderer and unchanged GLBs, with a light neutral studio surface,
closer framing and the approved family palettes. Arm captures exclude attached
weapons. The receipt records renderer and source-model hashes. Original assets
and historical thumbnails are retained.

Builder, review and phone model previews use a matching light studio backdrop.
Shop and part-detail cards use the new images. Ranged desktop, tablet, phone and
short-landscape build/review/shop checks pass, including image decoding, unclipped
cards, draft persistence and Finish. No simulation, statistics or economy change.
