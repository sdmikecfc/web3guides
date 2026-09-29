import ClassicRules from './ClassicRules';
import WorkshopRules from './WorkshopRules';
import TokenZoneRules from './TokenZoneRules';
export const metadata={title:'Competition rules | Model Kombat',description:'Model Kombat fixed-token zones: eligibility, scoring and provisional rewards.'};
export default function RulesPage(){return process.env.BOTS_TOKEN_ZONES==='1'?<TokenZoneRules/>:process.env.BOTS_WORKSHOP_COMPETITION==='1'&&process.env.BOTS_WORKSHOP_JOURNEY==='1'?<WorkshopRules/>:<ClassicRules/>}
