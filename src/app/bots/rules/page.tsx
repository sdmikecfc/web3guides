import ClassicRules from './ClassicRules';
import WorkshopRules from './WorkshopRules';
export const metadata={title:'Competition rules | Model Kombat',description:'The $2,000 Model Kombat competition: eligibility, scoring and prizes.'};
export default function RulesPage(){return process.env.BOTS_WORKSHOP_COMPETITION==='1'&&process.env.BOTS_WORKSHOP_JOURNEY==='1'?<WorkshopRules/>:<ClassicRules/>}
