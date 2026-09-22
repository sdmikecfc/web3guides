# Model Kombat — three-hero combat proof

This checkpoint implements the first hero/combat review gate. It does not approve the visual direction or complete the full remaster. The full catalogue, public replay publishing, automatic highlights, final Foley and frame-perfect MP4 exporter follow the required review of ordinary uninterrupted fights.

## Open the preview

Run the existing Next development server and open:

`/bots?view=fight&combat=7&style=tank&rival=speed&seed=75`

The current isolated local server uses port 3147. Its restart script is `.bots-preview/remaster-v7/start.cjs`. The browser preview lives inside the existing game shell with persistent room navigation. `Meet the robots`, `Weapon test`, and `Fight` are available above the arena. Details contains hero/opponent selection, repeatable seeds, automatic Special control, screenshots and a short native-video recorder. Space activates a ready manual Special.

For production-mode previews, set `BOTS_REMASTER_PREVIEW=1` for the direct preview route and `NEXT_PUBLIC_BOTS_REMASTER_PREVIEW=1` for the main shell. No production deployment is part of this checkpoint.

## Implemented

- Three original T3 Blender rigs and GLBs: teal Boiler Knight, coral Roller Daredevil and indigo Owl Ranger. Editable Blender scenes, authored material maps, measured joints, collision shapes and weapon markers are retained beside this document and in `public/bots-art/3d/remaster-v7`.
- A separate v7 simulation and shared articulated pose. Hands, weapon grips, cannon cradle, muzzle, recoil, feet and wheels use the same hierarchy for contact and display. Preparation, recovery, interruption, missing limbs and directional defeat have explicit poses.
- Real hammer/blade sweeps, cannon projectiles, backup-pistol draws, retreat, shoves, limited control effects and three actual Specials. Amber shield, cyan Overdrive route trails/afterimages, violet Slow Field, and active countdowns distinguish the abilities.
- Robot-owned clay geometry receives recorded local impacts. Damage follows a part through detachment, reconstructs on replay, and resets between fights. Fine normal/roughness maps are embedded in the exported GLBs.
- A camera that follows recorded action and frames both fighters; portrait and steady/reduced-motion modes; warm miniature arena lighting, audience terraces and existing locally served crowd animation.
- Designed procedural proof audio, native review-video recording, and repeatable local frame capture. These audio cues are not the final recorded Foley mix; native MediaRecorder footage is not the planned frame-perfect Mediabunny exporter.

## Compatibility boundaries

The proof never enrolls a player, spends or grants coins, imports a wallet, awards results, replaces saved robots, or publishes a replay. Only the three fixed T3 practice kits are admitted. Versions 2–6 and their assets retain their current rules. Shared accounting, Doma Reporter, paid generation and competitive balancing are outside this work.

## Reproducible checks

Use the installed Node/TypeScript dependencies; no package installation is required for domain checks:

```powershell
node --preserve-symlinks --preserve-symlinks-main scripts/bots-v7-domain-check.cjs bots-v7-domain-check.ts
node --preserve-symlinks --preserve-symlinks-main scripts/bots-v7-domain-check.cjs bots-v7-motion-check.ts
node --preserve-symlinks --preserve-symlinks-main scripts/bots-v7-domain-check.cjs bots-v7-contact-check.ts
node --preserve-symlinks --preserve-symlinks-main scripts/bots-v7-domain-check.cjs bots-v7-fallback-check.ts
```

For the actual WebGL check, set `MK_PLAYWRIGHT_MODULE` to an available Playwright module and run `scripts/bots-v7-renderer-check.cjs`. Set `MK_PREVIEW_URL` when using a port other than 3147. It opens isolated browser contexts, compares loaded GLB joints to physical poses, checks vertex-buffer replay/reset and shared-model isolation, and measures frame delivery. It does not use a player's browser profile or issue write requests.

Windows installations that encounter the system `realpathSync` permission issue can preload `.bots-preview/remaster-v7/native-path.cjs`. It uses Node's native path resolver; it does not invent paths or alter permissions.

## Review honestly

These are authored toy motions, not general rigid-body ragdolls. The bodies and three complete kits need a human visual review before their proportions, movement and material treatment are extended to all families and tiers. There has been no held-out competitive balance run and no physical-phone test. The final review receipt records exact artifact versions, measured performance and remaining limitations.
