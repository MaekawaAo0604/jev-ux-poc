import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {runConstraintChoiceComparison,constraintChoiceSummary,constraintChoiceSchedule,constraintTrialStopReason,methodAdmissibility} from '../runner/constraint-choice-comparison.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {loadPublicPersonaSet} from '../runner/public-persona-set.js';
import {buildExplorationViewer} from '../runner/exploration-viewer-data.js';
import {personaInputBindings} from '../runner/persona-beta-comparison.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {verifyTransferFrames} from '../runner/transfer-analysis.js';
import {personaTaskQuery} from '../app/persona-task-fixture.js';
import {checkPersonaTaskObjective,readPersonaTaskSnapshot} from '../runner/persona-task-oracle.js';
import {VisualHypothesisTransportError} from '../jev/virtual-beta/visual-hypotheses-contracts.js';

const own=resolve('reports/constraint-choice-2026-11-08/independent');
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const full=process.env.CONSTRAINT_CHOICE_INDEPENDENT==='1';
const fixture={version:1,task:'methods'} as const;
async function rootFor(name:string){await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,name+'-'));const prior=join(root,'prior.json');await writeFile(prior,JSON.stringify({count:0,files:[]}));return{root,prior};}
function answer(request:any,next='done'){
 return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries<any>(request.questions).map(([id,q])=>{
 const choice=id==='nextAction'?next:id==='workingInquiry_plan'?Object.keys(q.criteria).at(-1)!:id.startsWith('goalSearch_')?'uncertain':id.startsWith('workingInquiry_')?(id==='workingInquiry_condition'?'none':'unknown'):id.startsWith('actionRelation_')?(id==='actionRelation_availabilityEvidence'||id.startsWith('actionRelation_evidence_')||id.startsWith('actionRelation_contextEvidence_')?'none':'unknown'):id==='decisionBasis'?'goal':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';
 const admitted=Object.hasOwn(q.criteria,choice)?choice:Object.hasOwn(q.criteria,'unknown')?'unknown':Object.keys(q.criteria)[0];
 return[id,{choice:admitted,probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,key===admitted?1:0]))}];}))};
}

test('independent factorial set, balanced schedule and admissibility separate exploration from saved behavior',async()=>{
 const selected=await loadPublicPersonaSet('experiments/persona/constraint-choice-v1/set.json');
 const shared=Object.values<any>(selected.personas).map(({id,name,contextAndConstraints,...rest})=>rest);
 for(const entry of shared)assert.deepEqual(entry,shared[0]);
 const facts=Object.values<any>(selected.personas).map(p=>p.contextAndConstraints);for(const f of facts){assert.equal(f.length,4);assert.equal(f[0],facts[0][0]);assert.equal(f[3],facts[0][3]);}
 assert.equal(new Set(facts.map(f=>f[1])).size,2);assert.equal(new Set(facts.map(f=>f[2])).size,2);assert.equal(new Set(facts.map(f=>JSON.stringify([f[1],f[2]]))).size,4);
 const schedule=constraintChoiceSchedule();assert.equal(schedule.length,16);assert.equal(new Set(schedule.map(s=>s.id)).size,16);for(const actor of selected.actors)assert.deepEqual(schedule.filter(s=>s.actor===actor).map(s=>s.position).sort(),[1,2,3,4]);
 const legacy=(await import('../runner/persona-task-comparison.js')).personaTaskSchedule();assert.equal(legacy.length,36);assert.equal(new Set(legacy.map(s=>s.sequence)).size,36);
 for(const canStoreCredentials of [false,true])for(const hasPhone of [false,true]){const c={canStoreCredentials,hasPhone};assert.equal(methodAdmissibility('local',c).consistent,canStoreCredentials);assert.equal(methodAdmissibility('phone',c).consistent,hasPhone);assert.equal(methodAdmissibility('code',c).consistent,true);assert.equal(methodAdmissibility('none',c).consistent,null);}
 const summary=constraintChoiceSummary({schedule:constraintChoiceSchedule(1),records:[{actor:'M0',sequence:1,status:'RESULT',valid:true,methodAudit:{firstExplored:'phone',savedMethod:'none',status:'not-saved',consistent:null}},{actor:'M1',sequence:2,status:'RESULT',valid:false,methodAudit:{savedMethod:'local',status:'saved',consistent:false}},{actor:'M2',sequence:3,status:'ATTEMPTING',valid:false}],totalRequests:0,status:'RUNNING'});
 assert.equal(summary.valid,1);assert.equal(summary.invalid,1);assert.equal(summary.pending,1);assert.equal(summary.missing.length,1);assert.equal(summary.byActor.M0.notSaved,1);assert.equal(summary.byActor.M1.incompatibleSaved,0);assert.equal(summary.byActor.M2.notSaved,0);
});

test('independent stop classifier trusts transport boundaries and never model output metadata',()=>{
 const fake:any={termination:'DECISION_LIMIT',steps:[{response:{answers:{code:'LEDGER_ACCOUNTING_UNAVAILABLE',statusCode:401}},visualHypotheses:{response:{output:{termination:'SAFETY_STOP',code:'PRIOR_RAW_CHANGED',statusCode:402}}}}]};assert.equal(constraintTrialStopReason({},fake),null);
 for(const statusCode of [400,401,402,403,404,429])assert.equal(constraintTrialStopReason({},{termination:'API_ERROR',steps:[{error:{code:'HTTP_ERROR',statusCode}}]} as any),'PROVIDER_UNAVAILABLE');
 assert.equal(constraintTrialStopReason({},{termination:'API_ERROR',steps:[{visualHypotheses:{error:{code:'TIMEOUT',attempts:1,httpReceived:false}}}]} as any),null);
 assert.equal(constraintTrialStopReason({},{termination:'SAFETY_STOP',steps:[]} as any),'SAFETY_STOP');assert.equal(constraintTrialStopReason({error:{code:'LEDGER_ACCOUNTING_UNAVAILABLE'}}),'BUDGET_ACCOUNTING_FAILURE');
});

test('independent real local UI all paths, state, visible oracle and fresh identical pixels',{skip:!full,timeout:120000},async()=>{
 const {root}=await rootFor('ui'),server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');const origin='http://127.0.0.1:'+address.port,browser=await chromium.launch({headless:true});const hashes:string[]=[];
 try{for(const method of ['local','phone','code']){const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});try{
 const unexpected:string[]=[];await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(url.origin!==origin||!['GET','HEAD'].includes(req.method())){unexpected.push(req.method()+' '+url.origin);return route.abort();}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(origin+'/good/'+personaTaskQuery(fixture)+'#complete',{waitUntil:'networkidle'});const settle=async()=>page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await settle();
 const initial=await readPersonaTaskSnapshot(page,fixture);assert.equal(initial.method,'none');assert.equal(initial.savedMethod,'none');assert.equal(initial.complete,false);assert.deepEqual(initial.events,[]);assert.equal(initial.route,'start');assert.equal(await checkPersonaTaskObjective(page,fixture),false);hashes.push(sha(await page.screenshot()));
 const styles=[];const sizes:{width:number;height:number}[]=[];for(const option of ['local','phone','code']){const control=page.locator('[data-persona-task-action="method-'+option+'"]');assert.equal(await control.count(),1);assert.equal(await control.isEnabled(),true);assert.equal(await control.getAttribute('aria-pressed'),'false');const b=await control.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=1280&&b.y+b.height<=900);sizes.push(b);styles.push(await control.evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,background:s.backgroundColor,border:s.border,fontSize:s.fontSize};}));}assert.ok(sizes.every(s=>Math.abs(s.width-sizes[0].width)<1&&Math.abs(s.height-sizes[0].height)<1));assert.deepEqual(styles[0],styles[1]);assert.deepEqual(styles[1],styles[2]);assert.equal(await page.locator('input,textarea,form').count(),0);
 await page.screenshot({path:join(root,'initial-'+method+'.png')});await page.locator('[data-persona-task-action="method-'+method+'"]').click();await settle();assert.equal((await readPersonaTaskSnapshot(page,fixture)).savedMethod,'none');assert.equal(await checkPersonaTaskObjective(page,fixture),false);
 await page.locator('[data-persona-task-action="save-method"]').click();await settle();assert.equal((await readPersonaTaskSnapshot(page,fixture)).savedMethod,method);assert.equal(await checkPersonaTaskObjective(page,fixture),true);const saved=page.locator('[data-persona-method-saved]');assert.equal(await saved.getAttribute('data-persona-method-saved'),method);const label=await saved.innerText();await saved.evaluate(el=>el.textContent='未保存');assert.equal(await checkPersonaTaskObjective(page,fixture),false);await saved.evaluate((el,text)=>el.textContent=text,label);assert.equal(await checkPersonaTaskObjective(page,fixture),true);
 const status=page.locator('[data-persona-task-complete]');await status.evaluate(el=>(el as HTMLElement).style.display='none');assert.equal(await checkPersonaTaskObjective(page,fixture),false);await status.evaluate(el=>(el as HTMLElement).style.display='');await saved.evaluate(el=>el.parentElement!.appendChild(el.cloneNode(true)));assert.equal(await checkPersonaTaskObjective(page,fixture),false);await saved.last().evaluate(el=>el.remove());
 await page.screenshot({path:join(root,'saved-'+method+'.png')});await page.reload({waitUntil:'networkidle'});await settle();assert.equal((await readPersonaTaskSnapshot(page,fixture)).savedMethod,'none');assert.equal(await checkPersonaTaskObjective(page,fixture),false);assert.deepEqual(unexpected,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 }finally{await context.close();}}assert.equal(new Set(hashes).size,1);await writeFile(join(root,'pixel-hashes.json'),JSON.stringify(hashes));}finally{await browser.close();await server.close();}
});

test('independent ordinary cohort binds all traits at three stages, hides audit and preserves viewer raw',{skip:!full,timeout:180000},async()=>{
 const {root,prior}=await rootFor('ordinary'),before=await sourceIdentity();const batch=join(root,'batch');const m=await runConstraintChoiceComparison({out:batch,priorSnapshot:prior,mock:true,repeats:1,envFile:'C:/NEVER_READ_ENV.env'});assert.equal(m.status,'COMPLETED');assert.equal(m.records.length,4);assert.equal(m.totalRequests,0);assert.equal(m.preservationAfter,true);
 for(const row of m.records){assert.equal(row.valid,true);const bytes=await readFile(row.resultPath),r=JSON.parse(bytes.toString()),p=m.personas[row.actor];assert.equal(sha(bytes),row.resultSha256);assert.deepEqual(personaInputBindings({persona:p,result:r}),{native:1,assessment:1,action:1,errors:[]});assert.deepEqual(r.personaTask.terminalSnapshot.events,[]);assert.equal(r.personaTask.terminalSnapshot.savedMethod,'none');assert.equal(r.steps.length,1);assert.equal(r.apiCalls,3);assert.equal(r.objectiveSuccess,false);assert.equal(r.termination,'SUBJECTIVE_DONE');
 const s=r.steps[0],v=s.visualHypotheses.request;assert.deepEqual(v.memory.records,[]);assert.deepEqual(v.experience.transitions,[]);for(const c of v.candidates){assert.deepEqual(Object.keys(c).sort(),['id','type']);assert.match(c.id,/^(e\d+|scroll_down|scroll_up)$/);}for(const input of [s.modelInput,s.deliberation.modelInput]){assert.deepEqual(input.exploration.persona,p);assert.deepEqual(input.userState.expectations,p.expectations);assert.equal(input.audit,undefined);assert.equal(input.observation.screen,undefined);assert.equal(input.observation.visibleText,undefined);assert.equal(input.observation.url,undefined);}
 const wire=JSON.stringify([v,s.modelInput,s.deliberation.modelInput,s.questions,s.deliberation.questions]);for(const privateKey of ['data-persona','savedMethod','canStoreCredentials','hasPhone','terminalSnapshot','personaTask'])assert.equal(wire.includes(privateKey),false,privateKey+' leaked');assert.equal((await replayDirectory(join(row.dir,'exploration'))).verified,true);assert.ok((await verifyTransferFrames(r,join(row.dir,'exploration'))).every(f=>f.validCurrentFrame&&f.successfulResponse));assert.deepEqual(s.selection.raw,s.response.answers.nextAction.probabilities);assert.equal(s.selection.modelChoice,s.response.answers.nextAction.choice);assert.equal(s.selection.selected,'done');assert.equal(s.action.type,'done');assert.ok(s.selection.normalized);assert.ok(s.selection.filtered);assert.ok(s.selection.policy.scope);
 }
 for(const key of ['productSha256','currentImageSha256','nativeNonpersonaSha256'])assert.equal(new Set(m.records.map((r:any)=>r.initialInputs[key])).size,1);assert.equal(new Set(m.records.map((r:any)=>r.runId)).size,4);assert.equal(new Set(m.records.map((r:any)=>r.dir)).size,4);
 const viewer=join(root,'viewer'),catalog=await buildExplorationViewer({batches:[batch],out:viewer});assert.equal(catalog.runs.length,4);assert.equal(catalog.issues.length,0);assert.equal(new Set(catalog.runs.map(r=>r.group)).size,1);for(const run of catalog.runs){assert.equal(run.validity,'valid');assert.equal(run.mock,true);assert.equal(run.objective.value,false);const d=await json(join(viewer,run.detailFile!)),bytes=await readFile(join(viewer,d.rawFile));assert.equal(sha(bytes),d.provenance.rawSha256);assert.ok(bytes.equals(await readFile(d.provenance.sourceResult)));for(const image of d.steps[0].images){assert.equal(image.delivery,'response-received');assert.equal(sha(await readFile(join(viewer,image.file))),image.sha256);}}
 assert.deepEqual(await sourceIdentity(),before);await writeFile(join(root,'independent-evidence.json'),JSON.stringify({status:'PASS',APIRequests:0,source:before.sourceHash,batch,viewer,runs:catalog.runs.length},null,2));
});

test('independent scripted ordinary response traverses select-save-observe with model argmax matching actual action',{skip:!full,timeout:120000},async()=>{
 const {root}=await rootFor('scripted'),p=JSON.parse(await readFile('experiments/persona/constraint-choice-v1/m1.json','utf8'));let decisions=0;const out=join(root,'trial');const {result:r}=await runHumanJev({out,mock:true,persona:p,personaTaskFixture:fixture,mode:'experience-persona-unweighted',maxDecisions:3,maxRunMs:300000,visualRequestMs:60000},async request=>{if(request.questions.nextAction)decisions++;return answer(request,decisions===1?'e1':decisions===2?'e1':'done');});
 assert.equal(r.validForComparison,true);assert.equal(r.objectiveSuccess,true);assert.equal(r.personaTask!.terminalSnapshot!.savedMethod,'local');assert.equal(methodAdmissibility('local',{canStoreCredentials:false,hasPhone:false}).consistent,false);assert.equal(r.steps.length,3);assert.equal(r.apiCalls,9);assert.equal(r.uiActions,2);for(const s of r.steps){assert.equal(s.selection!.modelChoice,s.response!.answers.nextAction.choice);assert.equal(s.selection!.selected,s.selection!.modelChoice);assert.deepEqual(s.selection!.raw,s.response!.answers.nextAction.probabilities);const action=s.action!;if(action.type==='click')assert.equal(action.elementId,s.selection!.selected);else assert.equal(action.type,'done');}assert.equal((await replayDirectory(join(out,'exploration'))).verified,true);
});

test('independent ordinary native invalid stop, provider immediate stop and timeouts remain infrastructure',{skip:!full,timeout:180000},async()=>{
 for(const kind of ['invalid','provider','timeout']){const {root,prior}=await rootFor('native-'+kind);const m=await runConstraintChoiceComparison({out:join(root,'batch'),priorSnapshot:prior,mock:true,repeats:1},async options=>runHumanJev(options,undefined,async()=>{if(kind==='invalid')return{model:'gpt-6-luna',status:'invalid-json',output:null,rawText:'invalid',request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};throw new VisualHypothesisTransportError(kind==='provider'?{code:'HTTP_ERROR',attempts:1,httpReceived:true,statusCode:429}:{code:'TIMEOUT',attempts:1,httpReceived:false});}));
 assert.equal(m.totalRequests,0);assert.equal(m.records.every((r:any)=>!r.valid),true);assert.equal(m.status,kind==='invalid'?'CONSECUTIVE_INVALID_TRIALS':kind==='provider'?'PROVIDER_UNAVAILABLE':'COMPLETED');assert.equal(m.records.length,kind==='invalid'?3:kind==='provider'?1:4);for(const row of m.records){const r=await json(row.resultPath);assert.equal(r.termination,'API_ERROR');assert.notEqual(r.termination,'ABANDONED');assert.equal(row.modelInvalid,kind==='invalid');}
 }
});

test('independent ordinary invalid assessment stops exactly after three durable trusted model-invalid results',{timeout:180000},async()=>{
 await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'invalid-assessment-'));
 const prior=join(root,'prior.json');await writeFile(prior,JSON.stringify({count:0,files:[]}));
 const manifest=await runConstraintChoiceComparison({out:join(root,'batch'),priorSnapshot:prior,mock:true,repeats:1},async options=>runHumanJev(options,async request=>{const response=answer(request);assert.ok(request.questions.knowledge,'test targets the assessment stage');response.answers.knowledge={choice:'invalid-not-a-criterion',probabilities:Object.fromEntries(Object.keys(request.questions.knowledge.criteria).map(key=>[key,0]))};return response;}));
 await writeFile(join(root,'independent-observed.json'),JSON.stringify({status:manifest.status,attempted:manifest.records.length,records:manifest.records.map((r:any)=>({status:r.status,modelInvalid:r.modelInvalid,error:r.error,summary:r.summary}))},null,2));
 assert.equal(manifest.status,'CONSECUTIVE_INVALID_TRIALS');assert.equal(manifest.records.length,3);assert.equal(manifest.totalRequests,0);
 for(const row of manifest.records){const result=await json(row.resultPath);assert.equal(result.termination,'INVALID_DISTRIBUTION');assert.equal(result.steps[0].error.code,'INVALID_ASSESSMENT');assert.equal(row.valid,false);assert.equal(row.modelInvalid,true);assert.equal(row.status,'RESULT');}
});
