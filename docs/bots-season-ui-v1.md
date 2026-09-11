# Season workshop and shared game rooms — preview verification

Date: 2026-09-12. This is the preview UI behind `BOTS_SEASON_V1` and `NEXT_PUBLIC_BOTS_SEASON_V1`; it does not enable a hosted season or apply a migration.

## Implemented

- The new season has its own shell and session-only wallet sign-in. Visiting, browsing, or opening the tour does not enroll a player, grant coins, or hydrate the old garage. Collection opens the existing saved garage separately.
- Fresh visitors can build, browse, watch the trailer, or take a short illustrated tour. Returning players can reopen “Show me around.” The tour only saves its presentation version; it never resets a robot or draft.
- The build starts with the body and keeps all seven choices editable until Finish. Left and right limbs are independent. The selected body explains its special, the basic styles have plain strengths and weaknesses, and incompatible signatures remain visible instead of silently changing another part.
- Shop and build comparisons use canonical `statsV6`, GP, price, and part points. A finished robot is a reference for planning another robot. The sixteen-item shelf has no permanent inspector; details open in a native dialog. Filters stay below the shelf.
- Browser drafts contain canonical part IDs, name, and defense preference only. Wallet/server revisions and balances are not imported from browser storage. Conflicting browser and wallet drafts require a clear choice. A failed draft or Finish request retains its request ID for an identical retry.
- Season Garage has five stands, explicit readiness/repair information, a quote-confirmed rush repair, offline special plans, the daily coin calculation, source-status text, and an explicit trade-bonus check. A free loaner is offered when every season robot is repairing.
- Recorded battles, rivalries, and standings use the actual API records. Defender replays explain that they are recorded defenses; they do not imply online presence. Direct rematches use the actual rival robot ID.
- Past-season collections expose each expired purse separately. Their build review charges for unique missing designs, reuses owned designs, and leaves the original robots intact.
- Versions 5 and 6 use the centered fight-room frame with a prominent Special area, popup details, and persistent six-room navigation. Existing demo and saved-replay routes enter the same game shell while retaining their original identity and simulation path.
- Community is a room, not a full-screen legacy drawer. Occupants load independently; successful actors remain visible when another actor fails. The helper inspects its workshop, visitors arrive, and robots make restrained gestures. Recorded activity and practice examples remain clearly labeled.
- Exact uniform T3 heroes may use their corresponding authored still. A mixed robot, another tier, or another weapon cannot borrow a preset's picture. Selected supported 3D previews use one active renderer; hidden rooms pause their preview.

## Checks completed

- Full project TypeScript: `tsc --noEmit --incremental false --pretty false` passed after the UI changes.
- `scripts/bots-season-workshop-check.cjs`: seven groups passed. They cover 250-coin/100-GP basic builds, combat-stat agreement, independent limbs, final-weapon preservation, incompatible signatures, safe draft parsing, archived-design cost, exact hero-still identity, and URL identity preservation.
- Existing styled catalogue/UI domain regression: seven groups passed; older drafts and catalogue identities remain supported.
- Isolated browser checks passed at 1280×720, 390×844, and 844×390, using Chromium with reduced motion. The new shop shows sixteen complete desktop tiles and nine complete portrait-phone tiles. Short landscape keeps navigation visible with four complete shelf tiles and a scrolling shelf.
- Version-5 fight checks found the arena centered at all three sizes, with Special controls above navigation. The details dialog closes with Escape. The original style URL preserves its seed in the shared shell.
- Community reached five loaded occupants with persistent navigation and no old full-screen drawer. The fresh welcome does not intercept navigation away from a deep-linked fight.
- Fresh welcome and tour browser checks made no POST requests. Independent choices and an unfinished draft survived room navigation.
- A fully intercepted wallet/API test exercised a failed draft save and failed Finish, then identical retries. Both retries reused the original operation ID; exactly one robot was created and one 250-coin allowance was spent in the test fixture. No old `/me`, handoff, or enlist route was called. This is mocked API verification, not a real wallet signature test.
- The complete classic build regression selected mixed independent limbs, finished one exact robot for 250, and reached the actual styled practice link. All sixteen classic shop images loaded; nine complete tiles fit the phone shelf. No browser page errors occurred in these completed checks.
- Direct legacy routes `/bots/fight/demo?seed=75&showcase=1&loadout=hammer` and `/bots/fight/demo-spar` passed desktop/phone checks with an actual canvas, six room buttons, no horizontal overflow, and a working Garage action. This check caught and fixed the ancestor legacy mobile dock intercepting the new room navigation.

Browser scripts and screenshots are in the task workspace at `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/v6-ui-review`. Reports include `season-ui-checks.json`, `season-save-checks.json`, `shell-checks.json`, `legacy-shell-checks.json`, and the `classic` folder. Portable domain checks are included as source files under `scripts`.

## Remaining limits

- The full v6 visual catalogue is not finished or approved. The UI explicitly labels its instruction drawings and pending artwork. Only the three authored T3 hero families and their supported mixed pieces currently have runtime art; real T1–T4 item-specific combat previews require the remaining assets. The three complete hero lineup and contact stills still need human review before broader export.
- Hosted season migration/enrollment remains disabled until the backend rollout is approved and applied. The local preview explains that the season is not open and offers building, instruction, and real practice actions without a wallet.
- Real wallet signing, hosted transactional behavior, a physical mobile device, and the 60/30 FPS hardware targets were not verified by this UI lane. Headless Chromium layout checks are not a physical-mobile performance measurement.
- The independent actor-failure code path is implemented, but an injected hard renderer failure was not exercised in the browser. Missing asset requests can be handled by the existing part fallback before that failure path is reached.
- No DomaReporter code, trading service, live database, or paid generation was changed by this UI work.
