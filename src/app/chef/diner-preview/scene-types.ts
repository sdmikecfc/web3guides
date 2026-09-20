import type { HomeSceneGesture } from '@/lib/chef/diner/home-gesture';
export type { HomeSceneGesture } from '@/lib/chef/diner/home-gesture';
export interface ScenePoint { x:number; y:number }
export interface SceneFood { recipeId:string; kind:'raw'|'processed'|'dish'|'burnt'|'dirty'|'ingredient'|'plate'; stage?:string; ingredientId?:string; vesselKind?:'plate'|'cup'|'fry_box'|'bowl'|'pizza_dish'; cold?:boolean; mastery?:number }
export interface SceneSlot { food?:SceneFood|null; state?:'idle'|'working'|'ready'|'burning'; progress?:number }
export interface SceneObject extends ScenePoint { id:string; kind:string; rotation?:0|1|2|3; tier?:number; stock?:number; basketRaised?:boolean; portions?:number; state?:'idle'|'working'|'ready'|'burning'; progress?:number; food?:SceneFood|null; slots?:SceneSlot[]; footprint?:[number,number]; color?:string }
export interface SceneSeat extends ScenePoint { id:string; status:string; item?:SceneFood|null; customerId?:string|null }
export interface SceneTable extends ScenePoint { id:string; capacity:1|2|4; rotation?:0|1|2|3; seats:SceneSeat[] }
export interface ScenePerson extends ScenePoint {
  id:string; role:'chef'|'waiter'|'customer'; look?:number; facing?:0|1|2|3;
  pose?:'idle'|'walk'|'carry'|'cook'|'wash'|'sit'|'eat'|'cheer'|'leave';
  held?:SceneFood|null; target?:ScenePoint|null; order?:{recipeId:string;patience:number}|null;
  work?:{stationKind?:string;recipeId?:string};
  tableId?:string|null;seatId?:string|null;
}
export interface DinerSceneData {
  width:number;height:number;pavementWidth?:number;pavementHeight?:number;sign?:string;paint?:string;
  homeTerraceDepth?:number;
  trailer?:Array<{id:string;kind:string;tier:number}>;
  guideTarget?:string|null;
  floor?:string;wall?:string;wrap?:string;uniform?:string;
  objects:SceneObject[];tables:SceneTable[];people:ScenePerson[];queue?:ScenePoint[];
  selectedId?:string|null;tick?:number;paused?:boolean;
  tileHighlights?:Array<ScenePoint&{valid:boolean}>;
}
export interface DinerPerformance { fps:number;drawCalls:number;triangles:number;width:number;height:number }
export interface SceneAnchor { id:string;x:number;y:number;visible:boolean }
export interface DinerSceneProps {
  mode:'truck'|'home';scene:DinerSceneData;rotation:number;editing?:boolean;
  onTarget:(id:string,seatId?:string)=>void;onTile:(x:number,y:number)=>void;
  onHomeGesture?:(gesture:HomeSceneGesture)=>void;
  showWorldHints?:boolean;onAnchors?:(anchors:SceneAnchor[])=>void;
  worldReward?:{id:string;label:string;receipt:string}|null;
  onRotate?:(rotation:number)=>void;onPerformance?:(value:DinerPerformance)=>void;
  onError?:(message:string)=>void;
  className?:string;
}
