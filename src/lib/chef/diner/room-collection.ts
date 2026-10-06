/** Public room-building selection for the current furniture pass.
 * This is a browsing filter, never an ownership or save migration. The remaining
 * ornaments stay usable from Storage while their art is being revised. */
export const ROOM_COLLECTION_IDS=new Set([
 'half_wall_cream','half_wall_walnut','half_wall_deco','slatted_screen',
 'display_counter_red','display_counter_oak','display_counter_deco',
 'display_corner_red','display_corner_oak','display_corner_deco',
 'waiting_bench_red','waiting_bench_oak','waiting_sofa','lobby_table',
 'floor_lamp','planter_divider','leafy_plant','brass_planter','red_planter','herb_planter','daisy_pot',
 'chrome_clock','diner_clock','brass_sconce','chandelier',
 'checkered_shelf','wine_rack','pie_display','condiment_caddy','welcome_mat',
 'milkshake_sign','coffee_print','garden_poster','coffee_sign','burger_print',
 'burger_mascot','retro_radio','bear_statue','deer_trophy','deco_mirror',
]);
export function roomCollectionVisible(id:string,kind:'equipment'|'decor',owned:number):boolean {
 return kind==='equipment'||owned>0||ROOM_COLLECTION_IDS.has(id);
}
