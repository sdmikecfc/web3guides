import { RECIPES, ROUTES } from './content';
import type { DecorDef } from './collections';

/** Earned displays do not contribute charm or income. */
export const PRESTIGE_DECOR:DecorDef[]=[
  ...['gochujang','smoothie','wines'].map(id=>({id:`prestige_journey_${id}`,name:`${({gochujang:'Spice Street',smoothie:'Fruit Club',wines:'Vineyard'} as Record<string,string>)[id]} journey badge`,description:'Earned by finishing all eight services of this seasonal journey.',footprint:[1,1] as [number,number],price:0,setId:'achievements',wall:true,memento:true,prestige:true})),
  ...['burger','breakfast','ramen','bistro'].map(id=>({id:`prestige_project_${id}`,name:`${({burger:'Burger joint',breakfast:'Breakfast café',ramen:'Ramen bar',bistro:'Bistro'} as Record<string,string>)[id]} opening plaque`,description:'Earned by completing your restaurant project and hosting opening night.',footprint:[1,1] as [number,number],price:0,setId:'achievements',wall:true,memento:true,prestige:true})),
  {id:'prestige_picnic_plaque',name:'Neighbourhood Picnic plaque',description:'Earned by helping your community cook 300 verified meals, including three of your own.',footprint:[1,1],price:0,setId:'achievements',wall:true,memento:true,prestige:true},
  {id:'prestige_service_badge',name:'Five good lunches badge',description:'Earned by completing five ordinary truck services.',footprint:[1,1],price:0,setId:'achievements',wall:true,memento:true,prestige:true},
  {id:'prestige_rally_trophy',name:'Weekly rally trophy',description:'Earned by completing a server-verified weekly rally.',footprint:[1,1],price:0,setId:'achievements',counter:true,memento:true,prestige:true},
  ...ROUTES.map(route=>({id:`prestige_route_${route.id}`,name:`${route.name} souvenir`,description:`Earned by completing the ${route.name} finale.`,footprint:[1,1] as [number,number],price:0,setId:'achievements',wall:true,memento:true,prestige:true})),
  ...RECIPES.map(recipe=>({id:`prestige_dish_${recipe.id}`,name:`${recipe.name} illustration`,description:`Earned by serving ${recipe.name} and reaching recipe level three.`,footprint:[1,1] as [number,number],price:0,setId:'achievements',wall:true,memento:true,prestige:true})),
];
