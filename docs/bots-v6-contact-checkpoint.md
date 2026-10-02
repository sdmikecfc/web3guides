# V6 contact review checkpoint — 12 September 2026

Contact/mechanics pass. Balance does not pass. This is a local preview checkpoint for the three T3 heroes, not a release or full catalogue art approval.

No Reporter source, configuration, process, database, shared accounting, live wallet enrollment, paid asset job or deployment was touched in this work. Legacy v2–v5 implementations remain unchanged.

## Integration

Source is staged in `outputs/v6-domain/src/lib/bots/v6/`. At the final comparison, only `build.ts` and `engine.ts` differed from the repository; copy them together. All nine other domain files, including root's `hero-collision.ts`, matched by SHA256. Do not overwrite later root-owned hero edits with older files.

Copy the latest `outputs/v6-domain/scripts/` tests and runner. Added `bots-v6-hero-balance-check.ts`; updated mechanics assertions include unique live projectile IDs and victim break-event identity. `checkpoint-files.json` records exact hashes.

Catalogue IDs, canonical stat tuples, GP and prices have not changed. Seasonal SQL can be checked against the repository catalogue; this does not approve applying it. Derived unreleased v6 snapshots have changed: start a fresh preview fight after copying. No v2–v5 save/replay conversion.

## Correctness fixes retained

- Shared bounded two-link arms, weapon orientation/grip, actual strike point and live arm capsules. No stretched arms or phantom requested contacts. Persistent damage maps into canonical part rest space.
- Actual GLB vectors `[+/-40,-390,25]` and `[0,-425,95]` mm. Independent left/right arm metadata supports mixed builds.
- Whole T3 blade edge sweep `[65,180,0] → [150,870,0] → [35,1090,0]`, radius 30 mm, mirrored left. Targets between endpoints are hit; back-of-hammer contacts are rejected.
- Authored Tank recovery correction passes dense reach checks. Root's staged/repo hero manifest currently matches.
- Shared articulated gun mounts, eccentric muzzle rays and seeded pre-collision spread. Actual barrel checks replace the overly conservative body-radius minimum that blocked valid pistol shots. No random miss after a physical hit.
- Flank specials use the actual equipped blade proxy. Projectile IDs are unique across pellets/emissions. Break `who` and `target` both identify the victim.
- Real directional footprints, swept body-front charge and deterministic coincident-centre separation.

Shared exports: `fighterPoseV6`, `posedProxiesV6`, `weaponGripPoseV6`, `gunMountV6`, `muzzleV6`, `barrelClearV6`, `actionPhaseV6`, `actionPathPhaseV6`.

## Selected numeric state

The last 0% Tank/Ranged training candidate was rejected. The earlier pass-4 numbers were restored while keeping all correctness fixes. The actual-blade flank correction changes the resulting rates, so old pass-4 percentages are not the current result.

| Setting | Chosen value |
|---|---:|
| Twin blades raw damage | 27 |
| Shoulder cannon raw damage | 47 |
| Piledriver damage multiplier | 1.18 |
| Backup pistol damage / impulse | 18 / 260 |
| Backdash / T3 charge movement multiplier | 2.1 / 2.8 |
| Body-stat plating coefficient / cap | .24 / .35 |
| Aim-error accuracy coefficient | .035 |

Five-second Specials, shield reduction/cap, meter, slow, status protection and GP budgets were not weakened. These numbers remain a preview candidate.

## Completed verification on chosen state

- Strict staged TypeScript (no emit or incremental output): PASS.
- Mechanics: 11 groups PASS, 24,863 bounded trajectory ticks, 375 physical shot origins. All ten weapons finish their fixtures; AP/shield/control/meter/limb/status, command retry, JSON reconnect/replay, origin/ID and coincident-centre checks pass.
- Actual-GLB/shared-pose: 6 groups PASS, including complete blade-edge sweep. Tank/Speed reach passes both sides, 201 phases and five height requests, maximum error below 3e-13 mm versus a 1 mm requirement.
- Earlier unchanged-legacy verification: v5 12 groups, 352 mixed/repeated fixtures, 40,235 trajectory ticks, all 200 frozen hashes unchanged; historical replay/link compatibility PASS. Not unnecessarily rerun after v6-only edits.
- Root/Faraday separately report actual Three.js/GLB hand/grip agreement and root reports the sword/arm browser fix and contact clip verified. Those are separate integration results.

## Balance evidence: FAIL

Authored T3 signatures, eight seeds per bank, both sides, 16 matches per pair, 96 matches total. Both players use automatic Specials with Balanced plans. Rates are wins for the first style.

| Pair | Training | Held out | Required |
|---|---:|---:|---:|
| Tank / Speed | 68.75% | 62.5% | 30–70% |
| Tank / Ranged | 37.5% | 25% | 30–70% |
| Speed / Ranged | 100% | 93.75% | 30–70% |

Training overall: Tank 53.125%, Speed 65.625%, Ranged 31.25%. Held-out overall: Tank 43.75%, Speed 65.625%, Ranged 40.625%. Required overall: 40–60%. First-side bias: 6.25pp training, 2.08pp held out; required below 5pp. No timeouts.

Training seeds are `7919*i`; held-out seeds are `0x4ab93000+130363*i`, i=1..8. Held-out seeds were not used for numeric tuning, but were also evaluated on the rejected candidate. No changes were made after viewing the final results. This reduced diagnostic exits nonzero and cannot certify balance even if its rates pass.

Earlier pass-4 training, before actual-blade flank correction: 56.25 / 37.5 / 93.75%. Rejected final numeric pass: training 75 / 0 / 87.5%, held-out 50 / 6.25 / 56.25%. That rejected pass used charge3.8, backup28, plating coefficient.4, aim coefficient.15, piledriver1.10; those values are not selected.

Final logs: `checkpoint-mechanics.log`, `checkpoint-pose.log`, `checkpoint-tsc.log`, `checkpoint-hero-balance.log`. Rejected history remains `hero-tune-*.log` and `rejected-tune7-hero-heldout.log`.

## Exact commands

From task workspace:

```powershell
$env:NODE_PATH='C:/Users/Mike/Desktop/web3guides/node_modules'
node --preserve-symlinks --preserve-symlinks-main styles-test-runner.cjs outputs/v6-domain/scripts/bots-v6-check.ts
$env:BOTS_V6_ASSET_ROOT='C:/Users/Mike/Desktop/web3guides/public/bots-art/3d/season-v6'
node --preserve-symlinks --preserve-symlinks-main styles-test-runner.cjs outputs/v6-domain/scripts/bots-v6-pose-check.ts
$env:BOTS_V6_HERO_SEEDS='8'
$env:BOTS_V6_HERO_SPLIT='both'
node --preserve-symlinks --preserve-symlinks-main styles-test-runner.cjs outputs/v6-domain/scripts/bots-v6-hero-balance-check.ts
node --preserve-symlinks --preserve-symlinks-main C:/Users/Mike/Desktop/web3guides/node_modules/typescript/bin/tsc -p outputs/v6-domain/tsconfig.json --pretty false
```

Portable repo runner after copying: `node --preserve-symlinks --preserve-symlinks-main scripts/bots-v6-check.cjs <test-file.ts>`. Accepted files: `bots-v6-check.ts`, `bots-v6-pose-check.ts`, `bots-v6-hero-balance-check.ts`, `bots-v6-balance-check.ts`. Hero default is 16 seeds and both splits.

## Explicit remaining work

1. Tune Speed/Ranged and Tank/Ranged through real contact, part-loss, cycle, escape and time-to-first-shot diagnostics. Inspect side bias with larger samples; retain all gates.
2. Run fresh full-size training/held-out after the next freeze. All tiers/families, mixed builds, signature splashes, mirrors, Early/Balanced/Last stand, manual timing and ten-weapon counter combinations are not certified. The broad runner covers base presets and signature/mixed samples; it does not exhaust the weapon/plan matrix. No current full catalogue balance run has passed.
3. Root temporarily removed cosmetic tipping/leg swing because proxies stayed upright. Shared physical knockdown/leg poses remain needed. Upright recovery is an explicit current visual limit.
4. Non-blade Speed bodies still need an authored built-in flank blade for complete equipment fidelity. Renderer should hide held equipment during an unarmed punch/shove; do not invent invisible contacts.
5. Full six-family/four-tier art production awaits hero review. Only three T3 GLBs have actual mesh/joint evidence; other collision metadata is rehearsal data.
6. No physical-mobile benchmark, live wallet/season rollout, database application or deployment. This checkpoint does not authorize any of them.
