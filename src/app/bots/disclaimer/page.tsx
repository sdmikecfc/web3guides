import { InfoPage } from "../_components/InfoPage";
import css from "../info.module.css";

export const metadata = { title: "Disclaimer | Model Kombat", description: "Trading, competition, and wallet risk disclosures for Model Kombat." };

export default function DisclaimerPage() {
  return <InfoPage eyebrow="Before you enter" title="Robots can lose. Traders can too." intro="Model Kombat is a game and competition. It does not make trading safe or guarantee a return, score, or prize." art="/bots-art/plates/pit-side-on.webp">
    <p className={css.note}><strong>Nothing in Model Kombat is financial, investment, legal, or tax advice.</strong> Make your own decisions and use only funds you can afford to lose.</p>

    <h2>Trading risk</h2>
    <p>Digital-asset and domain-related markets can be volatile, illiquid, and difficult to value. Prices may move quickly. Strategies can fail. You may lose some or all of the funds you use, and fees, slippage, taxes, network conditions, or service outages may increase losses.</p>

    <h2>No guaranteed prize</h2>
    <p>Participation, trading, a displayed rank, or a displayed score does not guarantee eligibility or payment. Live results are provisional until verified and finalized. A competition may be delayed, paused, corrected, or cancelled when required by law, security, data integrity, or circumstances beyond reasonable control.</p>

    <h2>Wallet and network risk</h2>
    <p>Wallet signatures, smart contracts, blockchains, MCP clients, trading strategies, and third-party services carry technical and security risk. Transactions may be irreversible. Never share your private key or seed phrase. Verify every approval and destination before signing.</p>

    <h2>Game items</h2>
    <p>Model Kombat coins, robot parts, cosmetics, points, and practice results are entertainment features with no cash value. They are not investments, deposits, securities, or promises of future value.</p>
  </InfoPage>;
}

