# Model Kombat tracking — October 6 status

The internal AI now supplies **wallet associations and exact Strategy execution references**. Model Kombat's separate worker fetches public transactions, verifies receipts and computes scores. It reuses the existing Supabase login; no Doma backend key is needed.

## Setup completed

**SQL is installed and the internal AI's v4 handoff is running. Do not rerun setup or change its instructions.** Keep job `f2w7gt5t55` on its existing four-hour schedule and the duplicate paused. Model Kombat does not require the old Bot Battle receipt sender to resume.

## Verified on October 6

- The repaired release **`78d32dac87d7120a`**, worker **`mk-public-worker-3-native-eth`**, is installed by the user and its private health reporting works. The audit completed at **08:43:27 UTC**, covering one account/two wallets through **06:10:40.089 UTC**: 14 agent fills, **$26.684083**, no volume problems, no score writes. Financial status remains pending with **`NATIVE_CONTRACT_FLOW_REVIEW_REQUIRED`**. This is a specific unsupported native contract interaction, not the prior blanket native-ledger rejection. The exact transaction is not yet identified; do not treat it as a proven swap/refund or waive it.
- Our worker independently found **14 completed agent-wallet fills totaling $26.684083** on the one approved linked test wallet. Public amounts matched transaction receipts. This agrees with the prior internal-AI rehearsal.
- Supabase independently confirms one linked account, two wallets, zero Strategy references and complete Strategy coverage through **October 6, 03:49:04 UTC**. The zero references is expected for this account, which has never created a Strategy.
- The user's installed service completed its first full linked-account audit at **04:49:35 UTC**: one account, two wallets, 14 agent fills, **$26.684083**, no volume-coverage errors, and a common cutoff of **03:49:04.951 UTC**. It reported `NATIVE_CAPITAL_LEDGER_REQUIRED`, so ROI/profit did not pass.
- The check was read-only. The campaign remains draft; no competition points or financial scores were written.
- Local PostgreSQL tests cover Strategy-only accounts, wallet conflicts, corrected/revoked references, coverage gaps, repeated requests, restricted AI access, and atomic volume/FIFO settlement with rollback.
- Collector tests cover exact integer quantities, failed receipts, missing API rows, duplicate fills, stale data, reorgs, pagination and revocation without erasing records during outages.
- Public-history accounting tests cover supported FIFO histories, opening and closing balances, quote capital, and explicit rejection of unknown cost basis or unsupported flows.

## Router fees

The backend now distinguishes the pool's swap amount from the wallet's actual cost/proceeds. A 10 USDC spend with a verified 0.05 routing fee contributes **9.95 USDC swap volume**, with **10 USDC acquisition cost**. Sale proceeds use the net amount received. Refunds are excluded from cost; no fixed fee percentage is assumed.

The adapter verifies executed commands, the historical reviewed router implementation, official factory pool, swap log, transfers and exact wallet totals. Ambiguous batches, unsupported routes or unexplained amounts remain pending. Tests cover input/output fees, buys, sells, refunds and invalid amounts. A historical public no-fee settlement passed the actual RPC adapter.

**A real fee-bearing Strategy settlement has not passed end to end.** The AI's 156-reference source dry run did not submit those references to our database and does not establish that result.

## What is still required

### Both-wallet investigation after explicit user approval

The user approved checking both linked public wallets. Read-only public history inspection identified the first rejection as UniversalRouter transaction `0xaf664e3b310306ad7149ae9753fe65c5e397278565e76521db10df0884feb970`: an ETH-funded exact-output domain purchase routed through USDC. A prepared, undeployed verifier pins the historical router runtime, factory pools, executed commands, transfers, token fee and ETH refund. It independently verifies 214,880,117,132,687 wei spent, 3,769,154,048,095 wei refunded, and 100,000,000 domain units received; the domain pool's USDC input is 628,587 base units. The live public adapter and isolated ledger tests pass. This patch has not been installed, and does not make the complete account financially ready.

The broader inventory found **36 liquidity-position transactions**, 32 involving **WEB3GUIDES.COM/USDC.e**, across 11 domain LP positions. Positions **47933** and **10285** have nonzero liquidity at both opening block `0xeb3620` and closing block `0xfe0ba4`. The external wallet also used bridges. The agent wallet had no native contract outflows and one incoming RelayRouter funding transfer. These are historical portfolio flows, not failed wallet association or missing MCP trade detection.

Sanitized local evidence is in `D:/Temp/modelkombat-native-flow-inventory-20261006.json`, `D:/Temp/modelkombat-all-lp-flow-20261006.json` and `D:/Temp/modelkombat-lp-boundaries-20261006.json`. No database, live worker, campaign or Reporter changes were made in this investigation.

**Decision pending:** retain the agreed account-wide FIFO method and implement proper LP accounting, or explicitly change competition ROI/profit to campaign-time eligible bot trades with matched acquisition costs. The latter is a rule change, not an assumption to apply automatically. Do not invent zero-cost LP withdrawals, ignore positions and declare account ROI verified, or send another installer as though the isolated router fix resolves this account. The user has been asked to choose; current rules remain intact.

**Cash tracking is not yet fully verified.** The identity/coverage handoff and full-account volume check are confirmed, but no real Strategy trade has been reconciled through our collector. The installed native ledger is working beyond the old blanket rejection, but the participant's unsupported native contract interaction still blocks full financial reconstruction. LP flows and transferred domain tokens with unknown acquisition cost also remain unsupported; a successful volume check does not establish ROI. Successful repeated financial audits and live financial settlement remain outstanding.

The user installed the worker at **04:47:48 UTC**. The dedicated `model-kombat-tracking` service is enabled, running and isolated from Reporter under `/opt/model-kombat-tracking`. The initial audit completed; its missing report was a timing issue, not evidence of a service crash.

## Native ETH repair installed; full-account contract flow pending

The old blanket rejection of any native ETH balance or gas activity is replaced by an exact native ledger. ETH has its own zero-address accounting asset, separate from WETH. Finalized transfers, gas, L1 data fees, linked-wallet movements, sponsorship and direct wrapping are reconciled against native opening/closing balances. Quote-capital deposits add capital; internal transfers and wrapping do not. Scored swap volume is unchanged. Unsupported mint/bridge transactions, ambiguous contract flows, LP flows, missing cost basis or reconciliation failures remain pending.

The fee adapter follows the OP Stack [Jovian receipt specification](https://specs.optimism.io/protocol/jovian/exec-engine.html): its DA-footprint field is not another blob fee. The calculated fee on a public Doma receipt matched the explorer's actual fee exactly. Local PostgreSQL tests verify native capital and fee-inclusive realized profit, and verify that the incremental migration preserves campaign state and the AI role's restricted permissions.

The corrected public adapter reconstructed the previously approved **single agent wallet** successfully: **31 ledger events**, zero opening lots, matching opening/closing balances, and no database writes. Pure quote funding from contracts is accepted when there is no asset disposal; ambiguous exchanges and unknown domain basis remain blocked. This check excluded the other linked wallet and supplied no scored-fill list, so it does **not** establish complete account-level ROI or real Strategy settlement. The droplet must run the updated full-account audit before either is called ready.

The consolidated repair is **`D:/Temp/modelkombat-tracking-update-20261006/tracking-update.sql`**. It combines native ETH support and a private operational-status channel in one atomic, repeat-safe patch. It supersedes the earlier standalone native patch. A read-only production check on October 6 confirmed `nativeAccountingReady: true` and the installed worker's completed report. No further SQL or installer retry is needed for this update.

The next installer attempt stopped before upload because the droplet's 8.7 GB root filesystem was full (inodes were only 22% used). The user cleared package downloads and explicitly trimmed older system journals to 200 MB, recovering **719 MB free**. No application files or databases were part of that cleanup. The installer now checks 512 MiB/30,000 free inodes before upload, uses stable content IDs and an isolated temporary npm cache, removes its own validated staging directory, and retains the current plus previous verified release after successful startup. Reusing a release verifies its files, installation marker and local dependencies; it never runs `npm ci` inside the active release. Updates replace service/config/runtime files atomically and restore the prior collector if new startup fails. Unknown release directories and unsafe links are preserved.

Verification: the delivered package passed the router, public collector, accounting and native ETH suites using clean D-drive dependencies and again on the user's droplet during installation. Repeated packaging produced the same content ID. Release cleanup/retention and directory-junction safety checks passed; Windows could not exercise Linux npm executable symlinks. The actual disk-check loop was tested under Bash with passing/rejected disk and inode fixtures. The droplet successfully removed one obsolete release and retained its current/previous versions. Full linked-account financial reconciliation remains unresolved as reported above.

The installer checks the required database functions before replacing the existing service, then verifies that the new process produces a fresh `mk-public-worker-3-native-eth` status. A failed preflight leaves the old service in place. Worker health uses the existing service-role connection through an allowlisted, private RPC; anonymous users and the internal-AI role cannot read or write it. It stores no wallet addresses, account IDs, credentials or trade references. Draft mode can publish operational health, but still writes no scores. Read-only worker modes publish no health records. Reports distinguish `scoreWrites` from status-report writes.

After this update the assistant can fetch current/last completed audits with `mkz_worker_health(null)` through the existing Supabase connection. Manual copying of routine server logs is no longer required. Local status/report files remain available for database outages. Direct non-interactive SSH access by the assistant is unavailable; the user's installer remains the server-update path.

In the Windows VS Code terminal, run:

```powershell
node C:\Users\Mike\Desktop\web3guides\scripts\bots\install-tracking-worker.cjs
```

This uses the user's normal SCP/SSH login to `root@143.110.183.157`. It sends the three existing Model Kombat environment settings over SSH without printing their values, then deletes the temporary settings file. It installs locked dependencies, runs the packaged tests and enables restart after reboot. The service checks every 15 minutes; the internal AI stays on its existing four-hour schedule. It collects public history for registered linked wallets. Node 20+ and systemd are required; missing prerequisites stop installation visibly.

After updating, read the completed report and current audit status:

```powershell
ssh root@143.110.183.157 "cat /var/lib/model-kombat-tracking/backend-worker-status.json; cat /var/lib/model-kombat-tracking/backend-worker-last-run.json"
```

The installer and clean package have passed local tests. **No remote installation has been performed by the agent.** A running service is not proof that financial tracking passed; inspect its report. The direct worker command remains:

`node scripts/bots/run-trade-worker.cjs --write --watch`

The direct command runs immediately and every four hours by default. The prepared service uses a 15-minute polling setting. Without `--write`, it performs a read-only rehearsal. It cannot open the campaign, enroll users, grant coins, or transfer rewards. A draft run writes no scores.

**Running `vercel --prod` does not start this collector.** No website production deployment or deployment-automation change has been performed by the agent. The user runs the separate collector installer.

Opening remains a separate action. The announced October 6, 2026 14:00 UTC start is not applied by these scripts; the database remains authoritative. Rewards can be funded at payout. No new upfront-funding requirement has been added.

Physical-phone testing, a clean release build covering all current game changes, two real source runs and final live wallet checks remain release tasks. Earlier preview/build passes do not verify this new tracking increment.
