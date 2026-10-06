import type {DomainId} from './domain-worlds';

/** Private art directions. These are not ownership, purchase or journey receipts. */
export const DOMAIN_ROOM_STUDIES:Record<DomainId,{asset:string;name:string;description:string;details:string;motion:string}>={
  gochujang:{asset:'domain_room_gochujang',name:'The Fireant Ramyeon Club',description:'A red-lacquer noodle house, built around Gochujang and its Fireant crew.',details:'Glazed red walls, gold latticework, pepper lanterns, a noodle counter and an ant-run kitchen.',motion:'The ant cooks tend their pots with planted feet; the host gives a small greeting.'},
  smoothie:{asset:'domain_room_smoothie',name:'The Tropical Fruit Club',description:'A sunlit fruit bar inside a lush waterfront orangery.',details:'Peach fluted counters, pale stone, tall glass panels, tropical planting and a fresh produce bar.',motion:'A supported bamboo ceiling fan turns slowly. Fruit stays in its bowls or inside the blender.'},
  wines:{asset:'domain_room_wines',name:'The Velvet Cellar',description:'An intimate wine bar with bottle-lined walnut walls and a complete tasting counter.',details:'Oak plank floors, illuminated cellar shelving, brass stemware rails, burgundy seating and limestone counters.',motion:'The room stays calm. Wine glasses and bottles rest on their supports; no floating or orbiting wine.'},
};
export const DOMAIN_ROOM_ASSET_IDS=new Set(Object.values(DOMAIN_ROOM_STUDIES).map(room=>room.asset));
