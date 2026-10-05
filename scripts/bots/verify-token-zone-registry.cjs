// Read-only discovery: Doma registry + chain calls. Never trades or reads payout balances.
// --apply-reviewed HASH registers the inspected manifest in game-only tables while draft.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createPublicClient,http,parseAbi}=require('viem');
const root=path.resolve(__dirname,'../..'),out='D:/Temp/modelkombat-tracking-review';
const cid='model-kombat-zones-1',USDC='0x31eef89d5215c305304a2fa5376a1f1b6c5dc477',WETH='0x4200000000000000000000000000000000000006',FACTORY='0x2e50b586d5bcd04cb6125e028a6a669f7f3cf1c2';
const rewards=[['USDC','1000',5000],['DEPIN.ai','3304.58',25000],['ALERT.ai','968.60',50000],['BRAG.com','3440.80',100000],['INVESTORS.xyz','13966.48',175000],['RIDES.com','3543.22',250000],['BONER.com','2261.22',400000],['GOCHUJANG.com','619.06',550000],['SOFTWARE.ai','2437.97',750000]];
const address=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const file=path.join(out,'verified-registry.json');
async function apply(expected){
 const m=JSON.parse(fs.readFileSync(file,'utf8'));
 if(hash(m)!==expected||Date.now()-Date.parse(m.checkedAt)>3600000||m.assets.length!==9||!m.markets.length)throw Error('Inspect a fresh complete manifest before applying its exact SHA-256.');
 require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('Configuration unavailable.');}});
 const db=require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const draft=async()=>{const r=await db.from('mkz_campaigns').select('state,starts_at,ends_at').eq('id',cid).single();if(r.error||r.data.state!=='draft'||r.data.starts_at||r.data.ends_at)throw Error('Registry setup only runs against the undated draft.');};
 await draft();
 // Never overwrite a different pre-existing identity, quantity or threshold.
 const prior=await db.from('mkz_reward_assets').select('*');if(prior.error)throw Error('Reward registry unavailable.');
 for(const a of m.assets){const p=prior.data.find(x=>x.symbol===a.symbol);if(p&&['chain_id','address','decimals','required_quantity','threshold'].some(k=>String(p[k])!==String(a[k])&&!(k==='required_quantity'&&Number(p[k])===Number(a[k]))))throw Error('Existing reward definition differs: '+a.symbol);}
 await draft();
 // Leave old funding observations intact; zero for new definitions means unobserved, not prefunded.
 const assets=m.assets.map(a=>({...a,funded_units:String(prior.data.find(p=>p.symbol===a.symbol)?.funded_units??'0')}));
 let r=await db.from('mkz_reward_assets').upsert(assets,{onConflict:'symbol'});if(r.error)throw Error('Reward definitions rejected: '+r.error.code);
 for(let i=0;i<m.markets.length;i+=200){await draft();r=await db.from('mkz_markets').upsert(m.markets.slice(i,i+200),{onConflict:'chain_id,domain_token,quote_token'});if(r.error)throw Error('Market registry rejected: '+r.error.code);}
 await draft();
 const method='mk-fifo-realized-capital-1';
 const config=await db.from('mkz_campaigns').select('financial_method').eq('id',cid).single();
 if(config.error||(config.data.financial_method&&config.data.financial_method!==method))throw Error('An existing financial method needs separate review.');
 if(!config.data.financial_method){r=await db.from('mkz_campaigns').update({financial_method:method}).eq('id',cid).eq('state','draft').is('financial_method',null).select('id');if(r.error||r.data.length!==1)throw Error('Draft method configuration changed concurrently.');}
 await draft();
 console.log(JSON.stringify({registeredRewards:assets.length,registeredMarkets:m.markets.length,financialMethod:method,campaignState:'draft',dates:null,balancesRead:false,tradesMade:0,manifestSha256:expected}));
}
async function discover(){
 // Only extract the two read-only API settings. No Reporter module is executed.
 let url=process.env.DOMA_API_URL,key=process.env.DOMA_API_KEY;
 if(!key){const arg=process.argv.indexOf('--doma-env');if(arg<0)throw Error('Provide existing DOMA_API_KEY or --doma-env PATH.');const raw=fs.readFileSync(process.argv[arg+1],'utf8'),read=k=>raw.match(new RegExp('^'+k+'=(.*)$','m'))?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');url=read('DOMA_API_URL');key=read('DOMA_API_KEY');}
 const endpoint=new URL(url||'https://api.doma.xyz/v1/graphql');if(endpoint.protocol!=='https:'||endpoint.hostname!=='api.doma.xyz'||!key)throw Error('Doma API configuration rejected.');
 async function gql(query){for(let n=0;n<4;n++){const r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Api-Key':key},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});if(r.status===429||r.status>=500){await new Promise(resolve=>setTimeout(resolve,1000*2**n));continue;}if(!r.ok)throw Error('Doma metadata HTTP '+r.status);const p=await r.json();if(p.errors)throw Error('Doma metadata schema rejected: '+p.errors[0].message);return p.data;}throw Error('Doma metadata unavailable after bounded retries.');}
 const all=[];let expected;
 for(let skip=0;skip<10000;skip+=100){const p=(await gql(`{ fractionalTokens(take:100,skip:${skip}) { totalCount items { address status poolAddress priceUsd tvlUsd chain { networkId } params { name symbol decimals } } } }`)).fractionalTokens;
  if(expected!==undefined&&expected!==p.totalCount)throw Error('Registry changed during pagination; rerun.');expected=p.totalCount;all.push(...p.items);if(all.length===expected)break;if(!p.items.length||all.length>expected)throw Error('Incomplete Doma registry.');}
 if(all.length!==expected||new Set(all.map(t=>t.chain.networkId+':'+t.address.toLowerCase())).size!==all.length)throw Error('Incomplete or duplicate registry.');
 const tokens=all.filter(t=>t.chain.networkId==='eip155:97477'&&address(t.address)&&['GRADUATION_SUCCESSFUL','FRACTIONALIZED'].includes(t.status)&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(t.params.name));
 // Public RPC has a small burst allowance. Serialize reads instead of flooding it.
 let queue=Promise.resolve();
 const pacedFetch=(...args)=>{const job=queue.then(async()=>{await new Promise(r=>setTimeout(r,750));return fetch(...args);});queue=job.then(()=>undefined,()=>undefined);return job;};
 const client=createPublicClient({transport:http('https://rpc.doma.xyz',{timeout:30000,retryCount:3,retryDelay:1500,fetchFn:pacedFetch})});if(await client.getChainId()!==97477)throw Error('Wrong chain.');
 const block=await client.getBlock({blockTag:'finalized'}),checkedAt=new Date().toISOString();
 const erc=parseAbi(['function decimals() view returns (uint8)','function symbol() view returns (string)','function name() view returns (string)']);
 const poolAbi=parseAbi(['function token0() view returns (address)','function token1() view returns (address)','function fee() view returns (uint24)','function liquidity() view returns (uint128)']);
 const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns (address)']);
 const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber:block.number});
 const metadata=async address=>{const [decimals,symbol,name,code]=await Promise.all([read(address,erc,'decimals'),read(address,erc,'symbol'),read(address,erc,'name'),client.getCode({address,blockNumber:block.number})]);if(!code||code==='0x')throw Error('Missing token contract');return {address,decimals:Number(decimals),symbol,name};};
 const quotes=await Promise.all([metadata(USDC),metadata(WETH)]);if(quotes[0].decimals!==6||quotes[1].decimals!==18||quotes[1].symbol!=='WETH'||!/^USDC(?:\.e)?$/.test(quotes[0].symbol))throw Error('Unexpected quote-token identity.');
 const assets=[],proofs=[];
 for(const [symbol,quantity,threshold] of rewards.slice(1)){
  const matches=tokens.filter(t=>t.params.name.toLowerCase()===symbol.toLowerCase()&&t.status==='GRADUATION_SUCCESSFUL'&&address(t.poolAddress));
  // Never pick by first ticker hit, liquidity size, or a fuzzy name.
  if(matches.length!==1)throw Error('Reward identity needs review: '+symbol+' has '+matches.length+' graduated matches.');
  const t=matches[0],contract=t.address.toLowerCase(),pool=t.poolAddress.toLowerCase(),meta=await metadata(contract);
  if(meta.decimals!==t.params.decimals||meta.name.toLowerCase()!==symbol.toLowerCase()||meta.symbol.toLowerCase()!==symbol.toLowerCase())throw Error('Reward metadata mismatch: '+symbol);
  const [a,b,fee,liquidity]=await Promise.all(['token0','token1','fee','liquidity'].map(fn=>read(pool,poolAbi,fn)));
  const legs=[a.toLowerCase(),b.toLowerCase()],quote=legs.find(v=>v!==contract);
  if(!legs.includes(contract)||![USDC,WETH].includes(quote)||liquidity<=0n)throw Error('Reward pool is not liquid against a supported quote: '+symbol);
  if((await read(FACTORY,factoryAbi,'getPool',[a,b,fee])).toLowerCase()!==pool)throw Error('Reward pool not from official factory: '+symbol);
  assets.push({symbol,chain_id:97477,address:contract,decimals:meta.decimals,funded_units:'0',required_quantity:quantity,threshold,liquid_pair:pool,verified_at:checkedAt,price_usd:typeof t.priceUsd==='number'&&t.priceUsd>0?String(t.priceUsd):null,price_at:typeof t.priceUsd==='number'&&t.priceUsd>0?checkedAt:null});
  proofs.push({symbol,address:contract,pool,quote,fee,activeLiquidity:liquidity.toString(),metadata:meta});
 }
 const stablePool=proofs.find(p=>p.quote===USDC);if(!stablePool)throw Error('No verified liquid USDC reward market.');
 assets.unshift({symbol:'USDC',chain_id:97477,address:USDC,decimals:6,funded_units:'0',required_quantity:'1000',threshold:5000,liquid_pair:stablePool.pool,verified_at:checkedAt,price_usd:null,price_at:null});
 const markets=tokens.flatMap(t=>[[USDC,'USDC'],[WETH,'ETH']].map(([quote_token,quote_kind])=>({chain_id:97477,domain_token:t.address.toLowerCase(),quote_token,quote_kind,domain_name:t.params.name,evidence:`Doma fractionalTokens mainnet registry ${checkedAt}; status ${t.status}; recognized quote ${quote_token}. Direct or routed economic fills require independent completed-trade evidence.`,verified_at:checkedAt})));
 const result={schemaVersion:1,checkedAt,chainId:97477,blockNumber:block.number.toString(),blockHash:block.hash,source:'https://api.doma.xyz/graphql',quoteReference:'https://github.com/d3-inc/doma-skill/blob/main/references/chains.md',catalogueRows:all.length,eligibleDomains:tokens.length,quoteTokens:quotes,assets,markets,proofs,fundingPolicy:'organizer funds earned awards at payout; no balance checks performed'};
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2));
 console.log(JSON.stringify({file,sha256:hash(result),block:result.blockNumber,catalogueRows:all.length,eligibleDomains:tokens.length,markets:markets.length,rewardAssets:assets.map(a=>({symbol:a.symbol,address:a.address,decimals:a.decimals,quantity:a.required_quantity,pair:a.liquid_pair})),quoteTokens:quotes,balancesRead:false},null,2));
}
const index=process.argv.indexOf('--apply-reviewed');(index>=0?apply(process.argv[index+1]):discover()).catch(e=>{console.error(e.shortMessage||e.message);if(e.details)console.error(e.details);process.exitCode=1;});
