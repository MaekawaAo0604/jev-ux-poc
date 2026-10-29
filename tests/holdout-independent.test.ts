import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {createServer,type ViteDevServer} from 'vite';
import {chromium,type Browser,type Page} from 'playwright';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {sha,runBeta,type BetaResult,type BetaStep} from '../runner/virtual-beta-core.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {holdoutDefinition,type HoldoutFixture} from '../app/holdout-fixture.js';
import {holdoutSchedule,runHoldoutStability} from '../runner/holdout-stability.js';
import {analyzeHoldoutRuns,type HoldoutRunRecord} from '../runner/holdout-analysis.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {parseCharter} from '../jev/persona.js';

// Fresh verifier, normal transport, local fetch interception only. Never read env or participant files.
process.env.AI_GATEWAY_API_KEY='MOCK_INDEPENDENT_HOLDOUT_ONLY';
process.loadEnvFile=()=>{throw new Error('ENV_READ_FORBIDDEN');};
const reportRoot=resolve('reports/holdout-stability-2026-10-28/independent-'+Date.now()+'-'+process.pid);
await mkdir(reportRoot,{recursive:true});
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
const frozen=await sourceIdentity();
const protocol=await json('experiments/virtual-beta/holdout-stability.json');
const evidence:any={kind:'independent-preflight',realAPIRequests:0,sourceHash:frozen.sourceHash,checks:[],fixtureEvidence:[],adapterEvidence:[]};
after(async()=>{const final=await sourceIdentity();assert.equal(final.sourceHash,frozen.sourceHash,'functional-verification sources changed during execution');assert.deepEqual(final.sourceHashes,frozen.sourceHashes);evidence.finalSourceHash=final.sourceHash;await writeFile(join(reportRoot,'preflight.json'),JSON.stringify(evidence,null,2)+'\n');});
let server:ViteDevServer,browser:Browser,baseURL:string;
before(async()=>{server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0}});await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');baseURL='http://127.0.0.1:'+address.port;browser=await chromium.launch({headless:true});});
after(async()=>{await browser?.close();await server?.close();});
const expected={switch:'定期便のお届け曜日を土曜日に変更しました',revisit:'共有リンクを無効にしました',direct:'次回の予約を2026年11月14日に変更しました'};
const tokens={switch:['s1a','s1b'],revisit:['r1a','r1b'],direct:['d1a','d1b']};
const click=async(p:Page,id:string)=>{await p.locator('[data-holdout-action="'+id+'"]').click();await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));};
const incomplete=async(p:Page)=>{assert.equal(await p.locator('[data-holdout-complete]').count(),0);assert.equal(await p.getByRole('status').count(),0);};
async function hashImage(p:Page){return sha(await p.screenshot());}
async function open(p:Page,path:string){await p.goto(baseURL+path,{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready);}

test('independent source identity, unchanged baseline policy, protocol schedule and bounded profiles',async t=>{
 const current=await sourceIdentity();assert.equal(current.sourceHash,frozen.sourceHash);assert.deepEqual(current.sourceHashes,frozen.sourceHashes);
 let baselineAvailable=true;try{execFileSync('git',['cat-file','-e',protocol.baselineRevision+'^{commit}'],{stdio:'pipe'});}catch{baselineAvailable=false;}
 if(baselineAvailable){for(const file of Object.keys(protocol.frozenPolicyHashes))assert.equal(execFileSync('git',['show',protocol.baselineRevision+':'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'),execFileSync('git',['show','5798717671f7fec7502a225e40ac56db48e1c5e4:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'),'historical holdout producer policy content must match its baseline apart from Git checkout line endings');}else await t.test('optional historical policy proof',{skip:'baseline commit unavailable in this checkout; all functional cases still execute'},()=>{});
 assert.deepEqual(holdoutSchedule(),protocol.schedule);assert.equal(new Set(holdoutSchedule().map(r=>r.id)).size,24);
 for(const mode of ['experience-basis','experience-defer'] as const){const p=humanJevProfile(mode);assert.equal(p.maximumRequests,24);assert.equal(p.reviewMaximum,0);assert.equal(p.perRunMaximum,12);assert.deepEqual([p.config.maxAPICalls,p.config.maxDecisions,p.config.maxUIActions,p.config.maxLooks,p.config.maxRunMs],[24,12,15,3,180000]);assert.deepEqual(p.config.vision,{mode:'crop',clearWidth:4096,clearHeight:4096,blurRadius:12});}
 evidence.revision=current.revision;evidence.checks.push('frozen-source-and-baseline-policy','24-fixed-schedule-and-bounds');
});

test('independent full main: all six real UI paths, mandatory revisit gates, stable home pixels and fresh reset',async()=>{
 for(const task of ['switch','revisit','direct'] as const)for(const [i,variant] of (['alpha','beta'] as const).entries()){
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'block'}),p=await context.newPage();
  try{
   await open(p,'/good/?holdout='+tokens[task][i]);await p.locator('.holdout-fixture').waitFor();await incomplete(p);const initial=await hashImage(p);const initialFile=task+'-'+variant+'-initial.png';await p.screenshot({path:join(reportRoot,initialFile)});
   if(task==='switch'){await click(p,'primary');await incomplete(p);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);await click(p,'home');assert.equal(await hashImage(p),initial);await click(p,'alternative');}
   else if(task==='revisit'){
    await click(p,'account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),false);await click(p,'home');assert.equal(await hashImage(p),initial);
    await click(p,'primary');await incomplete(p);assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);
    await p.evaluate(()=>{location.hash='account';});await p.waitForURL('**#account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),false);
    await click(p,'home');assert.equal(await hashImage(p),initial);await click(p,'account');await click(p,'verify');await incomplete(p);
    await p.evaluate(()=>{location.hash='primary';});await p.waitForURL('**#primary');assert.equal(await p.locator('[data-holdout-action="apply"]').count(),0);
    await click(p,'home');assert.equal(await hashImage(p),initial);await click(p,'primary');await incomplete(p);
   }else{await click(p,'primary');await incomplete(p);}
   await click(p,'apply');assert.equal(await p.getByRole('status').count(),1);assert.equal(await p.locator('[data-holdout-complete="true"]').count(),1);assert.equal(await p.getByRole('status').innerText(),expected[task]);assert.equal(await p.getByRole('status').isVisible(),true);
   await p.screenshot({path:join(reportRoot,task+'-'+variant+'-complete.png')});await p.reload({waitUntil:'networkidle'});await incomplete(p);await click(p,'home');assert.equal(await hashImage(p),initial);evidence.fixtureEvidence.push({task,variant,initialImageSha256:initial,completionUnique:true,reloadReset:true,requiredRevisit:task==='revisit'});
  }finally{await context.close();}
 }
 evidence.checks.push('six-full-main-paths-reset-and-revisit-gates');
});

test('independent normal good and bad UI remain reachable; holdout never mounts on bad or ambiguous selector',async()=>{
 const p=await browser.newPage();try{for(const path of ['/good/','/bad/','/bad/?holdout=s1a','/good/?holdout=s1a&holdout=r1b','/good/?holdout=s1a&betaUI=r']){await open(p,path);assert.equal(await p.locator('.holdout-fixture').count(),0);assert.match(await p.locator('body').innerText(),/暮らし/);}
 await open(p,'/good/');await p.getByRole('link',{name:'通知設定',exact:true}).click();await p.getByRole('button',{name:'メール通知を停止する',exact:true}).click();assert.equal(await p.getByRole('status').innerText(),'メール通知を停止しました');
 await open(p,'/bad/');assert.equal(await p.getByRole('link',{name:'通知設定',exact:true}).count(),0);assert.equal(await p.getByRole('link',{name:'各種設定',exact:true}).count(),1);
 }finally{await p.close();}evidence.checks.push('legacy-main-good-bad-and-opt-in-isolation');
});

function response(body:any,action:string,malformed=false){
 return {model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q]:[string,any])=>{
 const choice=id==='nextAction'?action:id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id.startsWith('effect_')?'advances':id==='experienceProgress'?'unknown':id==='experienceExpectation'?'unknown':'none';
 assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);
 return [id,{choice,probabilities:malformed&&id==='knowledge'?{unexpected:1}:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
 }))};
}
function checkBoundary(body:any){
 const state=body.state;assert.equal(body.model,'jev-1.14.0');assert.equal(state.exploration.charter.targetWebsite,'local:demo');assert.equal(state.exploration.charter.oracle,undefined);assert.equal(state.exploration.persona,undefined);assert.equal(state.observation.screen,undefined);assert.equal(state.audit,undefined);assert.equal(state.deferral,undefined);assert.equal(state.userState.deferrals,undefined);
 const serialized=JSON.stringify(state);assert.doesNotMatch(serialized, /holdout=|data-holdout|referencePath|holdoutFixture|definitionHash|sourceHash|rawScreenshot|regionsOfInterest|"oracle"|"fixture"|"audit"/);
 assert.deepEqual(Object.keys(state.observation).sort(),['candidateIds','clearRect','fixation','height','id','image','transform','viewport','width'].sort());
}
async function transport(name:string,mode:'experience-basis'|'experience-defer',options:{failure?:'http'|'malformed';expired?:boolean}={}){
 const dir=join(reportRoot,name),ledger=join(reportRoot,name+'-budget.json'),bodies:any[]=[];await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'MOCK_INDEPENDENT_HOLDOUT_ONLY',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}),{flag:'wx'});
 const previous=globalThis.fetch;let actionIndex=0;
 globalThis.fetch=async(url,init)=>{
  assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer MOCK_INDEPENDENT_HOLDOUT_ONLY');assert.equal(new Headers(init?.headers).get('TypeSafe-Danger-Zone-Long-Context'),'true');assert.ok(init?.signal);checkBoundary(JSON.parse(String(init?.body)));const body=JSON.parse(String(init?.body));bodies.push(body);
  if(options.failure==='http')return new Response('',{status:503});
  const action=['e2','e2','done'][actionIndex];if(body.questions.nextAction)actionIndex++;return new Response(JSON.stringify(response(body,action,options.failure==='malformed')),{status:200});
 };
 try{const saved=await runHumanJev({out:dir,mock:false,mode,phaseBudget:ledger,longContext:true,holdoutFixture:{task:'direct',variant:'alpha'},runId:name,...(options.expired?{deadlineEpochMs:Date.now()-1}:{})});const budget=await json(ledger),manifest=await json(join(dir,'manifest.json'));assert.equal(budget.used,bodies.length);assert.equal(saved.result.apiCalls,bodies.length);assert.equal(manifest.actualAPIRequests,bodies.length);assert.equal(manifest.humanInputsRead,false);assert.equal(saved.result.code?.sourceHash,frozen.sourceHash);assert.ok(budget.attempts.every((a:any)=>a.metadata.attempts===1));assert.equal(saved.review.reason,'PROFILE_DISABLED');evidence.adapterEvidence.push({name,requests:bodies.length,realAPIRequests:0,termination:saved.result.termination,objective:saved.result.objectiveAssessment,ledger:budget,bodyHashes:bodies.map(b=>sha(JSON.stringify(b)))});return {...saved,bodies,budget};}finally{globalThis.fetch=previous;}
}

test('independent ordinary adapter: complete body equality, fresh reset, model ignorance and successful UI oracle',async()=>{
 const c=await transport('adapter-control','experience-basis'),p=await transport('adapter-policy','experience-defer');
 assert.equal(c.result.objectiveSuccess,true);assert.equal(p.result.objectiveSuccess,true);assert.equal(p.result.termination,'SUBJECTIVE_DONE');assert.equal(p.result.uiActions,2);assert.equal(p.bodies.length,6);assert.deepEqual(c.bodies,p.bodies);assert.equal(sha(await readFile(join(c.root,'initial-product.png'))),sha(await readFile(join(p.root,'initial-product.png'))));
 assert.equal(p.result.steps[0].selection!.drawIndex,0);assert.deepEqual(p.result.steps[0].deferral!.state.entries,[]);assert.ok(p.result.steps.every(s=>s.deliberation!.assessment!.goal!=='satisfied'));assert.equal((await replayDirectory(join(c.root,'exploration'))).verified,true);assert.equal((await replayDirectory(join(p.root,'exploration'))).verified,true);evidence.checks.push('normal-adapter-pair-input-equality-actual-direct-success-and-replay');
});

test('independent ordinary adapter: HTTP, malformed and expired deadline never retry or operate UI',async()=>{
 for(const failure of ['http','malformed'] as const){const saved=await transport('adapter-'+failure,'experience-defer',{failure});assert.equal(saved.bodies.length,1);assert.equal(saved.result.termination,failure==='http'?'API_ERROR':'INVALID_DISTRIBUTION');assert.equal(saved.result.uiActions,0);assert.equal(saved.result.validForComparison,false);assert.equal(saved.result.perceivedDone,false);}
 const expired=await transport('adapter-expired','experience-defer',{expired:true});assert.equal(expired.bodies.length,0);assert.equal(expired.budget.used,0);assert.equal(expired.result.termination,'TIME_LIMIT');assert.equal(expired.result.uiActions,0);evidence.checks.push('normal-adapter-no-retry-malformed-http-and-phase-deadline');
});

async function core(name:string,mutate:(p:Page)=>Promise<void>,stop=false){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),p=await context.newPage();const fixture:HoldoutFixture={task:'direct',variant:'alpha'},original=await json('experiments/persona/charter.json'),charter=parseCharter({...original,targetWebsite:'local:good',goal:holdoutDefinition(fixture).goal});let stopped=false;
 try{return await runBeta(p,{runId:name,dir:join(reportRoot,name),baseURL,charter,config:humanJevProfile('experience-defer').config,holdoutFixture:fixture,isSafetyStopped:()=>stopped,evaluate:async request=>{await mutate(p);stopped=stop;return response({questions:request.questions},request.questions.nextAction?'done':'e2') as any;}});}finally{await context.close();}
}
test('independent oracle uniqueness and safety stop cannot be mistaken for objective failure or model completion',async()=>{
 const dup=await core('ambiguous-oracle',async p=>{await p.evaluate(text=>{for(let i=0;i<2;i++){const node=document.createElement('p');node.setAttribute('data-holdout-complete','true');node.setAttribute('role','status');node.textContent=text;document.body.append(node);}},expected.direct);});
 assert.equal(dup.objectiveAssessment.status,'ERROR');assert.equal(dup.objectiveAssessment.value,null);assert.equal(dup.validForComparison,false);
 const stopped=await core('safety-stop',async()=>{},true);assert.equal(stopped.termination,'SAFETY_STOP');assert.equal(stopped.uiActions,0);assert.equal(stopped.perceivedDone,false);assert.equal(stopped.validForComparison,false);evidence.checks.push('oracle-ambiguity-and-safety-stop');
});

test('independent batch mock uses no fetch, no ledger and refuses output reuse',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('NO_API_IN_MOCK');};
 try{const out=join(reportRoot,'batch-mock');const saved=await runHoldoutStability({out,mock:true,limit:2});assert.equal(saved.trials,2);assert.equal(saved.requests,0);assert.equal(saved.status,'COMPLETED');assert.equal(calls,0);const manifest=await json(join(out,'manifest.json'));assert.equal(manifest.records.length,2);assert.equal(manifest.humanInputsRead,false);assert.equal((await json(join(out,'summary.json'))).pairs[0].consistent,true);assert.equal((await json(join(out,'prior-ledger-check.json'))).unchanged,true);await assert.rejects(runHoldoutStability({out,mock:true,limit:2}),/EEXIST/);assert.equal((await json(join(out,'manifest.json'))).records.length,2);}finally{globalThis.fetch=previous;}
 evidence.checks.push('batch-mock-zero-api-prior-ledger-preservation-and-output-no-reset');
});

test('independent analysis mutation checks: faults, missing destination and pair identity',async()=>{
 const saved=await json(join(reportRoot,'adapter-control/exploration/result.json')) as BetaResult;
 function record(condition:'control'|'policy',replicate=1):HoldoutRunRecord{const id='synthetic-'+condition+'-'+replicate,result=structuredClone(saved);result.runId=id;if(condition==='policy')result.config=humanJevProfile('experience-defer').config;return {id,task:'direct',variant:'alpha',replicate,condition,initialImageSha256:'same',result};}
 const c=record('control'),p=record('policy');assert.equal(analyzeHoldoutRuns([c,p]).pairs[0].consistent,true);
 for(const mutate of [(r:HoldoutRunRecord)=>{r.result.code!.revision='other';},(r:HoldoutRunRecord)=>{r.result.config.selection.seed++;},(r:HoldoutRunRecord)=>{r.initialImageSha256='other';},(r:HoldoutRunRecord)=>{r.result.input.persona={} as any;},(r:HoldoutRunRecord)=>{r.result.code!.sourceHash='other';}]){const changed=structuredClone(p);mutate(changed);assert.equal(analyzeHoldoutRuns([c,changed]).pairs[0].consistent,false);}
 const fault=record('control',2);fault.result.termination='API_ERROR';fault.result.objectiveAssessment={status:'OK',value:false};fault.result.objectiveSuccess=false;fault.result.uiActions=999;const summary=analyzeHoldoutRuns([c,fault]);assert.equal(summary.cells[0].objectiveFailures,0);assert.equal(summary.cells[0].faults,1);assert.equal(summary.cells[0].meanUIActions,2);
 const first=structuredClone(c.result.steps[0]),last=structuredClone(c.result.steps[1]);last.number=3;last.observationId='o3';last.audit!.url=first.audit!.url;last.assetFiles!.current.sha256=first.assetFiles!.current.sha256;
 const away=structuredClone(c.result.steps[1]);away.number=2;away.observationId='o2';last.modelInput={experienceContext:{returnedRoutes:[{fromObservationId:'o1',toObservationId:'o3',path:[{source:{observationId:'o1',imageSha256:first.assetFiles!.current.sha256},result:{observationId:'o2',imageSha256:away.assetFiles!.current.sha256}},{source:{observationId:'o2',imageSha256:away.assetFiles!.current.sha256},result:{observationId:'o3',imageSha256:last.assetFiles!.current.sha256}}]}]}};
 const terminal=structuredClone(away);terminal.number=4;delete terminal.action;delete terminal.selection;last.action={type:'click',elementId:'different-id'};last.outcome='UI_PERFORMED';c.result.steps=[first,away,last,terminal];
 assert.equal(analyzeHoldoutRuns([c]).runs[0].postReturnBranches[0].status,'same-destination');last.audit!.url=first.audit!.url+'#home';assert.equal(analyzeHoldoutRuns([c]).runs[0].postReturnBranches[0].status,'same-destination','initial empty hash and rendered #home are the same bundled home route');terminal.audit!.url=first.audit!.url+'#alternative';assert.equal(analyzeHoldoutRuns([c]).runs[0].postReturnBranches[0].status,'changed-destination');c.result.steps.pop();const unknown=analyzeHoldoutRuns([c]).runs[0];assert.equal(unknown.postReturnBranches[0].status,'unknown');assert.equal(unknown.metrics.postReturnBranchChanges,0);assert.equal(unknown.route.edges.at(-1)!.status,'unknown');evidence.checks.push('adversarial-analysis-pair-fault-and-unknown-destination');
});


test('independent native browser Back supports the required real home revisits',async()=>{
 for(const token of ['r1a','r1b']){
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP'}),p=await context.newPage();
  try{
   await open(p,'/good/?holdout='+token);const initial=await hashImage(p);
   await click(p,'primary');await incomplete(p);await p.goBack();await p.waitForURL('**/?holdout='+token);assert.equal(await hashImage(p),initial);
   await click(p,'account');assert.equal(await p.locator('[data-holdout-action="verify"]').isEnabled(),true,'actual home return via native Back must admit the verification prerequisite');
   await click(p,'verify');await incomplete(p);await p.goBack();await p.waitForURL('**/?holdout='+token);await click(p,'primary');
   assert.equal(await p.locator('[data-holdout-action="apply"]').count(),1,'actual home return via native Back must enable the required revisit');await click(p,'apply');assert.equal(await p.getByRole('status').innerText(),expected.revisit);
  }finally{await context.close();}
 }
 evidence.checks.push('native-browser-back-actual-revisit');
});
