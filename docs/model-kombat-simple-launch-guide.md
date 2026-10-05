# Model Kombat: simple launch guide

> Superseded by [the current token-zone launch guide](model-kombat-token-zone-launch.md). Use that guide and its one SQL file. The two-week $2,000 instructions below are historical and must not be used for the new 28-day competition.

**Not 100% ready.** The production build and isolated database tests passed.
The live game schema, wallet flows and trade attribution still need verification.
Do not open the cash competition yet. Its $2,000 pool remains draft with no dates.

## 1. Set up the game database

In the Supabase project used by Model Kombat, open **SQL Editor → New query**.
Open `D:/Temp/modelkombat-launch-guide/01-workshop-setup.sql`, copy its entire
contents into the editor and run it once. If there is an error, stop and keep the
error text; do not work around it by dropping tables or disabling security.

This is one atomic package of these existing migrations, in order:
1. `scripts/sql/bots-workshop-v8.sql`
2. `scripts/sql/bots-workshop-journey.sql`
3. `scripts/sql/bots-workshop-competition.sql`
4. `scripts/sql/bots-workshop-reporter-read.sql`

It adds game tables/functions and a read-only Reporter adapter. It does not
write Reporter records, reset inventories, give existing players extra starters,
open the competition or fix cross-wallet attribution.

Run `D:/Temp/modelkombat-launch-guide/02-check-setup.sql` next. All presence checks
should be true. A newly created competition should say **draft**, both dates
should be **null**, and `pool_cents` should be **200000**. A null `campaign_id`
is expected before the separately reviewed competition-opening setup.

Regenerate these files when migrations change:
`node scripts/bots/package-launch-sql.cjs`

## 2. Confirm Vercel Production settings

After the SQL succeeds, set these flags in this project's Production environment:

```text
BOTS_WORKSHOP_JOURNEY=1
BOTS_WORKSHOP_COMPETITION=1
NEXT_PUBLIC_BOTS_WORKSHOP_V1=1
```

The competition flag shows its draft status; it does not open scoring.
Confirm the existing Supabase URL, public key and server-only service-role key
point to the same project. Confirm strong server-only `BB_SESSION_SECRET` and
`BB_FIGHT_SALT` are set. Keep existing working secrets; do not rotate them casually
or paste their values into chat. Never prefix a secret with `NEXT_PUBLIC_`.

## 3. Publish the website yourself

The reviewed source was pushed as `7c7771c6` on `battle-bots-week1`.
Use the normal Model Kombat deployment checkout with that commit, then run:

```powershell
vercel --prod
```

The shared C-drive source contains unrelated uncommitted project work. The clean
Model Kombat-only candidate is `D:/Temp/modelkombat-release-20260928/candidate`.
If using it, confirm Vercel targets the existing Model Kombat project, not a new
project. Do not deploy unrelated working changes accidentally. Git push is not
deployment. These instructions do not authorize competition opening.

## 4. Prove normal game play on the deployed site

Use a fresh browser profile: choose a starter, name/paint it, Finish, complete
training, finish a house fight, buy a part and reload. Verify the balance agrees
between results/history/header. Then connect a wallet and reopen that garage on
your phone. Verify music, character loops and saving. Do not describe browser
emulation as physical-phone testing.

## 5. Fix trade attribution before announcing cash scoring

The internal AI reports MCP uses a Privy embedded wallet while Strategies can use
a linked external wallet. The current game reads wallet-keyed Reporter records;
it has no verified Doma-user mapping. Pasting another wallet/user ID into a form
must never let someone claim its trades.

Required work: authenticate a participant's relationship to the Doma account;
read its authoritative linked-wallet mapping; retain source wallet and MCP versus
Strategy attribution for every execution; deduplicate fills and handle corrections.
Use stable fill/execution references and real execution timestamps. Keep private
Doma IDs off public leaderboards. Preserve existing accounting definitions; do
not add wallet ROI percentages or count internal transfers as new capital.

Mapping/aggregating multiple wallets into one cash-competition entrant also needs
an explicit scoring design. This changes the current wallet-keyed integration;
it is not fixed by running the four game migrations.

MCP allowance ≠ executed trade. Created Strategy ≠ filled Strategy trade.
Ordinary filled limit orders ≠ verified Strategy fills. Existing approved cash
eligibility still requires Strategy activity on three distinct days per week.

Read-only live check on 28 September 2026 at 11:23 UTC:
- The supplied Privy/external pair for user 593019 has no buyer fills or verified
  MCP receipts in the configured game database. This does not prove no trades
  exist in Doma's own database.
- User 599861's supplied MCP wallet has **0 verified receipts**, **6 rejected
  receipts**, and **0 observed buyer fills** here. Those receipts have not been
  reconciled to the AI's reported eight executions; do not assume six of eight
  were failed swaps.
- Live workshop tables are still absent from the REST schema; the Reporter
  campaign is draft, with no campaign snapshots or credited campaign fills.
  Empty campaign scores are expected before opening, not proof of an outage.

Ask the internal AI for a private, read-only diagnostic export for users 593019
and 599861: authoritative linked-wallet mapping and ownership/link timestamps;
each reported MCP execution's stable ID, chain, transaction hash, actual wallet,
status, execution time and fill legs; filled Strategy executions separately from
created Strategies and ordinary limit orders; and any corrections/completeness
cutoff. No credentials or private keys. Reconcile the existing eight executions
before asking anyone to spend funds on another test trade.

Trading rewards are not currently spendable as new-workshop coins. The approved
release preserved separate balances; connecting that reward path is another
outstanding economy decision and implementation task.

## Ready means

Game launch: SQL installed, production settings confirmed, deployed complete loop
and wallet/phone saves pass. Cash competition: identity mapping, verified source
reconciliation, participant accounting and rewards all pass, then Mike separately
chooses and authorizes the start time. Neither is confirmed ready today.
