import {readRun,type LadderRun} from './ladder';
import {RULES,ART,AI_VERSION,type AIVersion,type Command} from './types';
import type {ArenaId} from './arenas';
import {arenaDefinition} from './arenas';
export const ARCADE_SAVE='mk11.arcade.ladders.1';
export type ArcadeSave={version:1;scope:string;runs:Partial<Record<1|2|3|4,LadderRun>>;active:1|2|3|4|null;arena:ArenaId;checkpoint:{runId:string;stage:number;lives:number;tick:number;commands:Command[];rules:typeof RULES;art:typeof ART;aiVersion?:AIVersion}|null};
export const freshArcadeSave=(scope:string):ArcadeSave=>({version:1,scope,runs:{},active:null,arena:'reactor',checkpoint:null});
export function readArcadeSave(raw:string|null,scope:string):ArcadeSave{
 const out=freshArcadeSave(scope);if(!raw||raw.length>3000000)return out;
 try{const s=JSON.parse(raw);if(s.version!==1||s.scope!==scope)return out;
  for(const tier of [1,2,3,4] as const){const r=readRun(s.runs?.[tier]);if(r&&r.tier===tier)out.runs[tier]=r;}
  if([1,2,3,4].includes(s.active)&&out.runs[s.active as 1])out.active=s.active;
  out.arena=arenaDefinition(s.arena).id;
  const c=s.checkpoint,r=out.active?out.runs[out.active]:null;
  if(c&&c.aiVersion!==undefined&&c.aiVersion!=='mk11-ai-1'&&c.aiVersion!==AI_VERSION)return out;
  if(c&&r&&(c.aiVersion??'mk11-ai-1')!==(r.aiVersion??'mk11-ai-1'))return out;
  if(c&&r&&c.runId===r.id&&c.stage===r.stage&&c.lives===r.lives&&c.rules===RULES&&c.art===ART&&Number.isSafeInteger(c.tick)&&c.tick>=0&&c.tick<=60000&&Array.isArray(c.commands)&&c.commands.length<=24000&&c.commands.every((v:Command,i:number)=>v.side===0&&Number.isSafeInteger(v.tick)&&v.tick>=0&&v.tick<=c.tick&&Number.isSafeInteger(v.sequence)&&v.sequence>0&&(i===0||v.tick>=c.commands[i-1].tick&&v.sequence>c.commands[i-1].sequence)&&typeof v.down==='boolean'&&['left','right','up','down','light','heavy','special','guard','throw','super','enhance','escape','dash','finish','clear','skip'].includes(v.action)))out.checkpoint=c;
 }catch{}return out;
}
