# Model Kombat deployment check — 8 September 2026

The site can be released for practice testing separately from launching the prize competition. Combat Lab is still a separate v4 experience; the normal garage, first fight and competitive fights retain their existing engines.

## Checked configuration and live state

| Item | Finding |
| --- | --- |
| Vercel project | The repository is linked to `web3guides`. `vercel inspect modelkombat.xyz` resolves to a Ready production deployment, also aliased to `www.modelkombat.xyz` and `domagaming.com`. |
| Live home | The game renders on ModelKombat.xyz. The garage, room navigation and Help drawer work; Rules, Privacy, Terms and Disclaimer are linked. |
| One-window rooms | The subsequent local room revision now uses the full workshop scene for Garage/Build, timber display shelves for Parts, arena art for Fight/Prizes and street/workshop art for Community/Help. See `../_game/ROOMS.md` for verification. This room revision has not been deployed. Combat Lab is still separate. |
| Latest Lab | Local only. `BOTS_COMBAT_LAB` is absent from Vercel's production environment variable list. The route deliberately returns 404 in ordinary production. |
| Domain routing | ModelKombat.xyz rewrites `/` to `/bots`, `/lab` to `/bots/lab`, and clean policy routes into the game. Existing `/bots/...` paths also work. |
| Wallet | The live Connect button opens the wallet chooser. A later 8 September check confirmed that Production lacked both session-signing keys, causing the reported 500 when minting a play session. A fresh sensitive `BB_SESSION_SECRET` has now been added to Vercel Production; it takes effect on the next deployment. Both ModelKombat domains are in the signature-domain allowlist. A real signed login and saved-garage round trip were not performed. |
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

The home is `https://modelkombat.xyz/`. The new combat is at `https://modelkombat.xyz/lab` (also `/bots/lab`) and `https://domagaming.com/bots/lab`. The CLI confirms `--env` is a runtime environment override. For later deployments without that override, add `BOTS_COMBAT_LAB=1` to the Vercel project's Production environment settings. The original build/domain check changed no Vercel configuration or deployment. The later wallet follow-up below added one missing environment variable; no deployment was performed.

The existing production workshop/toy/onboarding feature variables are present. The local production build is run with those three switches enabled, matching the observed live workshop. Prize campaigns, rewards and wallet requirements are not enabled by the Lab flag.

## Wallet sign-in follow-up — 8 September 2026

Read-only Vercel inspection confirmed that Production had neither `BB_SESSION_SECRET` nor its supported fallback, `BB_CARD_SECRET`. Production session creation therefore threw after wallet signing instead of returning a playable session. The nonce table and required player columns were confirmed present through zero-row database reads.

A fresh cryptographically random `BB_SESSION_SECRET` was added as a sensitive Vercel Production variable using stdin. Its presence was verified by name only. No existing secret was replaced and no deployment was performed; the new value applies to the next production deployment.

The local nonce and enlist endpoints now check signing configuration before issuing a nonce or changing a garage. Missing configuration and backend failures return clear, safe 503 messages. `npx tsx scripts/bots-sign-in-check.ts` passes: both endpoints refuse missing configuration before database access, configured keys mint verifiable sessions, tampered sessions remain rejected, and existing refusal responses are preserved. This focused result does not claim a new full production build.

The browser wallet chooser opens, but a real user-wallet signature and saved-garage round trip remain unverified. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is still absent, so mobile QR connection remains unavailable.

## Fight and chosen-robot follow-up — 8 September 2026

Production also lacked `BB_FIGHT_SALT` and `BB_CARD_SECRET`. Fresh sensitive values were added for these two previously absent names; no existing variable was replaced and no deployment was performed. They apply at the next deployment. The resolver now checks its signing dependencies before it can claim a daily fight, hold coins or create a battle row. Normal fights need the salt; player fights also need the card signer. The older missing-salt failure already used the resolver's compensation path to release counters and decline the failed battle.

Connecting a finished practice build now carries validated catalogue choices, socket colours, name and available cosmetics into an unused starter while preserving the account's existing part statistics, prices and balances. A claimed appearance fingerprint prevents competing requests from mixing parts; the same request can resume an interrupted save. Pending saves block fights, edits and recycling. Developed accounts are preserved. An unfinished practice build remains local with an explicit message. Server onboarding purchases use their canonical allowance path when that schema is present.

`battle_bots_onboarding` is still absent from the linked database. Required battle, ledger, card, bot update-time and part colour columns passed zero-row existence checks. No player records or database schema were changed for verification. The new offline `scripts/bots-wallet-fight-check.ts` exercises a real house-fight resolver, permanent-part save guards, authenticated appearance validation, competing/retried/interrupted saves, declined-fight recovery eligibility and recycle ownership. Browser wallet signing and a live rewarded fight still need verification after deployment; these tests use an in-memory service boundary and no network.

## Before a prize launch

- Restore a usable campaign configuration and reporter snapshot; confirm dates, eligibility, ROI/profit accounting and reviewed prize output against actual data.
- Complete a real wallet-signature, refresh and saved-garage round trip on the final domain. Configure WalletConnect if mobile QR connection is required.
- Finish the agreed combat balance and visual review, and test on actual mobile hardware. Charged specials, interacting item effects, drops/salvage and premium tier silhouettes remain later increments.
- The concept-art room implementation is complete locally; review the finished preview as part of the release's visual approval.

## Verification for this revision

- TypeScript passes; the fixed-step simulation is unchanged by the flame presentation work.
- Practice purchase/save/restore and campaign-enrollment checks pass. All eight reporter snapshot/privacy/availability contract checks pass.
- Full `npm run build` passed with the three workshop/toy/onboarding switches enabled. Existing optional wallet dependency and Browserslist warnings remain.
- Eight compiled HTTP checks returned 200: ModelKombat home, Lab, Rules, Privacy, Terms, Disclaimer, Doma's Lab and the flamethrower GLB. Domain rewrites were tested through the forwarded host header.
- Compiled browser preview completed a flame fight, then replay restored both armour totals, zero dents and cleared burn state. No browser errors were reported. The current mixed build sampled 60 FPS, 99–100 draws and about 212,000 triangles with the animated crowd; these are laptop browser counters, not a physical-phone measurement.
- The flame now uses a shared soft sprite, a stream reaching its existing range, a surface flare, visible body-attached burning tongues and warm local lighting. It remains a stylised effect with a simple body proxy.

Build log: `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\model-kombat-production-build.log`.
