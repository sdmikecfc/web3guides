'use client';
import type {DinerState} from '@/lib/chef/diner/progression';
import {giftOfferText,type RoadsideGift} from '@/lib/chef/diner/roadside-gifts';
import {DinerIcon} from './DinerIcon';
import {ModelIcon} from './ModelIcon';
import css from './diner.module.css';
export function RoadsideGifts({state,gift,claim}:{state:DinerState;gift:RoadsideGift;claim:(id:string)=>void}){
 return <div className={css.grid}>{gift.offers.map(offer=>{const text=giftOfferText(offer,state);return <article className={css.card} key={offer.id}><div className={css.cardArt}>{offer.kind==='recipe'?<ModelIcon kind="food" recipeId={offer.target} label={text.name}/>:offer.kind==='equipment'||offer.kind==='upgrade'?<ModelIcon kind={offer.target} tier={offer.kind==='upgrade'?offer.amount:1} label={text.name}/>:<DinerIcon name={offer.kind==='coins'?'coin':offer.kind==='ingredients'?'leaf':'star'} size={49}/>}</div><div className={css.cardBody}><h3>{text.name}</h3><p>{text.detail}</p><button className={css.primary} disabled={!!gift.claimed} onClick={()=>claim(offer.id)}>Take this gift</button></div></article>;})}</div>;
}
