import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {GET} from '../src/app/api/chef/share-image/route';
import {kitchenMetadata,KITCHEN_SITE,KITCHEN_SHARE_IMAGE} from '../src/lib/chef/site-metadata';

(async()=>{
  assert.equal(kitchenMetadata.metadataBase?.href,`${KITCHEN_SITE}/`);
  assert.equal(kitchenMetadata.openGraph?.siteName,'Domain Kitchen');
  assert(!JSON.stringify(kitchenMetadata).includes('Web3Guides'));
  assert(KITCHEN_SHARE_IMAGE.startsWith(`${KITCHEN_SITE}/api/`));
  const response=await GET(),png=Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  if(process.env.DK_SHARE_REVIEW==='1')writeFileSync('D:/Temp/domain-kitchen-share-preview.png',png);
  console.log(`PASS dedicated Kitchen metadata and public 1200×630 PNG (${png.length} bytes), no wallet or remote assets required.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
