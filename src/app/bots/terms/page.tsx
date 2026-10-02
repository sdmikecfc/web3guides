import { InfoPage } from "../_components/InfoPage";

export const metadata = { title: "Terms | Model Kombat", description: "Terms for using and playing Model Kombat." };

export default function TermsPage() {
  return <InfoPage eyebrow="Terms of use" title="Keep the fight fair." intro="These terms govern your access to Model Kombat. By connecting a wallet or using the game, you agree to them." art="/bots-art/plates/street-elevation.webp">
    <h2>Who may play</h2>
    <p>You must be at least 18 years old, able to enter a binding agreement, and permitted to use the game under the laws that apply to you. You are responsible for your wallet, credentials, devices, taxes, and compliance with local law.</p>

    <h2>The game and competitions</h2>
    <p>Model Kombat gives you a limited, personal, revocable right to use the game. The competition rules, dates, eligibility requirements, score definitions, and prize tables published on the Rules page form part of these terms.</p>
    <p>Game coins, robot parts, decorations, and other virtual items are game features. They have no cash value and do not create ownership of Model Kombat software or artwork.</p>

    <h2>Fair play</h2>
    <p>Do not exploit bugs, falsify activity, manipulate scores, interfere with another player, evade limits, scrape protected data, reverse engineer restricted systems, or use bots and coordinated accounts to gain an unfair advantage. We may investigate, pause, correct, or disqualify activity when reasonably needed to protect players and results.</p>

    <h2>Wallets and third-party services</h2>
    <p>Your wallet and trading activity may rely on third-party software and networks that Model Kombat does not control. Keep your private keys and seed phrase secret. Transactions can be irreversible.</p>
    <p>Doma services are also governed by the <a href="https://doma.xyz/terms" target="_blank" rel="noopener noreferrer">Doma Terms of Service</a>. If a third-party term conflicts with these game terms for that third-party service, its term controls your use of that service.</p>

    <h2>Availability and responsibility</h2>
    <p>The game is provided on an as-available basis. Features, campaigns, and access may change or pause for maintenance, security, legal, or integrity reasons. To the fullest extent permitted by law, Model Kombat and Doma disclaim implied warranties and are not liable for indirect, incidental, special, consequential, or investment losses arising from the game.</p>
    <p>We may update these terms. Continued use after updated terms take effect means you accept them. If you do not agree, stop using the game and disconnect your wallet.</p>
  </InfoPage>;
}

