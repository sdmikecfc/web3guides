import { InfoPage } from "../_components/InfoPage";

export const metadata = { title: "Privacy | Model Kombat", description: "How Model Kombat handles game and wallet data." };

export default function PrivacyPage() {
  return <InfoPage eyebrow="Privacy notice" title="Your garage. Your data." intro="This notice explains what Model Kombat uses to run the game, verify competition results, and protect the workshop." art="/bots-art/plates/workshop-interior.png">
    <h2>Information we use</h2>
    <p>Model Kombat may process your public wallet address, wallet-signature authentication records, generated or chosen display name, robot builds, inventory, game progress, fight history, campaign scores, and prize status.</p>
    <p>When you enter a trading competition, we may process verified Doma strategy activity needed to calculate eligibility and scores, including timestamps, confirmed fills, starting-capital snapshots, realized profit, and qualifying deposits. We may also receive ordinary technical data such as browser type, device information, logs, approximate location derived from an IP address, and error or security events.</p>

    <h2>How we use it</h2>
    <ul><li>Run and save the game.</li><li>Authenticate your wallet without asking for its private key.</li><li>Calculate standings, check eligibility, and deliver prizes.</li><li>Prevent cheating, abuse, fraud, and technical failures.</li><li>Measure performance, fix problems, and respond to support requests.</li></ul>

    <h2>What other players can see</h2>
    <p>Public game pages may show your display name, robot, cosmetic items, fight results, rank, score, and prize status. Public blockchain activity can remain visible independently of Model Kombat. We do not ask for or store your seed phrase or private key.</p>

    <h2>Services and storage</h2>
    <p>We may use Doma, Vercel, Supabase, wallet providers, analytics, and security providers to deliver the service. These providers process data under their own terms and privacy practices. A practice garage may use browser storage on your device for local progress and preferences.</p>
    <p>We keep information only as long as needed for the purposes above, legal obligations, dispute handling, security, and competition records. Retention periods vary by record and applicable law.</p>

    <h2>Your choices</h2>
    <p>You can clear local practice data through your browser and disconnect your wallet at any time. Depending on where you live, you may have rights to request access, correction, deletion, restriction, or a copy of certain personal data. Use the official contact channel listed on <a href="https://doma.xyz" target="_blank" rel="noopener noreferrer">doma.xyz</a> for privacy requests about Model Kombat.</p>
  </InfoPage>;
}

