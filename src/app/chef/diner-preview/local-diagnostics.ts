type Diagnostic={kind:'blocked-action'|'onboarding'|'service'|'frame';at:number;details:Record<string,string|number|boolean>};
const samples:Diagnostic[]=[];
/** Session-local, bounded diagnostics. No account IDs, network or analytics SDK. */
export function recordLocalDiagnostic(kind:Diagnostic['kind'],details:Diagnostic['details']){
  const last=samples.at(-1),now=Date.now();
  if(kind==='frame'&&samples.some(sample=>sample.kind==='frame'&&now-sample.at<10000))return;
  if(kind!=='blocked-action'&&last?.kind===kind&&JSON.stringify(last.details)===JSON.stringify(details))return;
  samples.push({kind,at:now,details});if(samples.length>120)samples.shift();
}
export function readLocalDiagnostics(){return samples.map(sample=>({...sample,details:{...sample.details}}));}
export function clearLocalDiagnostics(){samples.length=0;}
export function repeatedBlockedAction(now=Date.now()){
 const last=samples.filter(s=>s.kind==='blocked-action'&&now-s.at<=30000).at(-1);
 return last&&samples.filter(s=>s.kind==='blocked-action'&&now-s.at<=30000&&s.details.target===last.details.target&&s.details.reason===last.details.reason).length>=3?last.details:null;
}
