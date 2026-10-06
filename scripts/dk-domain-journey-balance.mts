import {DOMAIN_IDS} from '../src/lib/chef/diner/domain-worlds';
import {domainService} from '../src/lib/chef/diner/domain-journeys';
import {dispatchService} from '../src/lib/chef/diner/service';
import {Cook} from './dk-diner-cook-fixture';
const seeds=Number(process.env.DK_SEEDS??100),result=[];
for(const domain of DOMAIN_IDS)for(const [completed,kind] of [[0,'medium'],[7,'finale']] as const){
 let cleared=0,served=0,missed=0,totalTicks=0;const failures=[];
 for(let seed=0;seed<seeds;seed++){
  let s=domainService(domain,`calibration-${seed}`,completed,kind,{},true);
  const cook=new Cook(()=>s,a=>{s=dispatchService(s,a);},20);
  try{cook.send({type:'prepare'});cook.run(true);cleared++;}catch(e){failures.push({seed,phase:s.phase,served:s.served,notice:s.notice,error:(e as Error).message});}
  served+=s.served;missed+=s.missed;totalTicks+=s.tick;
 }
 const row={domain,profile:kind,seeds,cleared,completion:cleared/seeds,served,missed,meanSeconds:Math.round(totalTicks/seeds/20),failures:failures.slice(0,5)};result.push(row);console.log(JSON.stringify(row));
}
if(result.some(r=>r.completion<.95))process.exitCode=1;
