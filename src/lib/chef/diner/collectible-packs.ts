import {COLLECTIBLES as V1, type CollectibleDef as LegacyDef, PACKS, PACK_TICKETS, usdcLabel} from './collectible-packs-v1';
import type {StationKind} from './types';
export {PACKS,PACK_TICKETS,usdcLabel};
export const oddsLabel=(item:{weight:number})=>`${item.weight/100}%`;
export type {PackKind,CollectibleRarity,PackLeaderboardRow} from './collectible-packs-v1';
import type {PackKind,CollectibleRarity,PackLeaderboardRow} from './collectible-packs-v1';
export const PACK_VERSION=2;
export type CollectionVersion=1|2;
export interface CollectibleDef extends Omit<LegacyDef,'shape'> {shape:string;version:CollectionVersion;equipmentKind?:StationKind;animation:string}
type Design=[id:string,name:string,description:string,mount:LegacyDef['mount'],animation:string,equipmentKind?:StationKind,width?:number];
const designs:Record<PackKind,Design[]>={regular:[
 ['lucky_cat_soda','Lucky Cat Soda Fountain','Glazed ivory, jade enamel and a beckoning paw. Dresses a drinks station you already own.','floor','beckon','drinks'],
 ['rocket_shake','Rocket Shake Mixer','A polished rocket with a swirling shake chamber. Your blender keeps all its upgrades.','floor','swirl','blender'],
 ['dumpling_bathhouse','Dumpling Bathhouse','Little dumplings taking a steamy break beneath a jade tiled roof.','counter','steam'],
 ['sir_pickles','Sir Pickles the Brave','A pickle knight and his faithful corn-dog steed. Lunch needs a hero.','counter','banner'],
 ['pancake_wheel','Pancake Ferris Wheel','Butter passenger cars circle a pancake wheel dripping with amber syrup.','counter','wheel'],
 ['rabbit_tea','Moon Rabbit Tea Shrine','A glazed moon rabbit pours tea beneath a tiny copper crescent.','counter','pour'],
 ['disco_lobster','Disco Lobster','A chrome-clawed wall star with a coral neon halo.','wall','claws'],
 ['croissant_mobile','Croissant Cloud Mobile','Pastry moons and butter stars turn beneath a porcelain cloud.','ceiling','mobile'],
 ['kraken_espresso','Kraken Espresso Works','Copper tentacles tend the espresso fittings. Dresses your existing coffee machine.','floor','steam','coffee'],
 ['bento_garden','Bonsai Bento Garden','A lacquered lunchbox holds a bonsai, a waterfall and tiny golden koi.','counter','koi'],
 ['noodle_theatre','Midnight Noodle Theatre','A brass-trimmed miniature theatre performs an endless late-night noodle service.','wall','theatre'],
 ['last_fry','The Last Fry Reliquary','One perfect golden fry, floating inside an emerald and glass sanctuary.','counter','relic'],
],super:[
 ['dragonfire_grill','Dragonfire Grill','Cherry enamel scales, copper horns and a proud little chimney. Dresses your grill without changing its cooking.','floor','dragon','grill'],
 ['disco_burger_jukebox','Disco Burger Jukebox','Sesame-bun crown, spinning vinyl and dancing coral lights. A silent celebration of your restaurant.','floor','jukebox'],
 ['koi_boiler','Neon Koi Noodle Boiler','A jade-and-brass boiler with a little koi window. Keeps your existing baskets and capacity.','floor','koi','boiler'],
 ['lunar_oven','Lunar Dumpling Oven','A moon-shaped oven with a warm porthole. Your baking, beautifully dressed.','floor','moon','oven'],
 ['phoenix_fryer','Phoenix Fry Foundry','Copper feathers surround your real fryer basket. Automatic lifting still requires the equipment upgrade.','floor','phoenix','fryer'],
 ['gelato_observatory','Jellyfish Gelato Observatory','Pastel jellyfish float inside an ornate dessert-shaped observatory.','floor','jellyfish'],
 ['octopus_orchestra','Octopus Cocktail Orchestra','Eight carefully choreographed arms, one impossibly grand cocktail hour.','floor','orchestra'],
 ['burger_belt','Cheeseburger Championship Belt','A gem-studded enamel burger medallion for the wall of a true lunch champion.','wall','gleam',undefined,2],
 ['sushi_parade','Sushi Dragon Parade','A jade dragon carries a procession of tiny sushi treasures across two display spots.','counter','parade',undefined,2],
 ['after_hours_diner','The After-Hours Diner','A wall-mounted midnight restaurant, complete with its own miniature rainy windows.','wall','diorama',undefined,2],
 ['cosmic_carousel','Cosmic Buffet Carousel','Food planets orbit a brass carousel, waiting for the next interstellar lunch break.','floor','carousel',undefined,2],
 ['world_on_plate','The World on a Plate','An entire restaurant island floats above a porcelain plate. The smallest world with the biggest appetite.','floor','world',undefined,2],
]};
const weights=[1600,1600,1600,1600,850,850,850,850,119,50,30,1];
const rarity=(i:number):CollectibleRarity=>i<4?'common':i<8?'uncommon':(['rare','epic','legendary','mythic'] as const)[i-8];
export const COLLECTIBLES:CollectibleDef[]=(['regular','super'] as const).flatMap(pack=>designs[pack].map(([id,name,description,mount,animation,equipmentKind,width],i)=>({id:`collect_${id}`,shape:id,name,description,mount,animation,equipmentKind,footprint:[width??1,1],pack,rarity:rarity(i),weight:weights[i],version:2})));
export const LEGACY_COLLECTIBLES:CollectibleDef[]=V1.map(item=>({...item,version:1,animation:'none'}));
export const ALL_COLLECTIBLES=[...LEGACY_COLLECTIBLES,...COLLECTIBLES];
export const COLLECTIBLE_BY_ID:Record<string,CollectibleDef>=Object.fromEntries(ALL_COLLECTIBLES.map(item=>[item.id,item]));
export const packItems=(pack:PackKind,version:CollectionVersion=PACK_VERSION)=>(version===1?LEGACY_COLLECTIBLES:COLLECTIBLES).filter(item=>item.pack===pack);
export function collectibleAtTicket(pack:PackKind,ticket:number,version:CollectionVersion=PACK_VERSION):CollectibleDef {
 if(!Object.hasOwn(PACKS,pack)||![1,2].includes(version)||!Number.isInteger(ticket)||ticket<0||ticket>=PACK_TICKETS)throw new Error('Invalid pack ticket.');
 let end=0;for(const item of packItems(pack,version)){end+=item.weight;if(ticket<end)return item;}throw new Error('Pack odds do not total 100%.');
}
/** Constructed only by the trusted settlement adapter. Beta samples are never receipts. */
export interface SettledPackOpening {openingId:string;wallet:string;pack:PackKind;version:CollectionVersion;itemId:string;openedAt:number;chainId:number;contractAddress:string;transactionHash:string;logIndex:number;tokenId:string;mode:'live'}
export function packLeaderboard(receipts:readonly SettledPackOpening[],pack:PackKind):PackLeaderboardRow[]{
 const ids=new Set<string>(),events=new Set<string>(),tokens=new Set<string>(),players=new Map<string,Omit<PackLeaderboardRow,'rank'>&{items:Set<string>}>();
 for(const receipt of receipts){
  if(!receipt||typeof receipt.openingId!=='string'||typeof receipt.wallet!=='string'||typeof receipt.transactionHash!=='string'||typeof receipt.contractAddress!=='string'||typeof receipt.tokenId!=='string'||typeof receipt.itemId!=='string')continue;
  const item=COLLECTIBLE_BY_ID[receipt.itemId];if(!item||![1,2].includes(receipt.version))continue;
  if(receipt.mode!=='live'||item?.version!==receipt.version||!receipt.openingId||!/^0x[\da-f]{40}$/i.test(receipt.wallet)||!/^0x[\da-f]{64}$/i.test(receipt.transactionHash)||!/^0x[\da-f]{40}$/i.test(receipt.contractAddress)||!Number.isSafeInteger(receipt.chainId)||receipt.chainId<=0||!Number.isSafeInteger(receipt.logIndex)||receipt.logIndex<0||!/^(0|[1-9]\d*)$/.test(receipt.tokenId)||!Number.isSafeInteger(receipt.openedAt)||receipt.openedAt<0||item.pack!==receipt.pack)continue;
  const event=`${receipt.chainId}:${receipt.transactionHash.toLowerCase()}:${receipt.logIndex}`,token=`${receipt.chainId}:${receipt.contractAddress.toLowerCase()}:${receipt.tokenId}`;
  if(ids.has(receipt.openingId)||events.has(event)||tokens.has(token))continue;ids.add(receipt.openingId);events.add(event);tokens.add(token);
  const wallet=receipt.wallet.toLowerCase(),row=players.get(wallet)??{wallet,regular:0,super:0,total:0,unique:0,items:new Set<string>()};row[receipt.pack]++;row.total++;row.items.add(receipt.itemId);row.unique=row.items.size;players.set(wallet,row);
 }
 let rank=0,previous=-1;return [...players.values()].filter(row=>row[pack]>0).sort((a,b)=>b[pack]-a[pack]||a.wallet.localeCompare(b.wallet)).map(({items,...row})=>{if(row[pack]!==previous){rank++;previous=row[pack];}return {...row,rank};});
}
