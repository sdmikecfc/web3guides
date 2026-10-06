import {tierForGP} from './equipment';
import {LADDERS,type LadderRun} from './ladder';
import type {Build,Tier} from './types';

/** Free fighters stay in Tier 1. Higher ladders use the selected owned robot's real GP. */
export function ladderAvailable(tier:Tier,build:Build|null,owned:boolean):boolean{
 return !!build&&tier<=(owned?tierForGP(build.gp):1)&&(!owned?build.tier===1&&tierForGP(build.gp)===1:true);
}
export function ladderRequirement(tier:Tier):string{
 return `Upgrade your robot to ${LADDERS[tier-1].gp} Gear Points to unlock Tier ${tier}.`;
}
const BUILD_KEYS=['name','style','tier','gp','health','damage','speed','handling','guard','precision'] as const;
/** Recheck saved runs against current equipment; a pre-fix high-tier loaner is not an unlock. */
export function ladderResumeAvailable(run:LadderRun,build:Build|null,robotId:string|null):boolean{
 if(!ladderAvailable(run.tier,build,!!robotId)||!build)return false;
 if(run.robotId&&run.robotId!==robotId)return false;
 return BUILD_KEYS.every(key=>run.build[key]===build[key]);
}
