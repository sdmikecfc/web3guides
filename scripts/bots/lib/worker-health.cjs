'use strict';
// A strict operational allowlist: never forward raw errors or private evidence.
function healthPayload(status,report={}){
 const payload={workerVersion:status.workerVersion,phase:status.phase,runStartedAt:status.runStartedAt,updatedAt:status.updatedAt};
 for(const key of ['state','coverageFrom','confirmedThrough','complete','financialComplete','status'])if(report[key]!=null)payload[key]=report[key];
 if(report.counts){payload.counts={};for(const key of ['accounts','wallets','verifiedFills','volumeUsd','strategyFills','agentFills'])if(report.counts[key]!=null)payload.counts[key]=report.counts[key];}
 for(const key of ['problems','accountingProblems'])if(report[key])payload[key]=report[key].slice(0,100).map(x=>({code:/^[A-Z][A-Z0-9_]{2,100}$/.test(x.code)?x.code:'SOURCE_UNAVAILABLE'}));
 if(report.code)payload.code=/^[A-Z][A-Z0-9_]{2,100}$/.test(report.code)?report.code:'WORKER_FAILED';
 if(typeof report.scoreWrites==='boolean')payload.scoreWrites=report.scoreWrites;
 return payload;
}
module.exports={healthPayload};
