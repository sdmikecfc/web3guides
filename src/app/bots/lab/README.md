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
- Twenty-nine GLBs in `public/bots-art/3d/toy-lab/`: 24 body modules derived from the original garage moulds, plus the Blender-authored hammer, baton, rifle, flamethrower and shield. `scripts/bots-lab-toy-assets.ts` exports the garage moulds with shared-edge subdivision for dents. The earlier clay catalogue and Blender authoring source remain preserved separately. Each catalogue has a provenance/hash manifest.
- Separate v4 simulation at 60 fixed steps per second, seeded randomness, planar movement, facing, wind-up, contact, recovery, travelling projectiles, directional shields and consumable guard. The rifle plants to aim and repositions during recovery.
- Hammer knockdown; every third clean baton hit can stun. Stun is 24 steps (0.4 seconds); knockdown/get-up is 72 (1.2 seconds). Recovery protection lasts another 120 steps (2 seconds), while ordinary damage still applies. Missing weapon arms disable weapon attacks, missing legs disable dodges, and losing both arms disables punches.
- Per-robot clay geometry, limited craters and grooves, fingerprints, protected machinery, debris retaining its dents, deterministic replay/reset. Impact collision proxies use the bind pose so rendering cadence cannot change the damaged vertices.
- Stepped showroom idle poses, smooth combat motion and camera rendering, impact reactions, steady camera, procedural sound cues, pause/resume, repeatable seed input, three rival presets, local build storage and preview-before-fitting.
- Overall stat totals on the left and an isolated 3D part preview with signed comparison on the right. Also added to the existing tutorial/build screen, with stats on each part card. Starter moulds retain their existing equal 1/1/1 stats. Trying a starter part never purchases it or replaces other selected sockets.

## Initial implementation verification (historical)

These commands passed for the initial implementation. Current-revision checks are recorded separately below; the historical full build is not a build of today's visual revision.

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

## Previous correction after visual and combat review

The first clay character designs and their first visual revision were rejected. This revision uses the actual original garage toy moulds, paint colours, faces and winding keys as its foundation. It retains the workshop plate, wooden plinth and warm panels. The original garage renderer and assets are unchanged.

The armour test is directly beneath the preview. It shows a close view of real surface displacement with cavity shading; the rifle is hidden and arms lowered during that inspection. Dents and shading reset together. Shared-edge subdivision prevents the tearing found in the first conversion. These are still bounded surface dents, not volumetric clay.

Build examples now say **Heavy hitter**, **Fast fighter**, and **Sharpshooter**, with a plain-language explanation of each. Independent parts still determine the build. Mike's tier 3–4 direction is recorded in `art-src/bots/TOY_ART_DIRECTION.md`: broader premium frames, substantial shoulders and protective, menacing helmets. Premium tier assets and progression are not implemented by this correction.

Fighting robots render at 88% size. The simulation's usable radius increases from 4.45 to 5.10 units, about 15% more space across the ring. All actors, projectiles, camera targets and indicators use the same presentation scale. The rifle bends its elbows and raises its barrel when crowded, cancels aim below 2.15 units, retreats during preparation/recovery and has a leg-dependent escape step with a 3.5-second cooldown. Precision leg mobility is now 26 (1.56 units/s for the matching pair); faster legs remain faster. Melee fighters approach during preparation and commit their final step into a swing. Shield recharge begins three seconds after the last block. These changes apply only to the v4 lab.

The audience now uses an actual Higgsfield-generated loop based on the existing arena image, mapped around a curved backdrop. The locally served H.264 clip is 960×248, 24 FPS, 8.04 seconds and 143,889 bytes. It is muted, pauses in the showroom or hidden tab, uses a still for reduced motion and falls back to the still on autoplay failure. Provenance is in `public/bots-art/video/arena-crowd-loop.json`. Cinematic framing follows the fight angle to keep both robots visible; steady camera remains available.

Checks passed for that revision:

- TypeScript and the development preview.
- 216 deterministic family/mixed matchups plus 64 additional fully mixed builds, each repeated. All terminate, stay bounded and make contact. 46 of the 216 matchups finish at the time limit; balance and pacing remain unfinished.
- 51 targeted rifle matchups: 1,249 shots and 429 escape steps. Minimum firing clearance, cancelled close-range aim, retreat during recovery and escape cooldown pass.
- All 28 actual GLBs: 12,553,960 bytes, 152 meshes, valid hashes and attachment labels. Geometry and colour isolation, reconstruction, reset, hardware protection, capped deformation, repeated detachment cleanup, and six rifle assemblies' muzzle clearance pass.
- All 200 previous-engine baseline hashes remain unchanged. Existing builder preview/isolation checks pass.
- Desktop and 390×844 browser layouts, a completed fight, visible crowd playback and advancing video time, and no horizontal mobile overflow. Desktop with animated crowd sampled 60 FPS, around 96–100 draws and 204,000–205,000 triangles. These are browser counters on the development laptop, not certified hardware benchmarks.

The current assets draw fewer meshes but contain more triangles than the rejected clay catalogue. A full production build and physical-phone performance run have not been repeated for this correction. Visual quality still requires Mike's review; passing the checks does not certify the toy-design standard.

## Rifle push-off and flamethrower increment

The rifle now answers close pressure with a left-arm shove, a backward dash and a faster aimed follow-up. A clean shove displaces the rival over 12 simulation steps, without adding a stun. A braced shield or a successful dodge prevents displacement. The escape has a shared 4.5-second cooldown. The shove needs the left arm, the dash needs both legs, and the rifle needs the right arm. Losing the left arm still permits a dash without a shove. Muzzle flashes, travelling trails and an on-screen shot count make firing readable. Trails stop when their simulation projectile makes contact or expires.

Choose **Weapon → Flamethrower → Fit this part** to try the fourth weapon. Its compact orange, ceramic and brass toy model comes from `art-src/bots/blender/build_lab_flamethrower.py`, with editable `lab-flamethrower.blend` beside it. It fires four cone checks across a 0.8-second burst, reaches 2.7 units, then cools for 1.1 seconds. Unblocked hits refresh a bounded 2.5-second burn, which damages body armour for 2 every 0.5 seconds while active. Directional shields can prevent ignition; stun/knockdown interrupt the burst and right-arm loss disables it. Heat leaves isolated scorch shading instead of physical craters. Scorch survives detachment and resets/reconstructs with replay. Both guns pull back at close quarters; flame jets stop at the rival's body proxy.

Latest verification:

- `npx tsc --noEmit` passes.
- `npx tsx scripts/bots-lab-check.ts`: 216 repeated family/mixed fights plus 64 fully mixed builds pass. 192 of the 216 finish by knockout; 24 reach the 90-second limit.
- `npx tsx scripts/bots-lab-rifle-check.ts`: 51 rifle matchups, 1,283 shots and 203 rifle escapes. Cooldown, firing clearance, arm/leg requirements and blocked/evaded shove checks pass. The reported seed 2048, Sharpshooter vs Fast fighter design 2, fires 14 shots and deals 176 total part damage. It still loses on remaining body armour at 90 seconds. This is not a competitive balance certification.
- `npx tsx scripts/bots-lab-flame-check.ts`: 144 repeated mixed-weapon fights, cone/range, interruptions, shield protection, finite burn duration and arm-loss checks pass.
- `npx tsx scripts/bots-lab-assets-check.ts`: 29 GLBs, 12,658,712 bytes and 158 meshes; hashes, attachment labels, actual dents, scorch, instance isolation, deterministic reconstruction, detachment/reset/disposal and both guns' muzzle clearance across all six family/design assemblies pass.
- `npx tsx scripts/bots-director-check.ts`: all 200 previous-engine baseline hashes remain unchanged.
- Desktop browser confirmed the 14-shot reported result, fitted flamethrower with all six body parts preserved, flame burst/cooling/burn indicators and a completed flame match. Sampled rendering with the animated crowd was 60 FPS, roughly 98–102 draws and 205,000–207,000 triangles. These are development-laptop browser counters, not physical-phone measurements.
- At 390×844, the flame weapon, health/status labels and pause/steady-camera controls fit without horizontal overflow. A completed flame match replayed with restored armour, zero dents and cleared burn state; the asset checks also repeat detachment/reset cleanup 12 times. Browser error logs were empty during this check.

Shoulder-mounted weapons are not part of this increment. Flame is a stylised particle cone with simple body-proxy occlusion, not a fluid simulation or exact mesh collision. At this point, balance, art approval, physical-phone performance and a new full production build remained outstanding; the later build check is recorded below. Only the isolated v4 practice lab changes; no production deployment was made.

## Flame visibility and release check (latest, 8 September 2026)

Replaced the tiny polygon particles with a shared soft flame sprite. The stream reaches the weapon's existing range and flares upward at contact; taller flames follow the burning torso during cooling. Warm local lights help the effect read against the toy surfaces. Instancing caps the effect at one flame draw, and its texture and lights are released with the scene. Simulation damage, timing, range and match results are unchanged.

- TypeScript, practice purchase/save/restore and campaign-enrollment checks pass; all eight campaign reporter contract checks pass.
- Full `npm run build` passes with the production workshop/toy/onboarding switches enabled. Existing optional wallet dependency/Browserslist warnings remain. Eight compiled HTTP checks pass for both domains, the Lab, policy pages and the flamethrower asset.
- Compiled browser preview completed a match and replay reset health, dents and burning; browser error logs were empty. The user's mixed Heavy head 2/precision body/flamethrower build sampled 60 FPS, 99–100 draws and approximately 212,000 triangles with the animated crowd. No physical-phone or OS reduced-motion run was added.
- ModelKombat.xyz and domagaming.com already point to the linked Vercel project. The new Lab is local and needs its production flag. The live competition feed reports unavailable data; signed wallet persistence is not verified. See [deployment readiness](./DEPLOYMENT_READINESS.md) for the exact command and launch gaps.
- Main Garage, Parts, Build and Fight navigation stays in one app shell. Full concept-art room presentation remains incomplete: the builder has the workshop backdrop, Garage uses an art banner above its collection, and Parts is a catalogue grid. Combat Lab remains separate.

The fire is still a stylised sprite effect with approximate body occlusion. This revision does not certify final art quality or competitive balance. No production deployment was performed.

## Remaining limits

- A physical mobile-device performance test is outstanding; the 30 FPS phone target is not certified. Reduced-motion branches disable camera motion/impact slowdown and CSS animation; an OS-level reduced-motion session was not available for live verification.
- This is an initial combat/visual balance pass. Family variants and matchups are not competitively balanced. Boundary movement and limb-loss outcomes are deterministic but use simplified planar collision, not a full physics solver. Highly asymmetric combinations can have approximate hand/weapon contact and some clipping during falls.
- Dents are bounded shell deformation, not volumetric clay simulation. Fine surface detail uses a procedural normal map; no tearing, material transfer, sliced limbs, or exact projectile-height ballistics. Blade grooves are a material demonstration; the playable baton is an electrical melee weapon, not a fourth sword weapon.
- Sound is synthesized prototype audio. Replays restart from the seed; there is no timeline scrubbing or persisted/shareable replay file yet.
- Charged specials, interacting item effects, drops, salvage and multi-round carryover remain the next increment. Production combat, wallets, prize rules and the existing concept-art rooms were not changed by the lab.

## Discord preview post

Combat Lab preview update: flamethrower bursts now have softer, longer flames, a flare where they hit and visible lingering fire while the weapon cools. Combat stats and timing are unchanged. Practice only while we refine balance and visuals.
