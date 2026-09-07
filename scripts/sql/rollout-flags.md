# Game rollout switches

The switches are independent. Unset switches are enabled in local development and disabled in a production build. `1` enables; `0` or any other explicit value disables. A Vercel Preview is a production build, so set the two public switches to `1` in its Preview environment when reviewing the pilot.

| Switch | Enabled | Disabled |
| --- | --- | --- |
| `NEXT_PUBLIC_BOTS_WORKSHOP_V1` | Single-screen workshop and old-room URL redirects | Existing garage, builder, shop, battles, board and strategy clients |
| `NEXT_PUBLIC_BOTS_TOY_PILOT` | Reviewed Blender toy modules and directed 3D fight | Native toy parts and the prior fight renderer; no Blender manifest or motion request |
| `BOTS_ONBOARDING_V1` | New accounts may receive the free welcome robot and protected 250-coin build allowance | New accounts receive the historical starter kit and 45 remaining coins (120 grant minus 75 kit) |

The `NEXT_PUBLIC_` values are embedded at build time. Changing them requires a new build/deployment; changing a browser URL cannot enable them. `BOTS_ONBOARDING_V1` is server-only. It does not affect reporter launch or prize-payout switches.

## Deploy and roll back

1. Keep new-account onboarding disabled while reviewing and applying the schema. Apply the existing 001–009 schema, independent-limb migration where needed, then the complete `bots-onboarding-v1.sql`. Pause game writes while deploying schema and replacing older starter producers.
2. Enable the workshop and toy pilot in Preview, walk through a signed-out practice garage, then verify a new signed-in test wallet with onboarding enabled. Existing accounts should keep every ID, balance and item.
3. Opt in to each production switch only after its checks pass. They need not be enabled together.
4. Roll back presentation switches or stop new onboarding independently. Keep the additive database tables, reserve-aware `bb_grant`, and onboarding RPCs installed. Do not remove progress rows, refund/reissue allowances or restore the old debit function.

Existing version-1 onboarding is grandfathered regardless of the onboarding switch: Me/balance reads remain available, and that player's seven purchases, practice and completion can resume. `/bots/welcome` is the resume door even when the main workshop switch is off; the legacy garage exposes it for unfinished progress. Completed users remain completed. The explicit `/bots/welcome` continuation keeps the shell available after completion so the first-fight earning invitation and the new starter parts still work; the normal room URLs continue to follow the workshop switch.

`bb_legacy_provision` is included in the onboarding SQL for a transactional rollback path. It shares the player-row lock with v1 provisioning and checks both inventory/history and versioned progress before granting anything. Repeated or mixed-version enlistments cannot award both kits.

If the new migration is absent, sign-in falls back to the original-schema starter sequence. Only explicit missing-function/table errors take this path; permission, validation and other database failures do not silently choose another economy. Existing inventory and recycled starter history are preserved, and a duplicate starter-kit debit never creates another kit. This compatibility path spans the historical HTTP/database operations rather than one transaction; an interrupted old-schema starter may need operator reconciliation. The migrated atomic path is the supported launch path.

No remote migrations, flag changes, commits or deployments are performed by these files. Local checks: `scripts/bots-rollout-check.ts` and `scripts/bots-onboarding-check.ts` (set `BOTS_PGLITE_PATH` to the local PGlite module if needed).
