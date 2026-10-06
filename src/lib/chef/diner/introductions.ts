import type {DinerState} from './progression';
import type {Introduction} from './personal-touches';
import {STYLE_BUNDLES} from './progress-rewards';
export const introductionVisit=(s:DinerState)=>`${s.career.services}:${s.run?.id??'home'}:${s.run?.serviceDays??0}`;
export function stylePlaced(s:DinerState){const bundle=STYLE_BUNDLES.find(b=>b.id===s.progressRewards?.style);return !!bundle&&bundle.decor.every(id=>s.home.layout.some(p=>p.equipmentId===id));}
export function nextIntroduction(s:DinerState,communityReady=false):{id:Introduction;title:string;action:'staff'|'recipes'|'project'|'community';label:string}|null{
 if(s.progressRewards?.pinned||s.run?.service||s.rally.service||s.run?.event||s.run?.position||s.personal?.lastSuggestionVisit===introductionVisit(s))return null;
 const seen=new Set(s.personal?.introductions??[]);
 if(!seen.has('crew')&&(s.staffMembers.length>3||s.career.services>=5))return {id:'crew',title:'Meet the people making your place work.',action:'staff',label:'Meet your crew'};
 if(!seen.has('signature')&&Object.values(s.recipes).some(r=>r.level>=1))return {id:'signature',title:'Give an upgraded dish your restaurant’s touch.',action:'recipes',label:'Personalize a dish'};
 if(!seen.has('project')&&stylePlaced(s)&&!s.projects?.active)return {id:'project',title:'What kind of place are you making?',action:'project',label:'Choose a restaurant project'};
 if(!seen.has('community')&&s.career.services>=4&&communityReady)return {id:'community',title:'Cook a few meals for the neighbourhood picnic.',action:'community',label:'Meet the picnic'};
 return null;
}
