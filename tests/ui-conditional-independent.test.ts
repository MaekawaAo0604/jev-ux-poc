import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createSampler,replaySelection,InvalidDistributionError} from '../jev/virtual-beta/selection.js';
import type {BetaAction,BetaCandidates,SelectionRecord} from '../jev/virtual-beta/contracts.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {sha} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {reasonComparisonPlan,analyzeReasonRuns,runDeferralReasonExperiment,snapshotReasonPriorLedgers} from '../runner/deferral-reason-experiment.js';

// Independent audit never loads an env file or calls a real gateway.
process.env.AI_GATEWAY_API_KEY='INDEPENDENT_UI_CONDITIONAL_DUMMY';
process.loadEnvFile=()=>{throw Error('ENV_FILE_READ_FORBIDDEN');};
const before=await sourceIdentity();
const output=resolve('reports/notification-switch-2026-10-29/independent-'+Date.now()+'-'+process.pid);
await mkdir(output,{recursive:true});
const evidence:Record<string,any>={sourceBefore:before,externalAPIRequests:0,output,tests:[]};
async function gate(){assert.deepEqual(await sourceIdentity(),before,'Source changed: stop audit and notify parent');}
after(async()=>{
 const sourceAfter=await sourceIdentity();
 await writeFile(join(output,'audit.json'),JSON.stringify({...evidence,sourceAfter,sourceUnchanged:JSON.stringify(before)===JSON.stringify(sourceAfter)},null,2));
 assert.deepEqual(sourceAfter,before,'Product source remains frozen throughout independent audit');
});
test('independent source is portable by default, with explicit optional historical pin',async()=>{
 const pin=process.env.UI_CONDITIONAL_AUDIT_PIN;
 if(pin){const expected=JSON.parse(await readFile(pin,'utf8'));assert.equal(before.revision,expected.revision);assert.equal(before.sourceHash,expected.sourceHash);}
 assert.match(before.sourceHash,/^[a-f0-9]{64}$/);
});
function candidate(action:BetaAction):any{return {action,get label(){throw Error('SEMANTIC_LABEL_MUST_NOT_BE_READ');}};}
const close=(actual:number,expected:number,msg='')=>assert.ok(Math.abs(actual-expected)<2e-14,msg+': '+actual+' != '+expected);
const draw=(seed:number,index=0)=>createHash('sha256').update('jev-virtual-beta-selection:v1:'+seed+':'+index).digest().readUInt32BE(0)/4294967296;
function pick(p:Record<string,number>,q:number|null){const keys=Object.keys(p).sort();if(q===null)return keys.reduce((a,b)=>p[b]>p[a]?b:a);let c=0;for(const k of keys){c+=p[k];if(q<c)return k;}return keys.filter(k=>p[k]>0).at(-1)!;}
function probability(raw:Record<string,number>,excluded:Record<string,string>={}){
 const total=Object.values(raw).reduce((a,b)=>a+b,0),safe=Object.fromEntries(Object.keys(raw).sort().map(k=>[k,excluded[k]?0:raw[k]/total]));
 const surviving=Object.values(safe).reduce((a,b)=>a+b,0);return Object.fromEntries(Object.entries(safe).map(([k,v])=>[k,v/surviving]));
}
function oracle(raw:Record<string,number>,cs:BetaCandidates,weights:Record<string,number>,seed:number,mode:'argmax'|'sample',excluded:Record<string,string>={}){
 const before=probability(raw,excluded),keys=Object.keys(before),q=mode==='sample'?draw(seed):null,baseline=pick(before,q);
 const ui=keys.filter(k=>['click','back','scroll'].includes(cs[k].action.type)),mass=ui.reduce((n,k)=>n+before[k],0),wmass=ui.reduce((n,k)=>n+before[k]*weights[k],0);
 const marginal=Object.fromEntries(keys.map(k=>[k,ui.includes(k)?before[k]*weights[k]/wmass*mass:before[k]]));
 let conditionalDraw:number|null=null,selected=baseline,filtered:Record<string,number>;
 if(!ui.includes(baseline))filtered=Object.fromEntries(keys.map(k=>[k,Number(k===baseline)]));
 else{
  filtered=Object.fromEntries(keys.map(k=>[k,ui.includes(k)?before[k]*weights[k]/wmass:0]));
  if(q!==null){let allPrefix=0,uiPrefix=0;for(const k of keys){if(k===baseline)break;allPrefix+=before[k];if(ui.includes(k))uiPrefix+=before[k];}conditionalDraw=(uiPrefix+q-allPrefix)/mass;}
  selected=pick(filtered,conditionalDraw);
 }
 return {before,baseline,ui,mass,wmass,marginal,conditionalDraw,filtered,selected,q};
}
const mixed:BetaCandidates={
 a:candidate({type:'click',elementId:'secret-route'}),b:candidate({type:'stuck'}),
 c:candidate({type:'scroll',direction:'down'}),d:candidate({type:'done'}),
 e:candidate({type:'back'}),f:candidate({type:'look',point:{x:10,y:20}}),
 g:candidate({type:'reread'}),h:candidate({type:'wait'}),i:candidate({type:'abandon'})
};
const mixedRaw={a:.43,b:.09,c:.1,d:.08,e:.09,f:.06,g:.05,h:.05,i:.05};
const mixedWeights={a:.01,b:1,c:.4,d:1,e:1,f:1,g:1,h:1,i:1};
test('independent malformed action shapes reject before consuming counter',()=>{
 const invalid=[
  {type:'click'}, {type:'click',elementId:''}, {type:'click',elementId:3},
  {type:'scroll',direction:'sideways'}, {type:'scroll'},
  {type:'look',point:{x:Number.NaN,y:2}}, {type:'look',point:{x:-1,y:2}},
  {type:'look',point:{x:1,y:Infinity}}, {type:'look'}, {type:'mystery'}, null
 ];
 const failures:any[]=[];
 for(const action of invalid){
  const sampler=createSampler({mode:'sample',seed:7});
  let accepted=false;try{sampler.select('x',{x:1},{x:{action,label:'x'}} as any,{},{x:1},'ui-conditional');accepted=true;}catch(error){assert.ok(error instanceof InvalidDistributionError);}
  const next=sampler.select('x',{x:1},{x:{action:{type:'click',elementId:'x'},label:'x'}},{},{x:1},'ui-conditional');
  if(accepted||next.drawIndex!==0)failures.push({action,accepted,nextDrawIndex:next.drawIndex});
 }
 evidence.malformedActionFailures=failures;
 assert.deepEqual(failures,[],'Malformed action shape must fail without consuming a sampler draw');
});
test('independent actual types override deceptive IDs and labels; legacy global golden behavior stays exact',()=>{
 const cs:BetaCandidates={stuck:candidate({type:'click',elementId:'e2'}),e1:candidate({type:'stuck'}),done:candidate({type:'back'}),abandon:candidate({type:'scroll',direction:'up'})};
 const raw={stuck:.86,e1:.07,done:.04,abandon:.03},weights={stuck:.01,e1:1,done:1,abandon:1};
 const legacy=createSampler({mode:'argmax',seed:20261028}).select('stuck',raw,cs,{},weights);
 const explicit=createSampler({mode:'argmax',seed:20261028}).select('stuck',raw,cs,{},weights,'global');
 assert.deepEqual(legacy,explicit);assert.equal(legacy.selected,'e1');assert.equal(legacy.policy!.scope,undefined);
 const expectedTotal=.03+.04+.07+.86*.01;
 assert.deepEqual(legacy.policy!.before,probability(raw));
 assert.equal(legacy.policy!.weightedTotal,expectedTotal);
 for(const k of Object.keys(raw))close(legacy.filtered[k],raw[k as keyof typeof raw]*weights[k as keyof typeof weights]/expectedTotal);
 const next=createSampler({mode:'argmax',seed:20261028}).select('stuck',raw,cs,{},weights,'ui-conditional');
 assert.equal(next.selected,'done');assert.equal(next.policy!.scope!.baselineSelected,'stuck');
 assert.deepEqual(next.policy!.scope!.uiCandidates,['abandon','done','stuck']);
 assert.equal(next.policy!.scope!.marginal.e1,.07);
 assert.deepEqual(replaySelection(next,cs),next);
});
test('independent oracle verifies 512 sample seeds and both argmax outcomes, raw choice distinct from sampler choice',()=>{
 let preserved=0,uiCount=0;
 for(const mode of ['argmax','sample'] as const)for(let seed=0;seed<(mode==='sample'?512:2);seed++){
  const excluded:Record<string,string>=seed%3===0?{c:'OUTSIDE_CLEAR_REGION'}:{};
  const expected=oracle(mixedRaw,mixed,mixedWeights,seed,mode,excluded);
  const record=createSampler({mode,seed}).select('i',mixedRaw,mixed,excluded,mixedWeights,'ui-conditional'),scope=record.policy!.scope!;
  assert.equal(record.modelChoice,'i');assert.equal(record.selected,expected.selected,'seed '+seed);
  assert.equal(record.draw,expected.q);assert.equal(record.drawIndex,0);assert.equal(scope.baselineSelected,expected.baseline);
  assert.deepEqual(scope.uiCandidates,expected.ui);close(scope.uiMass,expected.mass);close(scope.weightedUIMass,expected.wmass);
  for(const key of Object.keys(mixed)){close(scope.marginal[key],expected.marginal[key],key);close(record.filtered[key],expected.filtered[key],key);}
  close(expected.ui.reduce((s,k)=>s+scope.marginal[k],0),expected.mass);
  if(scope.baselineClass==='non-ui'){preserved++;assert.equal(record.selected,expected.baseline);assert.equal(scope.conditionalDraw,null);}
  else{uiCount++;if(mode==='sample')close(scope.conditionalDraw!,expected.conditionalDraw!);}
  assert.deepEqual(replaySelection(record,mixed),record);
  assert.deepEqual(record.policy!.before,expected.before);
 }
 assert.ok(preserved>100);assert.ok(uiCount>100);evidence.seedSweep={seeds:512,preservedNonUI:preserved,baselineUI:uiCount};
});
test('independent each non-UI type preserves raw baseline in argmax and sampled occurrence',()=>{
 for(const type of ['done','stuck','abandon','look','reread','wait'] as const){
  const action=type==='look'?{type,point:{x:0,y:0}}:{type};
  const cs:BetaCandidates={a:candidate({type:'click',elementId:'a'}),b:candidate(action as BetaAction),c:candidate({type:'back'})};
  const raw={a:.1,b:.8,c:.1},weights={a:.01,b:1,c:1};
  for(const mode of ['argmax','sample'] as const)for(let seed=0;seed<24;seed++){
   const plain=createSampler({mode,seed}).select('a',raw,cs),next=createSampler({mode,seed}).select('a',raw,cs,{},weights,'ui-conditional');
   assert.equal(next.policy!.scope!.baselineSelected,plain.selected);
   assert.equal(next.policy!.scope!.marginal.b,.8);
   if(plain.selected==='b'){assert.equal(next.selected,'b');assert.deepEqual(next.filtered,{a:0,b:1,c:0});}
  }
 }
});
test('independent exact CDF endpoints map to next interval and same UI quantile without extra draw',()=>{
 for(const seed of [0,1,7,44,20261028]){
  const q=draw(seed),s=createSampler({mode:'sample',seed});
  const cs:BetaCandidates={a:candidate({type:'stuck'}),b:candidate({type:'click',elementId:'b'}),c:candidate({type:'back'})};
  const raw={a:q,b:(1-q)/2,c:(1-q)/2},w={a:1,b:.01,c:1};
  const r=s.select('b',raw,cs,{},w,'ui-conditional');
  assert.equal(r.draw,q);assert.equal(r.policy!.scope!.baselineSelected,'b');assert.equal(r.policy!.scope!.conditionalDraw,0);assert.equal(r.selected,'b');
  assert.equal(s.select('b',raw,cs,{},w,'ui-conditional').draw,draw(seed,1));
  const reversed:BetaCandidates={a:candidate({type:'click',elementId:'a'}),b:candidate({type:'wait'}),c:candidate({type:'back'})};
  const p=createSampler({mode:'sample',seed}).select('a',raw,reversed,{},{a:.01,b:1,c:1},'ui-conditional');
  assert.equal(p.policy!.scope!.baselineSelected,'b');assert.equal(p.selected,'b');assert.equal(p.policy!.scope!.conditionalDraw,null);
 }
});
test('independent invalid scope weights exclusions raw and underflow reject with no counter use; filter is explicit',()=>{
 const cases=[
  {scope:'unknown'}, {weights:undefined},
  {weights:{...mixedWeights,b:.5}}, {weights:{...mixedWeights,a:0}},
  {weights:{...mixedWeights,a:NaN}}, {weights:{...mixedWeights,a:Infinity}},
  {weights:{...mixedWeights,a:2}}, {weights:{...mixedWeights,a:Number.MIN_VALUE}},
  {raw:{...mixedRaw,a:-1}}, {raw:{...mixedRaw,a:NaN}}, {raw:{...mixedRaw,a:.9}},
  {excluded:{z:'unknown'}},{excluded:{a:''}},
  {excluded:Object.fromEntries(Object.keys(mixed).map(k=>[k,'BLOCKED']))}
 ];
 for(const change of cases){
  const args:any={raw:mixedRaw,weights:mixedWeights,excluded:{},scope:'ui-conditional',...change};
  const sampler=createSampler({mode:'sample',seed:13});
  assert.throws(()=>sampler.select('a',args.raw,mixed,args.excluded,args.weights,args.scope),InvalidDistributionError);
  assert.equal(sampler.select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional').drawIndex,0);
 }
 const filtered=createSampler({mode:'argmax',seed:0}).select('a',mixedRaw,mixed,{a:'SAFETY_BLOCKED'},mixedWeights,'ui-conditional');
 assert.equal(filtered.policy!.before.a,0);assert.equal(filtered.policy!.scope!.marginal.a,0);assert.equal(filtered.filtered.a,0);
 assert.deepEqual(filtered.adjustments,[{candidate:'a',reason:'SAFETY_BLOCKED'}]);assert.notEqual(filtered.selected,'a');
 close(filtered.normalization.filteredTotal,.57);
});
test('independent no-UI, zero-UI, all-UI, ties and independent sampler instances',()=>{
 for(const mode of ['argmax','sample'] as const){
  const none:BetaCandidates={a:candidate({type:'done'}),b:candidate({type:'wait'})};
  const r=createSampler({mode,seed:8}).select('a',{a:.5,b:.5},none,{},{a:1,b:1},'ui-conditional');
  assert.equal(r.policy!.scope!.uiMass,0);assert.deepEqual(r.policy!.scope!.marginal,{a:.5,b:.5});
  assert.equal(r.selected,createSampler({mode,seed:8}).select('a',{a:.5,b:.5},none).selected);
  const zero:BetaCandidates={...none,c:candidate({type:'back'})};
  assert.equal(createSampler({mode,seed:8}).select('a',{a:.5,b:.5,c:0},zero,{},{a:1,b:1,c:.01},'ui-conditional').policy!.scope!.uiMass,0);
  const all:BetaCandidates={a:candidate({type:'back'}),b:candidate({type:'scroll',direction:'up'})};
  const a=createSampler({mode,seed:8}).select('a',{a:.5,b:.5},all,{},{a:.01,b:.4},'ui-conditional');
  const b=createSampler({mode,seed:8}).select('a',{a:.5,b:.5},all,{},{a:.01,b:.4});
  assert.equal(a.selected,b.selected);assert.deepEqual(a.filtered,b.filtered);assert.equal(a.policy!.scope!.conditionalDraw,a.draw);
 }
 const cfg={mode:'sample' as const,seed:5},one=createSampler(cfg),two=createSampler(cfg);cfg.seed=9;
 const record=one.select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional');one.select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional');
 assert.deepEqual(record,two.select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional'));
 record.policy!.scope!.uiCandidates.push('b');record.policy!.weights.a=1;
 assert.equal(two.select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional').policy!.weights.a,.01);
});
test('independent replay rejects forged class group baseline marginal and actual candidate type',()=>{
 const original=createSampler({mode:'sample',seed:5}).select('a',mixedRaw,mixed,{},mixedWeights,'ui-conditional');
 const mutations=[
  (r:SelectionRecord)=>{r.policy!.scope!.baselineSelected='i';},
  (r:SelectionRecord)=>{r.policy!.scope!.baselineClass=r.policy!.scope!.baselineClass==='ui'?'non-ui':'ui';},
  (r:SelectionRecord)=>{r.policy!.scope!.uiCandidates.push('i');},
  (r:SelectionRecord)=>{r.policy!.scope!.uiCandidates.reverse();},
  (r:SelectionRecord)=>{r.policy!.scope!.marginal.i=.99;},
  (r:SelectionRecord)=>{r.policy!.scope!.conditionalDraw=.123;},
  (r:SelectionRecord)=>{r.draw=.123;},
  (r:SelectionRecord)=>{delete r.policy!.scope;},
  (r:SelectionRecord)=>{r.selected='i';}
 ];
 for(const mutate of mutations){const bad=structuredClone(original);mutate(bad);assert.throws(()=>replaySelection(bad,mixed),InvalidDistributionError);}
 const changed={...mixed,a:{action:{type:'done' as const},label:'a'}};
 assert.throws(()=>replaySelection(original,changed),InvalidDistributionError);
});

type Interception={observation:string;stage:string;input:any;questions:any;images:Record<string,string>;response:any};
async function gatewayRun(conditional:boolean){
 await gate();
 const root=join(output,conditional?'conditional-gateway':'legacy-gateway');await mkdir(root);
 const ledger=join(root,'budget.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_UI_CONDITIONAL_STUB',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}));
 const intercepted:Interception[]=[],stubFailures:any[]=[],previousFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  try{
   assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
   assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer INDEPENDENT_UI_CONDITIONAL_DUMMY');
   assert.equal(new Headers(options?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');
   const body=JSON.parse(String(options?.body)),input=body.state,n=Number(input.observation.id.slice(1));
   assert.equal(input.observation.screen,undefined);assert.equal(input.audit,undefined);assert.equal(input.exploration.charter.oracle,undefined);
   assert.ok(!/data-testid|data-holdout|objectiveAssessment|rawScreenshot|regionsOfInterest|selectionScope|baselineSelected/.test(JSON.stringify(input)));
   assert.ok(input.userState.memory.length<=3);assert.ok(input.reasonObservations.length<=1);assert.ok(Object.keys(body.assets).length<=4);
   const images=Object.fromEntries(Object.entries(body.assets).map(([key,asset]:[string,any])=>[key,sha(Buffer.from(asset.data_base64,'base64'))]));
   for(const ref of [...input.memoryObservations,...input.reasonObservations])assert.equal(images[ref.image],ref.imageSha256,'Actual attached memory/reason hash');
   assert.equal(images.current,input.userState.lastObservation.imageSha256,'Actual current input hash');

   const script=['','e4','e4','e2','scroll_down','e2','e4','e2','done'];
   const special:Record<string,number>={back:.03,e1:.01,e2:.86,e3:.02,look_0:.02,look_1:.01,look_2:.01,stuck:.04};
   const answers=Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
    const choice=id==='nextAction'?(script[n]??'done'):id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':
     id==='goalEvidence'||id.startsWith('evidence_')||id==='experienceEvidence'?'o'+n:id.startsWith('effect_')?'neutral':
     id==='experienceProgress'?'neutral':id==='experienceExpectation'?'supported':id==='reasonCaptureCategory'?'unknown':
     id==='reasonCaptureEvidence'?'none':id.endsWith('Grounded')||id.endsWith('Status')?'unknown':'none';
    assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
    return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,id==='nextAction'&&n===7?(special[key]??0):Number(key===choice)]))}];
   }));
   const response={model:'jev-1.14.0',answers};
   intercepted.push({observation:input.observation.id,stage:body.questions.nextAction?'action':'assessment',input,questions:body.questions,images,response});
   return new Response(JSON.stringify(response),{status:200});
  }catch(error){stubFailures.push({message:(error as Error).message,stack:(error as Error).stack});throw error;}
 };
 try{
  const saved=await runHumanJev({out:join(root,'run'),mock:false,phaseBudget:ledger,mode:conditional?'experience-reason-conditional':'experience-reason-grounded',longContext:true});
  await writeFile(join(root,'intercepted.json'),JSON.stringify({intercepted,stubFailures,externalAPIRequests:0},null,2));
  assert.deepEqual(stubFailures,[],'Gateway assertion errors must not be hidden by API_ERROR handling');
  const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8')),budget=JSON.parse(await readFile(ledger,'utf8'));
  assert.equal(manifest.sourceHash,before.sourceHash);assert.equal(manifest.revision,before.revision);assert.equal(manifest.humanInputsRead,false);
  assert.equal(manifest.actualAPIRequests,intercepted.length);assert.equal(budget.used,intercepted.length);
  assert.equal(intercepted.length,saved.result.decisions*2);
  const s=saved.result.steps[6];assert.equal(s.selection!.modelChoice,'e2');assert.equal(s.selection!.raw.e2,.86);assert.equal(s.selection!.policy!.weights.e2,.01);
  assert.equal(saved.result.objectiveAssessment.value,false);assert.equal(saved.result.objectiveSuccess,false);
  if(conditional){
   assert.equal(s.selection!.policy!.scope!.baselineSelected,'e2');assert.equal(s.selection!.selected,'back');assert.equal(s.outcome,'UI_PERFORMED');assert.deepEqual(s.action,{type:'back'});
   assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.steps[7].selection!.selected,'done');
   assert.notEqual(saved.result.steps[7].userState!.lastObservation!.imageSha256,s.userState!.lastObservation!.imageSha256);
  }else{assert.equal(s.selection!.selected,'stuck');assert.equal(saved.result.termination,'STUCK');}
  const replay=await replayDirectory(join(saved.root,'exploration'));assert.equal(replay.verified,true);
  evidence[conditional?'conditionalBrowser':'legacyBrowser']={intercepted:intercepted.length,liveAPIRequests:0,termination:saved.result.termination,objective:saved.result.objectiveAssessment,uiActions:saved.result.uiActions,selection:s.selection,action:s.action,outcome:s.outcome,replay,root:saved.root};
  return {...saved,intercepted};
 }finally{globalThis.fetch=previousFetch;}
}
test('independent normal gateway stub plus real browser reproduces old STUCK to new performed UI without false success',async()=>{
 const old=await gatewayRun(false),next=await gatewayRun(true);
 assert.equal(old.intercepted.length,14);assert.equal(next.intercepted.length,16);
 const mismatches:any[]=[],imageDifferences:any[]=[];
 for(let index=0;index<old.intercepted.length;index++){
  const a=old.intercepted[index],b=next.intercepted[index];
  assert.equal(b.observation,a.observation);assert.equal(b.stage,a.stage);
  assert.deepEqual(Object.keys(b.images),Object.keys(a.images),'Attached asset names/count must remain unchanged');
  // Track actual byte differences explicitly. Map only the SHA values of corresponding
  // attached images for a separate input-contract comparison, including evidence text.
  const hashMapping=Object.fromEntries(Object.keys(a.images).map(key=>[b.images[key],a.images[key]]));
  const mapReferences=(value:unknown):unknown=>{
   if(typeof value==='string'){let mapped=value;for(const [actual,expected] of Object.entries(hashMapping))mapped=mapped.replaceAll(actual,expected);return mapped;}
   if(Array.isArray(value))return value.map(mapReferences);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapReferences(v)]));
   return value;
  };
  assert.deepEqual(mapReferences(b.input),a.input,'No non-image-reference input value may change');
  assert.deepEqual(mapReferences(b.questions),a.questions,'Question wording may differ only in actual attached-image SHA references');
  try{assert.deepEqual(b.input,a.input);assert.deepEqual(b.questions,a.questions);assert.deepEqual(b.images,a.images);}catch{
   mismatches.push({index,observation:a.observation,stage:a.stage,imageHashDifferences:Object.keys(a.images).filter(key=>a.images[key]!==b.images[key]).map(key=>({image:key,old:a.images[key],conditional:b.images[key]}))});
  }
 }
 assert.ok(mismatches.every(m=>m.index>=2),'Initial observation inputs/questions/assets must exactly match');
 const {PNG}=await import('pngjs');
 for(let n=1;n<=7;n++){
  const a=PNG.sync.read(await readFile(join(old.root,'exploration','input-'+n+'.png'))),b=PNG.sync.read(await readFile(join(next.root,'exploration','input-'+n+'.png')));
  assert.equal(b.width,a.width);assert.equal(b.height,a.height);
  let pixels=0,minX=a.width,minY=a.height,maxX=-1,maxY=-1,maxChannelDelta=0;
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4;let different=false;for(let c=0;c<4;c++){const delta=Math.abs(a.data[i+c]-b.data[i+c]);if(delta)different=true;maxChannelDelta=Math.max(maxChannelDelta,delta);}if(different){pixels++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
  imageDifferences.push({observation:'o'+n,pixels,ratio:pixels/(a.width*a.height),bbox:pixels?{minX,minY,maxX,maxY}:null,maxChannelDelta});
 }
 evidence.pairedRawInputEquality={comparedRequests:14,exactEqualRequests:14-mismatches.length,actualRawInputsEqual:mismatches.length===0,mismatches,imageDifferences,limitation:'Later rendered pixels can differ; this never establishes byte-identical image/model input at mismatched requests.'};
 evidence.pairedInputContractComparison={passed:true,requests:14,method:'Corresponding attached-image SHA references explicitly mapped; all other input values, question wording, asset names and counts compared exactly',exactInputEqualityClaim:false};
 const dir=join(next.root,'exploration'),path=join(dir,'result.json'),bytes=await readFile(path),original=JSON.parse(bytes.toString());
 const mutations=[
  ['actual action',(r:any)=>{r.steps[6].action={type:'stuck'};}],
  ['scope class',(r:any)=>{r.steps[6].selection.policy.scope.baselineClass='non-ui';}],
  ['scope group',(r:any)=>{r.steps[6].selection.policy.scope.uiCandidates.push('stuck');}],
  ['marginal',(r:any)=>{r.steps[6].selection.policy.scope.marginal.stuck=.99;}],
  ['config scope',(r:any)=>{r.config.deferral.selectionScope='global';}],
  ['actual audit action',(r:any)=>{r.steps[6].audit.screen.elements=r.steps[6].audit.screen.elements.filter((e:any)=>e.id!=='e2');}]
 ] as const;
 const rejected:any[]=[];
 for(const [name,mutate] of mutations){
  const bad=structuredClone(original);mutate(bad);await writeFile(path,JSON.stringify(bad));
  try{await assert.rejects(replayDirectory(dir));rejected.push({name,rejected:true});}finally{await writeFile(path,bytes);}
 }
 assert.equal((await replayDirectory(dir)).verified,true);evidence.savedTamperCases=rejected;
});
test('independent paired configs and comparator require equality outside id and selection scope',async()=>{
 await gate();
 const old=humanJevProfile('experience-reason-grounded'),next=humanJevProfile('experience-reason-conditional'),normalized=structuredClone(next);
 normalized.config.id=old.config.id;delete normalized.config.deferral!.selectionScope;assert.deepEqual(normalized,old);
 const plan=reasonComparisonPlan('deferral-scope');
 assert.deepEqual(plan.modes,{old:'experience-reason-grounded',reason:'experience-reason-conditional'});assert.equal(plan.fullSchedule.length,12);
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const replicate of [1,2]){
  const slots=plan.fullSchedule.filter(s=>s.scenario===scenario&&s.replicate===replicate);
  assert.deepEqual(slots.map(s=>s.condition).sort(),['old','reason']);
  assert.notEqual(slots[0].condition,plan.fullSchedule.filter(s=>s.scenario===scenario&&s.replicate!==(replicate as any))[0].condition);
 }
 assert.equal(plan.limits.maxRequestsPerTrial,24);assert.equal(plan.limits.phaseMaximumRequests,288);
 assert.equal(plan.limits.maxJudgmentsPerTrial,12);assert.equal(plan.limits.maxUIActionsPerTrial,15);assert.equal(plan.limits.maxLooksPerTrial,3);assert.equal(plan.limits.maxRunMs,180000);assert.equal(plan.limits.parallel,1);
 const prior=await snapshotReasonPriorLedgers('deferral-scope'),oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('MOCK_FETCH_FORBIDDEN');};
 const dir=join(output,'scope-comparison-mock');
 try{const result=await runDeferralReasonExperiment({out:dir,mock:true,comparison:'deferral-scope',limit:2});assert.equal(result.status,'COMPLETED');assert.equal(result.requests,0);assert.equal(result.trials,2);}finally{globalThis.fetch=oldFetch;}
 const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8')),summary=JSON.parse(await readFile(join(dir,'summary.json'),'utf8'));
 assert.equal(manifest.requestAccounting.used,0);assert.equal(manifest.performanceEvidence,false);assert.equal(summary.pairs[0].consistent,true);
 const records=await Promise.all(manifest.records.map(async(r:any)=>({...r,result:JSON.parse(await readFile(join(dir,r.resultPath),'utf8'))})));
 for(const field of ['memoryCapacity','maxReasonImages','reviewMode','weight'] as const){
  const bad=structuredClone(records),r=bad[1].result;
  if(field==='memoryCapacity')r.config.state.memoryCapacity++;
  else if(field==='maxReasonImages')r.config.deferralReason.maxReasonImages++;
  else if(field==='reviewMode')r.config.deferralReason.reviewMode='separate';
  else r.config.deferral.weight=.02;
  assert.ok(analyzeReasonRuns(bad,'deferral-scope').pairs[0].errors.includes('CONFIG_MISMATCH'),field);
 }
 for(const r of summary.runs){assert.equal(r.success,false,'Mock done with false goal is never success');assert.equal(typeof r.policyPromotedTerminal,'number');assert.equal(typeof r.baselineTerminalPreserved,'number');}
 assert.deepEqual(await snapshotReasonPriorLedgers('deferral-scope'),prior);
 const ledgerCheck=JSON.parse(await readFile(join(dir,'prior-ledger-check.json'),'utf8'));assert.equal(ledgerCheck.unchanged,true);assert.equal(ledgerCheck.checked,prior.length);
 evidence.comparison={dir,trials:2,externalAPIRequests:0,priorLedgerCount:prior.length,priorUnchanged:true};
});
test('independent optional archived notification failures retain raw and reproduce all three counterfactuals',async(t)=>{
 let manifest:any;try{manifest=JSON.parse(await readFile('reports/deferral-grounding-2026-10-29/live/manifest.json','utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){t.skip('No local historical artifacts; runtime audit remains portable');return;}throw error;}
 const runs:any[]=[];
 for(const rec of manifest.records.filter((r:any)=>r.scenario==='notifications')){
  const path=join('reports/deferral-grounding-2026-10-29/live',rec.resultPath),result=JSON.parse(await readFile(path,'utf8'));
  if(result.termination!=='STUCK')continue;
  const s=result.steps.at(-1),cs:BetaCandidates=Object.fromEntries(Object.keys(s.selection.raw).map(k=>[k,{action:k==='back'?{type:'back'}:k.startsWith('e')?{type:'click',elementId:k}:k.startsWith('scroll_')?{type:'scroll',direction:k.endsWith('up')?'up':'down'}:k.startsWith('look_')?{type:'look',point:{x:0,y:0}}:{type:k},label:k}])) as BetaCandidates;
  const legacy=createSampler({mode:s.selection.mode,seed:s.selection.seed});
  let reproduced:any;for(let n=0;n<=s.selection.drawIndex;n++)reproduced=legacy.select(s.selection.modelChoice,s.selection.raw,cs,Object.fromEntries(s.selection.adjustments.map((a:any)=>[a.candidate,a.reason])),s.selection.policy.weights);
  assert.deepEqual(reproduced,s.selection);
  const sampler=createSampler({mode:s.selection.mode,seed:s.selection.seed});let next:any;
  for(let n=0;n<=s.selection.drawIndex;n++)next=sampler.select(s.selection.modelChoice,s.selection.raw,cs,Object.fromEntries(s.selection.adjustments.map((a:any)=>[a.candidate,a.reason])),s.selection.policy.weights,'ui-conditional');
  assert.equal(next.policy.scope.baselineClass,'ui');assert.notEqual(next.selected,'stuck');
  assert.deepEqual(next.raw,s.selection.raw);assert.deepEqual(next.policy.before,s.selection.policy.before);
  runs.push({id:rec.id,raw:s.selection.raw,legacy:s.selection.selected,conditional:next.selected,baseline:next.policy.scope.baselineSelected,goalAfterCounterfactual:'NOT_EXECUTED'});
 }
 assert.equal(runs.length,3);evidence.archivedCounterfactuals=runs;
});



test('independent disabled deferral scope is inert in core and saved replay',async()=>{
 await gate();
 const {chromium}=await import('playwright'),{parseCharter}=await import('../jev/persona.js'),{runBeta}=await import('../runner/virtual-beta-core.js');
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1280,height:900}});
 const dir=join(output,'disabled-scope-core');
 try{
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://independent.test'?route.fulfill({contentType:'text/html',body:'<!doctype html><title>Independent</title><h1>Visible fixture</h1><button>Preference</button>'}):route.abort());
  const page=await context.newPage(),config=humanJevProfile('experience-reason-conditional').config;
  config.deferral!.enabled=false;config.deferralReason!.enabled=false;
  const charter=parseCharter({schemaVersion:1,id:'independent',targetWebsite:'local:good',goal:'メール通知を停止して確認する',initialState:{description:'Fictional clean test',currentDate:'2026-09-19'},scope:['Local fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:4,oracle:'notifications'});
  const result=await runBeta(page,{runId:'disabled-scope',dir,baseURL:'http://independent.test',charter,config,evaluate:async req=>({model:'INDEPENDENT_LOCAL_STUB',answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
   const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':Object.keys(q.criteria)[0];
   return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  }))})});
  assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.objectiveAssessment.value,false);assert.equal(result.steps[0].selection!.selected,'done');assert.equal(result.steps[0].selection!.policy,undefined);
  const replay=await replayDirectory(dir);assert.equal(replay.verified,true);
  evidence.disabledScope={termination:result.termination,selection:result.steps[0].selection,replay,externalAPIRequests:0};
 }finally{await browser.close();}
});
