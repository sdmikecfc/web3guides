'use strict';
const {assertPublicationSourceUnchanged}=require('./publication-source-check.cjs');
const {progressivePublication}=require('./progressive-publication.cjs');
// Before the first write, recheck the facts used by the completed scan. The
// exact fresh fingerprint is still tested inside SQL's atomic transaction.
// Retry only a known atomic rejection; an uncertain response may have written.
async function startPublication({snapshot,packet,accountCoverage,rpc,report={}}){
 for(let attempt=0;attempt<3;attempt++){
  const current=await rpc('mkz_worker_snapshot');
  const fingerprint=assertPublicationSourceUnchanged({original:snapshot,current,packet,accountCoverage});
  const publisher=progressivePublication({snapshot:{...snapshot,fingerprint},packet,accountCoverage,rpc});
  try{await publisher.start(report);return publisher;}
  catch(error){if(error?.message!=='WORKER_COMMIT_MK_WORKER_SOURCE_CHANGED'||attempt===2)throw error;}
 }
 throw Error('PUBLICATION_SOURCE_CHANGED');
}
module.exports={startPublication};
