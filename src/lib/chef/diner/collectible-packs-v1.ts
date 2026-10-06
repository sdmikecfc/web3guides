/** Launch collection v1. Integer odds; money is expressed in USDC base units.
 * Preview draws have no monetary value and never produce an official receipt. */
export type PackKind = 'regular' | 'super';
export type CollectibleRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type CollectibleShape = 'cat'|'diver'|'rocket'|'robot'|'radio'|'clock'|'lantern'|'crown'|'globe'|'sign'|'train'|'spatula'|'mech'|'dragon'|'octopus'|'ufo'|'moon'|'disco'|'capsule'|'aquarium'|'express'|'phoenix'|'portal'|'king';
export interface CollectibleDef {id:string;name:string;description:string;pack:PackKind;rarity:CollectibleRarity;weight:number;shape:CollectibleShape;mount:'counter'|'floor'|'wall'|'ceiling';footprint:[number,number]}
export const PACK_VERSION=1;
export const PACK_TICKETS=10_000;
export const PACKS:Record<PackKind,{name:string;subtitle:string;priceUnits:number;redemptionUnits:number}>= {
  regular:{name:'Regular pack',subtitle:'Little legends of the lunch counter',priceUnits:5_000_000,redemptionUnits:4_990_000},
  super:{name:'Super pack',subtitle:'Outrageous centrepieces. Unmistakably yours.',priceUnits:10_000_000,redemptionUnits:9_980_000},
};
const weights=[1600,1600,1600,1600,850,850,850,850,119,50,30,1];
const rarity=(i:number):CollectibleRarity=>i<4?'common':i<8?'uncommon':(['rare','epic','legendary','mythic'] as const)[i-8];
type Design=[string,string,string,CollectibleShape,CollectibleDef['mount'],number?];
const designs:Record<PackKind,Design[]>={
  regular:[
    ['lucky_bun','Lucky Bun','A sesame-bun lucky cat waving in the next lunch rush.','cat','counter'],
    ['pickle_diver','Deep-sea Pickle','A pickle in a copper diving helmet, searching for the last fry.','diver','counter'],
    ['mustard_rocket','Mustard Mission','A mustard-powered rocket on a tiny launch pad.','rocket','counter'],
    ['ketchup_robot','Ketchup Companion','A tin condiment robot with a very important serving tray.','robot','counter'],
    ['noodle_radio','Noodle Wave Radio','A noodle-bowl radio with chopstick aerials and a brass tuning dial.','radio','counter'],
    ['pancake_clock','Five More Pancakes','A syrup-drizzled pancake wall clock. Always almost lunchtime.','clock','wall'],
    ['dumpling_lantern','Little Dumpling Lantern','A pleated dumpling lantern with a tassel and a warm little face.','lantern','counter'],
    ['fry_crown','King of the Fries','Golden fries form a crown on a velvet display cushion.','crown','counter'],
    ['burger_globe','Burger in Orbit','A sesame planet inside a miniature celestial display.','globe','counter'],
    ['neon_lunch','One More Bite','A sculpted neon burger sign with a cherry-red halo.','sign','wall'],
    ['lunch_express','The Lunch Express','A tiny burger locomotive pulling a wagon of fries.','train','counter',2],
    ['golden_spatula','The First Golden Spatula','The original kitchen legend, held in its own emerald shrine.','spatula','counter'],
  ],
  super:[
    ['burger_mech','Bunzilla Service Unit','A burger-powered robot with spatula arms and chunky steel boots.','mech','floor'],
    ['ramen_dragon','Guardian of the Broth','A jade dragon curled around a steaming ramen cauldron.','dragon','floor'],
    ['octopus_chef','Eight-arm Executive Chef','A coral octopus chef balancing a whole dinner service.','octopus','floor'],
    ['sundae_ufo','Sundae Abduction','A flying sundae saucer lifting its cherry into orbit.','ufo','floor'],
    ['moon_noodles','Midnight Noodle Moon','A crescent moon, chopsticks and a glowing bowl for the wall.','moon','wall'],
    ['disco_fries','Disco Fry-day','A mirrored fry-ball chandelier with its own golden crown.','disco','ceiling'],
    ['capsule_cabinet','Tiny Treasures Machine','A retro capsule cabinet filled with miniature food planets. Decorative; no extra draws.','capsule','floor'],
    ['jellyfish_tank','After-hours Aquarium','Pastel jellyfish suspended in a brass-framed display aquarium.','aquarium','floor',2],
    ['midnight_express','Midnight Supper Express','A grand emerald food-truck locomotive on its own display plinth.','express','floor',2],
    ['phoenix_grill','Phoenix of the Flat-top','Copper wings rise around a flame-coloured burger jewel.','phoenix','floor'],
    ['diner_portal','Door to the Last Diner','A star-filled diner doorway with a tiny moonlit counter inside.','portal','floor'],
    ['king_bun','His Majesty, King Bun','A crowned burger monarch on a towering emerald throne.','king','floor'],
  ],
};
export const COLLECTIBLES:CollectibleDef[]=(['regular','super'] as const).flatMap(pack=>designs[pack].map(([id,name,description,shape,mount,width],i)=>({id:`collect_${id}`,name,description,shape,mount,footprint:[width??1,1],pack,rarity:rarity(i),weight:weights[i]})));
export const COLLECTIBLE_BY_ID:Record<string,CollectibleDef>=Object.fromEntries(COLLECTIBLES.map(item=>[item.id,item]));
export function packItems(pack:PackKind){return COLLECTIBLES.filter(item=>item.pack===pack);}
export function collectibleAtTicket(pack:PackKind,ticket:number):CollectibleDef {
  if(!Object.hasOwn(PACKS,pack)||!Number.isInteger(ticket)||ticket<0||ticket>=PACK_TICKETS)throw new Error('Invalid pack ticket.');
  let end=0;for(const item of packItems(pack)){end+=item.weight;if(ticket<end)return item;}throw new Error('Pack odds do not total 100%.');
}
export const oddsLabel=(item:CollectibleDef)=>`${item.weight/100}%`;
export const usdcLabel=(units:number)=>(units/1_000_000).toFixed(2);

/** Only a trusted settlement adapter may construct these after finality and mint.
 * A wallet connection, browser draw or submitted transaction hash is not proof. */
export interface SettledPackOpening {openingId:string;wallet:string;pack:PackKind;version:1;itemId:string;openedAt:number;chainId:number;contractAddress:string;transactionHash:string;logIndex:number;tokenId:string;mode:'live'}
export interface PackLeaderboardRow {rank:number;wallet:string;regular:number;super:number;total:number;unique:number}
export function packLeaderboard(receipts:readonly SettledPackOpening[],pack:PackKind):PackLeaderboardRow[]{
  const ids=new Set<string>(),events=new Set<string>(),tokens=new Set<string>(),players=new Map<string,Omit<PackLeaderboardRow,'rank'>&{items:Set<string>}>();
  for(const receipt of receipts){
    if(!receipt||typeof receipt.openingId!=='string'||typeof receipt.wallet!=='string'||typeof receipt.transactionHash!=='string'||typeof receipt.contractAddress!=='string'||typeof receipt.tokenId!=='string'||typeof receipt.itemId!=='string')continue;
    const item=COLLECTIBLE_BY_ID[receipt.itemId];
    if(receipt.mode!=='live'||receipt.version!==PACK_VERSION||!receipt.openingId||!/^0x[\da-f]{40}$/i.test(receipt.wallet)||!/^0x[\da-f]{64}$/i.test(receipt.transactionHash)||!/^0x[\da-f]{40}$/i.test(receipt.contractAddress)||!Number.isSafeInteger(receipt.chainId)||receipt.chainId<=0||!Number.isSafeInteger(receipt.logIndex)||receipt.logIndex<0||!/^(0|[1-9]\d*)$/.test(receipt.tokenId)||!Number.isSafeInteger(receipt.openedAt)||receipt.openedAt<0||item?.pack!==receipt.pack)continue;
    const event=`${receipt.chainId}:${receipt.transactionHash.toLowerCase()}:${receipt.logIndex}`,token=`${receipt.chainId}:${receipt.contractAddress.toLowerCase()}:${receipt.tokenId}`;
    if(ids.has(receipt.openingId)||events.has(event)||tokens.has(token))continue;
    ids.add(receipt.openingId);events.add(event);tokens.add(token);
    const wallet=receipt.wallet.toLowerCase(),row=players.get(wallet)??{wallet,regular:0,super:0,total:0,unique:0,items:new Set<string>()};
    row[receipt.pack]++;row.total++;row.items.add(receipt.itemId);row.unique=row.items.size;players.set(wallet,row);
  }
  let rank=0,previous=-1;
  return [...players.values()].filter(row=>row[pack]>0).sort((a,b)=>b[pack]-a[pack]||a.wallet.localeCompare(b.wallet)).map(({items,...row})=>{if(row[pack]!==previous){rank++;previous=row[pack];}return {...row,rank};});
}
