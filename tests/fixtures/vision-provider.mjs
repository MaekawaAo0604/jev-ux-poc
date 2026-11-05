import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
let observedPage,changed=false;
const observe=PublicSitePage.prototype.observe;
PublicSitePage.prototype.observe=async function(...args){observedPage=this.page;return observe.apply(this,args);};
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://ai-gateway.vercel.sh/typesafe/v1/systemone')return original(url,options);
 const body=JSON.parse(options.body);
 assert.equal(new Headers(options.headers).get('TypeSafe-Danger-Zone-Images'),'true');
 assert.equal(body.model,'jev-1.14.0');
 const asset=body.assets[body.state.screenshot??body.state.observations?.[0].screenshot],bytes=Buffer.from(asset.data_base64,'base64');
 const visualInput={sha256:createHash('sha256').update(bytes).digest('hex'),imageHashes:Object.values(body.assets).map(a=>createHash('sha256').update(Buffer.from(a.data_base64,'base64')).digest('hex')),observations:body.state.observations??[],visualMemory:body.state.context?.visualMemory??[]};
 assert.equal(asset.format,'png');assert.equal(bytes.subarray(1,4).toString(),'PNG');
 if(!body.questions.nextAction){
  if(body.questions.completionCoverage)console.log('VISION_REVIEW '+JSON.stringify(visualInput));
  const choices=body.questions.completionCoverage?{completionCoverage:'complete'}:body.questions.relevance?{readability:'readable',relevance:'related'}:{completion:'supported'};
  return Response.json({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{const choice=id.startsWith('visual_note_')?'confirmed':choices[id]??'relevant';assert.ok(Object.hasOwn(q.criteria,choice));return [id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))});
 }
 const context=body.state.context;
 if(process.env.TEST_VISION_NUMBERING==='1'&&context.screen){
  assert.equal(context.visualMemoryStatus,'disabled');assert.deepEqual(context.visualMemory,[]);
  assert.equal(Object.keys(body.assets).length,1);
  console.log('VISION_NUMBERING '+JSON.stringify({elements:context.screen.elements,status:context.visualMemoryStatus}));
  const choice=context.screen.text.includes('Answer')?'done':'e2';
  assert.ok(Object.hasOwn(body.questions.nextAction.criteria,choice));
  return Response.json({model:'jev-1.14.0',answers:{nextAction:{choice,probabilities:Object.fromEntries(Object.keys(body.questions.nextAction.criteria).map(k=>[k,Number(k===choice)]))}}});
 }
 if(context.screen)console.log('VISION_REQUEST '+JSON.stringify(visualInput));
 if(process.env.TEST_VISION_CHANGE==='1'&&!changed){
  changed=true;
  await observedPage.evaluate(()=>{const c=document.querySelector('canvas');const g=c.getContext('2d');g.fillStyle='red';g.fillRect(0,0,c.width,c.height);});
  return new Response('Unavailable',{status:503});
 }
 const criteria=body.questions.nextAction.criteria;
 const choice=process.env.TEST_VISION_FRONTIER_VETO==='1'&&context.targets?'stuck':process.env.TEST_VISION_BRANCH==='1'?(context.targets?Object.keys(context.targets).find(id=>context.targets[id].label.includes('Other route')):context.screen.text.includes('Condition B')?'done':context.screen.text.includes('Dead end')?'stuck':context.screen.elements.find(e=>e.text==='First route').id):context.targets?Object.keys(context.targets)[0]:process.env.TEST_VISION_FORCE_STUCK==='1'?'stuck':context.screen.text.includes('Condition B')?'done':'scroll_down';
 assert.ok(Object.hasOwn(criteria,choice));
 return Response.json({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{const selected=id==='nextAction'?choice:'confirmed';return [id,{type:'choice',choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))});
};
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],doEvaluate:async({questions})=>({answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=id==='completion'?'supported':'relevant';assert.ok(Object.hasOwn(q.criteria,choice));return [id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];})),warnings:[]})})};
