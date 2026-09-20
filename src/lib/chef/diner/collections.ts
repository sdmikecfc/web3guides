import type { DinerState } from "./progression";
import type { Course } from "./types";

export interface DecorDef { id: string; name: string; footprint: [number, number]; price: number; setId: string; wall?: boolean; memento?: boolean }
export const DECOR: DecorDef[] = [
  { id: "red_planter", name: "Cherry-red planter", footprint: [1, 1], price: 150, setId: "fifties" },
  { id: "chrome_clock", name: "Chrome wall clock", footprint: [1, 1], price: 150, setId: "fifties", wall: true },
  { id: "milkshake_sign", name: "Milkshake print", footprint: [1, 1], price: 150, setId: "fifties", wall: true },
  { id: "checkered_shelf", name: "Checkered keepsake shelf", footprint: [1, 1], price: 300, setId: "fifties" },
  { id: "daisy_pot", name: "Daisy pot", footprint: [1, 1], price: 150, setId: "garden" },
  { id: "garden_poster", name: "Kitchen garden print", footprint: [1, 1], price: 150, setId: "garden", wall: true },
  { id: "pete_postcard", name: "Pete's first postcard", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "marge_badge", name: "Marge's thank-you badge", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "dottie_portrait", name: "Dottie and her poodle", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "rex_plate", name: "Rex's road-trip plate", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "lin_note", name: "Professor Lin's recipe note", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "kiki_deck", name: "Kiki's little skateboard", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "family_photo", name: "The Hendersons' photo", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
  { id: "bell_review", name: "Mr Bell's framed review", footprint: [1, 1], price: 0, setId: "mementos", wall: true, memento: true },
];
export const DECOR_BY_ID: Record<string, DecorDef> = Object.fromEntries(DECOR.map(d => [d.id, d]));
export const REGULARS = [
  { id: "old_pete", name: "Old Pete", favourite: "classic_burger", quirk: "A friendly word for every road ahead.", hint: "He has been here since opening day.", memento: "pete_postcard" },
  { id: "marge", name: "Marge", favourite: "coffee", quirk: "The night nurse always appreciates a fresh coffee.", hint: "Put coffee on your menu.", memento: "marge_badge" },
  { id: "dottie", name: "Dottie and her poodle", favourite: "ice_cream_sundae", quirk: "Her companion has excellent taste in comfortable corners.", hint: "Place a daisy pot and offer an ice cream sundae.", memento: "dottie_portrait" },
  { id: "rex", name: "Rex the trucker", favourite: "bacon_deluxe_burger", quirk: "A horn, a wave, and his usual booth.", hint: "Equip a truck horn and offer a bacon deluxe burger.", memento: "rex_plate" },
  { id: "professor_lin", name: "Professor Lin", favourite: "apple_pie", quirk: "Reads for ages and always leaves a little note.", hint: "Raise apple pie to level 5.", memento: "lin_note" },
  { id: "kiki", name: "Kiki the skater", favourite: "fries", quirk: "Just stopping by before her next adventure.", hint: "Visit the Boardwalk route.", memento: "kiki_deck" },
  { id: "hendersons", name: "The Hendersons", favourite: "pancakes", quirk: "There's always one more story around their table.", hint: "Place a table for four and offer pancakes.", memento: "family_photo" },
  { id: "mr_bell", name: "Mr Bell", favourite: "mastered", quirk: "A retired critic, still collecting wonderful lunches.", hint: "Master a dish and keep it on the menu.", memento: "bell_review" },
] as const;
export const FRIENDSHIP_LEVELS = [3, 8, 15, 25, 40] as const;
export function regularLevel(servings: number) { return FRIENDSHIP_LEVELS.filter(n => servings >= n).length; }
export function regularFavourite(state: DinerState, id: string) { const regular = REGULARS.find(r => r.id === id); return regular?.favourite === "mastered" ? Object.keys(state.recipes).find(key => state.recipes[key].level === 10) ?? null : regular?.favourite ?? null; }
export function regularAvailable(state: DinerState, id: string) {
  const favourite = regularFavourite(state, id), menu = Object.values(state.home.menu).flat();
  if (!favourite || !menu.includes(favourite)) return false;
  if (id === "dottie") return state.home.layout.some(p => p.equipmentId === "daisy_pot");
  if (id === "rex") return state.cosmetics.horn !== "quiet";
  if (id === "professor_lin") return (state.recipes.apple_pie?.level ?? 0) >= 5;
  if (id === "kiki") return state.collections.stamps.some(s => s.startsWith("boardwalk:"));
  if (id === "hendersons") return state.home.layout.some(p => p.equipmentId === "table_4");
  return !!REGULARS.find(r => r.id === id);
}
export function charmOf(state: DinerState) {
  const ids = new Set(state.home.layout.map(p => p.equipmentId).filter(id => !!DECOR_BY_ID[id]));
  const sets = ["fifties", "garden"].filter(set => DECOR.filter(d => d.setId === set).every(d => ids.has(d.id)));
  return { score: Math.min(100, ids.size * 2 + sets.length * 10), sets };
}
export const COSMETICS = {
  wraps: ["tomato", "buttercream", "sage", "sky"], horns: ["quiet", "friendly", "jazzy"], uniforms: ["classic", "cherry", "mint"], floors: ["checker", "cream", "terracotta"], walls: ["cream", "mint", "rose"], skins: ["original", "cherry", "mint", "cream"],
} as const;
export interface DinerStaff { id: string; name: string; role: "chef" | "waiter"; named: boolean; outfit: string; look: number }
export const RECRUITS = [{ id: "jo", name: "Jo", role: "waiter" }, { id: "bea", name: "Bea", role: "chef" }, { id: "gus", name: "Gus", role: "waiter" }] as const;
export interface SavedDinerLayout { id: string; name: string; layout: DinerState["home"]["layout"]; menu: Record<Course, string[]> }
