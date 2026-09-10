# MCP intake verification — 11 September 2026

## Result

The isolated intake is implemented and locally tested. Live SQL, deployment, collector scheduling and rewards integration are not enabled. No live trade, wallet, Reporter or shared reward operation was performed.

| Check | Result |
|---|---|
| Strict repository TypeScript, no emit, incremental disabled | Passed after final code and test changes |
| Parser and API boundary cases | 99 passed |
| Actual PGlite SQL behavior | 8 groups passed |
| HTTP handler through actual SQL | 7 groups passed, 10 real in-memory RPC calls |
| Next.js compilation of both new routes | Passed in local development server |
| Local GET watchlist and POST ingest with feed disabled | Both returned 503 `feed_disabled` with `private, no-store` |

API cases cover authentication before database access, strict fields, malformed JSON, exact decimal strings, uint256 bounds, oversized streamed requests, normalization, retry hashing, sanitized errors and watchlist pagination. SQL checks cover privileges/RLS, approved markets, enrollment, duplicates, revision conflicts, reversals after eligibility revocation, atomic rollback and migration reruns. Existing game data and shared money functions remain identical in the fixtures; the API-to-SQL fixture also uses rejecting triggers to detect attempted writes to existing player, ledger or Strategy tables.

The local runtime is Windows x64, Node.js 20.20.1, Next.js 14.2.3, with PGlite's in-memory PostgreSQL engine. This is not a live Supabase/PostgREST round trip, a full optimized production build, a multi-connection PostgreSQL concurrency stress test or a production throughput measurement. Advisory lock behavior was reviewed; real simultaneous sessions remain untested. MCP attribution, USD conversion and finality are supplied by the authorized collector, not independently recomputed by this API.

## Reproduce

Use Node.js 20 or later with the repository dependencies installed. Make `@electric-sql/pglite` available to the test runner, or point `BOTS_PGLITE_PATH` to an existing installation. The dependency is needed only by the two SQL test scripts; no production package was added.

```powershell
$env:BOTS_PGLITE_PATH = 'C:/path/to/test-runtime/node_modules/@electric-sql/pglite'
node scripts/bots-mcp-check.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

For this workstation's symlinked dependencies, add `--preserve-symlinks --preserve-symlinks-main` after `node`. Run only API boundary cases with `node scripts/bots-mcp-check.cjs bots-mcp-intake-check.ts`.

All fixtures use in-memory databases and fake credentials. The runner does not load environment files. Never point these tests at a live database; they contain no live database connection path.

## Deployment handoff

`model-kombat-mcp-handoff.md` contains the collector instructions, contract, error handling and activation order. `model-kombat-mcp-example.json` contains a strictly illustrative batch. The new migration reads enrollment from `battle_bots_players`; all writes and permission changes are limited to new `mk_mcp_*` objects. Doma Reporter and its shared accounting remain outside this increment.
