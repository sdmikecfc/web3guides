import type { HomeSceneGesture } from '@/lib/chef/diner/home-gesture';
import type { RoomPlan } from '@/lib/chef/diner/room-plan';
export type { HomeSceneGesture } from '@/lib/chef/diner/home-gesture';
export interface ScenePoint { x:number; y:number }
/** Components can change while the parent item's stage stays the same. */
export const sceneFoodKey=(food?:SceneFood|null)=>food?`${food.recipeId}:${food.kind}:${food.stage??''}:${food.ingredientId??''}:${food.vesselKind??''}:${food.cold??false}:${food.mastery??0}:${food.signatureStyle??''}:${(food.components??[]).map(c=>c.ingredientId).sort().join(',')}`:'';
export interface SceneFood { signatureStyle?:import('@/lib/chef/diner/personal-touches').SignatureDish['style']; recipeId:string; kind:'raw'|'processed'|'dish'|'burnt'|'dirty'|'ingredient'|'plate'; stage?:string; ingredientId?:string; components?:{id:string;ingredientId:string}[]; vesselKind?:'plate'|'cup'|'fry_box'|'bowl'|'pizza_dish'; cold?:boolean; mastery?:number }
export interface SceneSlot { food?:SceneFood|null; state?:'idle'|'working'|'ready'|'burning'; progress?:number }
export interface SceneObject extends ScenePoint { id:string; kind:string; label?:string; appearance?:string; rotation?:0|1|2|3; tier?:number; stock?:number;supplyIngredients?:string[]; basketRaised?:boolean; portions?:number; state?:'idle'|'working'|'ready'|'burning'; progress?:number; food?:SceneFood|null; slots?:SceneSlot[]; footprint?:[number,number]; color?:string; elevation?:number; gateOpen?:boolean; condition?:number; mount?:{kind:'wall'|'counter'|'ceiling';targetId:string;surfaceHeight:number} }
export interface SceneSeat extends ScenePoint { id:string; status:string; item?:SceneFood|null; customerId?:string|null; surface?:ScenePoint;style?:'classic'|'diner' }
export interface SceneTable extends ScenePoint { id:string; capacity:1|2|3|4|6; rotation?:0|1|2|3; seats:SceneSeat[]; kind?:'console'|'chef_bar'|'booth';footprint?:[number,number];seatHeight?:number;surfaceHeight?:number;tableStyle?:'cafe'|'restaurant' }
export interface SceneMountSurface {mount:{kind:'wall'|'counter'|'ceiling';targetId:string;slot:number};x:number;y:number;rotation:0|1|2|3;surfaceHeight:number;error:string|null}
export interface ScenePlacement {surfaces?:SceneMountSurface[]; object?:SceneObject;table?:SceneTable;valid:boolean }
export interface ScenePerson extends ScenePoint {
  name?:string;outfit?:string;customerType?:string;communityHandle?:string;id:string; role:'chef'|'waiter'|'cashier'|'customer'; look?:number; facing?:0|1|2|3;
  pose?:'idle'|'walk'|'carry'|'cook'|'wash'|'sit'|'eat'|'cheer'|'leave'|'takeOrder';
  held?:SceneFood|null; target?:ScenePoint|null; order?:{recipeId:string;patience:number}|null;
  work?:{stationKind?:string;recipeId?:string;seatHeight?:number};hidden?:boolean;
  tableId?:string|null;seatId?:string|null;
}
export interface DinerSceneData {
  buildView?:'overhead';
  buildEditor?:boolean;
  /** A player-requested Find/Show action, consumed once by the camera. */
  editorFocus?:{id:string;request:number};
  editorProblemTarget?:string;
  construction?:boolean;
  decoratingCatalogue?:boolean;
  discoveries?:import('@/lib/chef/diner/decor-discoveries').DecorDiscovery[];discoveryPreview?:boolean;
  signature?:import('@/lib/chef/diner/personal-touches').SignatureDish|null;
  environment?:import('@/lib/chef/diner/routes').RouteEnvironment;
  journeyDomain?:import('@/lib/chef/diner/domain-worlds').DomainId;
  atmosphere?:import('./presentation').Atmosphere;
  quality?:import('./presentation').Quality;
  rehearsal?:boolean;
  roomPlan?:RoomPlan;menu?:string[];roomFinishes?:{counter:string;worktop:string;upholstery:string;sign:string};
  width:number;height:number;pavementWidth?:number;pavementHeight?:number;sign?:string;paint?:string;
  homeTerraceDepth?:number;
  previewInset?:number;
  /** Embedded truck canvases put their HUD outside this row, with CSS-owned padding. */
  truckSetup?:boolean;
  /** Isolated art-review stage. Never used by saved restaurants. */
  characterReview?:boolean;
  /** Complete development-only room art, separate from saves and entitlement grants. */
  domainRoomStudy?:import('@/lib/chef/diner/domain-worlds').DomainId;
  /** Development capture framing only; ignored by production rendering. */
  reviewCamera?:{x:number;y:number;z:number;vertical:number;azimuth:number;elevation:number;foregroundCutaway?:number};
  trailer?:Array<{id:string;kind:string;tier:number}>;
  guideTarget?:string|null;
  compatibleTargets?:string[];
  floor?:string;wall?:string;wrap?:string;uniform?:string;
  objects:SceneObject[];tables:SceneTable[];people:ScenePerson[];queue?:ScenePoint[];
  selectedId?:string|null;tick?:number;paused?:boolean;
  tileHighlights?:Array<ScenePoint&{valid:boolean}>;
  /** Editor-only assignment line, never a navigation or simulation input. */
  serviceConnection?:ScenePoint[];
  placement?:ScenePlacement|null;
}
export interface DinerPerformance { fps:number;drawCalls:number;triangles:number;width:number;height:number }
export interface SceneAnchor { id:string;x:number;y:number;visible:boolean }
export interface DinerSceneProps {
  onConstruction?:(start:ScenePoint,end:ScenePoint)=>void;
  mode:'truck'|'home';scene:DinerSceneData;rotation:number;editing?:boolean;
  onTarget:(id:string,seatId?:string)=>void;onTile:(x:number,y:number)=>void;
  onCameraDisplaced?:(displaced:boolean)=>void;
  onMountSurface?:(surface:SceneMountSurface)=>void;
  onHoverTile?:(x:number|null,y:number|null)=>void;
  onHomeGesture?:(gesture:HomeSceneGesture)=>void;
  showWorldHints?:boolean;onAnchors?:(anchors:SceneAnchor[])=>void;
  worldReward?:{id:string;label:string;receipt:string}|null;
  onRotate?:(rotation:number)=>void;onPerformance?:(value:DinerPerformance)=>void;
  onError?:(message:string)=>void;
  className?:string;
}
