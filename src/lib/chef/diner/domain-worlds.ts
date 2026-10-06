import type {CollectibleRarity, PackKind} from './collectible-packs-v1';

/** A new, immutable catalogue namespace. Legacy collection versions 1/2 remain intact. */
export const DOMAIN_CATALOGUE_VERSION = 3 as const;
export const DOMAIN_IDS = ['gochujang', 'smoothie', 'wines'] as const;
export type DomainId = typeof DOMAIN_IDS[number];
export type DomainMachine = 'boiler'|'steamer'|'griddle'|'blender'|'juicer'|'wine_station'|'prep'|'oven'|'coffee'|'drinks'|'fridge';
export interface DomainWorld {
  id:DomainId; name:string; room:string; destination:string; invitation:string;
  palette:{ink:string;paper:string;accent:string;secondary:string}; materials:string[];
  menu:readonly {id:string;name:string;workflow:string;equipment:string}[];
  crowd:string; milestones:readonly [string,string,string];
}
export const DOMAIN_WORLDS:Record<DomainId,DomainWorld> = {
  gochujang:{id:'gochujang',name:'Gochujang.com',room:'Midnight Ramyeon',destination:'Spice Street',invitation:'A little heat. A late-night ritual.',palette:{ink:'#302324',paper:'#f7e9d2',accent:'#bb382d',secondary:'#d5a65b'},materials:['Cherry-red enamel','Charcoal tile','Glazed ceramic','Brushed steel'],crowd:'Spice fans arrive in small groups, bringing overlapping hot-food orders.',milestones:['Spice Street sign','Market-stall cabinet','Midnight paper lanterns'],menu:[
    {id:'spicy_ramyeon',name:'Spicy ramyeon',workflow:'Boil noodles → drain → add spicy broth and toppings → bowl',equipment:'Ramyeon boiler + prep'},
    {id:'steamed_mandu',name:'Steamed mandu',workflow:'Steam a finite basket → plate a portion → finish with sauce',equipment:'Mandu steamer + prep'},
    {id:'kimchi_fried_rice',name:'Kimchi fried rice',workflow:'Fry rice and kimchi → finish → plate',equipment:'Griddle + prep'},
  ]},
  smoothie:{id:'smoothie',name:'Smoothie.com',room:'The Fruit Club',destination:'Sunshine Waterfront',invitation:'Fresh fruit. Wild little worlds.',palette:{ink:'#224e46',paper:'#fff2d7',accent:'#e3a333',secondary:'#79b7a3'},materials:['Pale terrazzo','Curved coral enamel','Clear glass','Lush greenery'],crowd:'Brisk waterfront regulars create concentrated drink rushes.',milestones:['Fruit Club sign','Curved fruit display','Tropical hanging garden'],menu:[
    {id:'mango_smoothie',name:'Mango smoothie',workflow:'Prepare fruit → blend → pour into a clean cup',equipment:'Smoothie blender'},
    {id:'berry_smoothie_bowl',name:'Berry smoothie bowl',workflow:'Blend berries → portion into a bowl → add fruit and crunch',equipment:'Smoothie blender + prep'},
    {id:'citrus_cooler',name:'Citrus cooler',workflow:'Juice citrus → combine → pour into a clean cup',equipment:'Citrus juicer + prep'},
  ]},
  wines:{id:'wines',name:'Wines.xyz',room:'The Velvet Cellar',destination:'Vineyard Village',invitation:'An extraordinary little vintage.',palette:{ink:'#372839',paper:'#f1e6d6',accent:'#87364d',secondary:'#bda26b'},materials:['Walnut','Burgundy upholstery','Limestone','Polished brass'],crowd:'Longer visits and mixed food-and-drink orders reward careful seating and clearing.',milestones:['Velvet Cellar sign','Vintage bottle cabinet','Vineyard brass pendant'],menu:[
    {id:'house_red',name:'House red',workflow:'Open a bottle → pour a finite portion into a clean glass',equipment:'Wine-serving station'},
    {id:'cheese_fruit_board',name:'Cheese-and-fruit board',workflow:'Prepare cheese and fruit → arrange on a clean serving board',equipment:'Preparation counter'},
    {id:'baked_tartine',name:'Baked tartine',workflow:'Assemble bread and topping → bake → plate',equipment:'Prep + oven'},
  ]},
};

export interface DomainCollectible {
  id:string;domain:DomainId;catalogueVersion:typeof DOMAIN_CATALOGUE_VERSION;
  name:string;description:string;signature:string;pack:PackKind;rarity:CollectibleRarity;weight:number;
  mount:'floor'|'counter'|'wall'|'ceiling';footprint:readonly [number,number];
  machine?:DomainMachine;hero:boolean;artStatus:'concept';
}
type Design = readonly [slug:string,name:string,description:string,signature:string,mount:DomainCollectible['mount'],width?:number,machine?:DomainMachine];
const designs:Record<DomainId,Record<PackKind,readonly Design[]>> = {
  gochujang:{regular:[
    ['fireant_brigade','Fireant Kitchen Brigade','A red-glazed onggi jar opens onto a tiled Fireant kitchen, hanging chillies and a pair of apron-clad ant cooks.','One chef stirs with a moving forearm; both cooks keep their feet planted.','counter'],
    ['pepper_lanterns','Pepper Lantern Trio','Three sculpted peppers cradle warm porcelain lanterns.','Softly swaying silk tassels.','ceiling'],
    ['mandu_mountain','Mandu Mountain','A stack of bamboo baskets opens onto a miniature dumpling village.','A Fireant chef stirs a tiny pot; the upper basket lid moves on its hinge.','counter'],
    ['spice_drawers','Seoul Spice Cabinet','A rounded lacquer cabinet of ceramic spice drawers and brass labels.','A drawer slides along its runners to reveal glossy chillies.','floor'],
    ['pepper_prep','Pepper Workshop','A red-enamel preparation counter with sculpted pepper handles.','A brass pepper dial acknowledges preparation.','floor',1,'prep'],
    ['tiger_coffee','Fireant Night-Shift Coffee Works','An enamel Fireant barista braces a copper coffee boiler with pepper-shaped controls.','Steam rises from the real coffee vent while the planted Fireant barista holds a tiny cup.','floor',1,'coffee'],
    ['chilli_canopy','Chilli Garden Canopy','A hanging garden of ceramic chillies and trailing leaves.','Glazed peppers sway gently from their stems inside the frame.','ceiling',2],
    ['night_stall','One More Bowl','A tiny food-stall window full of glossy bowls and red stools.','A bowl carriage glides along runners beside its planted miniature cook.','wall',2],
    ['rice_griddle','Golden Rice Griddle','A red-enamel flat-top framed by brass rice stalks and a sculpted Fireant chef.','Its temperature dial responds to real cooking.','floor',1,'griddle'],
    ['kimchi_orchard','The Kimchi Orchard','Glazed fermentation jars form a miniature courtyard garden.','A small water wheel turns beside the jars.','counter',2],
    ['spice_moon','Spice Moon Pavilion','A moon-shaped brass pavilion sheltering an intricate midnight noodle stall.','A miniature lantern carousel turns on a visible brass bearing.','floor',2],
    ['last_lantern','The Last Lantern on Spice Street','A glowing, layered Korean food street inside a great ceramic lantern.','A bowl trolley travels along the lower street’s brass rail.','floor',2],
  ],super:[
    ['volcano_boiler','Volcano Ramyeon Boiler','A glazed volcanic cauldron, copper handles and an exposed working noodle basket.','Restrained chimney steam follows real cooking.','floor',1,'boiler'],
    ['fireant_doorman','Captain of the Night Shift','A confident Fireant host in an enamel jacket holds a tiny bowl aloft.','A small greeting nod keeps every foot planted.','floor'],
    ['mandu_steamer','Cloud Mandu Steamer','A ceramic cloud cradles tiered bamboo-and-brass steaming baskets.','Working steam escapes through sculpted vents.','floor',1,'steamer'],
    ['spice_drinks','Pepper Soda Works','A red-pepper-shaped drinks dispenser with jade taps and a copper drip tray.','A miniature pepper wheel turns while dispensing.','floor',1,'drinks'],
    ['hanok_roof','Midnight Roof Garden','An elaborate tiled roof with a small hidden rooftop supper.','A tiny cat watches its dangling lantern.','wall',2],
    ['pepper_band','The Hot Pepper House Band','Three sculpted pepper musicians on a tiled stage.','One restrained, silent musical flourish.','counter',2],
    ['ant_delivery','Fireant Express Delivery','A lacquer scooter carrying a tower of ramyeon bowls.','Its courier checks the wobbling stack.','floor'],
    ['steam_gate','Gateway to Supper','A freestanding ceramic gate shaped from rising noodle steam.','A little lantern swings beneath its arch.','floor',2],
    ['spice_aquarium','The Fireant Fermentation House','A cutaway Korean courtyard of onggi jars, chilli-drying racks and an ant kitchen crew.','An ant lifts a jar lid to check the ferment.','floor',2],
    ['fermentation_clockwork','The Fermentation Workshop','A detailed mechanical diorama of jars, pipes and tiny working cooks.','A jar elevator advances one step.','wall',2],
    ['midnight_express','Midnight Ramyeon Express','A Fireant conductor takes a ramyeon train around a tiled Korean noodle station, glowing lanterns and a tiny kitchen.','The locomotive and bowl carriages follow the same continuous brass rails.','counter',2],
    ['fireant_city','Fireant City After Dark','A multi-level Fireant kitchen city built through a giant lacquer chilli.','A bowl lift travels between the kitchens on fixed brass guides.','floor',2],
  ]},
  smoothie:{regular:[
    ['toucan_bar','Toucan Tasting Bar','A sculpted toucan grips a wooden perch above a rounded oak fruit counter, fresh citrus and a wooden smoothie tasting tray.','A small head tilt leaves the bird’s feet firmly on its branch.','counter'],
    ['papaya_planter','Papaya Conservatory','A split papaya becomes a lush little greenhouse.','A perched butterfly gently folds its wings.','floor'],
    ['citrus_mobile','Citrus Solar Mobile','Sculpted citrus slices hang from fine brass arms, like a small, sunny solar system.','The slices turn slowly.','ceiling'],
    ['fruit_skate','Fruit Market Cruiser','A coral market tricycle carries secured baskets of citrus and a tiny smoothie kiosk.','Its striped canvas valance moves gently; the parked tricycle stays still.','floor'],
    ['watermelon_prep','Watermelon Workbench','Curved rind-green cabinetry with a speckled stone preparation top.','A fruit-shaped pointer marks real work.','floor',1,'prep'],
    ['citrus_juicer','Sunburst Citrus Press','A sculpted brass sun surrounds the working citrus press.','The supported citrus reamer turns only while juicing.','floor',1,'juicer'],
    ['berry_nest','Berry Birdhouse','A ceramic strawberry nest with tiny tropical birds.','One perched bird gently tilts its head inside the open ceramic shell.','wall'],
    ['mango_pendant','Mango Milkglass Pendant','A folded mango-peel frame around warm milkglass.','Its leaf tassel moves softly.','ceiling'],
    ['palm_fountain','Palm Soda Fountain','A compact palm tree with three gleaming fruit taps.','A coconut cap lifts while dispensing.','floor',1,'drinks'],
    ['fruit_tide','Low Tide Fruit Pool','A sculpted fruit-shell tide pool with miniature stepping stones and palms.','A small water ripple crosses the pool.','counter',2],
    ['mango_lagoon','Mango Lagoon','A cut mango shelters a complete little smoothie hut, feathered palms, a rock waterfall and a turquoise lagoon.','A moored wooden boat rocks gently beside the island.','floor',2],
    ['fruit_atoll','The Grand Fruit Conservatory','An elaborate cut-fruit conservatory encloses terraces of miniature tropical orchards.','A water wheel irrigates the supported orchard terraces.','floor',2],
  ],super:[
    ['orbit_blender','Fruit Orbit Blender','A fluted glass pitcher sits on a peach-and-jade motor cabinet, with citrus detailing and tactile controls.','The blade and fruit swirl remain inside the pitcher, moving only while it works.','floor',1,'blender'],
    ['pineapple_cabana','Pineapple Cabana','A carved pineapple cabana shelters a tiny deck chair, citrus tasting table and brass-supported parasol.','A little parasol turns.','floor'],
    ['berry_fridge','Berry Glasshouse Fridge','A curved botanical glasshouse cabinet with readable chilled shelves.','A little leaf lifts when supplies are collected.','floor',1,'fridge'],
    ['coconut_coffee','Coconut Espresso Club','A polished coconut-shell coffee machine with brass palm fittings.','Steam rises from its leaf-shaped vent.','floor',1,'coffee'],
    ['fruit_flamingo','Flamingo Fruit Waiter','An elegant coral flamingo balances an elaborate tropical tasting tray.','A restrained head tilt steadies the tray.','floor'],
    ['tropical_fan','Trade-Wind Garden','A wide carved-leaf installation surrounding a miniature fruit market.','A silent palm fan turns.','wall',2],
    ['sorbet_cloud','The Fruit-Garden Canopy','A curved, ceiling-mounted citrus trellis holds tiny planters and glass fruit pendants.','Supported leaf fans turn slowly beneath the trellis.','ceiling',2],
    ['banana_hammock','The Banana Day Off','A banana-shaped hammock between sculpted palms shelters a sleeping toucan.','A gentle hammock sway.','floor',2],
    ['citrus_reef','Citrus Reef Observatory','A cut-glass dome reveals a sculpted underwater world grown from citrus.','A glazed ray gently turns on a thin brass display spindle.','counter',2],
    ['tropical_station','Last Stop, Fruit Paradise','A miniature waterfront tram station with fruit kiosks and tiny commuters.','A fruit tram arrives at the platform.','wall',2],
    ['toucan_palace','Toucan Palace of Plenty','A sculpted papaya palace with curved balconies, a high bridge and feathered palms.','A perched toucan turns its head while the other birds keep their footing.','floor',2],
    ['sun_in_glass','A Whole Summer in a Glass','A terraced fruit-market waterfront inside an immense cutaway crystal smoothie glass.','A moored fruit-delivery dinghy rocks gently beside the quay.','floor',2],
  ]},
  wines:{regular:[
    ['midnight_decanter','The Midnight Decanter','A fluted crystal decanter rests in a sculpted brass grapevine cradle on a velvet-lined walnut tray.','Only the little candle flickers; the wine rests inside its glass.','counter'],
    ['cork_garden','The Cork Garden','A sculpted cork terrarium filled with miniature vineyard terraces.','A brass watering wheel turns.','counter'],
    ['harvest_lamp','Harvest Moon Lamp','A brass vine wraps a warm, frosted grape-cluster lamp.','A single vine leaf gently shifts.','floor'],
    ['cellar_library','The Tasting Library','A walnut cabinet of tiny books, bottles and engraved tasting trays.','A miniature ladder glides along its brass rail.','floor'],
    ['tasting_station','The Brass Tasting Cabinet','A limestone-and-brass display cabinet with a suspended bottle cradle.','The decorative bottle cradle gently turns.','floor'],
    ['walnut_prep','The Walnut Atelier','A rounded walnut preparation island with limestone top and vine-carved handles.','A small brass leaf acknowledges preparation.','floor',1,'prep'],
    ['vine_chandelier','Vineyard Constellation','A branched brass chandelier with jewel-like glass grape drops.','The smallest glass leaves softly sway.','ceiling',2],
    ['cheese_dome','The Cheese Observatory','A miniature cheese cellar under an ornate glass cloche.','Its planted affineur tends a cheese wheel with a little rind brush.','counter'],
    ['cellar_chiller','The Cellar Cabinet','A walnut-framed glass chiller with brass shelves and etched vines.','A cool indicator follows supply collection.','floor',1,'fridge'],
    ['harvest_procession','Harvest Procession','A miniature harvest parade winds around a sculpted limestone arch.','A tiny cart passes beneath the arch.','wall',2],
    ['bottle_vineyard','Vineyard in a Bottle','A cutaway wine bottle contains terraces, a village and an evening tasting courtyard.','The harvest cart rests beside the real miniature vineyard rows.','floor',2],
    ['endless_vintage','The Endless Vintage','A cellar, wine press and vineyard terraces inside a giant crystal hourglass.','A tiny barrel lift travels through the waist on visible guide rails.','floor',2],
  ],super:[
    ['sommelier_orrery','Sommelier’s Tasting Carousel','A walnut wine-serving cabinet with a brass-supported rotating bottle shelf and working taps.','Bottles stay seated on the shelf as it turns during service.','floor',1,'wine_station'],
    ['tartine_oven','The Limestone Hearth','A sculpted limestone oven with a brass grapevine door surround.','A restrained warm glow follows real baking.','floor',1,'oven'],
    ['cellar_coffee','After-Dinner Espresso','A burgundy espresso machine with walnut flanks and brass vine fittings.','Steam rises from a grape-leaf vent.','floor',1,'coffee'],
    ['vine_cooler','The Vineyard Cooler','A porcelain vineyard tower with brass juice taps and a stone drip tray.','A small weather vane turns while dispensing.','floor',1,'drinks'],
    ['cork_captain','The Corkmaker’s Atelier','An intricate cork-cutting workshop in a giant carved cork, with brass tools and tasting bottles.','A miniature craftsman turns the cork press.','counter',2],
    ['harvest_bear','The Velvet Sommelier','An expressive miniature sommelier in burgundy tailoring presents a silver tasting tray.','A planted-foot bow welcomes guests.','floor'],
    ['cellar_window','Window on the Last Vintage','A deep arched diorama of a lantern-lit wine cellar.','A barrel rocks in its inspection cradle beside a planted cellar keeper.','wall',2],
    ['grape_gazebo','The Grape Gazebo','A limestone pavilion covered in sculpted vines and jewel-like grapes.','A lantern sways over the tasting bench.','floor',2],
    ['moonlit_press','The Moonlit Wine Press','A detailed miniature harvest workshop under a brass moon.','The little press turns through its cycle.','counter',2],
    ['velvet_stage','The Velvet Tasting Theatre','A walnut-and-burgundy miniature theatre with an elaborate tasting table.','Its tiny curtain opens onto the evening service.','wall',2],
    ['vintage_airship','The Grand Cellar Chandelier','An ornate walnut-and-brass chandelier with mounted magnum bottles and hanging crystal stemware.','Tiny grape leaves move softly inside their brass frames.','ceiling',2],
    ['world_vintage','The World’s Last Perfect Vintage','A monumental cutaway oak barrel holds a complete terraced vineyard, press house and candlelit cellar.','A cellar lift carries a barrel between its supported floors.','floor',2],
  ]},
};
const WEIGHTS = [1600,1600,1600,1600,850,850,850,850,119,50,30,1] as const;
const HEROES = new Set(['fireant_brigade','volcano_boiler','midnight_express','toucan_bar','orbit_blender','mango_lagoon','midnight_decanter','sommelier_orrery','bottle_vineyard']);
export const DOMAIN_COLLECTIBLES:readonly DomainCollectible[] = DOMAIN_IDS.flatMap(domain=>(['regular','super'] as const).flatMap(pack=>designs[domain][pack].map(([slug,name,description,signature,mount,width=1,machine],i)=>({
  id:`domain_${domain}_${slug}`,domain,catalogueVersion:DOMAIN_CATALOGUE_VERSION,name,description,signature,mount,footprint:[width,1] as const,machine,hero:HEROES.has(slug),artStatus:'concept' as const,pack,weight:WEIGHTS[i],rarity:(i<4?'common':i<8?'uncommon':(['rare','epic','legendary','mythic'] as const)[i-8]),
}))));
export const DOMAIN_COLLECTIBLE_BY_ID:Readonly<Record<string,DomainCollectible>> = Object.fromEntries(DOMAIN_COLLECTIBLES.map(item=>[item.id,item]));
export function isDomainId(id:unknown):id is DomainId{return typeof id==='string'&&(DOMAIN_IDS as readonly string[]).includes(id);}
export function domainPackItems(domain:DomainId,pack:PackKind){return DOMAIN_COLLECTIBLES.filter(item=>item.domain===domain&&item.pack===pack);}
/** A deterministic catalogue lookup, not an RNG or evidence of a paid opening. */
export function domainItemAtTicket(domain:DomainId,pack:PackKind,ticket:number){
  if(!isDomainId(domain)||!['regular','super'].includes(pack)||!Number.isInteger(ticket)||ticket<0||ticket>=10000)throw new Error('Invalid catalogue ticket');
  let end=0;for(const item of domainPackItems(domain,pack)){end+=item.weight;if(ticket<end)return item;}
  throw new Error('Incomplete catalogue');
}
export const DOMAIN_PACK_PRICES = {regular:5_000_000,super:10_000_000} as const;
export const DOMAIN_PACK_MILESTONES = [{openings:1,reward:'Alternate sign'},{openings:10,reward:'Counter finish'},{openings:50,reward:'Lighting finish'}] as const;
export const DOMAIN_REDEMPTION_COPY='Keep the collectible and place it in your restaurant, or redeem its backing in the participating domain token. Token amount, fees and transaction details must be confirmed before purchase. No fixed USDC return is promised.';
