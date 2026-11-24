import {setTimeout as delay} from 'node:timers/promises';

const headers={'User-Agent':'HouseholdUtilities/1.1 (https://github.com/MLewkowicz/household-utilities)',Accept:'application/json'};

// Read the published item representation or just its English sitelink.
// A single reviewed ID per request keeps the payload and failure location explicit.
export async function readItem(url,{fetcher=fetch,sleep=delay,onRequest=()=>{},deadline=Date.now()+8*60_000}={}){
 for(let attempt=1;attempt<=4;attempt++){
  let response,code;
  try{
   response=await fetcher(url,{headers,signal:AbortSignal.timeout(20000)});
   if(response.ok)return {data:await response.json(),etag:response.headers.get('etag')};
  }catch(error){code=error.cause?.code||error.name;}
  const retry=!!code||response.status===429||response.status>=500;
  const value=response?.headers.get('retry-after');
  const retryAfter=value && (Number.isFinite(Number(value))?Number(value)*1000:Date.parse(value)-Date.now());
  const retryDelayMs=Math.max(2000*2**(attempt-1),retryAfter||0);
  const detail={url,attempt,batchSize:1,status:response?.status,code,retryDelayMs};
  await onRequest(detail);
  if(!retry||attempt===4)throw new Error(`Wikidata request failed: ${JSON.stringify(detail)}`);
  if(Date.now()+retryDelayMs+20000>=deadline)throw new Error('Wikidata requested a longer pause than the remaining job budget.');
  await sleep(retryDelayMs);
 }
}
