# Three-hero remaster review — 13 September 2026

Status: **first visual proof ready for review; visual approval pending**. This is not a completed spectator-quality release. The next catalogue expansion requires the user's review of ordinary uninterrupted fights, as specified in the implementation plan.

## Watch the actual browser footage

The local review gallery is `.bots-preview/remaster-v7/review/proof3/index.html`. Videos are saved locally; they are not uploaded or publicly published. Open the live preview at `http://127.0.0.1:3147/bots?view=fight&combat=7&style=speed&rival=ranged&seed=75`.

All paths below are relative to `.bots-preview/remaster-v7/review/proof3/`.

| Complete seed-75 fight | File | Decoded length | Result hash |
|---|---|---:|---|
| Boiler Knight / Roller Daredevil | `complete-fights/tank-speed-seed75.mp4` | 47.714 s | `9afc0287` |
| Boiler Knight / Owl Ranger | `complete-fights/tank-ranged-seed75.mp4` | 48.833 s | `a7f556c9` |
| Roller Daredevil / Owl Ranger | `complete-fights/speed-ranged-seed75.mp4` | 34.411 s | `e956749b` |

Each fight starts at simulation frame zero and continues to the result and short aftermath. No cuts, speedups or selected highlights were applied. Both robots use automatic Balanced Special activation. The footage is a clean arena capture; HTML labels, Special countdowns and navigation appear in the live page and separate HUD screenshots.

Each hero also has a six-second actual weapon demonstration in `proof-shots/` and a full camera rotation in `turntables/`. The silent rotations run 22.933 seconds and retain their original proof-2 metadata because the hero assets and materials did not change. `proof-shots/speed-special-{before,during,after}.png` and `special-hud/` provide the corresponding Special and interface views.

All nine MP4 files decode completely. They are 1280×720 H.264 at 30 FPS; fights and weapon demonstrations include AAC proof audio. The package record includes source/output SHA256 hashes, decoded durations and stream details. These are native browser review captures transcoded to MP4; the source recorder can omit frames. They are not the planned fixed-timeline 1080p Mediabunny exporter. No paid generation was used.

## Verification

- Three actual browser result packets replay with full deep equality in Node, including contact and damage locations; two tampering tests reject edited results. Rules: `mk7-proof-3`; rig/motion/collision/presentation: `mk7-*-pilot-1`; build manifest ID: `02d24920`.
- The 29-file asset handoff was hash verified. Asset manifest SHA256: `47fe5275c9c1c662acd43b28872d08afc6c1ed179140c06b616304bd0aaca8df`. Thirty-three asset-policy checks and independent GLB validation passed.
- Loaded GLB joint positions match the physical pose to less than 2e-12 mm in the two sampled assemblies. Own-geometry checks, repeated damage seeks, reset reconstruction and repeated-seek resource counts pass. No page errors or write requests occurred in isolated renderer checks.
- Focused collision, motion, planted-foot, muzzle, missing-arm fallback, snapshot, continuity and replay checks pass. Sampling the same recorded motion at 30/60/144 Hz preserves its result. Historical v5 compatibility and v6's 21 regression groups passed. Scoped strict TypeScript passed; a full production deployment/build certification is not claimed.

## Measured rendering

Edge 153.0.4234.32, Windows, ANGLE Direct3D11 on **Intel Iris Xe Graphics (0x9A49)**. Ten-second measured windows after warmup, isolated headless browser, active crowd, damage and Specials. CPU model was unavailable. Submission time is CPU draw-submission timing, not a GPU timer.

| Scenario | Render buffer | Average | 95th-percentile frame |
|---|---:|---:|---:|
| Desktop, 1280×720 viewport, final 1.25 pixel cap | 1597×538 | 59.90 FPS | 16.8 ms |
| Phone layout, 390×844 viewport, 1.35 cap, same laptop GPU | 523×796 | 59.90 FPS | 16.9 ms |

The earlier desktop 1.5 cap averaged 54.61 FPS; the final cap was reduced to 1.25. Capture dimensions are independently set, so the saved 720p review clips are unchanged. Phone emulation checks layout and this laptop's rendering only. **No physical phone was available or tested.** These are bounded measurements, not a guarantee for every fight, browser or screen size.

## Visual review and remaining work

The proof supplies new articulated heroes, real cannon/cradle/recoil geometry, coordinated grip/contact poses, separate amber/cyan/violet Specials, owned clay dents, deterministic detached-part motion, camera framing and a populated miniature arena. The review should judge the full exchanges, the short preparation and recovery poses, weapon weight, close-range crowding and how readable dents are at normal size. Code checks cannot establish that the fights are compelling.

Remaining limitations: authored collapse and settling rather than general rigid-body ragdolls; some close exchanges remain repetitive; heads can detach while a robot remains functional; only three complete T3 kits are admitted, without arbitrary mixed-part visual coverage. Sound is designed procedural proof audio, not the final recorded Foley mix. Public replay publishing, automatic highlights, frame-perfect exports, the full family/tier/weapon catalogue, competitive balance and physical-device testing remain later gates. Existing robots and historical engines were not converted. No economy, wallet, database, Reporter or shared-accounting changes and no production deployment were performed.

Detailed machine-readable receipts are in the adjacent `verification/` directory. Editable Blender scenes, GLBs, textures, source code and validation scripts are included in this game-only checkpoint. Large review videos remain local under `.bots-preview`.
