# Model Kombat deployment check — 8 September 2026

The site can be released for practice testing separately from launching the prize competition. Combat Lab is still a separate v4 experience; the normal garage, first fight and competitive fights retain their existing engines.

## Checked configuration and live state

| Item | Finding |
| --- | --- |
| Vercel project | The repository is linked to `web3guides`. `vercel inspect modelkombat.xyz` resolves to a Ready production deployment, also aliased to `www.modelkombat.xyz` and `domagaming.com`. |
| Live home | The game renders on ModelKombat.xyz. The garage, room navigation and Help drawer work; Rules, Privacy, Terms and Disclaimer are linked. |
| One-window rooms | Garage, Parts, Build and Fight switch within the same app shell. The builder has the workshop backdrop, but the collection garage uses a narrow art banner and Parts remains a catalogue grid. Full concept-art room presentation is not complete. Combat Lab is still a separate test screen. |
| Latest Lab | Local only. `BOTS_COMBAT_LAB` is absent from Vercel's production environment variable list. The route deliberately returns 404 in ordinary production. |
| Domain routing | ModelKombat.xyz rewrites `/` to `/bots`, `/lab` to `/bots/lab`, and clean policy routes into the game. Existing `/bots/...` paths also work. |
| Wallet | The live Connect button opens the wallet chooser. Both ModelKombat domains are in the server's signature-domain allowlist. A real signed login and saved-garage round trip were not performed. |
| Mobile wallet QR | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is absent from Vercel's variable list. The provider therefore omits WalletConnect/Rainbow QR options. Injected browser wallets remain offered. |
| Competition | The public live `/api/bots/campaign` returns `source: unavailable`, `campaign: null`, no standings and `domaMcp: pending`. The response does not identify whether configuration, schema or the reporter is missing. This does not certify a running prize competition. |
| Current rules pages | Two weeks; $800 ROI percentage, $800 realized profit and $400 battle points. No cash prizes ranked by volume. This check verifies the implemented content, not legal approval. |
| Scope of deployment | `vercel --prod` publishes the whole current project to all its aliases. Pre-existing Dash, Maxxers and Studio edits are also in the working directory; they were not edited or committed as part of the flame fix. |

## Publish a practice preview

The production build passed. This deploy command explicitly enables the Lab for this deployment:

```powershell
cd C:\Users\Mike\Desktop\web3guides
vercel --prod --yes --env BOTS_COMBAT_LAB=1
```

The home is `https://modelkombat.xyz/`. The new combat is at `https://modelkombat.xyz/lab` (also `/bots/lab`) and `https://domagaming.com/bots/lab`. The CLI confirms `--env` is a runtime environment override. For later deployments without that override, add `BOTS_COMBAT_LAB=1` to the Vercel project's Production environment settings. No Vercel environment setting or deployment was changed during this check.

The existing production workshop/toy/onboarding feature variables are present. The local production build is run with those three switches enabled, matching the observed live workshop. Prize campaigns, rewards and wallet requirements are not enabled by the Lab flag.

## Before a prize launch

- Restore a usable campaign configuration and reporter snapshot; confirm dates, eligibility, ROI/profit accounting and reviewed prize output against actual data.
- Complete a real wallet-signature, refresh and saved-garage round trip on the final domain. Configure WalletConnect if mobile QR connection is required.
- Finish the agreed combat balance and visual review, and test on actual mobile hardware. Charged specials, interacting item effects, drops/salvage and premium tier silhouettes remain later increments.
- Complete the Garage and Parts room presentation against the approved concept art before calling the full visual redesign finished.

## Verification for this revision

- TypeScript passes; the fixed-step simulation is unchanged by the flame presentation work.
- Practice purchase/save/restore and campaign-enrollment checks pass. All eight reporter snapshot/privacy/availability contract checks pass.
- Full `npm run build` passed with the three workshop/toy/onboarding switches enabled. Existing optional wallet dependency and Browserslist warnings remain.
- Eight compiled HTTP checks returned 200: ModelKombat home, Lab, Rules, Privacy, Terms, Disclaimer, Doma's Lab and the flamethrower GLB. Domain rewrites were tested through the forwarded host header.
- Compiled browser preview completed a flame fight, then replay restored both armour totals, zero dents and cleared burn state. No browser errors were reported. The current mixed build sampled 60 FPS, 99–100 draws and about 212,000 triangles with the animated crowd; these are laptop browser counters, not a physical-phone measurement.
- The flame now uses a shared soft sprite, a stream reaching its existing range, a surface flare, visible body-attached burning tongues and warm local lighting. It remains a stylised effect with a simple body proxy.

Build log: `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\model-kombat-production-build.log`.
