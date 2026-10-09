/** Immutable competition rules. Historical workshop-house-1 remains separate. */
export const ZONE_RULES = 'mk-token-zones-1';
export const ZONE_CAMPAIGN = 'model-kombat-zones-1';
export const DAY = 86_400_000;
export const ZONE_FRESH_MS = 5 * 3_600_000;
export const ZONE_CATEGORIES = ['volume', 'roi', 'profit', 'battles'] as const;
export type ZoneCategory = typeof ZONE_CATEGORIES[number];
export const CATEGORY_LABELS: Record<ZoneCategory, string> = {volume:'Trading volume',roi:'Realized ROI %',profit:'Realized profit',battles:'Battle points'};
export const CATEGORY_WEIGHTS: Record<ZoneCategory, number> = {volume:60,roi:15,profit:15,battles:10};
export const REWARD_ZONES = [
 {symbol:'USDC',quantity:'1000',threshold:5000,referenceUsd:1000,color:'#8dc7e8'},
 {symbol:'DEPIN.ai',quantity:'3304.58',threshold:25000,referenceUsd:100,color:'#98cda1'},
 {symbol:'ALERT.ai',quantity:'968.60',threshold:50000,referenceUsd:150,color:'#dbc16f'},
 {symbol:'BRAG.com',quantity:'3440.80',threshold:100000,referenceUsd:300,color:'#e6a475'},
 {symbol:'INVESTORS.xyz',quantity:'13966.48',threshold:175000,referenceUsd:300,color:'#bf9adf'},
 {symbol:'RIDES.com',quantity:'3543.22',threshold:250000,referenceUsd:450,color:'#65cbbd'},
 {symbol:'BONER.com',quantity:'2261.22',threshold:400000,referenceUsd:450,color:'#ed9cac'},
 {symbol:'GOCHUJANG.com',quantity:'619.06',threshold:550000,referenceUsd:500,color:'#f27569'},
 {symbol:'SOFTWARE.ai',quantity:'2437.97',threshold:750000,referenceUsd:750,color:'#86aaff'},
] as const;
export type ZoneSymbol = typeof REWARD_ZONES[number]['symbol'];
export type ZoneAsset = {symbol:ZoneSymbol;chainId:number;address:string;decimals:number;fundedUnits:string;verifiedAt:string;liquidPair:string;priceUsd:string|null;priceAt:string|null};
export type ZoneScore = {id:string;name:string;qualified:boolean;scores:Record<ZoneCategory,string|null>};
export type ZoneAward = {id:string;symbol:ZoneSymbol;units:string};
export type ZoneView = {
 schemaVersion:1;rules:typeof ZONE_RULES;available:boolean;state:'draft'|'active'|'closed'|'frozen'|'unavailable';
 startsAt:string|null;endsAt:string|null;confirmedThrough:string|null;fresh:boolean;complete:boolean;issues:string[];
 volumeUsd:string|null;history:{day:number;volumeUsd:string}[];assets:ZoneAsset[];
 standings:Record<ZoneCategory,{id:string;name:string;rank:number;score:string|null;qualified:boolean;verifiedThrough?:string|null}[]>;
 tracking?:{verified:number;total:number;partial:boolean;current?:number;retained?:boolean;oldestThrough?:string|null;newestThrough?:string|null};
 financials?:{verified:number|null;total:number|null;complete:boolean;confirmedThrough:string|null;retained?:boolean;oldestThrough?:string|null;newestThrough?:string|null};
 personal:null|{tradeThrough?:string|null;financialThrough?:string|null;resultsDelayed?:boolean;syncStatus?:'verified'|'syncing'|'review';financialStatus?:'verified'|'syncing'|'no_trades'|'review';scores?:Record<ZoneCategory,string|null>;id:string|null;connected:boolean;linkStatus:string;entered:boolean;weeks:(number|null)[];qualified:boolean|null;volumeUsd:string|null;attemptsRemaining:number|null;awards:ZoneAward[];challenges:string[];ranks:Record<ZoneCategory,number|null>};
};
export function emptyZoneView():ZoneView{return {schemaVersion:1,rules:ZONE_RULES,available:false,state:'unavailable',startsAt:null,endsAt:null,confirmedThrough:null,fresh:false,complete:false,issues:['Tracking setup is not confirmed.'],volumeUsd:null,history:[],assets:[],standings:{volume:[],roi:[],profit:[],battles:[]},personal:null};}
/** Decimal strings avoid floating-point ranking and preserve token base units. */
export function decimalUnits(value:string,decimals=6):bigint {
 if(!Number.isInteger(decimals)||decimals<0||decimals>36||! /^-?\d{1,40}(\.\d{1,36})?$/.test(value))throw Error('Invalid decimal');
 const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');
 if(fraction.length>decimals&&/[1-9]/.test(fraction.slice(decimals)))throw Error('Excess precision');
 const n=BigInt(whole)*BigInt(10)**BigInt(decimals)+BigInt((fraction.slice(0,decimals)+'0'.repeat(decimals)).slice(0,decimals)||'0');return negative?-n:n;
}
export function unitsDecimal(value:bigint,decimals:number):string {
 const sign=value<BigInt(0)?'-':'',n=(value<BigInt(0)?-value:value).toString().padStart(decimals+1,'0');
 return decimals?sign+n.slice(0,-decimals)+'.'+n.slice(-decimals):sign+n;
}
/** Largest remainder: stable key breaks rounding ties, never creates units. */
export function apportion(total:bigint,weights:{id:string;weight:bigint}[]):Map<string,bigint>{
 if(total<BigInt(0)||weights.some(w=>w.weight<BigInt(0))||new Set(weights.map(w=>w.id)).size!==weights.length)throw Error('Invalid allocation');
 const sum=weights.reduce((n,w)=>n+w.weight,BigInt(0)),out=new Map<string,bigint>();if(!sum)return out;
 const rows=weights.map(w=>({...w,units:total*w.weight/sum,remainder:total*w.weight%sum}));
 let left=total-rows.reduce((n,w)=>n+w.units,BigInt(0));rows.sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1);
 for(const r of rows){out.set(r.id,r.units+(left>BigInt(0)?BigInt(1):BigInt(0)));if(left>BigInt(0))left--; }return out;
}
export function ranked(rows:ZoneScore[],category:ZoneCategory){
 const sorted=rows.filter(r=>r.scores[category]!==null).map(r=>({...r,value:decimalUnits(r.scores[category]!,36)})).sort((a,b)=>a.value===b.value?a.id.localeCompare(b.id):a.value>b.value?-1:1);
 let rank=0;return sorted.map((r,i)=>{if(!i||r.value!==sorted[i-1].value)rank=i+1;return {...r,rank};});
}
function podium(total:bigint,rows:ReturnType<typeof ranked>){
 const positions=[BigInt(50),BigInt(30),BigInt(20)],groups:{id:string;weight:bigint;members:string[]}[]=[];
 for(let i=0;i<Math.min(3,rows.length);){let end=i+1;while(end<rows.length&&rows[end].value===rows[i].value)end++;
  groups.push({id:rows[i].id,weight:positions.slice(i,Math.min(3,end)).reduce((a,b)=>a+b,BigInt(0)),members:rows.slice(i,end).map(r=>r.id)});i=end;}
 const groupAwards=apportion(total,groups),awards=new Map<string,bigint>();
 for(const g of groups)for(const [id,n]of apportion(groupAwards.get(g.id)??BigInt(0),g.members.map(id=>({id,weight:BigInt(1)}))))awards.set(id,n);
 return awards;
}
export function tokenAwards(volumeUsd:string,assets:ZoneAsset[],rows:ZoneScore[]):ZoneAward[]{
 const volume=decimalUnits(volumeUsd),out:ZoneAward[]=[];
 for(const zone of REWARD_ZONES){if(volume<decimalUnits(String(zone.threshold)))continue;
  const asset=assets.find(a=>a.symbol===zone.symbol);if(!asset)continue;
  // Entitlements depend on fixed allocations, not when the organizer funds payouts.
  const total=decimalUnits(zone.quantity,asset.decimals);
  const categories=apportion(total,ZONE_CATEGORIES.map(id=>({id,weight:BigInt(CATEGORY_WEIGHTS[id])}))),combined=new Map<string,bigint>();
  for(const category of ZONE_CATEGORIES){const eligible=ranked(rows.filter(r=>r.qualified&&(category!=='volume'||decimalUnits(r.scores.volume??'0')>BigInt(0))),category),amount=categories.get(category)??BigInt(0);
   let awards:Map<string,bigint>;
   if(category==='volume'){
    const split=apportion(amount,[{id:'podium',weight:BigInt(40)},{id:'rest',weight:BigInt(60)}]);awards=podium(split.get('podium')??BigInt(0),eligible);
    const rest=eligible.filter(r=>!awards.has(r.id));
    if(!rest.length)awards=podium(amount,eligible);
    else for(const [id,n]of apportion(split.get('rest')??BigInt(0),rest.map(r=>({id:r.id,weight:r.value}))))awards.set(id,n);
   }else awards=podium(amount,eligible);
   for(const [id,n]of awards)combined.set(id,(combined.get(id)??BigInt(0))+n);
  }
  for(const [id,n]of combined)out.push({id,symbol:zone.symbol,units:n.toString()});
 }return out;
}
export function qualificationDays(times:string[],start:string,end:string):number[]{
 const s=Date.parse(start),e=Date.parse(end);if(!Number.isFinite(s)||e-s!==28*DAY)throw Error('Invalid competition window');
 const days=Array.from({length:4},()=>new Set<string>());
 for(const time of times){const t=Date.parse(time);if(t>=s&&t<e)days[Math.floor((t-s)/(7*DAY))].add(new Date(t).toISOString().slice(0,10));}
 return days.map(d=>d.size);
}
