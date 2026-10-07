# Public smart-wallet receipt fixtures

These are public Doma chain 97477 transactions, not private database exports.
They contain public on-chain UserOperation signatures, receipt logs, public indexed
swap rows, and runtime bytecode read at the receipts' historical blocks.

Reviewed 7 October 2026 through the official explorer's verified-source endpoint:

- [EntryPoint v0.8](https://explorer.doma.xyz/api/v2/smart-contracts/0x4337084d9e255ff0702461cf8895ce9e3b5ff108)
- [Simple7702Account](https://explorer.doma.xyz/api/v2/smart-contracts/0x4cd241e8d1510e30b2076397afc7508ae59c66c9)
- [UniversalRouter](https://explorer.doma.xyz/api/v2/smart-contracts/0x5089863e97196773038f98459262d866f2281f58)

The verifier pins each runtime hash and the wallet's exact EIP-7702 delegation.
It supports one successful signed UserOperation containing one account `execute`
call and one or two V3 exact-input swaps into the same domain token and wallet quote.
Every pool is resolved through the existing reviewed Doma V3 factory at that block.

The fixtures cover a split purchase, a split sale, and a USDC→WETH→domain purchase.
Only terminal domain-pool legs contribute volume. Each complete wallet transaction
becomes one economic fill; accounting uses actual wallet quote cost/proceeds.
Gas paid by a sponsor is not charged to the participant.

Unknown account implementations, batch operations, other commands, extra transfers,
unreviewed fees, missing indexed legs, and ambiguous Strategy attribution fail closed.
Adding this adapter does not prove private MCP command origin; source remains linked
agent-wallet activity unless a verified Strategy execution reference corroborates it.
