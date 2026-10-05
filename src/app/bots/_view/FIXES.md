# Toy, weapon and wallet corrections · 8 September 2026

## Changes

- Stickers, hats, expressions and earned decorations stay on the selected robot. They no longer route the whole build through a different renderer. Decorations attach to the actual authored surface, follow detached parts and own their cleanup resources.
- Happy keeps the original pupils. Expressions that cover a lens use a denser surface to avoid disappearing inside the curved eye.
- Axes, blades, saws and hammers face forward in the grip. Their contact markers lie on the physical working surface. Weapon contact solves both the arm position and striking-face orientation, including the arena's 0.68 render scale. The axe now selects cutting animations despite its historical `ironWrench` ID.
- The Lab hammer has an overhead lift, downward face-first strike and recovery. Its previous shoulder/wrist rotations cancelled the downstroke.
- Wallet sign-in failed in production because both session-signing variables were absent. A fresh sensitive `BB_SESSION_SECRET` is now configured in Vercel Production; it takes effect on the next deployment. Both sign-in routes check configuration before issuing a nonce or changing a garage and return readable failures.

Combat simulation, damage, timing, rewards and saved build choices are unchanged.

## Verification

- TypeScript and the full production build pass. Build log: `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\model-kombat-fixes-build.log`. Existing optional wallet-package warnings remain.
- `scripts/bots-weapon-contact-check.ts`: 864 actual native/GLB edge and face contacts across low, middle and high targets, three headings and both full/arena scales. Maximum measured positional error rounds to 0.0000 world units. Raycasts verify markers against real weapon surfaces.
- `scripts/bots-lab-hammer-pose-check.ts`: actual hammer brass endcap geometry leads a downward strike in all six family/design assemblies and three headings; minimum face/velocity alignment 0.919. Recovery and simulation isolation pass.
- `scripts/bots-cosmetic-identity-check.ts`: 31 looks preserve all seven base meshes and handle mixed builds, detached parts, missing canvas and disposal.
- `scripts/bots-toy-identity-check.ts`: all eight final weapon choices preserve the other six parts; unsupported native modules preserve their neighbours.
- `scripts/bots-director-check.ts`: all seven checks pass, including unchanged hashes for 200 legacy baseline fights.
- `scripts/bots-sign-in-check.ts`: production preflight refuses before database access when misconfigured; valid sessions, tamper rejection, existing key compatibility and safe refusal responses pass.
- Browser: fresh-page Tiny Biscuit sticker preview retains its original shape and pupils. Temporary changes were discarded. Main hammer and axe practice replays completed, their contact poses were inspected, and the measured weapon impact errors were zero. A Lab hammer fight produced knockdowns; the original mixed flamethrower build was restored afterward. Connect opens the wallet chooser.

A real wallet-signature/refresh round trip was not performed. WalletConnect QR still needs its separate project ID. No production deployment was run.

## Discord changelog

```text
Model Kombat fixes
• Stickers and decorations now stay on your chosen robot without changing its body or face.
• Axes hit with their edges and hammers hit with their striking faces.
• The Combat Lab hammer has a proper overhead strike and recovery.
• Fixed the missing wallet sign-in configuration and added clearer connection errors.
Your selected parts and fight results stay the same.
```
