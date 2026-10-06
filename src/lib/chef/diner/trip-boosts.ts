/** Only implemented effects can be offered. Old checkpoint IDs remain readable. */
export const TRIP_BOOSTS = [
  {id:'early_bird',name:'Early Bird',detail:'Double patience for the first five guests of each service.'},
  {id:'sharp_knives',name:'Sharp Knives',detail:'Held preparation actions take half the time.'},
  {id:'big_tipper',name:'Big Tipper',detail:'Each combo step adds 8% to tips instead of 5%.'},
] as const;
export const nextTripBoost=(owned:readonly string[])=>TRIP_BOOSTS.find(boost=>!owned.includes(boost.id));
export const tripBoostLabel=(id:string)=>TRIP_BOOSTS.find(boost=>boost.id===id)?.name??id.replace(/_/g,' ');
