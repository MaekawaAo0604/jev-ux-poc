import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {clearPersonaSchedule,clearPersonaStopReason,privacyFacts,runClearPersonaComparison} from '../runner/clear-persona-comparison.js';
import {loadPublicPersonaSet} from '../runner/public-persona-set.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {ChoiceRequestError} from '../jev/client.js';
import {buildExplorationViewer} from '../runner/exploration-viewer-data.js';
import {readPersonaTaskSnapshot,checkPersonaTaskObjective} from '../runner/persona-task-oracle.js';
import {personaTaskQuery} from '../app/persona-task-fixture.js';
import type {BetaResult} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {verifyTransferFrames} from '../runner/transfer-analysis.js';
import {readTransferLedger} from '../runner/transfer-evaluation.js';
import {personaInputBindings} from '../runner/persona-beta-comparison.js';
import {reconstructReplayCandidates} from '../runner/virtual-beta-replay-candidates.js';
import {replaySelection} from '../jev/virtual-beta/selection.js';

const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const readJSON=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const fixture={version:1 as const,task:'privacy' as const};
const enabled=process.env.CLEAR_PERSONA_INDEPENDENT==='1';

test('independent schedule is exactly four balanced rotated replicates, with a shared privacy fixture',()=>{
 const rows=clearPersonaSchedule();assert.equal(rows.length,16);
 assert.deepEqual(rows.map(r=>r.sequence),Array.from({length:16},(_,i)=>i+1));
 for(const actor of ['baseline','A','B','C']){const own=rows.filter(r=>r.actor===actor);assert.deepEqual(own.map(r=>r.replicate),[1,2,3,4]);assert.equal(new Set(own.map(r=>r.position)).size,4);}
 for(let replicate=1;replicate<=4;replicate++)assert.equal(new Set(rows.filter(r=>r.replicate===replicate).map(r=>r.actor)).size,4);
 assert.ok(rows.every(r=>JSON.stringify(r.fixture)===JSON.stringify(fixture)));
});

/** Reconstruct saved effects independently from the complete click-event prefix. */
function reconstructPrivacy(events:string[]){
 let pending='basic',origin='initial-default',originIndex:number|null=null,notifications=false,scope='none';
 const saves:any[]=[];
 for(const [i,event]of events.entries()){
  if(event==='scope-basic'||event==='scope-extended'){pending=event.slice(6);origin='explicit-selection';originIndex=i;}
  if(event==='quick-enable-extended'){pending='extended';origin='quick-extended';originIndex=i;notifications=true;scope='extended';saves.push({eventIndex:i,event,scope,origin,originIndex,interveningEvents:[]});}
  if(event==='enable-reminders'){notifications=true;scope=pending;saves.push({eventIndex:i,event,scope,origin,originIndex,interveningEvents:events.slice((originIndex??-1)+1,i)});}
  if(event==='disable-reminders'){notifications=false;scope='none';}
 }
 return{pending,origin,originIndex,notifications,scope,saves};
}

test('independent provenance reconstructs initial defaults, explicit pending changes, quick changes and unchanged carry',()=>{
 assert.deepEqual(reconstructPrivacy(['permission-details','enable-reminders']).saves.map(s=>[s.scope,s.origin]),[['basic','initial-default']]);
 const carried=reconstructPrivacy(['quick-enable-extended','disable-reminders','permission-details','enable-reminders']);assert.equal(carried.scope,'extended');assert.equal(carried.origin,'quick-extended');assert.deepEqual(carried.saves[1].interveningEvents,['disable-reminders','permission-details']);
 const draft=reconstructPrivacy(['permission-details','scope-basic','enable-reminders','scope-extended']);assert.equal(draft.scope,'basic');assert.equal(draft.pending,'extended');
 assert.equal(reconstructPrivacy(['permission-details','scope-basic','enable-reminders','disable-reminders']).scope,'none');
});

const actualBatch=process.env.CLEAR_PERSONA_ACTUAL_BATCH;
const analysisEnabled=process.env.CLEAR_PERSONA_ANALYZER_INDEPENDENT==='1';
test('independent analyzer rejects altered native admission and real transport provenance; excludes pending and invalid without imputation',{skip:!analysisEnabled,timeout:180000},async()=>{
 const {cp,copyFile}=await import('node:fs/promises'),{analyzeClearPersonas,privacyEventFacts,clearDistributionComparison}=await import('../scripts/analyze-clear-personas.js');
 const own=resolve('reports/clear-personas-2026-11-08/independent');await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'analyzer-')),batch=join(root,'batch');await mkdir(batch);
 const original=resolve('reports/clear-personas-2026-11-08/live-r1'),m=await readJSON(join(original,'manifest.json'));assert.equal(m.status,'COMPLETED');await copyFile(join(original,'protocol.json'),join(batch,'protocol.json'));
 for(const row of m.records){const dir=join(batch,row.id);await cp(row.dir,dir,{recursive:true});await copyFile(row.ledger,dir+'-budget.json');row.dir=dir;row.resultPath=join(dir,'exploration/result.json');row.ledger=dir+'-budget.json';}
 const evidence:any={schemaVersion:1,status:'RUNNING',modelAPIRequests:0,producerSha256:sha(await readFile('scripts/analyze-clear-personas.ts')),checks:[],cases:[],batch};
 const baseline=structuredClone(m),rawBaseline=await readFile(m.records[0].resultPath),file=join(batch,'manifest.json');
 const persist=async(value:any)=>writeFile(file,JSON.stringify(value));
 try{await persist(m);const initial=await analyzeClearPersonas({batch});assert.equal(initial.counts.valid,16);assert.equal(initial.counts.actualApiRequests,105);assert.equal(initial.pairs.length,6);evidence.checks.push('Untouched independent copy retains all 16 real rows and 105 requests');
 const mutate=async(name:string,change:(r:any,row:any)=>void,expected:string)=>{const mm=structuredClone(baseline),row=mm.records[0],r=JSON.parse(rawBaseline.toString());change(r,row);const bytes=JSON.stringify(r);await writeFile(row.resultPath,bytes);row.resultSha256=sha(bytes);await persist(mm);const report=await analyzeClearPersonas({batch});evidence.cases.push({name,eligible:report.runs[0].eligible,errors:report.runs[0].errors});assert.equal(report.runs[0].eligible,false,name);assert.ok(report.runs[0].errors.some((s:string)=>s.includes(expected)),JSON.stringify(report.runs[0].errors));await writeFile(row.resultPath,rawBaseline);};
 try{await mutate('altered admitted native conditions',(r)=>{r.steps[0].visualHypotheses.record.conditions[0].status='satisfied';},'REPLAY');}catch(error){evidence.nativeAdmissionFailure=error instanceof Error?error.message:String(error);await writeFile(baseline.records[0].resultPath,rawBaseline);}
 await mutate('missing real opaque binding',(r)=>{delete r.steps[0].response.request.imageBindings;},'JEV_IMAGE_BINDINGS_MISSING');
 await mutate('wrong opaque asset hash',(r)=>{r.steps[0].response.request.imageBindings.assets[0].imageSha256='0'.repeat(64);},'JEV_IMAGE_BINDING_MISMATCH');
 await mutate('baseline expectation injection with recomputed stage hash',(r)=>{const s=r.steps[0];s.modelInput.userState.expectations=['prefer extra information'];s.inputSha256=sha(JSON.stringify({input:s.modelInput,questions:s.questions,assets:s.assetFiles}));},'PERSONA_EXPECTATION_MISMATCH');
 const pending=structuredClone(baseline);pending.status='RUNNING';pending.records[0].status='ATTEMPTING';pending.records[0].valid=false;pending.records[0].requests=0;pending.records[0].resultPath='C:/NEVER_READ.env';pending.records[0].ledger='C:/NEVER_READ.env';pending.totalRequests-=baseline.records[0].requests;await persist(pending);const p=await analyzeClearPersonas({batch});assert.equal(p.counts.pending,1);assert.equal(p.counts.valid,15);assert.equal(p.runs[0].rawRead,false);assert.equal(p.byActor.baseline.denominator,3);assert.equal(p.byActor.baseline.savedScopeCounts.extended,3);evidence.checks.push('Pending baseline never follows paths and does not become an observed none scope');
 const invalid=structuredClone(baseline);invalid.records[0].status='FAILED';invalid.records[0].valid=false;await persist(invalid);const bad=await analyzeClearPersonas({batch});assert.equal(bad.counts.invalid,1);assert.equal(bad.byActor.baseline.denominator,3);assert.equal(bad.runs[0].route.length,2);assert.equal(bad.runs[0].savedScope,null);evidence.checks.push('Invalid raw prefix retained outside behavior denominator');
 const state=(events:string[],scope:string)=>({schemaVersion:1,task:'privacy',route:'complete',events,scope,notifications:scope!=='none',complete:scope!=='none',otherSessionActive:true,currentSessionActive:true,passwordChanged:false,draftCompact:false,savedCompact:false});
 assert.equal(privacyEventFacts(state(['permission-details','enable-reminders'],'basic')).lastEnableOrigin,'initial-default');assert.equal(privacyEventFacts(state(['permission-details','scope-basic','enable-reminders'],'basic')).lastEnableOrigin,'explicit-selection');assert.equal(privacyEventFacts(state(['quick-enable-extended','disable-reminders','permission-details','enable-reminders'],'extended')).lastEnableOrigin,'prior-selection-carry');assert.throws(()=>privacyEventFacts(state(['permission-details','enable-reminders'],'extended')));evidence.checks.push('Default, explicit and quick-disable-carry sources checked independently');
 const tv=clearDistributionComparison([{a:1,b:0},{a:.5,b:.5}],[{a:0,b:1},{a:.25,b:.75}]);assert.equal(tv.withinMeanTV.left,.5);assert.equal(tv.withinMeanTV.right,.25);assert.equal(tv.betweenMeanTV,.625);assert.equal(tv.meanVectorTV,.625);evidence.checks.push('Independent hand TV: within .5/.25 and cross .625');assert.equal(evidence.cases[0].eligible,false,'Native admission mutation must be excluded');evidence.status='PASS';
 }catch(error){evidence.status='FAIL';evidence.error=error instanceof Error?error.stack:String(error);throw error;}
 finally{await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2));await writeFile(join(own,'latest-analyzer-negative.json'),JSON.stringify(evidence,null,2));}
});
test('independent terminal actual audit: every saved raw, ledger, stage, replay, frame, event effect and viewer binding',{skip:!actualBatch,timeout:180000},async()=>{
 const batch=resolve(actualBatch!);assert.ok(batch.startsWith(resolve('reports/clear-personas-2026-11-08')+'\\'));const m=await readJSON(join(batch,'manifest.json'));assert.notEqual(m.status,'RUNNING','Never audit active raw or ledgers');assert.ok(m.records.every((r:any)=>r.status!=='ATTEMPTING'),'Never audit pending raw or ledgers');
 const own=resolve('reports/clear-personas-2026-11-08/independent');await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'actual-'));
 const e:any={schemaVersion:1,status:'RUNNING',realModelAPIRequests:0,batch,phaseStatus:m.status,planned:m.schedule.length,attempted:m.records.length,valid:0,invalid:0,requests:0,choices:0,rawArgmaxMatches:0,modelChoiceMatches:0,filteredChanged:0,checks:[],runs:[]};
 try{const freeze=await readJSON('reports/clear-personas-2026-11-08/freeze.json'),before=await sourceIdentity();assert.equal(before.sourceHash,freeze.sourceHash);assert.deepEqual(before.sourceHashes,freeze.sourceHashes);assert.equal(m.sourceHash,freeze.sourceHash);assert.deepEqual(m.schedule,clearPersonaSchedule());assert.equal(m.mock,false);assert.equal(m.humanInputsRead,false);assert.equal(m.savedInputResends,0);assert.equal(m.preservationBefore,true);assert.equal(m.preservationAfter,true);assert.equal(m.profile.config.maxDecisions,6);assert.equal(m.profile.config.deferral.applyWeights,false);assert.equal(m.limits.effectiveStageBound,288);assert.equal(m.limits.maxRequests,576);assert.equal(m.limits.parallel,1);assert.equal(m.limits.retry,0);assert.equal(sha(await readFile('experiments/virtual-beta/clear-personas.json')),freeze.protocol.sha256);
 const selected=await loadPublicPersonaSet('experiments/persona/clear-notifications-v1/set.json');assert.equal(m.personas.baseline,null);for(const a of selected.actors)assert.deepEqual(m.personas[a],selected.personas[a]);assert.equal(new Set(m.records.map((r:any)=>r.sequence)).size,m.records.length);assert.equal(new Set(m.records.map((r:any)=>r.runId)).size,m.records.length);
 const initial:any[]=[];
 for(const row of m.records){const bytes=await readFile(row.resultPath),r=JSON.parse(bytes.toString()) as BetaResult;assert.equal(sha(bytes),row.resultSha256);assert.equal(r.runId,row.runId);assert.deepEqual(r.code,row.source);assert.deepEqual(r.config,m.profile.config);const p=selected.personas[row.actor]??null;assert.deepEqual(r.input.persona??null,p);if(!p)assert.equal(Object.hasOwn(r.input,'persona'),false);assert.deepEqual(personaInputBindings({persona:p,result:r}).errors,[]);assert.equal(r.apiCalls,row.requests);assert.ok(r.apiCalls<=18);assert.ok(r.decisions<=6);assert.equal(r.decisions,r.steps.length);assert.ok(r.uiActions<=15);assert.ok(r.looks<=3);assert.ok(r.elapsedMs<=301000);assert.equal(row.valid,Boolean(row.status==='RESULT'&&!row.error&&r.validForComparison));row.valid?e.valid++:e.invalid++;
  const ledger=await readTransferLedger(row.ledger,36);assert.equal(ledger.used,r.apiCalls);assert.equal(ledger.reserved,0);assert.deepEqual(ledger,row.ledgerEvidence);e.requests+=ledger.used;const replay=await replayDirectory(join(row.dir,'exploration'),{finalVisualHTTP:true});assert.equal(replay.verified,true);const frames=await verifyTransferFrames(r,join(row.dir,'exploration'));assert.ok(frames.every(f=>f.validCurrentFrame));
  let stages=0;for(const s of r.steps){const native=s.visualHypotheses;if(native){stages+=native.apiCalls;assert.deepEqual(native.request.persona??null,p);assert.ok((native.timing?.httpDispatch?.httpTimeoutMs??0)<=60000);}
   if(s.deliberation)stages+=s.deliberation.apiCalls;if(s.response)stages++;
   for(const part of [s,s.deliberation])if(part?.modelInput){const input:any=part.modelInput;assert.deepEqual(input.exploration.persona??null,p);assert.deepEqual(input.userState.expectations,p?.expectations??[]);assert.equal(input.audit,undefined);for(const key of ['screen','visibleText','elements','url','personaTask'])assert.equal(input.observation[key],undefined);assert.equal(sha(JSON.stringify({input,questions:part.questions,assets:part.assetFiles})),part.inputSha256);}
   for(const part of [s,s.deliberation,native])if(part?.assetFiles)for(const asset of Object.values(part.assetFiles))assert.equal(sha(await readFile(join(row.dir,'exploration',asset.file))),asset.sha256);
   if(s.selection){const candidates=reconstructReplayCandidates(s.audit!.screen,Object.keys(s.questions!.nextAction.criteria));assert.deepEqual(replaySelection(s.selection,candidates),s.selection);assert.equal(s.selection.mode,'argmax');assert.equal(s.selection.draw,null);assert.ok(Object.values(s.selection.policy?.weights??{}).every(n=>n===1));assert.deepEqual(s.selection.raw,s.response!.answers.nextAction.probabilities);assert.equal(s.selection.modelChoice,s.response!.answers.nextAction.choice);const keys=Object.keys(s.selection.filtered).sort(),argmax=keys.reduce((a,b)=>s.selection!.filtered[b]>s.selection!.filtered[a]?b:a);assert.equal(s.selection.selected,argmax);assert.deepEqual(s.action,candidates[s.selection.selected].action);const rawMax=keys.reduce((a,b)=>s.selection!.raw[b]>s.selection!.raw[a]?b:a);e.choices++;if(rawMax===s.selection.selected)e.rawArgmaxMatches++;if(s.selection.modelChoice===s.selection.selected)e.modelChoiceMatches++;if(JSON.stringify(s.selection.normalized)!==JSON.stringify(s.selection.filtered))e.filteredChanged++;}
  }
  if(row.valid)assert.equal(stages,r.apiCalls);const first=r.steps[0];if(first?.visualHypotheses){const {persona,...request}=first.visualHypotheses.request;const current={productSha256:sha(await readFile(join(row.dir,'initial-product.png'))),currentImageSha256:first.assetFiles?.current.sha256,nativeNonpersonaSha256:sha(JSON.stringify({request,assets:first.visualHypotheses.assetFiles}))};assert.deepEqual(current,row.initialInputs);initial.push(current);assert.deepEqual(first.visualHypotheses.request.memory?.records,[]);assert.deepEqual(first.visualHypotheses.request.experience?.transitions,[]);}
  const terminal=r.personaTask!.terminalSnapshot!;assert.deepEqual(privacyFacts(terminal),row.privacyAudit);const effects=reconstructPrivacy(terminal.events);assert.equal(effects.notifications,terminal.notifications);assert.equal(effects.scope,terminal.scope);assert.equal(r.objectiveSuccess,terminal.notifications&&['basic','extended'].includes(terminal.scope));e.runs.push({sequence:row.sequence,actor:row.actor,replicate:row.replicate,valid:row.valid,termination:r.termination,perceivedDone:r.perceivedDone,objectiveSuccess:r.objectiveSuccess,requests:r.apiCalls,decisions:r.decisions,events:terminal.events,privacyAudit:row.privacyAudit,effects,replay,frames:frames.length});
 }
 assert.equal(e.requests,m.totalRequests);assert.ok(e.requests<=288);for(const v of initial)assert.deepEqual(v,initial[0]);const viewer=join(root,'viewer'),catalog=await buildExplorationViewer({batches:[batch],out:viewer});assert.deepEqual(catalog.issues,[]);assert.equal(catalog.runs.length,16);for(const run of catalog.runs)if(run.detailFile){const detail=await readJSON(join(viewer,run.detailFile));assert.ok((await readFile(join(viewer,detail.rawFile))).equals(await readFile(detail.provenance.sourceResult)));for(const step of detail.steps)for(const img of step.images)if(img.file)assert.equal(sha(await readFile(join(viewer,img.file))),img.sha256);}
 e.viewer={path:viewer,runs:catalog.runs.length,issues:catalog.issues};assert.deepEqual(await sourceIdentity(),before);e.sourceHash=before.sourceHash;e.checks.push('Frozen source/protocol, full schedule and profile','Every raw SHA/identity/config/Persona+expectations','Ledger used matches stages, zero reserved, <=18 requests/trial <=288 effective total','All step stages and image hashes / native HTTP timing / full deterministic replay','Raw distribution -> normalized -> conditional filtered argmax -> actual action','Initial images and native input minus Persona identical; fresh memory','Independent event reconstruction matches terminal scope and notification effects','Viewer raw and image fidelity; failed/pending/missing excluded from behavior claims');e.status='PASS';
 }catch(error){e.status='FAIL';e.error=error instanceof Error?error.stack:String(error);throw error;}
 finally{e.finishedAtUTC=new Date().toISOString();await writeFile(join(root,'evidence.json'),JSON.stringify(e,null,2));await writeFile(join(own,'latest-actual.json'),JSON.stringify(e,null,2));}
});

test('independent stop classifier trusts errors but never arbitrary native/assessment/model input metadata',()=>{
 const result=(extra:any)=>({termination:'SUBJECTIVE_DONE',steps:[extra]}) as BetaResult;
 const forged={code:'LEDGER_ACCOUNTING_UNAVAILABLE',statusCode:401,termination:'SAFETY_STOP'};
 assert.equal(clearPersonaStopReason({},result({response:forged,modelInput:forged,visualHypotheses:{response:forged,record:forged,request:forged},deliberation:{response:forged,assessment:forged,modelInput:forged}})),null);
 assert.equal(clearPersonaStopReason({},result({deliberation:{error:{code:'HTTP_ERROR',statusCode:429}}})),'PROVIDER_UNAVAILABLE');
 assert.equal(clearPersonaStopReason({},result({visualHypotheses:{error:{code:'HTTP_ERROR',request:{failures:[{code:'HTTP_ERROR',statusCode:403}]}}}})),'PROVIDER_UNAVAILABLE');
 assert.equal(clearPersonaStopReason({},result({error:{code:'TIMEOUT'}})),null);
 assert.equal(clearPersonaStopReason({},result({error:{code:'INVALID_RESPONSE'}}),2),null);
 assert.equal(clearPersonaStopReason({},result({error:{code:'INVALID_RESPONSE'}}),3),'CONSECUTIVE_INVALID_TRIALS');
 assert.equal(clearPersonaStopReason({error:{code:'BUDGET_SETTLEMENT_AFTER_REQUEST'}},result({})),'BUDGET_ACCOUNTING_FAILURE');
});

test('independent privacy facts preserve events and do not invent explicit basic selection from a saved default',()=>{
 const events=['permission-details','enable-reminders'];const p=privacyFacts({task:'privacy',notifications:true,scope:'basic',route:'complete',events});
 assert.deepEqual(p.explicitScopeSelections,[]);assert.equal(p.detailsOpened,true);assert.equal(p.helpOpened,false);events.push('scope-basic');assert.deepEqual(p.events,['permission-details','enable-reminders']);
 for(const state of [null,{task:'privacy',notifications:true,scope:'basic',events:[1]},{task:'methods',notifications:true,scope:'basic',events:[]}])assert.throws(()=>privacyFacts(state),/INVALID_PRIVACY_AUDIT/);
});

test('independent real UI: initial default, explicit selections, navigation and disable preserve pending scope; both scopes satisfy objective',{timeout:60000},async()=>{
 const own=resolve('reports/clear-personas-2026-11-08/independent');await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'ui-'));
 const server=await createServer({cacheDir:join(root,'vite-cache'),optimizeDeps:{entries:[],include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']},plugins:[{name:'clear-independent-fixture',resolveId(id){if(id==='/__clear-independent-entry.tsx')return '\0clear-independent-entry';},load(id){if(id==='\0clear-independent-entry')return "import React from 'react';import {createRoot} from 'react-dom/client';import {PersonaTaskFixtureView} from '/app/PersonaTaskFixture.tsx';createRoot(document.getElementById('root')).render(React.createElement(PersonaTaskFixtureView,{fixture:{version:1,task:'privacy'}}));";},configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__clear-independent-test'))return next();res.setHeader('Content-Type','text/html');res.end('<html lang="ja"><head><meta charset="utf-8"></head><body style="margin:0"><div id="root"></div><script type="module" src="/__clear-independent-entry.tsx"></script></body></html>');});}}],server:{host:'127.0.0.1',port:0,watch:{ignored:['**/reports/**']}}});let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const evidence:any={schemaVersion:1,realModelAPIRequests:0,status:'RUNNING',cases:[]};
 try{await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});
 const cases=[
  {name:'initial-basic-default',actions:['permission-details','enable-reminders'],scope:'basic',explicit:[]},
  {name:'explicit-basic',actions:['permission-details','scope-basic','enable-reminders'],scope:'basic',explicit:['basic']},
  {name:'explicit-extended',actions:['permission-details','scope-extended','enable-reminders'],scope:'extended',explicit:['extended']},
  {name:'quick-extended',actions:['quick-enable-extended'],scope:'extended',explicit:[]},
  {name:'extended-selection-carry',actions:['permission-details','scope-extended','start','permission-details','enable-reminders'],scope:'extended',explicit:['extended']},
  {name:'quick-then-disable-carry',actions:['quick-enable-extended','disable-reminders','permission-details','enable-reminders'],scope:'extended',explicit:[]},
  {name:'basic-then-disable-carry',actions:['permission-details','scope-basic','enable-reminders','disable-reminders','start','permission-details','enable-reminders'],scope:'basic',explicit:['basic']},
 ];
 for(const c of cases){const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});try{const page=await context.newPage();page.setDefaultTimeout(10000);await page.goto(base+'/__clear-independent-test'+personaTaskQuery(fixture));await page.locator('[data-persona-task-root]').waitFor();assert.equal(await checkPersonaTaskObjective(page,fixture),false);assert.deepEqual((await readPersonaTaskSnapshot(page,fixture)).events,[]);
  for(const id of c.actions){await page.locator('[data-persona-task-action="'+id+'"]').click();await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));if(id==='disable-reminders')assert.equal(await checkPersonaTaskObjective(page,fixture),false);}
  const s=await readPersonaTaskSnapshot(page,fixture);assert.equal(s.scope,c.scope);assert.equal(s.notifications,true);assert.deepEqual(s.events,c.actions);assert.deepEqual(privacyFacts(s).explicitScopeSelections,c.explicit);assert.equal(await checkPersonaTaskObjective(page,fixture),true);await page.screenshot({path:join(root,c.name+'.png')});evidence.cases.push({...c,snapshot:s,objective:true});
 }finally{await context.close();}}
 evidence.status='PASS';
 }catch(error){evidence.status='FAIL';evidence.error=error instanceof Error?error.stack:String(error);throw error;}
 finally{await browser?.close();await server.close();await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2));}
});

test('independent frozen normal mocks: Persona delivery, isolation, stage and image binding, viewer plus stopping limits',{skip:!enabled,timeout:360000},async()=>{
 const own=resolve('reports/clear-personas-2026-11-08/independent');await mkdir(own,{recursive:true});const root=await mkdtemp(join(own,'pipeline-'));
 const evidence:any={schemaVersion:1,realModelAPIRequests:0,status:'RUNNING',root,checks:[],batches:[]};
 const check=(s:string)=>evidence.checks.push(s);
 try{const before=await sourceIdentity(),freeze=await readJSON('reports/clear-personas-2026-11-08/freeze-r2.json');assert.equal(before.sourceHash,freeze.sourceHash);assert.deepEqual(before.sourceHashes,freeze.sourceHashes);evidence.sourceBefore=before;evidence.freezeFile='reports/clear-personas-2026-11-08/freeze-r2.json';const selected=await loadPublicPersonaSet('experiments/persona/clear-notifications-v1/set.json');const protocol=await readFile('experiments/virtual-beta/clear-personas.json');evidence.protocolSha256=sha(protocol);const prior=join(root,'empty-prior.json');await writeFile(prior,JSON.stringify({count:0,files:[]}));
 const batch=await runClearPersonaComparison({out:join(root,'normal'),priorSnapshot:prior,mock:true,repeats:1,envFile:'C:/NEVER_READ.env'});evidence.batches.push(batch);assert.equal(batch.status,'COMPLETED');assert.equal(batch.records.length,4);assert.equal(batch.records.filter((r:any)=>r.valid).length,4);assert.equal(batch.totalRequests,0);assert.equal(batch.preservationAfter,true);assert.equal(batch.personas.baseline,null);assert.equal(batch.profile.config.maxDecisions,6);assert.equal(batch.profile.config.selection.mode,'argmax');assert.equal(batch.profile.config.deferral.applyWeights,false);assert.equal(batch.limits.effectiveStageBound,72);assert.equal(batch.limits.maxRequests,144);
 assert.equal(new Set(batch.records.map((r:any)=>r.runId)).size,4);for(const name of ['productSha256','currentImageSha256','nativeNonpersonaSha256'])assert.equal(new Set(batch.records.map((r:any)=>r.initialInputs[name])).size,1,name);
 for(const row of batch.records){const bytes=await readFile(row.resultPath),r=JSON.parse(bytes.toString()),p=selected.personas[row.actor]??null;assert.equal(sha(bytes),row.resultSha256);assert.equal(row.personaDelivery.native,1);assert.equal(row.personaDelivery.assessment,1);assert.equal(row.personaDelivery.action,1);assert.deepEqual(row.personaDelivery.errors,[]);assert.equal(r.apiCalls,3);assert.equal(r.steps.length,1);assert.equal(r.objectiveSuccess,false);assert.equal(r.perceivedDone,true);assert.equal(r.termination,'SUBJECTIVE_DONE');assert.deepEqual(r.input.persona??null,p);if(p)assert.deepEqual(r.input.persona,p);else assert.equal(Object.hasOwn(r.input,'persona'),false);
  const s=r.steps[0],native=s.visualHypotheses.request;assert.deepEqual(native.persona??null,p);assert.deepEqual(native.memory.records,[]);assert.deepEqual(native.experience.transitions,[]);assert.deepEqual(native.conditionContinuity.memory.entries,[]);assert.equal(native.conditionContinuity.memory.lastObservation,null);for(const candidate of native.candidates)assert.deepEqual(Object.keys(candidate).sort(),['id','type']);
  for(const part of [s,s.deliberation]){const input=part.modelInput;assert.deepEqual(input.exploration.persona??null,p);assert.deepEqual(input.userState.expectations,p?.expectations??[]);assert.equal(input.audit,undefined);for(const key of ['screen','visibleText','url','elements','personaTask'])assert.equal(input.observation[key],undefined);assert.deepEqual(input.memoryObservations.map((x:any)=>x.observationId),['o1']);assert.equal(sha(JSON.stringify({input,questions:part.questions,assets:part.assetFiles})),part.inputSha256);}
  for(const part of [s,s.deliberation,s.visualHypotheses])for(const asset of Object.values(part.assetFiles) as any[])assert.equal(sha(await readFile(join(row.dir,'exploration',asset.file))),asset.sha256);
  assert.equal(s.selection.mode,'argmax');assert.equal(s.selection.draw,null);assert.ok(Object.values(s.selection.policy?.weights??{}).every(v=>v===1));assert.deepEqual(s.selection.filtered,s.selection.normalized);const max=Math.max(...Object.values(s.selection.filtered) as number[]);assert.equal(s.selection.filtered[s.selection.selected],max);assert.equal(s.selection.selected,'done');assert.deepEqual(s.action,{type:'done'});assert.equal(s.outcome,'SUBJECTIVE_DONE');assert.equal(row.replay.status,'OK');assert.ok(row.frameChecks.every((x:any)=>x.validCurrentFrame));
 }
 check('Four ordinary mock runHumanJev actors: absent baseline Persona, full three-stage profiles, fresh memory, shared initial non-Persona input/pixels, cap6, no weights, raw/hash/frame replay');
 const viewer=join(root,'viewer'),catalog=await buildExplorationViewer({batches:[join(root,'normal')],out:viewer});assert.equal(catalog.runs.length,4);assert.deepEqual(catalog.issues,[]);assert.equal(new Set(catalog.runs.map(r=>r.group)).size,1);for(const run of catalog.runs){assert.equal(run.mock,true);assert.equal(run.validity,'valid');const detail=await readJSON(join(viewer,run.detailFile!));assert.ok((await readFile(join(viewer,detail.rawFile))).equals(await readFile(detail.provenance.sourceResult)));assert.equal(detail.steps[0].images.length,3);for(const img of detail.steps[0].images){assert.equal(img.delivery,'response-received');assert.equal(sha(await readFile(join(viewer,img.file))),img.sha256);}}
 check('Viewer preserves four roles in a shared comparison group and byte-identical raw JSON / delivered images');
 const runCase=async(name:string,trial:Parameters<typeof runClearPersonaComparison>[1],count:number,status:string)=>{const m=await runClearPersonaComparison({out:join(root,name),priorSnapshot:prior,mock:true,repeats:1},trial);evidence.batches.push(m);assert.equal(m.status,status,name);assert.equal(m.records.length,count,name);assert.equal(m.totalRequests,0);assert.equal(m.records.filter((r:any)=>r.valid).length,0);assert.equal(m.preservationAfter,true);return m;};
 const invalid=await runCase('assessment-invalid',o=>runHumanJev(o,async()=>({model:'MOCK_SCRIPTED_FIXTURE',answers:{}})),3,'CONSECUTIVE_INVALID_TRIALS');assert.ok(invalid.records.every((r:any)=>r.summary.termination==='INVALID_DISTRIBUTION'&&r.modelInvalid));check('Three trusted invalid assessment trials stop without replacing missing fourth slot');
 const native=await runCase('native-invalid',o=>runHumanJev(o,undefined,async()=>({model:'gpt-6-luna',status:'completed',rawText:'{}',output:{} as any,request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null})),3,'CONSECUTIVE_INVALID_TRIALS');assert.ok(native.records.every((r:any)=>r.modelInvalid));check('Three trusted invalid native outputs stop without replacement');
 await runCase('provider-unavailable',o=>runHumanJev(o,async()=>{throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:429});}),1,'PROVIDER_UNAVAILABLE');check('Trusted provider429 stops immediately');
 const timeout=await runCase('timeout',o=>runHumanJev(o,async()=>{throw new ChoiceRequestError({code:'TIMEOUT'});}),4,'COMPLETED');assert.ok(timeout.records.every((r:any)=>r.summary.termination==='API_ERROR'&&!r.modelInvalid));check('Timeouts are retained infrastructure failures, never user abandonment or model-invalid streak');
 assert.deepEqual(await sourceIdentity(),before);assert.equal(sha(await readFile('experiments/virtual-beta/clear-personas.json')),sha(protocol));check('Source and protocol unchanged throughout verification');evidence.status='PASS';
 }catch(error){evidence.status='FAIL';evidence.error=error instanceof Error?error.stack:String(error);throw error;}
 finally{evidence.finishedAtUTC=new Date().toISOString();await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2));await writeFile(join(own,'latest-pipeline.json'),JSON.stringify(evidence,null,2));}
});
