# Independent limbs: prelaunch inventory handoff

The browser demo upgrades its saved fake inventory automatically. The SQL file is for existing server inventory before switching wallet-backed play to independent limbs. It has **not been executed against a remote database**.

`bots-independent-limbs-prelaunch.sql` is based on the existing `battle_bots_001_init.sql` and `battle_bots_003_junkyard_shipments.sql` schema in the sibling `trading-bot/doma-reporter/sql` repository. It requires the `color` column from 003 and the existing JSONB `stats` and `build` columns. It adds no schema columns.

Run this on the prelaunch database after making a database backup and pausing inventory writers. Deploy the seven-socket web code in the same maintenance window. The migration locks bot and part writes, runs as one transaction, checks its invariants and commits only if they pass. Run the complete file with the database owner or service role, for example `psql --set ON_ERROR_STOP=on --file scripts/sql/bots-independent-limbs-prelaunch.sql` using your usual connection configuration. It returns counts of pairs split and bots migrated. A repeat run returns zero for both and changes no inventory or bot rows.

The script handles all active prelaunch inventory, including fake rows whose `is_test` flag is false. It does not delete inventory or reset balances. Original pair IDs become left limbs; one new right instance keeps the same colour, stats, source, provenance and creation time. Price is split into floor/ceiling halves. Resale is split separately so a 15-coin starter pair remains worth six coins after becoming 7- and 8-coin limbs. The override lives in `stats.salvage`, which both the server recycle route and client inventory view now use. Early seven-piece starter rows missing that override are corrected to three resale coins per limb.

Every converted bot gets `build.sockets` with head, torso, left/right arms, left/right legs and weapon. `build.parts` remains as the five-field compatibility alias. Names, looks, totals, tiers, timers and results are retained. A missing pair leaves both corresponding sockets empty. Both `{parts:{...}}` and the older top-level part-ID layout are supported. Recycled rows, battle snapshots, purchases, players and ledger entries are untouched.

Malformed IDs, foreign ownership, wrong slot kinds, duplicate usage, inconsistent bindings, and a partially converted build stop the transaction with an explanation. Review those specific rows before retrying. The script does not guess how to repair ambiguous inventory.

Validation completed locally:

- Eleven equipment regression groups, including server/client totals, separate limb persistence, resale, six-piece rewards and stored v3 replay roundtrips.
- Two complete PostgreSQL migration runs against a local temporary PGlite database. The second run produced byte-identical row snapshots.
- Owned and loose pairs, both legacy build layouts, incomplete bots, existing individual limbs, recycled history and rollback on invalid references.
- Frozen legacy replay rollup remains `9fd36ca7`; all nine legacy engine files and `rig-points.ts` remain byte-identical.

The SQL test fixture copies only the two inventory tables from migration 001 and adds the `color` column from 003. No remote credentials or database connection are used. To repeat the SQL check, install `@electric-sql/pglite` in a temporary directory, set `BOTS_PGLITE_PATH` to that installed package's absolute path, then run `node scripts/bots-equipment-sql-check.cjs`. The ordinary regression script is `scripts/bots-equipment-check.ts` and runs with the repository's TypeScript runner.

After migration, verify a returning wallet can put different arms on each side, save, reload and practice with the same seven pieces. Keep the maintenance backup until that check passes. Any separate inventory producer must also emit individual limb rows with `stats.equipmentVersion: 2` and single-piece prices before writes resume.
