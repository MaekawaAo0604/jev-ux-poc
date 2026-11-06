import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
const api=await import('../runner/public-persona-comparison.js').catch(()=>({} as any));
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');

test('public schedule supports1..100 repeats and four-position Latin rotation without actor-specific actions',()=>{
 assert.equal(typeof api.publicPersonaSchedule,'function');for(const repeats of [1,4,100]){const s=api.publicPersonaSchedule(repeats);assert.equal(s.length,repeats*4);assert.equal(new Set(s.map((v:any)=>v.id)).size,s.length);for(const actor of ['baseline','A','B','C'])assert.equal(s.filter((v:any)=>v.actor===actor).length,repeats);assert.ok(s.every((v:any)=>!Object.hasOwn(v,'actions')));}
 const s=api.publicPersonaSchedule(4);for(const actor of ['baseline','A','B','C'])assert.deepEqual(s.filter((v:any)=>v.actor===actor).map((v:any)=>v.position).sort(),[1,2,3,4]);for(const n of [0,101,1.2])assert.throws(()=>api.publicPersonaSchedule(n));
});

test('validation requires bounded explicit inputs and prevents mock credential reads and real injection',async()=>{
 assert.equal(typeof api.parsePublicPersonaOptions,'function');assert.throws(()=>api.parsePublicPersonaOptions(['--unknown']));assert.throws(()=>api.parsePublicPersonaOptions(['--out','x','--repeats','2.5']));
 const o={out:resolve('reports/example'),siteSpec:'site.json',charter:'charter.json',priorSnapshot:resolve('reports/prior.json'),mock:true,repeats:1};for(const change of [{repeats:101},{maxRequests:0},{maxPhaseMs:0},{envFile:'secret'}])assert.throws(()=>api.validatePublicPersonaOptions({...o,...change}));
 await assert.rejects(()=>api.runPublicPersonaComparison({...o,mock:false,envFile:resolve('../external.env')},async()=>({})),/MOCK_ONLY/);
});
async function setup(t:any){
 await mkdir(resolve('reports'),{recursive:true});const root=await mkdtemp(resolve('reports/public-cohort-test-'));t.after(()=>rm(root,{recursive:true,force:true}));const har=join(root,'frozen.har');await writeFile(har,'fixture');
 const siteSpec=join(root,'site.json'),charter=join(root,'charter.json'),priorSnapshot=join(root,'prior.json');const startURL='http://127.0.0.1:1/docs';await writeFile(siteSpec,JSON.stringify({schemaVersion:1,id:'local-test',startURL,allowedDocuments:[startURL],harPath:har,harSha256:sha('fixture'),capturedAtUTC:'2026-11-06T00:00:00Z',sourceDescription:'Offline injected test fixture'}));await writeFile(charter,JSON.stringify({schemaVersion:1,id:'read-passkeys',targetWebsite:startURL,goal:'Read the fixed independent passkey goal',initialState:{description:'Fresh snapshot',currentDate:'2026-11-06'},scope:['Read only'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}));await writeFile(priorSnapshot,JSON.stringify({count:0,files:[]}));
 return {root,options:{out:join(root,'batch'),siteSpec,charter,priorSnapshot,mock:true,repeats:1,maxRequests:144,maxPhaseMs:120000}};
}
async function successful(o:any,termination='DONE'){
 await mkdir(join(o.out,'exploration'),{recursive:true});await writeFile(join(o.out,'initial-product.png'),'product');const code=await sourceIdentity(),image=sha('image');const result:any={schemaVersion:1,runId:o.runId,condition:'human-screen-persona-unweighted',code:{revision:code.revision,sourceHash:code.sourceHash},config:humanJevProfile('experience-persona-unweighted',300000,60000).config,input:{charter:o.publicSite.charter,...(o.persona?{persona:o.persona}:{})},initialFingerprint:'same-initial',publicSite:{spec:o.publicSite.spec,networkMode:'frozen-har-no-fallback',events:[],initialProductImage:{file:'initial-product.png',sha256:sha('product')}},objectiveSuccess:null,objectiveAssessment:{status:'UNVERIFIED',value:null},perceivedDone:termination==='DONE',termination,looks:0,uiActions:0,decisions:1,apiCalls:0,apiMs:0,uiMs:0,modeledUserMs:null,elapsedMs:2,terminalObservation:{status:'RECORDED'},validForComparison:!['INVALID_DISTRIBUTION','API_ERROR'].includes(termination),steps:[{number:1,assetFiles:{current:{file:'input-1.png',sha256:image}},visualHypotheses:{request:{goal:o.publicSite.charter.goal,persona:o.persona??null},assetFiles:{current:{file:'s1-current.png',sha256:image}},response:{status:'completed'}}}]};await writeFile(join(o.out,'exploration/result.json'),JSON.stringify(result));return {root:o.out,result,review:{status:'NOT_RUN'}};
}

test('mock cohort stores compact paths/hashes/summaries and fixed inputs; resume never reruns attempted slots',async t=>{
 const {options}=await setup(t),seen:any[]=[];const m=await api.runPublicPersonaComparison(options,async(o:any)=>{seen.push(o);return successful(o);});assert.equal(m.status,'COMPLETED');assert.equal(m.records.length,4);assert.equal(m.totalRequests,0);assert.equal(m.preservationBefore,true);assert.equal(m.preservationAfter,true);assert.equal(m.limits.parallel,1);
 for(const r of m.records){assert.equal(r.result,undefined);assert.match(r.resultSha256,/^[a-f0-9]{64}$/);assert.equal(r.summary.objectiveSuccess,null);assert.equal(r.summary.objectiveAssessment.status,'UNVERIFIED');assert.equal(r.initialInputs.measured,true);assert.equal(r.initialInputs.nativeNonpersonaSha256,m.records[0].initialInputs.nativeNonpersonaSha256);}
 assert.ok(seen.every(o=>o.publicSite.charter.goal==='Read the fixed independent passkey goal'&&o.mode==='experience-persona-unweighted'&&o.longContext&&o.maximumRequests===36));assert.equal(new Set(seen.map(o=>o.runId)).size,4);
 const resumed=await api.runPublicPersonaComparison({...options,resume:true},async()=>{throw Error('MUST_NOT_RUN');});assert.equal(resumed.records.length,4);assert.equal(resumed.status,'COMPLETED');
});

test('resume rejects result tampering and changed snapshot/config identity before any further trial',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,successful);await writeFile(m.records[0].resultPath,'{}');await assert.rejects(()=>api.runPublicPersonaComparison({...options,resume:true},successful),/RESUME_RESULT_HASH_MISMATCH/);await assert.rejects(()=>api.runPublicPersonaComparison({...options,resume:true,repeats:2},successful),/RESUME_IDENTITY_MISMATCH/);
});

test('three consecutive model-invalid attempts are retained without replacements or user abandonment',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,(o:any)=>successful(o,'INVALID_DISTRIBUTION'));assert.equal(m.status,'CONSECUTIVE_INVALID_TRIALS');assert.equal(m.records.length,3);assert.ok(m.records.every((r:any)=>r.summary.termination==='INVALID_DISTRIBUTION'&&!r.valid));assert.equal(m.records.filter((r:any)=>r.summary.termination==='ABANDON').length,0);
});

test('quota failure stops after one attempt and arbitrary provider messages are never stored',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,async()=>{throw Object.assign(Error('NEVER_SAVE_THIS_SECRET'),{statusCode:429});});assert.equal(m.status,'PROVIDER_UNAVAILABLE');assert.equal(m.records.length,1);assert.equal(m.records[0].error.statusCode,429);assert.ok(!JSON.stringify(m).includes('NEVER_SAVE_THIS_SECRET'));
});

test('wrong objective success and persona identity invalidate and stop without rewriting raw result',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,async(o:any)=>{const saved=await successful(o);saved.result.objectiveSuccess=true;await writeFile(join(o.out,'exploration/result.json'),JSON.stringify(saved.result));return saved;});assert.equal(m.records.length,1);assert.equal(m.status,'PUBLIC_OBJECTIVE_MUST_REMAIN_UNVERIFIED');assert.equal(JSON.parse(await readFile(m.records[0].resultPath,'utf8')).objectiveSuccess,true);
});

test('resume preserves interrupted attempt, continues remaining slots once, and phase deadline is never reset',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,successful);m.records=m.records.slice(0,1);m.records[0].status='ATTEMPTING';m.status='RUNNING';m.totalRequests=0;for(const id of m.schedule.slice(1).map((s:any)=>s.id)){await rm(join(options.out,id),{recursive:true,force:true});}await writeFile(join(options.out,'manifest.json'),JSON.stringify(m));const seen:any[]=[];const resumed=await api.runPublicPersonaComparison({...options,resume:true},async(o:any)=>{seen.push(o);return successful(o);});assert.equal(seen.length,3);assert.equal(resumed.records[0].status,'INTERRUPTED');assert.equal(resumed.records[0].valid,false);assert.equal(resumed.deadlineEpochMs,m.deadlineEpochMs);
});

test('real request admission stops before an unbudgeted trial without reading the env file',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison({...options,mock:false,envFile:resolve('../COHORT_DO_NOT_READ.env'),maxRequests:35});assert.equal(m.status,'REQUEST_LIMIT');assert.equal(m.records.length,0);assert.equal(m.totalRequests,0);
});

test('phase time cap stops subsequent slots and resume does not reset the original deadline',async t=>{
 const {options}=await setup(t),now=Date.now,started=now();try{const m=await api.runPublicPersonaComparison({...options,maxPhaseMs:10000},async(o:any)=>{const result=await successful(o);Date.now=()=>started+100000;return result;});assert.equal(m.status,'PHASE_TIME_LIMIT');assert.equal(m.records.length,1);const r=await api.runPublicPersonaComparison({...options,maxPhaseMs:10000,resume:true},async()=>{throw Error('MUST_NOT_RUN');});assert.equal(r.records.length,1);assert.equal(r.deadlineEpochMs,m.deadlineEpochMs);}finally{Date.now=now;}
});

test('ledger hash and charged reservation mismatch stop resume without any network execution',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,successful);m.identity.mock=false;
 for(const r of m.records){r.ledger=r.dir+'-budget.json';const bytes=JSON.stringify({schemaVersion:1,status:'APPROVED',newMaximum:36,perRunMaximum:12,used:0,attempts:[]});await writeFile(r.ledger,bytes);r.ledgerEvidence={used:0,sha256:sha(bytes),reserved:0,ok:0,errors:0};}
 await writeFile(join(options.out,'manifest.json'),JSON.stringify(m));const realOptions={...options,mock:false,resume:true,envFile:resolve('../COHORT_DO_NOT_READ.env')};const verified=await api.runPublicPersonaComparison(realOptions);assert.equal(verified.records.length,4);
 await writeFile(m.records[0].ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',newMaximum:36,perRunMaximum:12,used:1,attempts:[{ordinal:1,status:'RESERVED'}]}));await assert.rejects(()=>api.runPublicPersonaComparison(realOptions),/RESUME_LEDGER_MISMATCH/);
});

test('prior preservation reads only explicitly listed reports and detects final byte changes',async t=>{
 const {root,options}=await setup(t),raw=join(root,'raw.json');await writeFile(raw,'preserve');await writeFile(options.priorSnapshot,JSON.stringify({count:1,files:[{path:raw,sha256:sha('preserve')}]}));let changed=false;const m=await api.runPublicPersonaComparison(options,async(o:any)=>{const saved=await successful(o);if(!changed){changed=true;await writeFile(raw,'changed');}return saved;});assert.equal(m.preservationBefore,true);assert.equal(m.preservationAfter,false);assert.equal(m.status,'PRIOR_RAW_CHANGED');assert.equal(await readFile(raw,'utf8'),'changed');
});

test('a concurrent resume cannot consume the same slot twice',async t=>{
 const {options}=await setup(t);let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);let first=true;
 const running=api.runPublicPersonaComparison(options,async(o:any)=>{if(first){first=false;entered();await gate;}return successful(o);});await waiting;await assert.rejects(()=>api.runPublicPersonaComparison({...options,resume:true},successful),/BATCH_ALREADY_RUNNING/);release();const m=await running;assert.equal(m.records.length,4);assert.equal(new Set(m.records.map((r:any)=>r.sequence)).size,4);
});

test('resume accounts a charged interrupted ledger even when the partial result is malformed',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,successful);m.identity.mock=false;m.status='RUNNING';m.records=m.records.slice(0,1);const row=m.records[0];row.status='ATTEMPTING';row.valid=false;row.ledger=row.dir+'-budget.json';row.resultSha256=null;delete row.ledgerEvidence;await writeFile(row.resultPath,'{"partial":');await writeFile(row.ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',newMaximum:36,perRunMaximum:12,used:1,attempts:[{ordinal:1,status:'RESERVED'}]}));m.totalRequests=0;await writeFile(join(options.out,'manifest.json'),JSON.stringify(m));
 const resumed=await api.runPublicPersonaComparison({...options,mock:false,resume:true,envFile:resolve('../COHORT_DO_NOT_READ.env')});assert.equal(resumed.status,'BUDGET_ACCOUNTING_FAILURE');assert.equal(resumed.records.length,1);assert.equal(resumed.records[0].requests,1);assert.equal(resumed.totalRequests,1);assert.equal(resumed.records[0].status,'INTERRUPTED');
});

test('checkpoint summary keeps pending attempts separate from invalid completed trials',async t=>{
 const {options}=await setup(t),during:any[]=[];const m=await api.runPublicPersonaComparison(options,async(o:any)=>{during.push(JSON.parse(await readFile(join(options.out,'summary.json'),'utf8')));return successful(o);});
 assert.equal(during.length,4);for(const [index,summary] of during.entries()){assert.equal(summary.attempted,index+1);assert.equal(summary.pending,1);assert.equal(summary.valid,index);assert.equal(summary.invalid,0);assert.equal(summary.byActor[m.schedule[index].actor].pending,1);assert.equal(summary.byActor[m.schedule[index].actor].invalid,0);}
 const final=JSON.parse(await readFile(join(options.out,'summary.json'),'utf8'));assert.equal(final.pending,0);assert.equal(final.invalid,0);assert.equal(final.valid,4);
 const failedOptions={...options,out:join(options.out,'../failed-pending-count')};await api.runPublicPersonaComparison(failedOptions,async()=>{throw {statusCode:429};});const failed=JSON.parse(await readFile(join(failedOptions.out,'summary.json'),'utf8'));assert.equal(failed.pending,0);assert.equal(failed.invalid,1);assert.equal(failed.valid,0);
});

test('three consecutive classified native schema failures count toward model-invalid stop',async t=>{
 const {options}=await setup(t);const m=await api.runPublicPersonaComparison(options,async(o:any)=>{const saved=await successful(o,'API_ERROR'),step=saved.result.steps[0];step.error={code:'INVALID_VISUAL_HYPOTHESES',status:'invalid-response'};step.visualHypotheses.error=step.error;step.visualHypotheses.response.status='invalid-response';await writeFile(join(o.out,'exploration/result.json'),JSON.stringify(saved.result));return saved;});
 assert.equal(m.status,'CONSECUTIVE_INVALID_TRIALS');assert.equal(m.records.length,3);assert.ok(m.records.every((r:any)=>r.modelInvalid===true&&!r.valid&&r.summary.termination==='API_ERROR'));assert.ok(m.records.every((r:any)=>r.summary.termination!=='ABANDONED'));
});

test('transport timeouts and HTTP503 do not become model-invalid from provider payload codes',async t=>{
 const {options}=await setup(t);let index=0;const m=await api.runPublicPersonaComparison(options,async(o:any)=>{const saved=await successful(o,'API_ERROR'),step=saved.result.steps[0];step.error=index++%2?{code:'HTTP_ERROR',statusCode:503}:{code:'TIMEOUT'};step.visualHypotheses.error=step.error;step.visualHypotheses.response.output={code:'INVALID_VISUAL_HYPOTHESES'};await writeFile(join(o.out,'exploration/result.json'),JSON.stringify(saved.result));return saved;});
 assert.equal(m.status,'COMPLETED');assert.equal(m.records.length,4);assert.ok(m.records.every((r:any)=>r.modelInvalid!==true&&!r.valid));
});
