import assert from 'node:assert/strict';
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://ai-gateway.vercel.sh/typesafe/v1/systemone')return original(url,options);
 const body=JSON.parse(options.body),c=body.state.context;
 assert.ok(!JSON.stringify(body.state).includes('DOM_SENTINEL'));assert.ok(!JSON.stringify(body.questions).includes('DOM_SENTINEL'));
 let action;
 if(c){
  const proof=!!process.env.TEST_IMAGE_MEMORY_PROOF&&!!body.questions.completionCoverage;
  assert.equal(c.observationMode,'image-only');assert.ok(c.imageJudgments);assert.equal(Object.keys(body.assets).length,proof?2:1);
  if(proof){
   assert.deepEqual(body.state.observations.map(s=>s.id),['v4','v3']);
   for(const s of body.state.observations)assert.ok(body.assets[s.screenshot]);
   assert.equal(c.imageJudgments.routes.length,0);
  }
  if(c.targets){
   const remembered=c.imageJudgments.routes.find(r=>r.assessment==='promising'&&c.targets[r.targetId]);
   assert.ok(remembered,'remote selection must receive the prior image relevance, not a DOM label');action=remembered.targetId;
   console.log('MEMORY_ROUTE '+JSON.stringify({targetId:action,source:c.imageJudgments.sources[remembered.source.reference]}));
  }else action=c.history.length===0?'e1':c.history.length===1?'stuck':c.history.length>=3?(process.env.TEST_IMAGE_MEMORY_EAGER?'back':'done'):Object.keys(body.questions.nextAction?.criteria??{}).find(id=>/^e\d+$/.test(id));
 }
 return Response.json({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{
  const choice=id==='image_check_0'?(c.history.length===0||c.history.length===2?'observed':'not_shown'):id==='image_check_1'?(c.history.length>=3?'observed':'not_shown'):id.startsWith('image_route_')?(id==='image_route_f2'?'promising':'unrelated'):id==='nextAction'?action:id==='completionCoverage'?'complete':id==='completionBoundary'?'closed':id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'supported':'relevant';
  assert.ok(Object.hasOwn(q.criteria,choice),`Invalid test choice ${choice} for ${id}`);
  return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
 }))});
};
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>{throw new Error('DOM audit forbidden');}};
