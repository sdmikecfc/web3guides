import type { Metadata } from "next";
import BotGuidePage from "@/components/BotGuidePage";

/** Player guide for the permanent restaurant and resumable food-truck route. */
const PLAY = "https://chef.web3guides.com";

export const metadata: Metadata = {
  title: "Domain Kitchen — Your Restaurant, Your Food Truck | Web3 Guides",
  description: "Build a restaurant, cook through a food-truck adventure, and bring new equipment home. Play free on desktop or phone, with no wallet needed to start.",
};

export default function DomainKitchenPage() {
  return (
    <BotGuidePage
      accent="#bd644c"
      eyebrow="Free to play · no wallet needed to start"
      title="Domain Kitchen"
      tagline="A restaurant to call home. A food truck full of possibilities. Cook, explore, and bring something wonderful back."
      what="Your crew runs your home restaurant while you decorate, collect ingredients, and improve recipes. When you want to cook yourself, open the food truck and take charge of the next lunch shift. Follow eight service days and four market or gift stops, then bring new equipment back to your restaurant. Play free in your desktop or phone browser."
      ctaPrimary={{ href: PLAY, label: "Open your restaurant", icon: "🍳", external: false }}
      ctaSecondary={{ href: "#risks", label: "About saves and coins", external: false }}
      dashboardUrl={PLAY}
      dashboard={{
        badge: "Your permanent home",
        title: "Make room for your discoveries",
        body: "Place a working fryer or lemonade station at home and your crew can serve its dishes. Leave a clear path to the equipment, look after its condition, and make the room your own.",
        cta: "Open the game →",
      }}
      quickstartLink={{ href: PLAY, label: "Start playing ↗", external: false }}
      quickstartNote="Start at home, then try one truck shift. You can pause and come back."
      closing={{
        title: "Make yourself at home",
        body: "A good lunch, a new discovery, and a favorite corner waiting at home. Your next adventure can be as small as one shift.",
        links: [{ href: PLAY, label: "Play Domain Kitchen", icon: "🍳", external: false }],
      }}
      stats={[
        { label: "Cost to start", value: "Free", sub: "Open the game in a desktop or phone browser" },
        { label: "Your restaurant", value: "Always yours", sub: "Decorate, care for your crew, and master recipes" },
        { label: "Your adventure", value: "12 stops", sub: "Eight service days with four stops along the way" },
        { label: "Your pace", value: "Pause & resume", sub: "Take a break without abandoning your shift" },
      ]}
      mechanics={[
        { icon: "🏠", title: "A restaurant that grows with you", body: "Your home crew cooks and serves automatically. Working equipment determines what they can make. Collect daily ingredients, improve recipes in Cookbook, and finish the room's small care jobs. Recipe achievements and saved coins unlock more room. Home service can earn while you are away, within its offline limit." },
        { icon: "🍳", title: "A kitchen in your hands", body: "In the truck, you gather ingredients, prepare and cook each order, plate it, and serve it at the window. Wash dirty dishes to keep clean plates available. Each service ends when its guests are fed or a guest leaves hungry. Pause whenever you need a break; the truck does not cook while you are away." },
        { icon: "🎁", title: "Discoveries worth bringing home", body: "Market stops introduce new machines for both kitchens. Your earned coins, equipment, and upgrades remain yours after a failed trip; the next route begins at the first lunch. Between shifts, arrange the truck, hire a helper, or improve your tools. Practice lets you try a kitchen without changing your route or earning rewards." },
      ]}
      steps={[
        { title: "1. Make yourself at home", body: "Let your crew serve its first guest, move a furnishing in Decorate, and open the parcel by the door. Use those ingredients toward your first recipe upgrade. Done keeps a room edit; Cancel leaves it as it was." },
        { title: "2. Open your food truck", body: "Choose Food Truck and open the next lunch. Click or tap a station to walk over and use it. Tap an empty floor tile to move. On a keyboard, use WASD or arrow keys to move, E or Space to interact, and P to pause." },
        { title: "3. Follow the recipe cards", body: "Pick an ingredient from the crates or fridge, then follow its recipe through the kitchen. Bring a finished order to the serving window. The card beside your chef shows what is in your hands and what to do next." },
        { title: "4. Bring something back", body: "Visit the stops between services and collect your discoveries. Use Back home to save and pause your shift. Place a new machine in the restaurant, leave its working side clear, and watch your crew add its dishes. Friends is there when you want to visit another kitchen." },
      ]}
      risks={[
        { heading: "Keep track of your save", body: "Browser play stays on this device; clearing browser storage removes that copy. A signed-in restaurant has a separate wallet save. If saving pauses, reconnect before continuing. Signing in does not spend or stake funds." },
        { heading: "Kitchen coins stay in the game", body: "Use coins for furniture, crew, ingredients, and upgrades. Token reward events are not open. Ordinary play does not promise tokens, points in another program, or a cash return." },
      ]}
    />
  );
}
