import {compareRecoveryLegacyProducers,assertRecoveryLegacyTrace,prepareRecoveryCurrentClone} from './recovery-compatibility-helper.js';
import {normalizeJevImageWire,currentJevImage} from './jev-image-wire.js';
import test from'node:test';import assert from'node:assert/strict';import{readFile,mkdir,mkdtemp,writeFile,access}from'node:fs/promises';import{join}from'node:path';import{execFileSync}from'node:child_process';import{runHumanJev}from'../runner/human-jev-experiment.js';import{replayDirectory}from'../runner/virtual-beta-replay.js';import{sha}from'../runner/virtual-beta-core.js';
const base='reports/recovery-transfer-2026-10-29';
const answer=(b:any)=>({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'done':id.startsWith('goalSearch_')?'uncertain':id==='decisionBasis'?'goal':id==='experienceProgress'||id==='experienceExpectation'?'unknown':id==='knowledge'?'insufficient':id==='goal'?'uncertain':id.startsWith('effect_')?'unknown':'none';assert.ok(Object.hasOwn(q.criteria,choice),id);return[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});
test('recovery HTTP current images contain visible UI while audit groundtruth and condition are excluded',async t=>{
 t.mock.method(process,'loadEnvFile',()=>{throw Error('REAL_ENV_READ_FORBIDDEN');});process.env.AI_GATEWAY_API_KEY='LOCAL_RECOVERY_TRANSPORT_ONLY';await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'transport-'));let calls:any[]=[];const starts:any[]=[];
 t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{assert.equal(String(url),'https://ai-gateway.vercel.sh/typesafe/v1/systemone');const body=JSON.parse(String(init?.body));calls.push(normalizeJevImageWire(body));const wire=JSON.stringify({input:body.state,questions:body.questions});assert.doesNotMatch(wire,/recoveryFixture|definitionHash|referencePath|data-recovery-|recovery=|rawScreenshot|"audit"|"oracle"|"eligible"|"verificationAttempts"|"recordChecks"|"terminalSnapshot"/);assert.equal(body.state.exploration.charter.targetWebsite,'local:demo');assert.equal(body.state.exploration.charter.id,'recovery-task');assert.equal(body.state.observation.screen,undefined);assert.equal(body.state.history,undefined);assert.ok(body.state.userState.memory.every((m:any)=>m.visibleText.length===0));assert.equal(sha(Buffer.from(currentJevImage(body).data_base64,'base64')),body.state.userState.lastObservation.imageSha256);return Response.json(answer(body));});
 try{for(const condition of ['changed','unchanged']as const){calls=[];const ledger=join(dir,condition+'-budget.json');await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'LOCAL_RECOVERY_STUB',newMaximum:24,perRunMaximum:12,used:0,attempts:[]}),{flag:'wx'});const saved=await runHumanJev({out:join(dir,condition),mock:false,phaseBudget:ledger,mode:'experience-goal-search-grounded',longContext:true,recoveryFixture:{version:1,task:'library',condition},runId:'local-'+condition});assert.equal(calls.length,2);starts.push(calls[0]);assert.equal(saved.result.objectiveSuccess,false);assert.equal(saved.result.perceivedDone,true);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.steps[0].audit?.recovery?.eligible,false);assert.equal(saved.result.recovery?.terminalSnapshot?.complete,false);assert.equal((await replayDirectory(join(saved.root,'exploration'))).verified,true);const budget=JSON.parse(await readFile(ledger,'utf8'));assert.equal(budget.used,2);assert.ok(budget.attempts.every((a:any)=>a.status==='OK'));}assert.deepEqual(starts[0],starts[1]);}finally{delete process.env.AI_GATEWAY_API_KEY;}
});
test('unchanged input and candidate construction retain b7 source; legacy loop and dispatch retain observable behavior',async t=>{
 const old=execFileSync('git',['show','b7ce1cdc2123d12136a63675f0ee437497f9154d:runner/virtual-beta-core.ts'],{encoding:'utf8'}),now=(await readFile('runner/virtual-beta-core.ts','utf8')).replaceAll('\r\n','\n');
 const slice=(s:string,start:string,end:string)=>{const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a);return s.slice(a,b);};
 assert.equal(slice(now,'export function modelInput(','export async function runBeta('),slice(old,'export function modelInput(','export async function runBeta('));
 const base='reports/recovery-transfer-2026-10-29';await mkdir(base,{recursive:true});
 const dir=await mkdtemp(join(base,'legacy-behavior-'));
 const caller=join(dir,'caller-with-env'),callerBefore=await prepareRecoveryCurrentClone(process.cwd(),caller);
 // The caller may contain real .env files; only these invented sentinels are created, never read.
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])await writeFile(join(caller,name),'CLOSED_ENV_SENTINEL_DO_NOT_READ=not-a-key\n');
 const sourcePath=join(caller,'runner/virtual-beta-source.ts');await writeFile(sourcePath,(await readFile(sourcePath,'utf8'))+'\n// Uncommitted tracked-overlay regression sentinel.\n');
 const added='runner/legacy-overlay-sentinel.ts';await writeFile(join(caller,added),'export const overlaySentinel = true;\n');
 const {expected,actual,overlay}=await compareRecoveryLegacyProducers(join(dir,'comparison'),caller);
 assert.ok(overlay.identity.sourceHashes[added],'Untracked runtime source must be inventoried');
 assert.equal(actual.producer.sourceHash,overlay.identity.sourceHash);
 assert.notEqual(overlay.identity.sourceHashes['runner/virtual-beta-source.ts'],callerBefore.identity.sourceHashes['runner/virtual-beta-source.ts'],'Tracked uncommitted bytes must affect the current snapshot');
 assert.equal(Object.keys(overlay.identity.sourceHashes).length,Object.keys(callerBefore.identity.sourceHashes).length+1);
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])await access(join(caller,name));
 assert.ok(!Object.keys(overlay.files).some(name=>name.split('/').some(part=>part.startsWith('.env'))),'Environment files must not be copied');
 for(const [name,mutate]of [
  ['oracle result',(trace:any)=>{trace.outcome.objectiveSuccess=true;}],
  ['executed action',(trace:any)=>{trace.steps[0].action.elementId='e2';}],
  ['delivered image',(trace:any)=>{trace.requests[0].assets[0].sha256='0'.repeat(64);}],
  ['candidate order',(trace:any)=>{trace.requests[1].candidateOrder.reverse();}],
 ]as const)await t.test('reject changed '+name,()=>{
  const changed=structuredClone(expected.trace);mutate(changed);
  assert.throws(()=>assertRecoveryLegacyTrace(changed,expected.trace),{code:'ERR_ASSERTION'});
 });
});

test('old sentinel and transfer first images, wire inputs and questions remain byte equivalent',async t=>{
 for(const [name,fixture]of [['sentinel',{holdoutFixture:{task:'direct',variant:'alpha'}}],['help',{transferFixture:{version:1,task:'help',variant:'alpha'}}]]as const){let old:any;try{old=JSON.parse(await readFile(join(base,'baseline-'+name,'exploration/result.json'),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){t.skip('Historical local pre-adapter raw absent');return;}throw e;}const dir=await mkdtemp(join(base,'compat-')),saved=await runHumanJev({out:join(dir,name),mock:true,mode:'experience-goal-search-grounded',longContext:true,runId:'compat-'+name,...fixture});const n=saved.result.steps[0],o=old.steps[0];for(const field of ['modelInput','questions','assetFiles']as const){assert.deepEqual(n[field],o[field]);assert.deepEqual(n.deliberation?.[field],o.deliberation?.[field]);}assert.deepEqual(saved.result.config,old.config);assert.equal(saved.result.initialFingerprint,old.initialFingerprint);}
});
