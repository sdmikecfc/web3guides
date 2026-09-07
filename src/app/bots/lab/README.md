# Model Kombat Combat Lab

First combat upgrade, implemented 8 September 2026. Practice only; no wallet, server fight writes, production rewards, or migration of existing replays.

## Open or restart the preview

The local development preview is at http://127.0.0.1:3000/bots/lab. The existing builder's stat panels are at http://127.0.0.1:3000/bots?view=build.

For development after a reboot, run in PowerShell:

```powershell
cd C:\Users\Mike\Desktop\web3guides
npm run dev -- --hostname 127.0.0.1 --port 3000
```

For the already compiled production-mode preview:

```powershell
cd C:\Users\Mike\Desktop\web3guides
$env:BOTS_COMBAT_LAB = '1'
npm run start -- --hostname 127.0.0.1 --port 3000
```

Run only one server on that port. Development and Vercel preview environments enable the lab automatically. `BOTS_COMBAT_LAB=0` disables it; `1` explicitly enables it. Ordinary production is disabled. The server route is dynamic and excluded from indexing. A production deployment was not performed.

## Included

- Six independent body sockets and a weapon; three families with two designs for each head, torso, arm, and leg. Brute left arm 2 carries a shield. All families can mix. Parts contribute armour, movement, aim, evasion, impact power and guard.
- Twenty-eight original GLBs: 24 body designs, hammer, baton, rifle, shield. The complete editable Blender catalogue and its authoring script are in `art-src/bots/blender/`. Asset provenance, byte sizes and SHA-256 hashes are in the GLB folder's manifest.
- Separate v4 simulation at 60 fixed steps per second, seeded randomness, planar movement, facing, wind-up, contact, recovery, travelling projectiles, directional shields and consumable guard. The rifle plants to aim and repositions during recovery.
- Hammer knockdown; every third clean baton hit can stun. Stun is 24 steps (0.4 seconds); knockdown/get-up is 72 (1.2 seconds). Recovery protection lasts another 120 steps (2 seconds), while ordinary damage still applies. Missing weapon arms disable weapon attacks, missing legs disable dodges, and losing both arms disables punches.
- Per-robot clay geometry, limited craters and grooves, fingerprints, protected machinery, debris retaining its dents, deterministic replay/reset. Impact collision proxies use the bind pose so rendering cadence cannot change the damaged vertices.
- Stepped 12 FPS posing with smooth camera rendering, impact reactions, camera emphasis, steady camera, procedural sound cues, pause/resume, repeatable seed input, three rival presets, local build storage and preview-before-fitting.
- Overall stat totals on the left and an isolated 3D part preview with signed comparison on the right. Also added to the existing tutorial/build screen, with stats on each part card. Starter moulds retain their existing equal 1/1/1 stats. Trying a starter part never purchases it or replaces other selected sockets.

## Verification

All commands below passed:

```powershell
npx tsc --noEmit
npm run build
npx tsx scripts/bots-lab-check.ts
npx tsx scripts/bots-lab-assets-check.ts
npx tsx scripts/bots-builder-preview-check.ts
npx tsx scripts/bots-toy-identity-check.ts
npx tsx scripts/bots-director-check.ts
npx tsx --conditions=react-server scripts/bots-game-state-check.ts
```

- 216 family-pair fights, including 72 mixed builds, plus 64 fully mixed builds, each repeated with identical results. All finished within the 90-second limit. Two of the 216 ended on the time limit; the rest ended by knockout.
- Targeted outcome checks for shield direction, interrupted preparation, range, limb loss, stun and knockdown duration and recovery protection.
- All 28 real GLBs parsed and hash-checked; dense clay surfaces, rough materials and attachment labels checked. Actual vertex changes, capped deformation, untouched hardware and second robot, retained damage after detachment, damage reconstruction at different rendering cadences, 12 reset/detachment cycles and disposal checked.
- Every starter offer previews on the intended socket without modifying coins, saved data or the other six sockets. Existing real GLB identity test still preserves all six chosen parts for all eight final weapon choices.
- All 200 previous-engine baseline hashes remain unchanged. Existing onboarding, saved garage and campaign contract checks passed.
- Browser checks at 1280×720 and 390×844: desktop panels, mobile wrapping/scrolling, visible part preview, signed gains/losses, fit/cancel, completed fight, pause, steady camera and real visible dents. A mobile stats-height issue found during inspection was fixed and rechecked.
- Observed development-desktop rendering around 58–60 FPS after warm-up, typically 112–115 draws and approximately 94,500 triangles for Brute/Hotshot. These are sampled browser rendering counters, not a GPU benchmark or a physical phone measurement.
- Compiled production HTTP gate: lab disabled returns 404; enabled local preview returns 200. Build completed with pre-existing optional wallet-package/Browserslist warnings and unrelated dynamic-route logs.

## Visual correction after initial review

The first lab presentation was rejected as a visual regression. The current revision restores the original workshop plate and wooden plinth, presents one larger selected robot, and uses the existing arena audience art behind a physical ring with brass fittings. Warm brown panels and rounded garage typography replace the green presentation. Robots have larger heads, ivory optics with pupils and glints, expressive brows, raised service panels, finer clay variation and distinct coral, teal and blue palettes. Combat rules are unchanged.

Verified this revision with TypeScript, all 28 actual GLB asset/attachment/deformation/replay-cleanup checks, desktop layout at 1440×1000 and mobile layout at 390×844, all three preset designs, a completed fight and return to the workshop, and visible hammer/projectile/blade dents. The showroom sampled 60 FPS, 57 draws and 52,890 triangles on the development desktop; this is not a physical phone measurement. Browser console had no errors. The earlier full build and engine-baseline results above apply to the initial implementation; this visual revision was checked with the development preview and TypeScript.

The clay character designs still need art refinement. Restoring the original setting does not establish that the new models match the original toy catalogue's quality.

## Remaining limits

- A physical mobile-device performance test is outstanding; the 30 FPS phone target is not certified. Reduced-motion branches disable camera motion/impact slowdown and CSS animation; an OS-level reduced-motion session was not available for live verification.
- This is an initial combat/visual balance pass. Family variants and matchups are not competitively balanced. Boundary movement and limb-loss outcomes are deterministic but use simplified planar collision, not a full physics solver. Highly asymmetric combinations can have approximate hand/weapon contact and some clipping during falls.
- Dents are bounded shell deformation, not volumetric clay simulation. Fine surface detail uses a procedural normal map; no tearing, material transfer, sliced limbs, or exact projectile-height ballistics. Blade grooves are a material demonstration; the playable baton is an electrical melee weapon, not a fourth sword weapon.
- Sound is synthesized prototype audio. Replays restart from the seed; there is no timeline scrubbing or persisted/shareable replay file yet.
- Charged specials, interacting item effects, drops, salvage and multi-round carryover remain the next increment. Production combat, wallets, prize rules and the existing concept-art rooms were not changed by the lab.

## Discord preview post

Combat Lab visual update: the familiar workshop is back, with a closer robot preview, expressive faces and a warm arena surrounded by the original crowd artwork. Mix parts and inspect their stats, then take your build into a practice fight. Clay dents and the new combat mechanics are still in place. Preview only while we refine the models.
