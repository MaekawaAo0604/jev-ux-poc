import assert from 'node:assert/strict';
const original=globalThis.fetch;let retried=false;
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://ai-gateway.vercel.sh/typesafe/v1/systemone')return original(url,options);
 const body=JSON.parse(options.body),context=body.state.context;
 assert.ok(!JSON.stringify(body.state).includes('DOM_SENTINEL'),'DOM state leaked');
 assert.ok(!JSON.stringify(body.questions).includes('DOM_SENTINEL'),'DOM criteria leaked');
 if(context){
  assert.equal(context.observationMode,'image-only');
  assert.equal(Object.keys(body.assets).length,1);
  console.log('IMAGE_ONLY_REQUEST '+JSON.stringify({context,questions:body.questions,observations:body.state.observations,imageCount:Object.keys(body.assets).length}));
  if(!retried){retried=true;return new Response('Retry once',{status:503});}
 }
 const choice=body.questions.completionCoverage?'complete':body.questions.readability?undefined:process.env.TEST_IMAGE_ONLY_NOOP==='1'?(context.history.length||!body.questions.nextAction.criteria.e1?'stuck':'e1'):context?.targets?Object.keys(context.targets).find(id=>context.targets[id].travelSteps===1):context?.history.length>=3?'done':context?.history.length===1?'stuck':Object.keys(body.questions.nextAction?.criteria??{}).find(id=>/^e\d+$/.test(id));
 return Response.json({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{
  const selected=choice??(id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'supported':'relevant');
  assert.ok(Object.hasOwn(q.criteria,selected),`Unavailable choice ${selected}`);
  return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];
 }))});
};
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>{throw new Error('DOM audit must not run in image-only mode');}};
