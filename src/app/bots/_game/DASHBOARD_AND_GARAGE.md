# Account dashboard and five-robot garage

Updated 2026-09-08.

## Player changes

- The coin button opens **Feed your robot**, an account dashboard inside the game window.
- It shows the connected wallet, coin balance, reserved/spendable coins, counted Strategy trading dollars, paid trade/bonus coins, real fight count, wins/losses, win rate, battle coin breakdown, ten recent replays, current competition trading totals, and the current robot with the most wins.
- Signed-out players see their local practice coin balance and robot. Real totals show a dash until available. Missing data is never replaced with an invented zero.
- The published coin rule has examples, a calculator, daily limits, and a plain-English explanation. MCP is marked **coming soon**. Prize rules remain separate from game coins.
- The garage has five physical timber stands, including empty stands, and a pointer to the next build. Finished parts stay with their robot; names and cosmetics can still change.
- Recycling shows an exact refund before confirmation. Normal parts return 40% of list value, rounded down per part; free starter parts return zero. Recycled practice robots remain recycled after reload.
- The Parts shop's filters and sorting sit underneath the shop. Sorting supports stars, ascending/descending price, and name.
- **Community** explains the former “Sprocket Row” name and offers player fight replays and competition scores.

## Accounting and data

Canonical trade rule: `C:/Users/Mike/Documents/Doma/BATTLE_BOTS_ECONOMY_DESIGN.md`, coin section. Compared with the reporter's current coin functions before writing player copy.

- Base: round(counted USD).
- Bonus percentage: clamp(round(2 × positive coin ROI percentage), 0, 100).
- Bonus: round(counted USD × bonus percentage / 100).
- Counted USD applies the same-token opposite-side 10-minute pairing rule, 3× recorded funds per token per day, and 4× recorded funds total per day. Recorded funds have a $50 floor and increase with deposits.
- Coin ROI includes the value of unsold positions. The cash competition's ROI score only uses realized profit; the dashboard never substitutes one for the other.
- The private dashboard reads credited Strategy records and actual ledger entries. It separates returned stakes, challenge winnings, house bonuses, ordinary battle rewards, and net battle gain/loss. It does not assume the older guide's symmetric stake description matches the current saved-defender implementation.
- All queries derive the wallet from the signed session. Private responses are not cached. Reads are bounded; incomplete lifetime scans return partial/unavailable totals rather than silently truncated sums.

## Verification

- Production build passed with the Lab, onboarding, workshop and toy preview flags enabled. The final follow-up only simplified two eligibility sentences.
- Dashboard regression covers self-only access, forged/expired/absent sessions, credited trade accounting, signed corrections, battle winnings/returned stakes/refunds, replay history, best robot selection, absent tables, and bounded scans.
- 88 calculator examples matched the reporter, including fractional-dollar rounding, negative returns, rounding boundaries and the bonus cap.
- Game state checks cover completed-part protection and persisted recycling. Wallet/fight checks exercise actual server code against an in-memory database, including no mutation when fight configuration is missing.
- Browser checked desktop 1280×720, phone 390×844 and small-phone 320×668: all five stands, dashboard, working calculator, shop filter placement and lowest-price sorting. No horizontal page overflow in measured phone layouts. Temporary viewport override was reset.
- Calculator UI: $100 counted and 25% return produced 150 coins.
- Build navigation opened a real empty third bay without changing either finished robot.
- Cosmetics and weapon contact regressions passed again: 31 cosmetic combinations retained their fitted models; 864 authored/native contact checks passed.
- Wallet handoff tests cover interrupted requests, identical retries, competing requests, valid starter colours, and rejection of forged paint bonuses. Selection is remembered separately for each wallet and local practice.
- A recycle retry after payment and part deletion can finish deleting the robot without a second payment. Only the exact server ledger receipt permits missing parts during cleanup; mismatched receipts and invalid remaining parts are rejected.

## Operational notes

Production was missing `BB_FIGHT_SALT` and `BB_CARD_SECRET`. Both were added as sensitive Vercel Production variables without exposing their values. Fight code now checks required configuration before spending an attempt or coins. No deployment was performed in this turn.

The local preview's generated Next.js cache briefly served missing chunks. The cache was rebuilt and the development server restarted; browser verification used the refreshed preview.

The connected wallet's live sign-in and paid fights were not executed by the agent. Authentication and resolver verification used isolated test data. The production database still lacks the newer onboarding table; the validated legacy starter appearance handoff supports existing schema without importing practice balances or statistics. Existing developed garages retain their owned robots.

Only a finished seven-part practice starter can copy its appearance at sign-in. An unfinished practice build stays saved locally. Its practice coins, combat statistics and item value never become wallet rewards.

## Discord post

```text
Model Kombat workshop update

• Feed your robot is now your game dashboard: coins, trades, fight results and replays in one place.
• See exactly how trading earns coins, with simple examples and a coin calculator. MCP support is coming soon.
• Your garage now shows all five robot stands. Follow the arrow to build another robot.
• Finished robots keep their parts. Names, faces and stickers can still change.
• Recycle a robot to make space. The game shows your coin refund before you confirm.
• Shop sorting and filters now sit below the shelves.
• Community shows recent player fights and competition scores.
• Fixed starter appearance changes at wallet sign-in and missing fight configuration.
```
