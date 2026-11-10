import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {sourceIdentity} from '../../runner/virtual-beta-source.ts';
import {replayDirectory} from '../../runner/virtual-beta-replay.ts';

const root=process.argv[2]??'reports/notification-switch-2026-10-29/live';
const out=process.argv[3]??'reports/notification-switch-2026-10-29/independent-live-'+Date.now();
await mkdir(out);
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const expected={revision:'e432f1895aa1ed2c85f8cb322ceb15e190c34c44',sourceHash:'d03ff817a9f40102851d25386e573925923adb93b80aa1c91f349e8563f374a3'};
const report={auditKind:'independent-read-only-real-deferral-scope',out,externalRequestsByAuditor:0,rawInputsResent:false,humanFilesRead:false,envFilesRead:false,failures:[],trials:[],pairs:[]};
let originals,sourceBefore;
function near(a,b,where){assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<3e-13,where+': '+a+' != '+b);}
function pick(distribution,q){const keys=Object.keys(distribution).sort();if(q===null)return keys.reduce((a,b)=>distribution[b]>distribution[a]?b:a);let prefix=0;for(const key of keys){prefix+=distribution[key];if(q<prefix)return key;}return keys.filter(k=>distribution[k]>0).at(-1);}
function draw(seed,index){return createHash('sha256').update('jev-virtual-beta-selection:v1:'+seed+':'+index).digest().readUInt32BE(0)/4294967296;}
function kinds(screen,ids){
 const result={};
 for(const id of ids){
  const element=screen.elements.find(e=>e.id===id&&e.available!==false);
  if(element)result[id]={type:'click',elementId:id};
  else if(id==='back')result[id]={type:'back'};
  else if(id==='scroll_down'&&screen.canScrollDown)result[id]={type:'scroll',direction:'down'};
  else if(id==='scroll_up'&&screen.canScrollUp)result[id]={type:'scroll',direction:'up'};
  else if(['done','stuck','abandon','reread','wait'].includes(id))result[id]={type:id};
  else if(/^look_[0-3]$/.test(id)){const n=Number(id.at(-1));result[id]={type:'look',point:{x:n%2?960:320,y:n<2?225:675}};}
  else throw Error('UNOBSERVED_ACTION '+id);
 }
 return result;
}
const ui=a=>['click','back','scroll'].includes(a.type);
const terminal=a=>['done','stuck','abandon'].includes(a.type);
function arithmetic(s,actions,scope){
 const ids=Object.keys(s.raw).sort(),total=ids.reduce((n,k)=>n+s.raw[k],0);
 assert.ok(total>0&&Math.abs(total-1)<=.02);
 assert.ok(ids.every(k=>Number.isFinite(s.raw[k])&&s.raw[k]>=0&&s.raw[k]<=1));
 const excluded=new Set(s.adjustments.map(a=>a.candidate));
 const normalized=Object.fromEntries(ids.map(k=>[k,s.raw[k]/total]));
 const safeWeights=Object.fromEntries(ids.map(k=>[k,excluded.has(k)?0:normalized[k]]));
 const surviving=ids.reduce((n,k)=>n+safeWeights[k],0);
 const before=Object.fromEntries(ids.map(k=>[k,safeWeights[k]/surviving]));
 const weights=s.policy?.weights??Object.fromEntries(ids.map(k=>[k,1]));
 assert.deepEqual(Object.keys(weights).sort(),ids);
 assert.ok(ids.every(k=>Number.isFinite(weights[k])&&weights[k]>0&&weights[k]<=1));
 const weightedTotal=ids.reduce((n,k)=>n+before[k]*weights[k],0);
 const global=Object.fromEntries(ids.map(k=>[k,before[k]*weights[k]/weightedTotal]));
 const q=s.mode==='sample'?draw(s.seed,s.drawIndex):null;
 const baseline=pick(before,q),uiIds=ids.filter(k=>ui(actions[k]));
 const mass=uiIds.reduce((n,k)=>n+before[k],0),weightedMass=uiIds.reduce((n,k)=>n+before[k]*weights[k],0);
 const marginal=Object.fromEntries(ids.map(k=>[k,ui(actions[k])&&mass>0?before[k]*weights[k]/weightedMass*mass:before[k]]));
 let filtered=global,conditionalDraw=null;
 if(scope==='ui-conditional'){
  assert.ok(ids.every(k=>ui(actions[k])||weights[k]===1));
  if(ui(actions[baseline])){
   filtered=Object.fromEntries(ids.map(k=>[k,ui(actions[k])?before[k]*weights[k]/weightedMass:0]));
   if(q!==null){let rawPrefix=0,uiPrefix=0;for(const k of ids){if(k===baseline)break;rawPrefix+=before[k];if(ui(actions[k]))uiPrefix+=before[k];}conditionalDraw=(uiPrefix+q-rawPrefix)/mass;}
  }else filtered=Object.fromEntries(ids.map(k=>[k,Number(k===baseline)]));
 }
 const selected=pick(filtered,scope==='ui-conditional'&&ui(actions[baseline])?conditionalDraw:q);
 return {ids,normalized,before,rawTotal:total,surviving,weights,weightedTotal,q,baseline,uiIds,mass,weightedMass,marginal,filtered,conditionalDraw,selected};
}
const location=url=>{const u=new URL(url);assert.ok(['127.0.0.1','localhost'].includes(u.hostname));return u.pathname+u.search+u.hash;};
async function tree(path){const files=[];for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())files.push(...await tree(p));else{assert.ok(e.isFile(),'No raw symbolic links');files.push(p);}}return files;}
async function snapshot(paths){return Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,hash(await readFile(p))])));}
function comparable(config){const c=structuredClone(config);delete c.id;if(c.deferral)delete c.deferral.selectionScope;return c;}
function answersOf(step,stage){return stage==='assessment'?step.deliberation.response.answers:step.response.answers;}
try{
 const manifest=await read(join(root,'manifest.json'));
 assert.equal(manifest.status,'COMPLETED','Only final completed 12 can receive acceptance');
 assert.equal(manifest.records.length,12);assert.equal(manifest.mock,false);assert.equal(manifest.comparison,'deferral-scope');
 assert.equal(manifest.revision,expected.revision);assert.equal(manifest.sourceHash,expected.sourceHash);
 sourceBefore=await sourceIdentity();report.currentRevisionMatchesProducer=sourceBefore.revision===expected.revision;assert.equal(sourceBefore.sourceHash,expected.sourceHash);assert.deepEqual(manifest.sourceHashes,sourceBefore.sourceHashes);
 const paths=[join(root,'manifest.json'),join(root,'prior-ledger-check.json')];
 for(const rec of manifest.records){paths.push(join(root,rec.id+'-budget.json'));paths.push(...await tree(join(root,rec.dir)));}
 assert.equal(manifest.priorLedgers.length,70);
 paths.push(...manifest.priorLedgers.map(x=>x.path));
 originals=await snapshot(paths);await writeFile(join(out,'original-hashes-before.json'),JSON.stringify(originals,null,2));
 report.manifest={status:manifest.status,revision:manifest.revision,sourceHash:manifest.sourceHash,recordCount:12,requestAccounting:manifest.requestAccounting,limits:manifest.limits};
 const schedule=[];
 for(let rep=1;rep<=2;rep++)for(const [i,scenario] of ['notifications','revisit-alpha','revisit-beta'].entries())for(const condition of (i+rep)%2===1?['old','reason']:['reason','old'])schedule.push({id:scenario+'-r'+rep+'-'+condition,scenario,replicate:rep,condition});
 assert.deepEqual(manifest.records.map(r=>({id:r.id,scenario:r.scenario,replicate:r.replicate,condition:r.condition})),schedule);
 const stored=[];
 for(const rec of manifest.records){
  const dir=join(root,rec.dir),r=await read(join(root,rec.resultPath)),trial=await read(join(dir,'manifest.json')),ledger=await read(join(root,rec.id+'-budget.json'));
  assert.equal(r.code.revision,expected.revision);assert.equal(r.code.sourceHash,expected.sourceHash);
  assert.equal(trial.revision,expected.revision);assert.equal(trial.sourceHash,expected.sourceHash);assert.deepEqual(trial.sourceHashes,sourceBefore.sourceHashes);assert.deepEqual(trial.config,r.config);
  assert.equal(trial.mock,false);assert.equal(trial.humanInputsRead,false);assert.equal(trial.model,'jev-1.14.0');
  assert.equal(trial.transport.longContext,true);assert.equal(trial.transport.maxAttemptsPerRequest,1);
  assert.equal(ledger.newMaximum,24);assert.equal(ledger.perRunMaximum,12);assert.ok(ledger.used<=24);
  assert.equal(ledger.used,ledger.attempts.length);assert.equal(ledger.used,r.apiCalls);
  assert.equal(ledger.used,trial.actualAPIRequests);assert.equal(ledger.used,trial.totalEvaluatorCalls);assert.equal(ledger.used,rec.requests);
  for(const [i,a] of ledger.attempts.entries()){
   assert.equal(a.status,'OK');assert.equal(a.ordinal,i+1);assert.equal(a.metadata.attempts,1);
   assert.equal(a.revision,expected.revision);assert.equal(a.sourceHash,expected.sourceHash);
   assert.equal(a.runKey.endsWith(i%2===0?'/assessment':'/action'),true);
  }
  const trace=await readFile(join(dir,'exploration/trace.zip'));assert.equal(trace.subarray(0,2).toString(),'PK');assert.ok(trace.length>0);
  const initial=hash(await readFile(join(dir,'initial-product.png')));assert.equal(initial,rec.initialImageSha256);
  const initialSaved=await read(join(dir,'initial-product.json'));assert.equal(initialSaved.sha256,initial);
  const requests=[],selections=[],reviews=[],route=[],hashChecks=[];
  let performed=0,looks=0;
  for(const step of r.steps){
   const n=step.number;
   assert.deepEqual(await read(join(dir,'exploration','step-'+n+'.json')),step,'Per-step raw file agrees with final result');
   route.push({step:n,url:location(step.audit.url),title:step.audit.screen.title,selected:step.selection?.selected,modelChoice:step.selection?.modelChoice,action:step.action,outcome:step.outcome,image:step.userState?.lastObservation?.imageSha256});
   assert.equal(hash(await readFile(join(dir,'exploration',step.audit.rawScreenshot))),step.audit.sourceSha256);
   for(const [stage,record] of [['assessment',step.deliberation],['action',step]]){
    assert.ok(record?.response,'Expected completed response for every request');
    assert.equal(record.response.model,'jev-1.14.0');assert.equal(record.response.request.attempts,1);assert.deepEqual(record.response.request.failures,[]);assert.equal(record.response.request.longContext,true);
    assert.equal(record.inputSha256,hash(JSON.stringify({input:record.modelInput,questions:record.questions,assets:record.assetFiles})));
    const assets=record.assetFiles;
    for(const [key,a] of Object.entries(assets)){
     assert.equal(basename(a.file),a.file);
     const actual=hash(await readFile(join(dir,'exploration',a.file)));assert.equal(actual,a.sha256);hashChecks.push({step:n,stage,key,file:a.file,sha256:actual});
    }
    const observation=record.modelInput.observation;assert.equal(observation.id,'o'+n);
    assert.equal(record.modelInput.audit,undefined);assert.equal(observation.screen,undefined);
    assert.ok(!/data-testid|data-holdout|objectiveAssessment|regionsOfInterest|baselineSelected|selectionScope/.test(JSON.stringify(record.modelInput)));
    assert.ok(record.modelInput.userState.memory.length<=3);assert.ok(record.modelInput.reasonObservations.length<=1);assert.ok(Object.keys(assets).length<=4);
    assert.equal(assets.current.sha256,step.userState.lastObservation.imageSha256);
    for(const ref of [...record.modelInput.memoryObservations,...record.modelInput.reasonObservations])assert.equal(assets[ref.image].sha256,ref.imageSha256);
    requests.push({step:n,stage,inputHash:record.inputSha256,responseAnswerHash:hash(JSON.stringify(record.response.answers)),attempts:record.response.request.attempts,elapsedMs:record.response.request.elapsedMs,model:record.response.model});
   }
   const s=step.selection;assert.ok(s);assert.deepEqual(s.raw,step.response.answers.nextAction.probabilities);assert.equal(s.modelChoice,step.response.answers.nextAction.choice);
   const actions=kinds(step.audit.screen,Object.keys(s.raw));
   const scope=r.config.deferral?.enabled?r.config.deferral.selectionScope:undefined;
   const computed=arithmetic(s,actions,scope);
   assert.equal(s.draw,computed.q);assert.equal(s.mode,'argmax');assert.equal(s.drawIndex,n-1);assert.equal(s.seed,r.config.selection.seed);
   assert.equal(s.selected,computed.selected);
   for(const k of computed.ids){near(s.normalized[k],computed.normalized[k],'normalized');near(s.policy.before[k],computed.before[k],'safe before');near(s.filtered[k],computed.filtered[k],'filtered');}
   near(s.normalization.rawTotal,computed.rawTotal,'raw total');near(s.normalization.filteredTotal,computed.surviving,'safe total');near(s.policy.weightedTotal,computed.weightedTotal,'weighted total');
   assert.deepEqual(step.action,actions[s.selected],'Actual action must match actual audited action');
   if(ui(step.action)&&step.outcome==='UI_PERFORMED')performed++;
   if(step.outcome==='FIXATION_MOVED')looks++;
   if(scope==='ui-conditional'){
    const p=s.policy.scope;assert.equal(p.kind,'ui-conditional-v1');assert.equal(p.baselineSelected,computed.baseline);
    assert.equal(p.baselineClass,ui(actions[computed.baseline])?'ui':'non-ui');assert.deepEqual(p.uiCandidates,computed.uiIds);
    near(p.uiMass,computed.mass,'UI mass');near(p.weightedUIMass,computed.weightedMass,'weighted UI mass');assert.equal(p.conditionalDraw,null);
    for(const k of computed.ids){near(p.marginal[k],computed.marginal[k],'marginal');if(!ui(actions[k]))assert.equal(p.marginal[k],computed.before[k]);}
    near(computed.uiIds.reduce((n,k)=>n+p.marginal[k],0),computed.mass,'UI total conserved');
    if(!ui(actions[computed.baseline]))assert.equal(s.selected,computed.baseline);
   }else assert.equal(s.policy.scope,undefined);
   const opposite=arithmetic(s,actions,scope==='ui-conditional'?undefined:'ui-conditional');
   selections.push({step:n,scope:scope??'global',mode:s.mode,modelChoice:s.modelChoice,modelChoiceType:actions[s.modelChoice].type,baseline:computed.baseline,baselineType:actions[computed.baseline].type,selected:s.selected,selectedType:actions[s.selected].type,baselineChanged:computed.baseline!==s.selected,controllerPromotedTerminal:!terminal(actions[computed.baseline])&&terminal(actions[s.selected]),nonUIBaseline:!ui(actions[computed.baseline]),nonUIPreserved:!ui(actions[computed.baseline])?s.selected===computed.baseline:null,counterfactualScope:scope==='ui-conditional'?'global':'ui-conditional',oppositeSelected:opposite.selected,oppositeType:actions[opposite.selected].type,raw:s.raw,before:computed.before,weights:computed.weights,uiCandidates:computed.uiIds,uiMass:computed.mass,weightedUIMass:computed.weightedMass,marginal:scope==='ui-conditional'?s.policy.scope.marginal:s.filtered,filtered:s.filtered,draw:s.draw,actualAction:step.action,actualOutcome:step.outcome});
   for(const review of step.deferralReason?.record.reviews??[]){
    if(review.basis){assert.equal(r.steps[Number(review.basis.observationId.slice(1))-1].userState.lastObservation.imageSha256,review.basis.imageSha256);}
    if(review.newEvidence){assert.equal(r.steps[Number(review.newEvidence.observationId.slice(1))-1].userState.lastObservation.imageSha256,review.newEvidence.imageSha256);}
    const sourceN=Number(review.identity.fromObservationId.slice(1)),original=r.steps[sourceN-1];
    const returnedAction=step.action,priorAction=original.action;
    const actualSameRevisit=step.outcome==='UI_PERFORMED'&&isDeepStrictEqual(returnedAction,priorAction);
    reviews.push({step:n,...review,rawReviewChoices:step.deferralReason.record.rawChoices,reviewObservation:step.audit.url,originalSourceStep:sourceN,originalSourceURL:location(original.audit.url),actualSameRevisit,performedAction:step.action,followingObservation:route[n]??(r.steps[n]?{url:location(r.steps[n].audit.url),image:r.steps[n].userState.lastObservation.imageSha256}:null)});
   }
  }
  assert.equal(requests.length,ledger.used);assert.equal(r.decisions,r.steps.length);assert.equal(r.uiActions,performed);assert.equal(r.looks,looks);
  const replay=await replayDirectory(join(dir,'exploration'));assert.equal(replay.verified,true);
  const objectiveTrue=r.objectiveAssessment.status==='OK'&&r.objectiveAssessment.value===true;
  const infra=['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP'].includes(r.termination);
  assert.equal(r.validForComparison,r.objectiveAssessment.status==='OK'&&r.terminalObservation.status==='RECORDED'&&!infra);
  assert.equal(r.objectiveSuccess,objectiveTrue);
  const item={...rec,requests:requests.length,ledgerUsed:ledger.used,ledgerAttemptStatuses:ledger.attempts.map(a=>a.status),requestTrace:requests,hashChecks,initial,termination:r.termination,objective:r.objectiveAssessment,objectiveSuccess:objectiveTrue,perceivedDone:r.perceivedDone,valid:r.validForComparison,infrastructureFailure:infra,uiActions:performed,decisions:r.steps.length,looks,route,selections,reviews,replay};
  report.trials.push(item);stored.push({rec,result:r,trial});
 }
 const countTypes=(selections,field)=>Object.fromEntries(['click','back','scroll','done','stuck','abandon','look','reread','wait'].map(type=>[type,selections.filter(s=>s[field]===type).length]));
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const replicate of [1,2]){
  const a=stored.find(x=>x.rec.scenario===scenario&&x.rec.replicate===replicate&&x.rec.condition==='old'),b=stored.find(x=>x.rec.scenario===scenario&&x.rec.replicate===replicate&&x.rec.condition==='reason');
  assert.ok(a&&b);assert.equal(a.rec.initialImageSha256,b.rec.initialImageSha256);
  assert.deepEqual(a.result.input,b.result.input);assert.deepEqual(a.trial.charter,b.trial.charter);assert.deepEqual(a.trial.persona,b.trial.persona);
  assert.deepEqual(comparable(a.result.config),comparable(b.result.config));
  for(const k of ['viewport','locale','timezoneId','transport'])assert.deepEqual(a.trial[k],b.trial[k]);
  const sa=a.result.steps[0],sb=b.result.steps[0];
  const assessmentEqual=sa.deliberation.inputSha256===sb.deliberation.inputSha256,actionEqual=sa.inputSha256===sb.inputSha256;
  const answerDifferences=[];
  for(const stage of ['assessment','action'])for(const key of Object.keys(answersOf(sa,stage))){
   const x=answersOf(sa,stage)[key],y=answersOf(sb,stage)[key];
   if(!isDeepStrictEqual(x,y))answerDifferences.push({stage,question:key,old:x,reason:y});
  }
  report.pairs.push({scenario,replicate,initialPNGEqual:true,personaCharterEqual:true,configEqualOutsideIdScope:true,assessmentInputHashEqual:assessmentEqual,oldAssessmentInputHash:sa.deliberation.inputSha256,reasonAssessmentInputHash:sb.deliberation.inputSha256,assessmentRawAnswersEqual:isDeepStrictEqual(sa.deliberation.response.answers,sb.deliberation.response.answers),actionInputHashEqual:actionEqual,actionRawAnswersEqual:isDeepStrictEqual(sa.response.answers,sb.response.answers),answerDifferences});
 }
 const check=await read(join(root,'prior-ledger-check.json'));
 assert.equal(check.ledgers.length,70);
 for(const prior of manifest.priorLedgers){assert.equal(hash(await readFile(prior.path)),prior.sha256);const other=check.ledgers.find(p=>p.path===prior.path);assert.equal(other.sha256,prior.sha256);}
 report.priorLedgers={count:70,hashesMatchPreRunBaseline:true,entries:manifest.priorLedgers};
 const totalRequests=report.trials.reduce((n,r)=>n+r.requests,0);assert.equal(totalRequests,manifest.requestAccounting.used);assert.ok(totalRequests<=288);
 report.accounting={rawResponses:totalRequests,clientRecordedHTTPAttempts:report.trials.reduce((n,t)=>n+t.requestTrace.reduce((n,r)=>n+r.attempts,0),0),freshLedgerUsed:report.trials.reduce((n,t)=>n+t.ledgerUsed,0),manifestRequestCount:manifest.requestAccounting.used,allAttemptsOne:true,allSettledOK:true,maximum:288,remaining:288-totalRequests,packetCaptureOrProviderBillingRead:false};
 report.conditions=['old','reason'].map(condition=>{
  const trials=report.trials.filter(t=>t.condition===condition),selections=trials.flatMap(t=>t.selections);
  return {condition,trials:trials.length,requests:trials.reduce((n,t)=>n+t.requests,0),successes:trials.filter(t=>t.objectiveSuccess&&t.valid).length,valid:trials.filter(t=>t.valid).length,infrastructureFailures:trials.filter(t=>t.infrastructureFailure).length,selectionCount:selections.length,baselineChanges:selections.filter(s=>s.baselineChanged).length,controllerPromotedTerminal:selections.filter(s=>s.controllerPromotedTerminal).length,baselineNonUI:selections.filter(s=>s.nonUIBaseline).length,nonUIPreserved:selections.filter(s=>s.nonUIPreserved===true).length,modelChoiceTypes:countTypes(selections,'modelChoiceType'),baselineTypes:countTypes(selections,'baselineType'),selectedTypes:countTypes(selections,'selectedType')};
 });
 report.scopeAcceptance={newSelections:report.trials.filter(t=>t.condition==='reason').flatMap(t=>t.selections).length,independentBaselineActualTypeGroupMassFilteredDrawActionChecks:true,mode:'argmax',extraRandomDraws:false};
 report.notifications=report.trials.filter(t=>t.scenario==='notifications').map(t=>({id:t.id,objective:t.objective,termination:t.termination,uiActions:t.uiActions,decisions:t.decisions,looks:t.looks,route:t.route,changedSelections:t.selections.filter(s=>s.baselineChanged)}));
 report.revisits=report.trials.filter(t=>t.scenario!=='notifications').map(t=>({id:t.id,objective:t.objective,uiActions:t.uiActions,decisions:t.decisions,termination:t.termination,reviews:t.reviews,revisitActions:t.reviews.filter(x=>x.released&&x.actualSameRevisit).length}));
 report.responseModels={expected:'jev-1.14.0',verifiedResponses:totalRequests,matchingResponses:report.trials.flatMap(t=>t.requestTrace).filter(q=>q.model==='jev-1.14.0').length};
 report.modelVariation={pairs:report.pairs.length,equalInitialAssessmentInputs:report.pairs.filter(p=>p.assessmentInputHashEqual).length,equalInitialAssessmentRawAnswers:report.pairs.filter(p=>p.assessmentRawAnswersEqual).length,equalInitialActionInputs:report.pairs.filter(p=>p.actionInputHashEqual).length,equalInitialActionRawAnswers:report.pairs.filter(p=>p.actionRawAnswersEqual).length};
  report.counterfactuals=report.trials.flatMap(t=>t.selections.filter(s=>s.selected!==s.oppositeSelected).map(s=>({trial:t.id,scenario:t.scenario,condition:t.condition,...s,boundary:'One-step deterministic arithmetic only; opposite action and subsequent goal were not executed'})));
 report.choiceCounts=report.conditions.map(condition=>{
  const selections=report.trials.filter(t=>t.condition===condition.condition).flatMap(t=>t.selections);
  const ids=field=>Object.fromEntries([...new Set(selections.map(s=>s[field]))].sort().map(id=>[id,selections.filter(s=>s[field]===id).length]));
  return {condition:condition.condition,modelChoice:ids('modelChoice'),baseline:ids('baseline'),selected:ids('selected'),modelChoiceBaselineDisagreements:selections.filter(s=>s.modelChoice!==s.baseline).length};
 });
 report.initialResponseVariation=report.pairs.map(p=>({scenario:p.scenario,replicate:p.replicate,assessmentProbabilityChanges:p.answerDifferences.filter(d=>d.stage==='assessment'&&!isDeepStrictEqual(d.old.probabilities,d.reason.probabilities)).map(d=>d.question),assessmentChoiceChanges:p.answerDifferences.filter(d=>d.stage==='assessment'&&d.old.choice!==d.reason.choice).map(d=>d.question),actionProbabilityChanges:p.answerDifferences.filter(d=>d.stage==='action'&&!isDeepStrictEqual(d.old.probabilities,d.reason.probabilities)).map(d=>d.question),actionChoiceChanges:p.answerDifferences.filter(d=>d.stage==='action'&&d.old.choice!==d.reason.choice).map(d=>d.question)}));
 report.status='VERIFIED_12_RAW_RUNS';
}catch(error){
 report.status='FAILED';report.failures.push({message:error.message,stack:error.stack});
}finally{
 if(originals){const after=await snapshot(Object.keys(originals));report.originals={count:Object.keys(originals).length,before:join(out,'original-hashes-before.json'),unchanged:isDeepStrictEqual(after,originals)};await writeFile(join(out,'original-hashes-after.json'),JSON.stringify(after,null,2));if(!report.originals.unchanged){report.status='FAILED';report.failures.push({message:'ORIGINAL_RAW_FILES_CHANGED'});}}
 if(sourceBefore){const sourceAfter=await sourceIdentity();report.source={before:sourceBefore,after:sourceAfter,unchanged:isDeepStrictEqual(sourceBefore,sourceAfter)};if(!report.source.unchanged){report.status='FAILED';report.failures.push({message:'SOURCE_CHANGED'});}}
 await writeFile(join(out,'audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({out,status:report.status,failures:report.failures,accounting:report.accounting,conditions:report.conditions,scope:report.scopeAcceptance,variation:report.modelVariation,prior:report.priorLedgers?.count,rawUnchanged:report.originals?.unchanged,sourceUnchanged:report.source?.unchanged},null,2));
 if(report.status==='FAILED')process.exitCode=1;
}
