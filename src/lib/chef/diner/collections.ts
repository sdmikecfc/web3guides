import type { DinerState } from "./progression";
import type { Course } from "./types";

export interface DecorDef { id: string; name: string; footprint: [number, number]; price: number; setId: string; wall?: boolean; counter?: boolean; ceiling?:boolean; passable?: boolean; memento?: boolean }
export const DECOR: DecorDef[] = [
  { id: "red_planter", name: "Cherry-red planter", footprint: [1, 1], price: 150, setId: "fifties", counter: true },
  { id: "chrome_clock", name: "Chrome wall clock", footprint: [1, 1], price: 150, setId: "fifties", wall: true },
  { id: "milkshake_sign", name: "Milkshake print", footprint: [1, 1], price: 150, setId: "fifties", wall: true },
  { id: "checkered_shelf", name: "Checkered keepsake shelf", footprint: [1, 1], price: 300, setId: "fifties" },
  { id: "daisy_pot", name: "Daisy pot", footprint: [1, 1], price: 150, setId: "garden", counter: true },
  { id: "garden_poster", name: "Kitchen garden print", footprint: [1, 1], price: 150, setId: "garden", wall: true },
  { id: "coffee_print", name: "Morning coffee print", footprint: [1, 1], price: 250, setId: "extras", wall: true },
  { id: "burger_print", name: "House burger print", footprint: [1, 1], price: 250, setId: "extras", wall: true },
  { id: "leafy_plant", name: "Tall rubber plant", footprint: [1, 1], price: 450, setId: "extras" },
  { id: "herb_planter", name: "Kitchen herb planter", footprint: [1, 1], price: 300, setId: "extras", counter: true },
  { id: "burger_mascot", name: "Little burger buddy", footprint: [1, 1], price: 180, setId: "welcome", counter: true },
  { id: "retro_radio", name: "Lunch-break radio", footprint: [1, 1], price: 220, setId: "welcome", counter: true },
  { id: "condiment_caddy", name: "Ketchup & mustard caddy", footprint: [1, 1], price: 120, setId: "welcome", counter: true },
  { id: "welcome_mat", name: "Gingham welcome mat", footprint: [1, 1], price: 120, setId: "welcome", passable: true },
  { id:'diner_clock',name:'Last-call wall clock',footprint:[1,1],price:420,setId:'smalltown',wall:true },
  { id:'bear_statue',name:'Big friendly bear',footprint:[1,1],price:950,setId:'smalltown' },
  { id:'deer_trophy',name:'Carved woodland trophy',footprint:[1,1],price:650,setId:'smalltown',wall:true },
  { id:'pie_display',name:'Pie under glass',footprint:[1,1],price:380,setId:'smalltown',counter:true },
  { id:'coffee_sign',name:'Fresh coffee sign',footprint:[1,1],price:320,setId:'smalltown',wall:true },
  { id:'jukebox',name:'Saturday-night jukebox',footprint:[1,1],price:1400,setId:'smalltown' },
  { id:'wine_rack',name:'Cellar wine cabinet',footprint:[1,1],price:1200,setId:'deco' },
  { id:'deco_mirror',name:'Sunburst mirror',footprint:[1,1],price:800,setId:'deco',wall:true },
  { id:'brass_planter',name:'Brass palm planter',footprint:[1,1],price:850,setId:'deco' },
  { id:'chandelier',name:'Golden-hour chandelier',footprint:[1,1],price:2200,setId:'deco',ceiling:true,passable:true },
  { id:'brass_sconce',name:'Pearl wall light',footprint:[1,1],price:500,setId:'deco',wall:true },
  { id:'velvet_rope',name:'Velvet welcome rope',footprint:[1,1],price:700,setId:'deco' },
  { id:'runner_menu',name:'Brass menu stand',footprint:[1,1],price:420,setId:'deco',counter:true },
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
export const STARTER_TRINKETS = ['burger_mascot', 'retro_radio', 'condiment_caddy', 'daisy_pot', 'burger_print', 'welcome_mat'] as const;
/** One spare slot preserves the welcome gift for old collections at their cap. */
export const MAX_DECOR_COPIES = 1001;
/** Fixed coin prices only; earned friendship keepsakes cannot be sold. */
export function decorResaleValue(id:string):number|null {const item=Object.hasOwn(DECOR_BY_ID,id)?DECOR_BY_ID[id]:null;return item&&!item.memento?Math.floor(item.price/2):null;}
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
export function regularFavourite(state: DinerState, id: string) {
  const regular = REGULARS.find(r => r.id === id);
  if (regular?.favourite !== "mastered") return regular?.favourite ?? null;
  const mastered = Object.keys(state.recipes).filter(key => state.recipes[key].level === 10);
  const menu = new Set(Object.values(state.home.menu).flat());
  return mastered.find(key => menu.has(key)) ?? mastered[0] ?? null;
}
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
  wraps: ["tomato", "buttercream", "sage", "sky"], horns: ["quiet", "friendly", "jazzy"], uniforms: ["classic", "cherry", "mint"], floors: ["checker", "cream", "terracotta", "wood", "terrazzo"], walls: ["cream", "mint", "rose", "diner_panel", "deco"], skins: ["original", "cherry", "mint", "cream"],
} as const;
export type FinishSlot = "floor" | "wall";
/** One purchase owns the whole-room finish permanently. Changing it has no service effect. */
export const FINISH_RULES = {
  version: 1,
  defaults: { floor: "checker", wall: "cream" },
  prices: { floor: { checker: 0, cream: 150, terracotta: 150, wood:600, terrazzo:1600 }, wall: { cream: 0, mint: 100, rose: 100, diner_panel:500, deco:1800 } },
} as const;
export function finishPrice(slot: FinishSlot, id: string): number | null {
  if (typeof id !== "string") return null;
  const prices = slot === "floor" ? FINISH_RULES.prices.floor : slot === "wall" ? FINISH_RULES.prices.wall : null;
  return prices && Object.prototype.hasOwnProperty.call(prices, id) ? (prices as Record<string, number>)[id] : null;
}
export type RoomFinishSlot='counter'|'worktop'|'upholstery'|'sign';
export const ROOM_PALETTES={
  counter:[{id:'tomato',name:'Tomato enamel',color:'#bd654e',price:0},{id:'sage',name:'Deep sage',color:'#365f55',price:250},{id:'cream',name:'Warm cream',color:'#f7f2e6',price:250},{id:'oak',name:'Warm oak',color:'#9b7650',price:250}],
  worktop:[{id:'porcelain',name:'Porcelain',color:'#fff9ee',price:0},{id:'walnut',name:'Walnut',color:'#876647',price:300},{id:'charcoal',name:'Charcoal',color:'#394b46',price:300}],
  upholstery:[{id:'cherry',name:'Cherry vinyl',color:'#bd654e',price:0},{id:'mint',name:'Soft mint',color:'#94b9a2',price:200},{id:'mustard',name:'Golden mustard',color:'#e3b454',price:200},{id:'teal',name:'Muted teal',color:'#477b73',price:200}],
  sign:[{id:'cream',name:'Cream sign',color:'#f7f2e6',price:0},{id:'sage',name:'Sage sign',color:'#365f55',price:200},{id:'coral',name:'Coral sign',color:'#bd654e',price:200}],
} as const;
export const ROOM_FINISH_DEFAULTS:Record<RoomFinishSlot,string>={counter:'tomato',worktop:'porcelain',upholstery:'cherry',sign:'cream'};
export function roomFinishPrice(slot:RoomFinishSlot,id:string):number|null {return Object.hasOwn(ROOM_PALETTES,slot)?ROOM_PALETTES[slot].find(f=>f.id===id)?.price??null:null;}
export interface DinerStaff { id: string; name: string; role: "chef" | "waiter" | "cashier"; named: boolean; outfit: string; look: number }
export const RECRUITS = [{ id: "jo", name: "Jo", role: "waiter" }, { id: "bea", name: "Bea", role: "chef" }, { id: "gus", name: "Gus", role: "waiter" }] as const;
export interface SavedDinerLayout { id: string; name: string; layout: DinerState["home"]["layout"]; menu: Record<Course, string[]>; room?:Pick<DinerState["home"],"w"|"h"|"roomPlan"> }
