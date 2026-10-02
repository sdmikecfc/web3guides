/** Cash accounting contract; separate from trading coin grants and historical campaigns. */
export const TOKEN_ACCOUNTING = {
 id:'mk-fifo-realized-capital-1',
 formula:'ROI percent = 100 × realized eligible period profit / (actual opening capital + external inbound capital).',
 profit:'Fee-inclusive FIFO: actual sell proceeds minus the consumed lots\' actual cost. Only eligible automated sells contribute profit. All buys, manual sells and outbound transfers still consume or create inventory correctly.',
 period:'Begin at the later of campaign opening and participant enrollment; end at the audited cutoff, no later than campaign closing. Subtract opening cumulative realized profit from closing cumulative realized profit.',
 participant:'Resolve all associated wallets to one Doma account. Preserve lot basis on transfers inside that account; internal movements add no capital, volume or realized profit. Never add wallet ROI percentages.',
 capital:'Value actual opening holdings and verified external inbound capital in USD. Include supported domain tokens and USDC/ETH quote capital. Withdrawals do not reduce the denominator. No minimum bankroll floor.',
 valuation:'Use canonical execution-time USD values and fee-inclusive net quote amounts. ETH/WETH uses evidenced historical prices, never current spot prices. Historical lot and capital coverage is required, including activity that earns no prizes.',
 precision:'Preserve the existing micro-USD money precision. Emit ROI as a decimal expansion with up to 36 fractional digits, not the rounded display percent. The existing accounting limit is $1 billion per money input.',
 unavailable:'Missing basis, external movement evidence, source coverage, prices or corrections means pending financial coverage. Zero capital gives null ROI. It is never replaced with zero confirmed profit.',
 provenance:'Existing Doma Reporter modules/battlebots/campaign.js periodCapital/periodRealized and campaign-accounting.js realizedCumulative; FIFO implementation in lib/lot_ledger.js realizedOf. Those files are read-only references and are not runtime imports.',
} as const;
