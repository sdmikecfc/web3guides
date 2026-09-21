import type { DinerTier, EquipmentDef, IngredientDef, RecipeDef, RecipeStep, StationKind, CookingAction } from './types';

/** Content revisions are stored with every service for deterministic replay. */
export const CONTENT_VERSION = 1;
export const SERVICE_RULES = { version: 1, tickMs: 50, ticksPerSecond: 20, chefSpeed: 3.2, customerSpeed: 2.8, coldTicks: 400, eatTicks: 100, washTicks: 40, comboMax: 10, comboTipPerStep: .05, baseTipRate: .12, menuMultipliers: [1, 1.15, 1.3, 1.5], maxTicksPerAction: 100, maxEvents: 60, maxTables:12 } as const;
export const INGREDIENTS: IngredientDef[] = [
  ...['beef','bun','potato','cheese','lettuce','tomato','onion','egg','milk','flour','sugar','cooking_oil','pasta','tomato_sauce','ramen_noodles','vegetable_broth','mixed_vegetables'].map(id => ({ id, name: title(id), rarity: 'common' as const })),
  ...['bacon','chicken','pickles','bread','butter','ice_cream','coffee_beans','lemon','sausage','corn'].map(id => ({ id, name: title(id), rarity: 'uncommon' as const })),
  ...['chocolate','strawberry','maple_syrup','avocado','apple','chili'].map(id => ({ id, name: title(id), rarity: 'rare' as const })),
];
function title(id: string): string { return id.split('_').map(s => s[0].toUpperCase() + s.slice(1)).join(' '); }
function step(station: StationKind, action: CookingAction, seconds: number, label: string, output: string, burnSeconds?: number): RecipeStep { return { station, action, ticks: Math.round(seconds * 20), label, output, ...(burnSeconds ? { burnTicks: burnSeconds * 20 } : {}) }; }
const grill = (output = 'grilled') => step('grill', 'risk', 6, 'Grill', output, 5);
const prep = (label = 'Assemble', output = 'assembled') => step('prep', 'hold', 1.5, label, output);
const fry = () => step('fryer', 'risk', 5, 'Fry', 'fried', 5);
const oven = () => step('oven', 'timed', 7, 'Bake', 'baked');
const blend = () => step('blender', 'hold', 3, 'Blend', 'blended');
function dish(id: string, name: string, course: RecipeDef['course'], ingredients: string[], stations: RecipeStep[], basePrice: number, route: RecipeDef['route']): RecipeDef { return { id, name, course, ingredients, steps: stations, basePrice, reputation: 1 + Math.floor(basePrice / 20), route, ...(route === 'secret' ? { secret: true } : {}) }; }
export const RECIPES: RecipeDef[] = [
  dish('classic_burger','Classic burger','main',['beef','bun'],[grill('cooked_patty'),prep('Combine patty and bun')],25,'starter'),
  dish('fries','Fries','starter',['potato','cooking_oil'],[prep('Cut potatoes','cut_potatoes'),fry()],12,'starter'),
  dish('lemonade','Lemonade','drink',['lemon','sugar'],[step('drinks','hold',2,'Pour lemonade','poured')],8,'downtown'),
  dish('cheeseburger','Cheeseburger','main',['beef','bun','cheese'],[grill('cooked_patty'),prep('Add cheese and bun')],30,'downtown'),
  dish('side_salad','Side salad','starter',['lettuce','tomato'],[prep('Chop and toss')],12,'downtown'),
  dish('hot_dog','Hot dog','main',['sausage','bun','onion'],[grill('cooked_sausage'),prep('Add bun and onion')],26,'downtown'),
  dish('coffee','Coffee','drink',['coffee_beans'],[step('coffee','timed',3,'Brew coffee','brewed')],10,'downtown'),
  dish('onion_rings','Onion rings','starter',['onion','flour','cooking_oil'],[prep('Batter onion rings','battered'),fry()],15,'boardwalk'),
  dish('mozzarella_sticks','Mozzarella sticks','starter',['cheese','flour','cooking_oil'],[prep('Coat cheese sticks','coated'),fry()],18,'boardwalk'),
  dish('grilled_cheese','Grilled cheese','main',['bread','cheese','butter'],[grill()],24,'boardwalk'),
  dish('fried_chicken_sandwich','Fried chicken sandwich','main',['chicken','bun','pickles','flour'],[prep('Coat chicken','coated'),fry(),prep('Add bun and pickles')],38,'boardwalk'),
  dish('vanilla_shake','Vanilla shake','drink',['milk','ice_cream'],[blend()],14,'boardwalk'),
  dish('ice_cream_sundae','Ice cream sundae','dessert',['ice_cream','chocolate'],[prep('Scoop and top')],20,'boardwalk'),
  dish('pancakes','Pancakes','dessert',['flour','egg','maple_syrup'],[grill()],22,'boardwalk'),
  dish('bacon_deluxe_burger','Bacon deluxe burger','main',['beef','bun','bacon','lettuce'],[grill('cooked_patty'),grill('cooked_patty_and_bacon'),prep('Build deluxe burger')],40,'night_market'),
  dish('strawberry_shake','Strawberry shake','drink',['milk','ice_cream','strawberry'],[blend()],16,'night_market'),
  dish('apple_pie','Apple pie','dessert',['apple','flour','butter','sugar'],[prep('Fill pastry','filled_pastry'),oven()],28,'night_market'),
  dish('strawberry_waffle','Strawberry waffle','dessert',['flour','egg','strawberry'],[step('waffle','risk',5,'Cook waffle','waffle',5),prep('Add strawberries')],24,'night_market'),
  dish('brownie','Brownie','dessert',['chocolate','flour','egg','sugar'],[prep('Mix batter','batter'),oven()],26,'night_market'),
  dish('loaded_nachos','Loaded nachos','starter',['corn','cheese','tomato'],[oven(),prep('Top nachos')],18,'night_market'),
  dish('chili_cheese_fries','Chili cheese fries','starter',['potato','cheese','chili'],[fry(),prep('Add chili and cheese')],22,'secret'),
  dish('avocado_burger','Avocado burger','main',['beef','bun','avocado','tomato'],[grill('cooked_patty'),prep('Add avocado and bun')],42,'secret'),
  dish('tomato_pasta','Tomato pasta','main',['pasta','tomato_sauce'],[step('boiler','timed',5,'Boil pasta','boiled_pasta'),prep('Fold in tomato sauce','sauced_pasta')],34,'downtown'),
  dish('vegetable_ramen','Vegetable ramen','main',['ramen_noodles','vegetable_broth','mixed_vegetables'],[step('boiler','timed',5,'Boil noodles','boiled_noodles'),prep('Add broth and vegetables','ramen')],42,'boardwalk'),
];
export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map(d => [d.id, d]));
for(const id of ['classic_burger','cheeseburger','bacon_deluxe_burger','avocado_burger','hot_dog'])RECIPE_BY_ID[id].assemblyIngredients=['bun'];
RECIPE_BY_ID.tomato_pasta.assemblyIngredients=['tomato_sauce'];
RECIPE_BY_ID.vegetable_ramen.assemblyIngredients=['vegetable_broth','mixed_vegetables'];
export const INGREDIENT_BY_ID: Record<string, IngredientDef> = Object.fromEntries(INGREDIENTS.map(d => [d.id, d]));
/** Only loose ingredients used by the physical service loop appear at supplies. */
export function ingredientSupply(id:string):'crate'|'fridge' {
  return ['beef','cheese','lettuce','tomato','egg','milk','bacon','chicken','butter','ice_cream','sausage','strawberry','avocado','mixed_vegetables'].includes(id)?'fridge':'crate';
}
function machine(id: string, name: string, family: string, prices: number[], capacities = [1,2,2], footprint: [number,number] = [1,1]): EquipmentDef { return { id, name, family, footprint, tiers: prices.map((price,i) => ({ tier: i + 1, price, capacity: capacities[i] ?? 1, speed: i === 0 ? 1 : i === 1 ? 1.15 : 1.35, ...(i === 2 && ['grill','fryer','waffle'].includes(id) ? { noBurn: true } : {}), ...((id === 'pass' && i >= 1) || (id === 'oven' && i === 2) ? { warm: true } : {}), ...(i === 2 && ['sink','drinks'].includes(id) ? { automatic: true } : {}) })) }; }
export const EQUIPMENT: EquipmentDef[] = [
  machine('boiler','Noodle boiler','cooking',[240,550,1100]), machine('bowls','Clean bowl rack','storage',[100,240,480],[2,4,6]),
  machine('crate','Pantry','storage',[0],[1]), machine('fridge','Fridge','storage',[0],[1]), machine('plates','Clean plate rack','storage',[0,120,300],[2,4,6]), machine('cups','Cup stand','storage',[80,180],[2,4]), machine('boxes','Fries boxes','storage',[0],[1]), machine('grill','Grill','cooking',[180,450,900]), machine('fryer','Fryer','cooking',[160,400,850]),
  machine('oven','Oven','cooking',[240,550,1100]), machine('blender','Blender','cooking',[180,420,850],[1,1,2]), machine('coffee','Coffee machine','cooking',[140,360,750],[1,2,5]),
  machine('waffle','Waffle iron','cooking',[200,480,950]), machine('drinks','Drinks station','cooking',[100,280,600],[1,1,1]), machine('prep','Prep counter','prep',[80,220,500],[1,1,2]),
  machine('pass','Holding counter','prep',[180,400,800],[2,4,6],[2,1]), machine('sink','Sink','cleaning',[80,240,600],[2,4,6]), machine('bin','Bin','cleaning',[20],[1]),
  machine('table_1','Table and one chair','service',[60,160],[1,1]), machine('table_2','Table for two','service',[80,220],[2,2],[1,2]), machine('table_4','Table for four','service',[180,420],[4,4],[2,2]),
  machine('booth_2','Upholstered booth for two','service',[180],[2],[1,2]),
  machine('tray','Serving tray','service',[100,300],[2,3]), machine('queue_bench','Queue bench','comfort',[120,280],[1,1],[2,1]),
  machine('jukebox','Jukebox','comfort',[200,500],[1,1]), machine('neon_sign','Neon sign','attraction',[180,450],[1,1]), machine('tip_jar','Tip jar','attraction',[80,220],[1,1]),
];
export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(EQUIPMENT.map(d => [d.id,d]));
/** Keep reserved content IDs for checkpoints, but sell only implemented equipment. */
export const DEFERRED_EQUIPMENT_IDS = ['tray','queue_bench','jukebox','neon_sign','tip_jar'] as const;
export const HOME_ONLY_EQUIPMENT_IDS = ['booth_2'] as const;
export const TRUCK_EQUIPMENT = EQUIPMENT.filter(item=>!(DEFERRED_EQUIPMENT_IDS as readonly string[]).includes(item.id)&&!(HOME_ONLY_EQUIPMENT_IDS as readonly string[]).includes(item.id));
/** Utilities do not imply a corresponding restaurant machine or free home copy. */
export const TRUCK_ONLY_EQUIPMENT_IDS = ['crate','fridge','plates','cups','boxes','bowls','bin','pass'] as const;
export const HOME_EQUIPMENT = EQUIPMENT.filter(item=>!(DEFERRED_EQUIPMENT_IDS as readonly string[]).includes(item.id)&&!(TRUCK_ONLY_EQUIPMENT_IDS as readonly string[]).includes(item.id));
export const isTruckEquipmentAvailable = (id:string):boolean => TRUCK_EQUIPMENT.some(item=>item.id===id);
export const isHomeEquipmentAvailable = (id:string):boolean => HOME_EQUIPMENT.some(item=>item.id===id);
/** Width-only growth keeps every earlier saved coordinate on the board. */
export const TRUCK_LAYOUT_VERSION=2 as const;
export const TRUCK_TIERS: Record<DinerTier, { tier: DinerTier; w: number; h: number; tables: number; helpers: number; menuCapacity:2|3|4; pavementW: number; pavementH: number; route: string | null }> = {
  1: { tier:1,w:7,h:3,tables:1,helpers:0,menuCapacity:2,pavementW:10,pavementH:4,route:null },
  2: { tier:2,w:8,h:3,tables:2,helpers:1,menuCapacity:3,pavementW:11,pavementH:5,route:'downtown' },
  3: { tier:3,w:9,h:3,tables:3,helpers:1,menuCapacity:4,pavementW:12,pavementH:6,route:'boardwalk' },
  4: { tier:4,w:10,h:4,tables:5,helpers:2,menuCapacity:4,pavementW:13,pavementH:7,route:'night_market' },
};
export const ROUTES = [
  { id:'downtown',name:'Downtown',rows:12,tier:1,recipeIds:['lemonade','cheeseburger','side_salad','hot_dog','coffee'] },
  { id:'boardwalk',name:'Boardwalk',rows:12,tier:2,recipeIds:RECIPES.filter(d => d.route === 'boardwalk').map(d => d.id) },
  { id:'night_market',name:'Night market',rows:12,tier:3,recipeIds:RECIPES.filter(d => d.route === 'night_market').map(d => d.id) },
] as const;
export const DIFFICULTIES = { slow:{customers:8,arrivalTicks:400,queuePatienceTicks:1800,tablePatienceTicks:1200}, medium:{customers:14,arrivalTicks:300,queuePatienceTicks:1400,tablePatienceTicks:1000}, busy:{customers:20,arrivalTicks:220,queuePatienceTicks:1000,tablePatienceTicks:800}, finale:{customers:30,arrivalTicks:200,queuePatienceTicks:900,tablePatienceTicks:760} } as const;
export const DAILY_SPECIALS = ['happy_hour','early_bird','big_tipper','sharp_knives','word_of_mouth','spare_plates'] as const;
export const SPICES = ['rush_hour','picky_eaters','short_staffed','two_strikes','full_menu'] as const;
export function recipePrice(recipeId: string, level = 0): number { return Math.round((RECIPE_BY_ID[recipeId]?.basePrice ?? 0) * (1 + Math.max(0,Math.min(10,Math.floor(level || 0))) * .1)); }
