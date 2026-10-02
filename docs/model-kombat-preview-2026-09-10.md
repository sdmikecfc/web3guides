# Model Kombat preview checkpoint — 10 September 2026

This checkpoint covers the clearer start, compact shop, shared garage scene and populated Community preview. The game remains a single-window experience with the original warm toy style. Existing robots, parts, coins and progress are preserved. The changes are local/preview work; this checkpoint is not a production deployment or permission to change a shared database.

## Absolute Doma Reporter boundary

**Doma Reporter protects the user's active 150,000-member Discord server and is off limits. Do not change its code, configuration, processes, services, deployment, live data, or related shared database behavior without separate explicit user permission after explaining the exact changes and consequences. Permission to develop or deploy Model Kombat does not grant that permission.**

Do not start, stop, restart or modify the offline trading, LP or arbitrage bots. Preserve unrelated existing changes, including Reporter intents, Dash, Maxxers and Studio. No Reporter edits, service operations, live/shared migration or real wallet enrollment were performed in this increment. Earlier operational notes must not be treated as authorization to cross this boundary.

The onboarding SQL is **staged only**. It proposes changes to `battle_bots_onboarding`, a replacement of shared `bb_coin_balance(text)`, four `bb_onboarding_v2_*` RPCs and their permissions. Enrollment and Finish would write game records and shared player/ledger balances through existing `bb_grant`. Our v2 work does not redefine `bb_grant`; the pre-existing v1 prerequisite does, so that prerequisite also requires separate detailed review if it is absent. No live/shared function was replaced. Do not describe the proposed shared-function behavior as unchanged.

See the [exact staged objects and migration boundary](../scripts/sql/onboarding-v2-migration.md) and [detailed backend verification](../scripts/sql/onboarding-v2-verification.md). Live schema, installed function definitions and production role permissions were not inspected in this audit. There is no unconditional migration or deployment instruction in this checkpoint.

## Completed preview behavior

**First visit and ownership**

- A centered “Build your own robot.” welcome offers Build my robot or Look around. Examples are labeled, and players can resume their own build.
- New v2 players build one robot with 250 protected starter coins. They can revisit all seven choices and choose a name before pressing Finish robot. The robot does not finish automatically when its weapon is selected.
- Finish preserves the selected model, creates seven owned parts and spends the allowance once. Finished robots keep their parts; name, face and stickers remain editable. Practice and garage exploration are explicit next choices, without an automatic earning-panel interruption.
- Browser and wallet storage are distinguished. Partial or completed browser choices can transfer into a new wallet draft after validation; browser coins, results and earned rewards are not imported. Existing wallet garages remain intact. Failed transfers offer retry or continued browser practice.
- Existing v1 onboarding and old browser saves remain supported. Stored v2 drafts can still resume if enrollment flags are turned off. Missing v2 SQL refuses new enrollment clearly instead of granting an old starter.

**Garage and Community**

- The garage uses one Three.js scene with five wheeled stands, a shared camera, floor, lights and shadows. Saved robots retain their actual parts and size differences. Selection, compact clipboard actions, build pointers and the maximum-five explanation remain available.
- Community now has five occupants: a featured recorded pair, additional visitors when available, and a workshop helper. Recorded robots link to their actual saved replays. Sparse activity uses labeled practice robots rather than invented players or online-status claims.
- The scoreboard and recent-fight tickets distinguish missing activity from failed loading. Visible Community views refresh fights every 30 seconds and standings every 60 seconds. Optional reads have deadlines, cancellation and stale-response protection.
- These are **fixed-camera rooms using projected background photographs/art, real 3D toys and stands, and shared shadows**. They are not complete free-camera Blender-built rooms. Full Blender room export and the remaining technical room audits are not finished.

**Shop**

- A compact shelf grid replaces the permanent side inspector. All 16 daily items fit at 1280×720; nine complete tiles fit at 390×844.
- Item popups contain the picture, name, tier, price, stats and purchase action. The delivery calendar is a popup; sorting and filters stay below the shelves. Closing inspection preserves shelf position.
- Compare with a robot supports independent left/right limbs and signed stat changes. Projected totals use actual fight aggregation, including family/colour bonuses. Finished-robot comparisons explain planning another robot; purchases add spare parts.
- Concurrent model preloading fixes the slow serial loading of shelf pictures.

## Verification completed

| Area | Evidence and result |
| --- | --- |
| Build | Full optimized Next.js production build passed; strict TypeScript passed. Build log: `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\model-kombat-launch-build.log`. |
| Fresh browser | Welcome, seven choices, replacing the head, explicit Finish, exactly one robot/seven parts, 250→0 coins and identical reload all passed. |
| Wallet boundaries | Mocked partial transfer, existing-wallet conflict, failed Finish/retry, persistent name, failed handoff/retry/keep-browser, signout during delayed transfer and failed-refresh recovery passed. Original browser choices stayed unchanged. Every API was mocked and external origins blocked. |
| Onboarding/domain | Eight v2 SQL/local groups, thirteen existing v1 SQL groups, game state, rollout/service fixtures and wallet/fight regressions passed. Actual SQL ran only in isolated in-memory PGlite. |
| Shop | 183 comparison cases passed, including both limb sides, empty slots, exact combat totals, bonuses and unchanged saved inventory. Browser checks confirmed all 16 desktop and nine phone tiles with loaded pictures. |
| Community | Visitor/identity and API checks passed: saved build snapshots match replays, old/missing snapshots do not impersonate players, and optional opponent-query failure does not discard public fights. |
| Popups and layout | Desktop and phone room previews reviewed; popup Escape, focus and preserved scroll exercised. Mobile Community boards now fit. |
| Optional room reads | Seven mocked requests and focused strict TypeScript passed for timeout/retry, cancellation, stale-body rejection and timer/listener cleanup. |

Unchanged SQL/service checks were not repeated merely for documentation. The [backend report](../scripts/sql/onboarding-v2-verification.md) records the detailed scenarios and test limitations.

Latest reviewed screenshots are in `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\outputs\launch-review\`:

- `garage-form-desktop.png` and `garage-form-mobile.png`
- `community-form-desktop.png` and `community-form-mobile.png`
- `shop-complete-desktop.png` and `shop-complete-mobile.png`

The user said “keep going please” after the room previews and review request. This is the accepted visual direction for continued trailer-reference preparation. It does not mean that unperformed Blender/runtime audits have passed.

## Performance and remaining limits

A short development-desktop sample showed about 60 FPS, 248 draw calls, 159,726 triangles and 3.4 ms CPU submission time. The GPU/hardware model was not recorded. CPU submission is not GPU completion, and this short sample is not a sustained performance benchmark.

No physical phone benchmark or real signed-wallet/live-database round trip was performed. Phone-sized browser layout checks do not establish the 30 FPS hardware-mobile target. PGlite's single-process queue does not establish physical multi-connection concurrency performance. Short-landscape shop and trailer checks passed, and emulated reduced motion stopped both room render loops. Physical OS-setting validation and a long replay/resource soak remain untested. Technical Blender/runtime audit flags remain false where work has not been done.

No external preview or production deployment was performed in this increment. A release still needs the appropriate game review and the separately authorized database decision; do not bundle unrelated working-tree changes into a release.

## Trailer delivered

The 35-second widescreen master, 15-second vertical cut, poster, credits and native editing project are complete. Four Seedance 2.5 shots were used; two impact attempts were rejected and replaced with actual gameplay. Total spend was **270 / 450 credits**, confirmed against the account balance. The 9.6 MB website copy loads only after Watch trailer is selected.

See [trailer deliverables, verification and limitations](model-kombat-trailer-2026-09-10.md) and [source-shot records](model-kombat-trailer-source-records.json). The player passed five browser cycles across desktop, phone and short landscape, including playback, no advance media requests, Escape and disposal. Final TypeScript passed. The original optimized build passed before the final small capture/player/layout edits; those edits compiled and ran in the preview.

The actual impact insert is slowed, with a held camera orbit; no simulation or geometry overrides were used. Fine dents remain subtle at fight distance. This does not complete the outstanding Blender room audits, physical-phone benchmark or separately authorized live database decision. Doma Reporter and live/shared SQL remain untouched.

## Draft Discord preview post — not sent

> **Model Kombat preview update**
>
> Start with 250 coins and build your own robot. Pick all seven parts, change your mind as you go, then give it a name and press Finish. Those parts stay with that robot.
>
> Your garage has five stands. The shop shows more parts at once, and tapping a part lets you see its stats and compare it with your robot. Community shows robots from recent fights, with replays you can watch.
>
> The trailer is ready, and we're still testing the preview. This is not the competition launch. Please tell us where you get stuck, what looks odd and which robot is your favourite.
>
> Preview link: [add the reviewed preview URL before posting]

The draft is for review only. No Discord message has been sent.
