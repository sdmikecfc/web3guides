# Diner playability review — 20 September 2026

This release changes the standalone diner and truck. The preserved legacy game is a separate implementation.

## Fixed interaction problems

- Truck crew no longer intercept clicks meant for equipment. Manual work uses a compact nearby control; keyboard E still works.
- Truck stations accept reachable sides and safe corners. Outdoor utility equipment is allowed, with the entrance and guest route protected. A fresh burger truck fits its plates inside and its bin outside; existing layouts are not repacked.
- The next tutorial guest arrives promptly after the first washing lesson.
- Home and truck furnishing placement uses a local, rotatable model preview. Invalid positions remain editable. Only Confirm sends a layout command. Buying a furnishing still buys an inventory copy; cancelling placement keeps that copy in storage.
- Older saves can buy the one-seat home table. Migration unlocks its design without granting extra physical copies.
- Framed artwork is flat artwork rather than sideways food or protruding character models.
- Four new café decorations are available: a morning coffee print (250 coins), house burger print (250), tall rubber plant (450), and kitchen herb planter (300). Existing collection bonuses are unchanged.
- New trips have one start and no more than two next roads. Major branches stay separate for three stops. Existing trips retain their original graph. The route screen explains the actual strike limit and half-haul loss; equipment and recipes remain owned.

## Features that needed explanation

| Feature | Entry and actual purpose |
| --- | --- |
| Restaurant name | Click the name above the room. Renaming is free; the friend code stays unchanged. |
| Expansion | Decorate → Grow restaurant. Shows exact size, restaurant-level requirement and coin price. Current first expansion is level 5 and 25,000 coins; there is no active 8,000-coin expansion in this diner implementation. |
| More guests | Recipe mastery, restaurant levels, unique décor and temporary buzz from truck services increase demand. Extra tables or workers increase capacity, not demand. The growth panel explains the current bottleneck. No earnings or arrival rates were inflated in this release. |
| Floors and walls | Decorate → Style → choose a finish. The catalogue closes and the actual room previews the finish. Cancel is free. Buy & apply records ownership; applying an owned finish is free. Existing applied finishes remain owned. |
| Player friends | Connect a wallet account, publish the diner, share its code/link, send a request and accept it. The panel separates incoming requests, sent requests and accepted friends. It does not promise unimplemented remote cleaning. |
| Friendship | Named NPC regulars have a daily favourite-meal plus greeting loop. Three/eight/fifteen/twenty-five/forty greetings mark friendship levels. The tangible rewards are a keepsake at 15 and a secret-recipe scrap at 40. Other levels are recognition, not invisible income bonuses. |
| Passport | A record of visited stops, not currency or a claim that every service was cleared. Truck growth separately requires a route finale and its recipes. |
| Shopping | Previously hidden equipment is visible with its discovery requirement. Keepsakes show their real regular and greeting requirement. Crew, recipes, expansion and room finishes have direct contextual entries. |

Mr Bell now recognises a mastered recipe actually on the menu rather than getting stuck on the first mastered recipe in save order.

## Wallet release requirements

Public diner play now requires an account verified by a wallet message signature. This flow requests no transaction, token approval or gas payment. Nonces expire, are tied to the exact origin/message and are consumed once. Every private diner endpoint checks the authenticated wallet session. Account switching isolates pending commands; device sign-out revokes that session. The browser-only sandbox is restricted to local development.

Existing browser preview saves are preserved and explicitly disclosed as separate from new server accounts. Unverified browser balances are not silently imported as authoritative progress.

**Do not deploy this as an operational wallet launch until the backend checklist is complete.** The read-only check of the locally configured Supabase project returned missing-schema responses for all nine diner tables. Ethereum Web3 auth and the deployed Vercel environment have not been verified. See [the server setup and release runbook](street-eats-preview-server.md) for the three exact migrations, origin/environment configuration, WalletConnect setup and two-account acceptance checks.

## Verification boundaries

Deterministic service, migration, routing, placement, ownership, wallet signature/replay, account isolation, social and renderer checks cover the code paths. Local browser checks cover naming, catalogue discovery, color preview/cancel/purchase, and furniture previews/rotation. A confirmed table retained its position and 90-degree orientation after reload; phone-size controls remained usable. The milkshake print was visually reviewed in the rendered phone catalogue. The full Next.js production build passed on the isolated diner release snapshot, with an existing optional `pino-pretty` dependency warning.

Mocked auth/social tests do not establish that production database migrations or actual wallet-provider configuration work. No production deployment or database mutation is part of this change.
