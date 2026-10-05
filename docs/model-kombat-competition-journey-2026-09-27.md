# Workshop competition journey — implementation and release review

## Release state

Implemented behind `BOTS_WORKSHOP_JOURNEY=1` and `BOTS_WORKSHOP_COMPETITION=1`. These flags are enabled only in the isolated local review environment for this work. No production deployment, Git push, live database migration or competition opening was performed.

The additive setup creates `workshop-competition-1` in **draft**, with **null start/end dates** and **200,000 prize cents**. It does not update the shared campaign tables or replace an active/frozen campaign. The existing payout arrays remain $800 ROI, $800 realized profit and $400 battles. Existing inventories, shared accounting, Doma Reporter and combat calculations were not changed by this increment.

## Six changes

1. Welcome/header show the competition and separate free building, game coins and cash prizes. The welcome starts at its heading instead of scrolling past it during dialog focus. Prize details stay in the workshop.
2. Progress/garage show competition state, explicit enrollment, verified-day status, scoring allowance and provisional category ranks. Missing evidence is not treated as zero or qualification. Enrollment cannot open while draft.
3. The ordinary trading/progress link no longer switches into the classic garage. Settings contains a labelled historical collection link. `/bots/rules` selects the new rules under the preview flags; `/bots/rules/classic` preserves the earlier rules.
4. Arena readiness starts the server fight in one flow. Results use settled coins and competition metadata; pending settlement says so. Public replays receive the recorded coin award, and replay viewing is explicitly reward-free. The browser/server contact fix and deterministic regression checks are retained.
5. Style fills the legal 250-coin seven-part starter. Name & colours precedes a final review, with all parts editable. The Finish/name blur race is avoided. Weapon tiles describe role/reach instead of zero health; equivalent non-weapon parts are labelled as the same performance.
6. Garage/shop/Progress show the next-robot plan. Purchases acknowledge the exact acquired spare and updated progress. Adding a purchase to a plan requires an explicit confirmation; it does not silently replace equipment or spend again.

## Game-only scoring transaction

`scripts/sql/bots-workshop-competition.sql` adds configuration, enrollment and attempt/result records. `mk8_competition_commit` wraps the existing garage, coin and public-replay commit in the same database transaction.

- Only the server's waiting → ready transition can reserve an attempt. Database time sets the start.
- The signed wallet, existing enrollment, normal house mode and owned robot are required.
- A wallet lock and unique daily ordinal enforce 12 starts across garages. Training consumes its existing coin allowance without consuming a competition attempt.
- Disconnecting retains the fight and attempt. Completion reconstructs the server simulation; clients cannot submit winners.
- Settlement records 1 for a win, 0 otherwise, once. Starts before opening and completions at/after closing do not score. Completion determines the week; UTC start day determines allowance.
- Linking later cannot convert an earlier guest/prelaunch fight into a scored result.
- Service-role-only records and functions; no anonymous/authenticated direct table access.
- Public packets omit wallet addresses and private trading evidence. Battle rankings remain provisional; final eligibility and payout review are still required.

## Strategy evidence integration — required before opening

**Unresolved source mapping:** the existing snapshot contract in this repository exposes fill counts, aggregate volume and earned coins. It does not document verified execution times or correction/revocation records. `battle_bots_campaign_fills.created_at` is a receipt timestamp, so it is deliberately not used as a trade-day substitute.

The new read-only adapter accepts an explicit, allowlisted evidence extension at `payload.players[authenticatedWallet].strategyEvidence` in the existing verified campaign snapshot:

```json
{
  "schemaVersion": 1,
  "source": "doma_strategy",
  "complete": true,
  "confirmedThrough": "ISO timestamp",
  "fills": [
    {
      "id": "canonical trade ID",
      "revision": 1,
      "status": "verified",
      "executedAt": "actual ISO execution timestamp"
    }
  ]
}
```

The evidence must cover the campaign, including corrections. Allowed statuses are `verified`, `pending`, `revoked`. Duplicate IDs use the highest revision; conflicting rows at the same revision, unsupported/incomplete data or stale coverage fail closed. Three distinct verified UTC dates qualify a week; both weeks are needed for final eligibility. Aggregate volume and coins are never eligibility evidence.

This is a supported integration contract, **not a claim that the live producer already supplies it**. Confirm the existing authoritative read-only source with Mike, then map it into the adapter. Do not change Doma Reporter or its snapshot producer without separate explicit permission. Do not open the competition while this source remains unverified. Final standings/payout review must use the new battle records and the unchanged eligibility/tie rules, rather than the legacy battle ledger.

## Review and checks

- SQL fixtures: exact $2,000 total, null-date draft, no prelaunch enrollment, preservation on migration rerun, 12 starts across garages, excluded training/loaner/guest fights, duplicate start/enrollment/settlement, closing/week boundaries, rollback of failed settlement and RLS.
- Evidence/API fixtures: distinct days, duplicate fills, corrections/revocations, both weeks, missing/stale evidence, authenticated field allowlist, no other-wallet data, no enrollment success without a saved entry, test-account exclusion.
- Existing campaign contract: unchanged ROI/profit units and historical snapshot/privacy tests.
- Existing journey tests: guest enrollment, concurrent HTTP retries, revision conflicts, signed local fixture claims, two separate garages, shared daily coin caps, revoked guest access and persistent selection.
- Combat regression: identical server/browser contacts, winner and damage events at 30/60/120 presentation batches; canonical outer-face collision regression reaches the same 1,147-tick result. No combat tuning changed.
- Music check: both MP3s, gesture start, mute/volume retention, blocked/missing-file recovery and disposal.
- Browser walkthrough: named/painted legal Speed starter → Finish reveal → training loss (+75 coins, no repairs) → normal house win (+75) → 75-coin spare purchase → next-robot plan showing 1/7 owned and 675 remaining. Header, result and history agreed. Competition stayed draft and awarded no points.
- Layout inspection at 1280×720, 390×844 and 844×390: persistent lower navigation and no horizontal document overflow. Naming/colours, part planning, Progress and Community checked. These are browser viewport checks, not physical-phone testing.
- D-drive production build passed using the isolated local database fixture. Earlier attempts failed on blocked Google Fonts, then missing public Supabase build settings; the successful run used network access for fonts and dummy local fixture settings, without production credentials. The final rerun after the rules, starter-review and standings changes also exited 0. Competition SQL/API and authority regression checks passed again. Source and isolated build dependencies remained intact.

### Remaining launch gates

- Apply/review migrations against the intended **game database** and verify real PostgreSQL concurrency, backups and permissions. PGlite/HTTP fixtures do not substitute for a live database rollout.
- Confirm/map the Strategy evidence source and the reviewed final standings/payout handoff.
- Real wallet signature rejection/reconnect and cross-device restoration with the production environment.
- Five newcomer reviews (target: four can explain coins versus cash, qualification and their next action); no humans were recruited by this task.
- Physical-phone testing and performance measurement.
- Choose a start date and separately authorize opening. No date is proposed or scheduled here.

## Rollout sequence

1. Review `bots-workshop-v8.sql`, `bots-workshop-journey.sql` and `bots-workshop-competition.sql`, in that order. Reapply the idempotent journey function update to include settled coins in new public replay packets. Do not modify existing public replay records.
2. Validate in an isolated deployment/database with both preview flags enabled. Missing competition setup must fail rather than create an old starter or silently score.
3. Complete the remaining checks above. A draft-only workshop can be reviewed while evidence integration is pending; cash competition opening cannot.
4. Mike alone publishes production by running **`vercel --prod`**. A Git push updates source only.

- Return check: reloading the unfinished Pocket Ranger restored its name, all seven selections and the Review step. Review remains available when coins are insufficient; Finish correctly stays disabled. Keyboard navigation returned to Progress. Short-landscape Review had no horizontal overflow and kept Finish visible.

Local screenshots: `D:/Temp/modelkombat-competition-training-result.png`, `D:/Temp/modelkombat-competition-progress-mobile.png`. Final prize-panel proof: `D:/Temp/modelkombat-competition-review-final.png`. Build log: `D:/Temp/modelkombat-competition-build.log`. Generated work stayed under `D:/Temp/modelkombat-launch-work`.
