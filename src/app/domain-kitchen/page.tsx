import type { Metadata } from "next";
import BotGuidePage from "@/components/BotGuidePage";

/**
 * The BEGINNER guide (M10). The other three pages built on this shell are
 * deliberately advanced: the LP bot guide talks about tick ranges, Permit2 and
 * plaintext mnemonics. This one is the opposite end, and it is the page for
 * somebody who arrived from a Discord link and has never opened the game.
 *
 * Copy rules, same as the game: plain words, nothing undefined, no em-dashes,
 * and never a promise about money. Impermanent loss is stated in the risks in
 * words a beginner can actually parse, because the honest version of "your
 * money works for you" includes the part where it can come back smaller.
 *
 * No Supabase write: guides normally live as rows in the `guides` table, but
 * this shell is a plain page component, which is why it is the cheap path for
 * hand-written long-form.
 */

const PLAY = "https://chef.web3guides.com";

export const metadata: Metadata = {
  title: "Domain Kitchen — Run a Restaurant On A Real Domain Token | Web3 Guides",
  description:
    "A free browser game where a real domain token runs your restaurant. Play with no wallet, and if you want to, buy a little of the token or lend some to the market and watch it pay your kitchen. Plain-English guide to what a domain token is and how to start.",
};

export default function DomainKitchenPage() {
  return (
    <BotGuidePage
      accent="#e8a13d"
      eyebrow="Free to play · no wallet needed to start"
      title="Domain Kitchen"
      tagline="A little restaurant that runs on a real domain token. Play it free in a browser. If you decide you want to, buying some of the token or lending a bit to the market makes your kitchen busier, and you can take your money back whenever you like."

      what="Domain Kitchen is a browser game. You run a small restaurant: seat guests, clear tables, cook better dishes, arrange the room how you like. That part is free, needs no wallet, and works on a phone. Underneath it, the restaurant is powered by a real domain. A domain is a web address, like software.ai, and Doma cuts ownership of one into a fixed number of small pieces that people can buy and sell. If you hold some of those pieces, or lend some to the market so other people can trade, the game reads that and your kitchen earns coins faster. Coins are a game thing. They buy tables, stoves and staff, and they never turn back into real money. The point is that you learn how any of this works by running a restaurant, not by reading a manual."

      /* The whole page has one job: get somebody into the game. Both hero
       * buttons go there, and the shell's GitHub/full-guide defaults are
       * overridden rather than left to render links that go nowhere. */
      ctaPrimary={{ href: PLAY, label: "Play free, no wallet", icon: "🍳", external: false }}
      ctaSecondary={{ href: "#risks", label: "Read the risks first", external: false }}

      dashboardUrl={PLAY}
      dashboard={{
        badge: "Live · real market",
        title: "The restaurant runs on a real domain",
        body: "This is not a simulation of a market. The game reads the actual Doma market for the domain it is built on, so what you own and what you lend show up in your kitchen within about a minute.",
        cta: "Open the game →",
      }}

      quickstartLink={{ href: PLAY, label: "Skip this and just play ↗", external: false }}
      quickstartNote="Steps 1 and 2 are the only ones most people ever do. The rest is there when you want it, and there is no hurry."

      closing={{
        title: "Start with step one",
        body: "Run a restaurant for five minutes with no wallet and no money. That is the whole ask. If you like it, the rest is one tap at a time.",
        links: [{ href: PLAY, label: "Play Domain Kitchen", icon: "🍳", external: false }],
      }}

      stats={[
        { label: "Cost to start", value: "Free", sub: "No wallet, no sign-up, works on a phone" },
        { label: "To start earning", value: "About $10", sub: "Smaller amounts get eaten by fees" },
        { label: "Your money", value: "Stays yours", sub: "In your own wallet, take it back anytime" },
        { label: "Game coins", value: "Never cash", sub: "They buy furniture and nothing else" },
      ]}

      mechanics={[
        {
          icon: "🏠",
          title: "A web address, cut into pieces",
          body:
            "Somebody owns software.ai the same way somebody owns a shop. Doma puts that ownership on a blockchain and splits it into a fixed number of small pieces, so lots of people can each own a bit instead of one person owning all of it. Those pieces are what you buy and sell. The domain carries on working as a normal web address the whole time.",
        },
        {
          icon: "🍳",
          title: "Two things make your kitchen busier",
          body:
            "Buying and selling the token pays your kitchen coins. So does lending some of your token and dollars to the market so other people can trade, which pays you a small cut of every trade that happens. The game shows both as coins per hour on the card in the corner. You can also just play, with neither, and the restaurant still runs.",
        },
        {
          icon: "⭐",
          title: "Money cannot buy a good restaurant",
          body:
            "Service quality comes from three places: your own hands, a room that is looked after, and dishes you have improved. No amount of coins and no amount of money moves it even slightly. A big wallet can build a big restaurant, but only care makes a good one. That rule is deliberate and it is not going to change.",
        },
        {
          icon: "🔒",
          title: "What you build stays built",
          body:
            "Taking your money back out of the market stops the coins coming in. It never un-builds your room. Every table, chair, stove and member of staff you bought stays exactly where it is. Nothing you made goes away because you changed your mind about the money.",
        },
        {
          icon: "🎁",
          title: "Sometimes there is a reward on top",
          body:
            "Every so often a domain runs a reward for the people trading it and lending to it. When one is running the game says so and shows you when the current round closes. When one is not, the game says nothing about it and simply carries on. It is a bonus, never the reason to be there.",
        },
        {
          icon: "📱",
          title: "It keeps running without you",
          body:
            "The crew works while you are away and the deliveries pile up for you rather than being lost. Coming back is a nice moment, and missing a day is not punished anywhere in the game. There are no streaks to break.",
        },
      ]}

      steps={[
        {
          title: "1. Play it first, with nothing",
          body:
            "Open the game and run a restaurant for five minutes. No wallet, no sign-up, no money. If you do not enjoy that part, none of the rest matters, and you have lost nothing finding out.",
        },
        {
          title: "2. Get a wallet, if you want to go further",
          body:
            "On app.doma.xyz you can sign in with Google and it makes you a wallet, then top it up with a card or Apple Pay. It takes about a minute. Everything you buy sits in your wallet, never with us and never with the game.",
        },
        {
          title: "3. Buy a little of the token",
          body:
            "Go to the domain's own page on the Doma app and buy a small amount. Ten dollars is plenty to see how it works. This alone already makes your kitchen busier, because trading counts.",
        },
        {
          title: "4. Lend some to the market",
          body:
            "In the game, open the card at the top left and press Put money to work. It uses half your dollars and half your token, sends both to the market, and pays you a cut of the trades that happen. The game handles the fiddly part and never asks you to pick a price range.",
        },
        {
          title: "5. Watch it turn up in the room",
          body:
            "Within a minute the card shows what you have working and how much it earns per hour, and the coins start arriving faster. Spend them on more seats and a bigger kitchen. When you want your money back, you take it back, and the room stays exactly as you built it.",
        },
      ]}

      risks={[
        {
          heading: "Prices move both ways",
          body:
            "A domain token can be worth less tomorrow than it is today. Nobody can tell you which way it will go, and this page is not going to pretend otherwise. Only ever use money you would be genuinely fine losing.",
        },
        {
          heading: "Lending to a market can hand you back a different mix",
          body:
            "When you lend, you put in some token and some dollars. If the price moves a lot while your money is in there, you can get back more of the one that fell and less of the one that rose. The trading fees you earned may or may not cover that difference. People call this impermanent loss. It is the main thing that surprises beginners, and it is worth understanding before you put in anything you care about.",
        },
        {
          heading: "Game coins are not money",
          body:
            "Coins buy tables, stoves and staff inside the game. They do not convert to anything, they cannot be withdrawn, and they are not a token. There is no in-game currency you can cash out, by design.",
        },
        {
          heading: "Rewards are occasional, not a salary",
          body:
            "A domain reward runs sometimes and not other times. When one is not running, playing pays you in coins and nothing else. Do not turn up expecting money to be on the table on any given day.",
        },
        {
          heading: "This is not advice",
          body:
            "Nothing here is financial advice and nobody here knows your situation. It is a game that happens to sit on top of a real market, and the honest reason to play is that you enjoy running the restaurant.",
        },
      ]}
    />
  );
}
