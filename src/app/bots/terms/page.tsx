import { InfoPage } from "../_components/InfoPage";

export const metadata = { title: "Terms | Model Kombat", description: "Terms for using and playing Model Kombat." };

export default function TermsPage() {
  return <InfoPage eyebrow="Terms of use" title="Keep the fight fair." intro="These terms govern your access to Model Kombat. By connecting a wallet or using the game, you agree to them." art="/bots-art/plates/street-elevation.webp">
    <h2>A community hobby game</h2>
    <p>Model Kombat is an independent, third-party hobby game run by @sdmike, with rewards to give back to the community I love. Doma does not operate this game. For game support, questions or prize disputes, contact <a href="https://discord.gg/doma" target="_blank" rel="noopener noreferrer">@sdmike in the Doma Discord</a>.</p>
    <h2>Who may play</h2>
    <p>You must be at least 18 years old, able to enter a binding agreement, and permitted to use the game under the laws that apply to you. You are responsible for your wallet, credentials, devices, taxes, and compliance with local law.</p>

    <h2>The game and competitions</h2>
    <p>Model Kombat gives you a limited, personal, revocable right to use the game. The competition rules, dates, eligibility requirements, score definitions, and prize tables published on the Rules page form part of these terms.</p>
    <p>Game coins, robot parts, decorations, and other virtual items are game features. They have no cash value and do not create ownership of Model Kombat software or artwork.</p>
    <p>Playing is free and does not require trading. Token competitions have separate trading eligibility and unlock conditions. Reference dollar values are estimates, not a guaranteed payment or return. Your trading losses and costs may exceed any reward. Prizes remain subject to verification under the published competition rules.</p>

    <h2>Fair play</h2>
    <p>Authorized automated trading through the supported Doma routes is part of the competition. Do not exploit game bugs, falsify activity, manipulate results, interfere with another player, evade limits through multiple identities, or access protected data without permission. Activity corrections and disputes are handled under the published rules; legitimate uncapped turnover is not rejected merely because it is repeated.</p>

    <h2>Wallets and third-party services</h2>
    <p>Your wallet and trading activity may rely on third-party software and networks that Model Kombat does not control. Keep your private keys and seed phrase secret. Transactions can be irreversible.</p>
    <p>Doma services are also governed by the <a href="https://doma.xyz/terms" target="_blank" rel="noopener noreferrer">Doma Terms of Service</a>. If a third-party term conflicts with these game terms for that third-party service, its term controls your use of that service.</p>

    <h2>Availability and responsibility</h2>
    <p>The game is provided as available. Features and access may pause for maintenance, security or integrity checks. Scores can be corrected when evidence changes. Nothing here excludes rights or liabilities that cannot lawfully be excluded. Model Kombat does not provide investment advice, custody your trading funds or guarantee third-party services.</p>
    <p>We may update these terms. Continued use after updated terms take effect means you accept them. If you do not agree, stop using the game and disconnect your wallet.</p>
  </InfoPage>;
}
