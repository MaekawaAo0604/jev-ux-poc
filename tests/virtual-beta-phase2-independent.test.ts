import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PhaseBudget} from '../runner/virtual-beta-budget.js';
import {BetaAdmissionError,BetaBudgetError} from '../runner/virtual-beta-core.js';
import {main} from '../runner/virtual-beta.js';

async function ledger(maximum=12,perRun=1){const dir=await mkdtemp(join(tmpdir(),'beta-phase2-independent-')),file=join(dir,'budget.json');await writeFile(file,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:'INDEPENDENT_LOCAL_ONLY',newMaximum:maximum,perRunMaximum:perRun,used:0,attempts:[]}));return {dir,file};}
function reply(body:any,choice='done'){return new Response(JSON.stringify({model:'jev-1.14.0',answers:Object.fromEntries(Object.entries(body.questions as Record<string,{criteria:Record<string,string>}>).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(id=>[id,id===selected?1:0]))}];}))}),{status:200});}

test('phase2 independent: 3 UI x 4 arms actual adapter keeps audit metadata private and reserves durably before HTTP',async()=>{
 const {dir,file}=await ledger(),previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY;let requests=0;
 process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_STUB';
 try{
  globalThis.fetch=async(url,options)=>{
   assert.ok(String(url).startsWith('https://ai-gateway.vercel.sh/'));requests++;
   const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,requests);assert.equal(saved.attempts.at(-1).status,'RESERVED');
   const body=JSON.parse(String(options!.body)),wire=JSON.stringify({state:body.state,questions:body.questions});
   assert.equal(body.model,'jev-1.14.0');assert.equal(body.state.exploration.charter.targetWebsite,'local:demo');assert.equal(body.state.exploration.charter.id,'notification-task');
   assert.doesNotMatch(wire,/notification-entry|notification-stop|regionsOfInterest|roiSelectors|uiVersion|entryTranslateYPx|entryLabel|betaUI|position-only|wording-only|良いUI|悪いUI|正解位置/);
   assert.ok(body.assets.current);assert.equal(body.state.observation.image,'current');
   if(!body.state.observation.screen){assert.doesNotMatch(wire,/通知設定|メール受信設定/);assert.equal(body.state.history,undefined);assert.ok(Object.values(body.questions.nextAction.criteria).every(label=>!String(label).includes('通知')));}
   if(body.state.userState){assert.equal(body.state.userState.revision,1);assert.equal(body.state.userState.memory.length,1);}
   return reply(body);
  };
  const result=await main(['--env-file',join(dir,'ABSENT'),'--phase-budget',file,'--max-total-api','12','--ui','reference,position-only,wording-only','--out',join(dir,'wire')]);
  assert.equal(requests,12);assert.equal(result!.results.length,12);
  for(const run of result!.results){assert.equal(run.apiCalls,1);assert.equal(run.uiActions,0);assert.equal(run.looks,0);assert.equal(run.perceivedDone,true);assert.equal(run.objectiveAssessment.value,false);assert.equal(run.validForComparison,true);assert.equal(run.modeledUserMs,null);assert.equal(run.steps[0].selection!.drawIndex,0);assert.ok(run.steps[0].audit!.regionsOfInterest!.length>0);}
  const comparison=JSON.parse(await readFile(join(dir,'wire','comparison.json'),'utf8'));assert.equal(comparison.actualAPIRequests,12);assert.equal(comparison.initialStatesMatch,true);assert.equal(comparison.initialStateGroups.length,3);assert.ok(comparison.initialStateGroups.every((g:any)=>g.count===4&&g.match));
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,12);assert.ok(saved.attempts.every((a:any)=>a.status==='OK'));
  const budget=await PhaseBudget.open(file);try{await assert.rejects(budget.reserve({runKey:'rejected',condition:'current',revision:'local',sourceHash:'local'}),BetaBudgetError);assert.equal(budget.used,12);}finally{await budget.close();}
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});

test('phase2 independent: HTTP errors count once, no retry, later CLI cannot exceed cumulative phase cap',async()=>{
 const {dir,file}=await ledger(1,1),previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY;let requests=0;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_STUB';
 try{
  globalThis.fetch=async()=>{requests++;const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'RESERVED');return new Response('{}',{status:503});};
  const args=['--env-file',join(dir,'ABSENT'),'--phase-budget',file,'--conditions','current','--ui','reference','--max-total-api','1'];
  const first=await main([...args,'--out',join(dir,'error')]);assert.equal(requests,1);assert.equal(first!.results[0].apiCalls,1);assert.equal(first!.results[0].termination,'API_ERROR');assert.equal(first!.results[0].validForComparison,false);
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'ERROR');
  const second=await main([...args,'--out',join(dir,'rejected')]);assert.equal(requests,1);assert.equal(second!.results[0].apiCalls,0);assert.equal(second!.results[0].termination,'API_LIMIT');
  assert.equal(JSON.parse(await readFile(join(dir,'rejected','comparison.json'),'utf8')).actualAPIRequests,0);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});

test('phase2 independent: persistence failure rejects admission before caller can initiate HTTP and releases owner lock',async()=>{
 const {file}=await ledger(),budget=await PhaseBudget.open(file);let requests=0;
 try{await rename(file,file+'.retained');await mkdir(file);await assert.rejects((async()=>{await budget.reserve({runKey:'local',condition:'current',revision:'test',sourceHash:'test'});requests++;})(),BetaAdmissionError);assert.equal(requests,0);}finally{await budget.close();}
 const retained=await PhaseBudget.open(file+'.retained');await retained.close();
});



test('phase2 independent: slow durable reservation must not start gateway HTTP after absolute run deadline',async(t)=>{
 const {dir,file}=await ledger(1,1),previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY,originalReserve=PhaseBudget.prototype.reserve,runBudget=90000,originalNow=performance.now.bind(performance);let requests=0,reachedReservations=0,clockOffset=0;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_STUB';
 const clock=t.mock.method(performance,'now',()=>originalNow()+clockOffset);
 try{
  const configs=JSON.parse(await readFile('experiments/virtual-beta/phase2-diagnostic.json','utf8'));for(const config of configs)config.maxRunMs=runBudget;const configPath=join(dir,'config.json');await writeFile(configPath,JSON.stringify(configs));
  PhaseBudget.prototype.reserve=async function(info){
   const id=await originalReserve.call(this,info);reachedReservations++;
   const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(reachedReservations,1);assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'RESERVED');
   clockOffset=runBudget+1;return id;
  };
  globalThis.fetch=async(_url,options)=>{requests++;return reply(JSON.parse(String(options!.body)));};
  const result=await main(['--env-file',join(dir,'ABSENT'),'--config',configPath,'--phase-budget',file,'--conditions','current','--ui','reference','--max-total-api','1','--out',join(dir,'slow-admission')]);
  assert.equal(reachedReservations,1,'The real durable reservation must complete before expiring the dispatch deadline');
  assert.equal(result!.results[0].termination,'TIME_LIMIT');assert.equal(requests,0,'No HTTP may start after the run deadline expired while awaiting reservation');assert.equal(result!.results[0].apiCalls,0);assert.equal(result!.results[0].uiActions,0);const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'ERROR');assert.equal(saved.attempts[0].metadata.attempts,0);assert.equal(saved.attempts[0].metadata.failureCode,'DEADLINE_BEFORE_REQUEST');const comparison=JSON.parse(await readFile(join(dir,'slow-admission','comparison.json'),'utf8'));assert.equal(comparison.actualAPIRequests,0);assert.equal(comparison.totalCalls,0);
 }finally{clock.mock.restore();PhaseBudget.prototype.reserve=originalReserve;globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});


test('phase2 independent: untransmitted settlement persistence failure stays API0 and releases phase lock',async(t)=>{
 const {dir,file}=await ledger(1,1),previousFetch=globalThis.fetch,previousKey=process.env.AI_GATEWAY_API_KEY,originalReserve=PhaseBudget.prototype.reserve,originalSettle=PhaseBudget.prototype.settle,runBudget=90000,originalNow=performance.now.bind(performance);let requests=0,reachedReservations=0,clockOffset=0;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_STUB';
 const clock=t.mock.method(performance,'now',()=>originalNow()+clockOffset);
 try{
  const configs=JSON.parse(await readFile('experiments/virtual-beta/phase2-diagnostic.json','utf8'));for(const config of configs)config.maxRunMs=runBudget;const configPath=join(dir,'config.json');await writeFile(configPath,JSON.stringify(configs));
  PhaseBudget.prototype.reserve=async function(info){
   const id=await originalReserve.call(this,info);reachedReservations++;
   const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(reachedReservations,1);assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'RESERVED');
   clockOffset=runBudget+1;return id;
  };
  PhaseBudget.prototype.settle=async()=>{throw new Error('INDEPENDENT_SETTLEMENT_PERSIST_FAILURE');};
  globalThis.fetch=async(_url,options)=>{requests++;return reply(JSON.parse(String(options!.body)));};
  const result=await main(['--env-file',join(dir,'ABSENT'),'--config',configPath,'--phase-budget',file,'--conditions','current','--ui','reference','--max-total-api','1','--out',join(dir,'settlement-error')]);
  assert.equal(reachedReservations,1,'The real durable reservation must complete before settlement can fail');
  const run=result!.results[0];assert.equal(requests,0);assert.equal(run.apiCalls,0);assert.equal(run.termination,'API_ERROR');assert.equal(run.validForComparison,false);assert.equal(run.uiActions,0);assert.deepEqual(run.steps[0].error,{code:'BUDGET_ADMISSION_ERROR'});
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.used,1);assert.equal(saved.attempts[0].status,'RESERVED');const comparison=JSON.parse(await readFile(join(dir,'settlement-error','comparison.json'),'utf8'));assert.equal(comparison.actualAPIRequests,0);assert.equal(comparison.totalCalls,0);const reopened=await PhaseBudget.open(file);await reopened.close();
 }finally{clock.mock.restore();PhaseBudget.prototype.reserve=originalReserve;PhaseBudget.prototype.settle=originalSettle;globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previousKey;}
});
