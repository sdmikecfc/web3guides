import {DOMAIN_COLLECTIBLE_BY_ID} from './domain-worlds';
/** Explicit local review inventory; concepts without built geometry must not masquerade as art. */
export const DOMAIN_COMMON_STUDIES=new Set([
 'domain_gochujang_pepper_lanterns','domain_gochujang_mandu_mountain','domain_gochujang_spice_drawers',
 'domain_smoothie_papaya_planter','domain_smoothie_citrus_mobile','domain_smoothie_fruit_skate',
 'domain_wines_cork_garden','domain_wines_harvest_lamp','domain_wines_cellar_library',
]);
export const DOMAIN_SUPER_COMMON_STUDIES=new Set([
 'domain_gochujang_fireant_doorman','domain_gochujang_mandu_steamer','domain_gochujang_spice_drinks',
 'domain_smoothie_pineapple_cabana','domain_smoothie_berry_fridge','domain_smoothie_coconut_coffee',
 'domain_wines_tartine_oven','domain_wines_cellar_coffee','domain_wines_vine_cooler',
]);
export const DOMAIN_UNCOMMON_STUDIES=new Set([
 'domain_gochujang_pepper_prep','domain_gochujang_tiger_coffee','domain_gochujang_chilli_canopy','domain_gochujang_night_stall',
 'domain_smoothie_watermelon_prep','domain_smoothie_citrus_juicer','domain_smoothie_berry_nest','domain_smoothie_mango_pendant',
 'domain_wines_tasting_station','domain_wines_walnut_prep','domain_wines_vine_chandelier','domain_wines_cheese_dome',
]);
/** Built review geometry is not an art approval or a production-release receipt. */
export const DOMAIN_NEW_STUDY_FOLDERS:Readonly<Record<string,string>>=Object.fromEntries([
 ...[
  'gochujang_hanok_roof','gochujang_pepper_band','gochujang_ant_delivery','gochujang_steam_gate',
  'smoothie_fruit_flamingo','smoothie_tropical_fan','smoothie_sorbet_cloud','smoothie_banana_hammock',
  'wines_cork_captain','wines_harvest_bear','wines_cellar_window','wines_grape_gazebo',
 ].map(slug=>[`domain_${slug}`,'super-uncommon-v1']),
 ...['rice_griddle','kimchi_orchard','spice_moon','last_lantern','spice_aquarium','fermentation_clockwork','fireant_city'].map(slug=>[`domain_gochujang_${slug}`,'rare-gochujang-v1']),
 ...['palm_fountain','fruit_tide','fruit_atoll','citrus_reef','tropical_station','toucan_palace','sun_in_glass'].map(slug=>[`domain_smoothie_${slug}`,'rare-smoothie-v1']),
 ...['cellar_chiller','harvest_procession','endless_vintage','moonlit_press','velvet_stage','vintage_airship','world_vintage'].map(slug=>[`domain_wines_${slug}`,'rare-wines-v1']),
]);
export const hasDomainArtStudy=(id:string)=>Object.hasOwn(DOMAIN_COLLECTIBLE_BY_ID,id)&&(DOMAIN_COLLECTIBLE_BY_ID[id].hero||DOMAIN_COMMON_STUDIES.has(id)||DOMAIN_SUPER_COMMON_STUDIES.has(id)||DOMAIN_UNCOMMON_STUDIES.has(id)||Object.hasOwn(DOMAIN_NEW_STUDY_FOLDERS,id));
