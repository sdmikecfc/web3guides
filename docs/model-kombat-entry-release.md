# Model Kombat: trading-first entry and wallet lookup

The home page presents the $2,000 prize pool and four immediately actionable steps:
connect Doma wallet, set up Gochujang trading, check ranks, then play. Wallet
connection is the primary action. The larger game promotion no longer pushes the
trading instructions below it. Competition dates remain unset and prelaunch
activity is explicitly excluded.

Play opens “Build your first robot” for a player with no robot or draft, even if
they previously dismissed the general welcome. Accepting a suggested starter
fills seven parts and goes to Name & colours. Existing drafts, owned robots and
active fights resume without changing balances or equipment. Earlier published
`entry=landing` links are supported too.

Wallet discovery now reuses **MK_MCP_INGEST_TOKEN**, the existing Doma AI
credential. Do not create MK_WALLET_RESOLVER_TOKEN. The new additive wallet-link
SQL and `MK_WALLET_TRACKING_ENABLED=1` are still required; the flag is not a secret.
See [the complete AI job and setup](model-kombat-wallet-link-setup.md).

## Evidence

- Isolated PostgreSQL wallet-link migration and permission tests passed.
- Shared-key API authorization, bounded writes and personal-wallet scoping passed.
- TypeScript checks cover the changed routes, landing page and workshop.
- Chromium checks at 1280×720, 390×844 and 844×390 passed without horizontal
  overflow. The connect action is above the fold on desktop.
- Fresh intro, seven-part starter, reload, draft resume, existing garage, active
  fight routing, old entry URL and reduced-motion navigation passed.
- Browser tests use mocked campaign/save responses and omit the unchanged 3D
  renderer during navigation checks. They are not live wallet, tracking coverage,
  physical-phone or combat performance certification.
- Screenshots and browser results: `D:/Temp/modelkombat-entry-review/`.
- Full Next.js production build passed in the isolated D-drive candidate using
  existing local environment settings. Compilation, type checking and page
  generation completed. Log: `D:/Temp/modelkombat-entry-production-build.log`.
  The initial environment-free build failed on unrelated pages requiring
  Supabase settings; no application workaround was needed. Existing optional
  `pino-pretty` and outdated Browserslist warnings remain.

## Still required before calling tracking live

1. Apply the wallet-link SQL and enable the lookup flag in the game deployment.
2. Point the internal AI's four-hour job at the updated endpoints, with its
   existing credential.
3. Verify one real saved mapping and a known completed Gochujang trade from the
   attached wallet. The read adapter does not extend Reporter's collection scope
   or manufacture missing fills.

Git pushes do not publish. Mike runs `vercel --prod`. Competition opening remains
a separate decision, with no dates or scoring enabled by this change.
