// A soft target for the observation array, not a provider-size guarantee.
// Complete pages stay together so a legend cannot be detached from its rows.
// Shared accepted evidence and questions remain additional request bytes.
export function contradictionBatches<T extends {pageId?:string;legacyFrame?:number}>(blocks:T[]):T[][]{
 const pages=new Map<string,T[]>();
 blocks.forEach((block,index)=>{
  const key=block.pageId?JSON.stringify(['page',block.pageId]):block.legacyFrame!==undefined?JSON.stringify(['frame',block.legacyFrame]):JSON.stringify(['unknown',index]);
  const page=pages.get(key)??[];page.push(block);pages.set(key,page);
 });
 const batches:T[][]=[];let batch:T[]=[],bytes=2;
 // Map order is first page appearance; each page retains its observed order.
 for(const page of pages.values()){
  const pageBytes=Buffer.byteLength(JSON.stringify(page),'utf8')-2;
  if(batch.length&&bytes+1+pageBytes>16000){batches.push(batch);batch=[];bytes=2;}
  bytes+=pageBytes+(batch.length?1:0);batch.push(...page);
 }
 // An oversized page (including a single oversized block) stays intact.
 if(batch.length||!batches.length)batches.push(batch);
 return batches;
}
