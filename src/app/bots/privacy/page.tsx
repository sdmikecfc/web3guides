import { InfoPage } from "../_components/InfoPage";

export const metadata = { title: "Privacy | Model Kombat", description: "How Model Kombat handles game and wallet data." };

export default function PrivacyPage() {
  return <InfoPage eyebrow="Privacy notice" title="Your garage. Your data." intro="This notice explains what Model Kombat uses to run the game, verify competition results, and protect the workshop." art="/bots-art/plates/workshop-interior.png">
    <h2>Who runs this game</h2>
    <p>Model Kombat is an independent community hobby game run by @sdmike, not by Doma. For support or a privacy request, contact <a href="https://discord.gg/doma" target="_blank" rel="noopener noreferrer">@sdmike in the Doma Discord</a>. Use a private message for personal information. Never send a seed phrase or private key.</p>
    <h2>Information we use</h2>
    <p>Model Kombat may process your public wallet address, wallet-signature authentication records, generated or chosen display name, robot builds, inventory, game progress, fight history, campaign scores, and prize status.</p>
    <p>When you sign in for tracking, we save your wallet and request its association with your Doma account and linked wallets, including an embedded agent wallet where available. Doma supplies account-to-wallet links and Strategy execution references. Our backend checks public blockchain records to calculate eligible volume, qualification, cost basis, ROI and realized profit. Linking alone does not prove that every trade was an MCP command.</p>
    <p>Hosting and security systems may also process connection information such as IP addresses, browser details and error logs. Account links and authentication credentials are not published on the leaderboard.</p>

    <h2>How we use it</h2>
    <ul><li>Run and save the game.</li><li>Authenticate your wallet without asking for its private key.</li><li>Calculate standings, check eligibility, and deliver prizes.</li><li>Prevent cheating, abuse, fraud, and technical failures.</li><li>Measure performance, fix problems, and respond to support requests.</li></ul>

    <h2>What other players can see</h2>
    <p>Public game pages may show your display name, robot, cosmetic items, fight results, rank, score, and prize status. Public blockchain activity can remain visible independently of Model Kombat and may be linkable to you. We do not ask for or store your seed phrase or private key.</p>

    <h2>Services and storage</h2>
    <p>The game uses hosting, database, wallet and blockchain services, including Vercel, Supabase and Doma. These providers process data according to their roles and policies and may operate outside your country. Doma trading permissions and account settings are managed separately in Doma.</p>
    <p>A secure session cookie identifies a server-saved guest garage. Browser storage also holds preferences, drafts, local legacy saves and sign-in state. Uploaded banners stay on the device and are not included in public replay packets. Clearing browser data may remove guest access and local-only content; it does not automatically delete server records.</p>
    <p>We keep information only as long as needed for the purposes above, legal obligations, dispute handling, security, and competition records. Retention periods vary by record and applicable law.</p>

    <h2>Your choices</h2>
    <p>You can browse and play free Arcade practice without wallet sign-in. Disconnecting a wallet does not delete an existing save, competition entry or public blockchain history. Depending on where you live, you may have rights to request access, correction, deletion, restriction, or a copy of personal data. Contact @sdmike for these requests; some records may need to be retained for security, competition disputes or legal obligations.</p>
  </InfoPage>;
}
