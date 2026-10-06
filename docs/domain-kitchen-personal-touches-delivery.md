# Personal touches: delivery record

Owner-approved scope: accessible controls; consented gameplay reports and private
inbox; recognizable crew and server priorities; cosmetic signature dishes; Quiet
view; verified Neighbourhood Picnic; four furniture discoveries; four restaurant
ambitions and celebrations. Each feature needs its contextual entry in ordinary
play. Keep one introduction per between-service visit and respect pinned goals.

## Implementation (25 September 2026)

- **Controls:** versioned wallet-scoped hold/tap preferences, handed action dock,
  44px/56px targets and 100/125/150% text in Settings. Completion, movement,
  target changes, modal entry, blur and pointer cancellation end manual work.
  Truck/rally/community controls use the same actions and simulation clock.
  First-preparation help offers tapping inline. Ready/burning labels supplement
  sound and colour; cooking help describes the active input method.
- **Reporting:** consented categories, note, replay preview, replay opt-out,
  download, retained failed draft and idempotent retry. The recorder retains
  bounded cooking actions/checkpoints in memory, with sanitization before upload
  or download. The 512KB endpoint has same-origin checks and a six-per-hour
  hashed-IP limit. A private, authenticated inbox supports build/category filters,
  replay/action-log fallback, status changes and deletion. Home-only incidents
  currently attach diagnostics rather than a visual home replay.
- **Crew:** names, individual existing uniform colours and three server priorities
  appear in People → Crew and when selecting a staff actor. Hiring and helper
  identities feed the actual rigs. A versioned scheduler finishes current work,
  promotes tasks waiting 20 seconds and preserves urgent cleaning/pass recovery.
  Policy changes settle prior earnings; live and offline simulations share it.
- **Signature dishes:** an upgraded recipe card offers a free name and Cream,
  Cherry or Sage vessel style. Food previews, home/menu presentation, ordinary
  service order details, profiles and postcards retain the underlying recipe.
  Existing accepted orders retain their presentation; new services use the edited
  signature. Standardized rally/community configurations have no signature.
- **Quiet view:** Decorate defaults to a clean presentation copy with evening
  lighting and idle crew. Live production, maintenance and pending work continue.
  Its toggle does not touch music or actual messes. Compact portrait bottom sheets
  and landscape/desktop side panels keep the room visible. Postcards reuse it.
- **Discoveries:** all four free-item combinations have catalogue/placement hints,
  mounted-position resolution, once-only scrapbook records and restrained scene
  effects. Drafts grant no discovery. Effects are noninteractive, separated by at
  least 60 seconds and static under reduced motion.
- **Restaurant projects:** four projects preserve their selected pairs and compact
  starting-room snapshots. Serving/mastery history, signature, owned decorations
  and design confirmation drive the existing goal card. Opening nights run six
  guests through a separate real home simulation with three greetings, pausing,
  free cancellation/retry and no ordinary rewards or wear. Once-only personalized
  plaques and before/after postcard output close the loop.
- **Community feast:** separate signature-authenticated companion endpoints and
  SQL records implement Neighbourhood Picnic, canonical loaned equipment, ordered
  replay/time credit, one active wallet attempt, partial served-meal contributions,
  a 300-meal shared goal and three-meal personal qualification. A verified claim
  attaches the cosmetic plaque to the beta restaurant without importing it into
  account storage. There are no ordinary cooking rewards or individual rankings.
- **Natural introductions:** eligibility and dismissals persist; one suggestion
  per between-service visit respects required activities and manually pinned
  goals. Permanent entries remain in the existing four home destinations.

Packs remain private. No paid generation, external analytics, production release
or source dependency replacement was performed. Unrelated changes were retained.

## Local verification

New deterministic checks passed:

- `scripts/dk-personal-touches-check.mts`: crew identities, all three priorities
  completing actual lunch, signature ownership/menu independence, quiet-copy
  isolation, bounded/sanitized replay, unsupported replay versions and controls.
- `scripts/dk-project-community-check.mts`: all four projects feed six guests,
  greet three and grant once without changing normal production/progress;
  project switching; pinned goals and introduction suppression; canonical picnic
  burger/fries cooking; six unique meal receipts; forged totals, accelerated time,
  interruption and unverified plaque rejection.
- `scripts/dk-signature-service-check.mts`: all 32 recipes follow identical actions,
  serving, washing, portions, warmth and earnings with and without signature art.
- `scripts/dk-decor-discovery-check.mts`: all four pairs, distance boundaries,
  rotation/storage, wall-mount coordinates, reload/idempotence, animation spacing,
  reduced motion and disposal.

Existing active-diner checks passed for first-shift teaching/receipts and 100-seed
early-service profiles, controls, double-table service, all shared recipes,
audiences/batches, all regular stories, rewards/home visits, room designs,
explicit menus, home tasks/traffic, service migration, Cosy choice, ranked
authority and presentation. The noodle coach now finishes the current dish before
suggesting another drained portion. Home JSON round-tripping no longer changes
optional order fields to explicit `undefined` values.

Source TypeScript checking passed. The final isolated Next production build on D:
passed compilation, lint/type validation and generation of all 266 static pages.
Implementation/check-file hashes match the isolated build snapshot.
Build output: `D:\Temp\domain-kitchen-routes-build-20260923\.next-routes`.
Final log: `D:\Temp\domain-kitchen-personal-build-final.log`.
The existing optional WalletConnect `pino-pretty` and Browserslist warnings are
unrelated to this feature set. Source `node_modules`, Next and Three were checked
intact; preview output resolves to `D:\Temp\domain-kitchen-mobile-next`, with no
dependency link inside the Next output directory.

Browser review used the disposable, development-only `mobile-review?room=1&personal=1`
fixture. It exercised signature editing, crew editing, projects and Quiet/Live
restoration at 360px, control preference reload, 150% text, and large touch targets.
Every rendered button met 56px when larger controls were selected. Landscape
review exposed and corrected a cramped decorating sheet. Final 390px and
1280×800 previews also passed visual layout review. Browser layout testing is not
a physical-device or sustained-FPS result.

Local HTTP checks confirm reports/community status are disabled and the private
inbox returns 404 while unconfigured.

## Online readiness: deliberately closed

These migrations are delivered but **not applied to a database**:

1. `supabase/migrations/20260925_domain_kitchen_problem_reports.sql`
2. `supabase/migrations/20260925_domain_kitchen_community_feast.sql`

Reporting needs the existing Supabase URL/service-role settings and server-only
`DINER_REPORTS_ADMIN_USER` / `DINER_REPORTS_ADMIN_PASSWORD`. Enable `pg_cron` and
verify the migration's `diner-report-retention` task and 30-day purge. Only after
signed-off end-to-end checks should both `DINER_REPORTS_ENABLED=true` and
`DINER_REPORTS_VERIFIED=true` be set. Readiness also checks the active retention
job; a flag alone is insufficient. Admin credentials never enter the client.
Private inbox: `/chef/dev/reports` (or `/dev/reports` on the Kitchen domain).

Community needs the existing signed-wallet companion account service, its schema,
and the new community migration. Verify database concurrency, command retry,
wallet switching, partial abandonment, shared completion, late qualification and
once-only claim/placement before setting **both** `DINER_COMMUNITY_ENABLED=true`
and `DINER_COMMUNITY_VERIFIED=true`. Its state must never replace the local beta
restaurant. Existing report/ranked/community tables remain separate.

## Acceptance still requiring people/devices/integration

- Live database migration and SQL/HTTP end-to-end tests for authenticated report
  submissions, inbox access, failure retries, limits, deletion and retention.
- Signed-wallet community end-to-end and concurrent contribution/entitlement
  tests. Deterministic replay tests do not substitute for database concurrency.
- Five first-time players: at least four naturally discover the applicable
  introductions, personalize a dish, use a pairing and identify a project step.
  Observe crew and community discovery at their appropriate milestones.
- Actual Android Chrome/Brave and iOS Safari input, interrupted work, downloads,
  orientation/safe areas and populated performance (30 FPS phone/60 FPS desktop).
- Full populated visual review of every signature vessel and paired decoration;
  before/after postcard export and opening-night presentation on actual devices.
- Previous delivery's broader economy/campaign and device gates remain recorded
  in `domain-kitchen-rewarding-session-delivery.md`; they are not silently closed
  by this implementation.

Production is exclusively the owner's own `vercel --prod`. Build output, caches,
temporary artifacts and generated assets stay on D:.
