// Bounded real-model regression replay; expected answers never enter model input.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assessGoal,isGoalComplete,pendingGoalChecks} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {safeRequestFailure} from '../../jev/client.ts';
import {preflight} from './2026-09-22-preflight.mjs';

const sources={
 tour:'reports/2026-09-22T08-46-15.934Z-public/exploration/result.json',
 prior:'reports/goal-check-validation-2026-09-20T11-35-17.953Z/validation.json',
 live:'reports/2026-09-21T00-46-14.646Z-public/exploration/result.json',
};
const files=['jev/goal-evidence.ts','jev/goal-status.ts','jev/evidence-session.ts','jev/client.ts'];
const hashFile=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,await hashFile(path)])));
const [tour,prior,live]=await Promise.all(Object.values(sources).map(async file=>JSON.parse(await readFile(file,'utf8'))));
const fixtures=[];
function fixture(id,goal,text,expectedComplete){
 const heading='施設見学のご案内';
 return {id,group:'new-fixtures',kind:'constructed-counterexample',expectedComplete,checks:[goal],state:{goal,currentDate:'2026-09-22',history:[],screen:{title:heading,pageId:'fixture',text:[heading,text],elements:[],canScrollDown:false,canScrollUp:false,regions:[heading,text].map((value,i)=>({id:`t${i+1}`,source:'dom',text:value,context:{landmark:'main',section:'s1',headings:[heading]}}))}}};
}
fixtures.push(
 fixture('available-yes','入会前に施設を見学できるか知りたい。','入会前でも施設を無料で見学できます。',true),
 fixture('available-no-is-an-answer','入会前に施設を見学できるか知りたい。','当施設では入会前の施設見学を受け付けていません。',true),
 fixture('availability-navigation-only','入会前に施設を見学できるか知りたい。','施設見学について詳しくはこちら',false),
 fixture('method-phone-explicit','見学を申し込む方法を知りたい。','施設見学は希望する店舗に電話でお申し込みください。',true),
 fixture('method-no-reservation-needed','見学を申し込む方法を知りたい。','見学は予約不要です。スタッフの受付時間内に店舗へ直接お越しください。',true),
 fixture('method-cta-only','見学を申し込む方法を知りたい。','施設見学のお申し込みはこちら',false),
 fixture('method-recommended-not-how','見学を申し込む方法を知りたい。','施設の見学を希望する方には事前のご予約をおすすめしています。',false),
 fixture('wrong-subject','高校生無料制度で施設を見学できるか知りたい。','法人契約の担当者は、契約前に施設を無料で見学できます。',false),
);
const step12=tour.steps.find(s=>s.number===12);
assert.ok(step12,'Recorded step 12 must exist');
const recorded=['whole','split'].map(mode=>({id:`recorded-12-${mode}`,group:'recorded-step12',kind:'recorded-state-checklist-ablation',source:sources.tour,sourceStep:12,expectedComplete:null,state:step12.state,checks:mode==='whole'?[tour.goal||tour.steps[0].state.goal]:['施設を見学できるか','見学を申し込む方法']}));
const generic=structuredClone(live.steps[2].state);
generic.goal='高校生無料制度で利用できる店舗を知りたい。申し込みはしない。';
generic.history=[];
const scopedHours=heading=>({goal:'高校生無料制度の利用時間を知りたい。',currentDate:generic.currentDate,history:[],screen:{title:heading,pageId:'p1',text:[heading,'平日10時から17時'],elements:[],canScrollDown:false,canScrollUp:false,regions:[heading,'平日10時から17時'].map((text,i)=>({id:`t${i+1}`,source:'dom',text,context:{landmark:'main',section:'s1',headings:[heading]}}))}});
const replay=prior.cases.map(c=>({id:c.id,state:c.state,checks:c.checks,expectedComplete:c.expectedComplete,group:'legacy-regression',kind:'saved-validation-case',source:sources.prior}));
replay.push(
 {id:'recorded-live-full-627-fragments',state:live.steps.at(-1).state,checks:live.settings.goalChecks,expectedComplete:true,source:sources.live},
 {id:'generic-member-stores-only',state:generic,checks:['利用できる店舗'],expectedComplete:false,source:sources.live},
 {id:'fixture-identical-hours-general-member',state:scopedHours('一般会員の利用時間'),checks:['高校生無料制度の利用時間'],expectedComplete:false,kind:'constructed-context-fixture'},
 {id:'fixture-identical-hours-highschool',state:scopedHours('高校生無料制度の利用時間'),checks:['高校生無料制度の利用時間'],expectedComplete:true,kind:'constructed-context-fixture'},
);
const hoursRule=scopedHours('高校生無料制度の利用時間');
hoursRule.screen.text[1]='利用できるのはスタッフアワー内のみです。深夜早朝は利用できません。';
hoursRule.screen.regions[1].text=hoursRule.screen.text[1];
replay.push({id:'fixture-general-hours-rule',state:hoursRule,checks:['高校生無料制度の利用時間'],expectedComplete:true,kind:'constructed-specificity-fixture'});
const concreteHours=structuredClone(hoursRule);
concreteHours.goal='高校生無料制度で福井店を今日利用できる具体的な開始・終了時刻を知りたい。';
replay.push({id:'fixture-concrete-hours-not-stated',state:concreteHours,checks:['具体的な開始・終了時刻'],expectedComplete:false,kind:'constructed-specificity-fixture'});
assert.equal(replay.length,16);
let schedule=[...[1,2].flatMap(repeat=>[...fixtures,...recorded].map(c=>({...c,repeat}))),...replay.map(c=>({...c,group:'legacy-regression',repeat:1}))];
assert.equal(schedule.length,36);
const onlyIndex=process.argv.indexOf('--only');
if(onlyIndex>=0){
 const selected=new Set((process.argv[onlyIndex+1]||'').split(','));
 assert.ok(selected.size>0&&[...selected].every(id=>schedule.some(c=>c.id===id)),'Unknown targeted case');
 schedule=schedule.filter(c=>selected.has(c.id));
}
if(process.argv.includes('--once'))schedule=schedule.filter(c=>c.repeat===1);
const root=resolve('reports',`production-scoring-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:false});
const out={startedAt:new Date().toISOString(),sources,sourceHashes:await hashes(Object.values(sources)),productionHashes:await hashes(files),harnessHash:await hashFile('docs/experiments/2026-09-22-production-scoring.mjs'),
 annotationMethod:'Single-agent explicit-text expectations reused unchanged from prior measurements. Ambiguous recorded step 12 has no correctness label.',
 boundedSchedule:{newFixtures:schedule.filter(c=>c.group==='new-fixtures').length,recordedStep12:schedule.filter(c=>c.group==='recorded-step12').length,legacyRegression:schedule.filter(c=>c.group==='legacy-regression').length,total:schedule.length,stopAfterConsecutiveTerminalErrors:3},
 planned:schedule.map(({state,...c})=>c),results:[]};
const save=()=>writeFile(join(root,'validation.json'),JSON.stringify(out,null,2));
const unchanged=async()=>{
 assert.deepEqual(await hashes(files),out.productionHashes,'Production changed during replay');
 assert.deepEqual(await hashes(Object.values(sources)),out.sourceHashes,'Input source changed during replay');
};
const confusion=rows=>{
 const labeled=rows.filter(r=>r.expectedComplete!==null);
 return {executed:rows.length,labeled:labeled.length,TP:labeled.filter(r=>!r.error&&r.expectedComplete&&r.complete).length,TN:labeled.filter(r=>!r.error&&!r.expectedComplete&&!r.complete).length,FP:labeled.filter(r=>!r.error&&!r.expectedComplete&&r.complete).length,FN:labeled.filter(r=>!r.error&&r.expectedComplete&&!r.complete).length,errors:rows.filter(r=>r.error).length};
};
await save();
console.log(JSON.stringify({report:join(root,'validation.json'),planned:schedule.length}));
process.loadEnvFile('.env');
out.preflight=await preflight();await save();
if(!out.preflight.ok){out.stopped='preflight-failed';out.notRun=schedule.map(c=>`${c.id}-${c.repeat}`);await save();console.log(JSON.stringify({stopped:out.stopped,preflight:out.preflight}));process.exit(1);}
let consecutiveErrors=0;
for(const c of schedule){
 try{await unchanged();}catch{out.stopped='source-or-production-changed';break;}
 const sessionPath=join(root,`${c.id}-${c.repeat}-session.json`);
 const session=createEvidenceSession({checkpoint:async snapshot=>writeFile(sessionPath,JSON.stringify(snapshot,null,2))});
 const started=performance.now();let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks,session);}catch(e){error={...safeRequestFailure(e),...(['goal-assessment','goal-evidence','action-selection'].includes(e.stage)?{stage:e.stage}:{})};assessment=e.goalAssessment;}
 await writeFile(sessionPath,JSON.stringify(session.snapshot(),null,2));
 const complete=error?null:isGoalComplete(assessment);
 const frames=[...c.state.history.map(h=>h.observedText||[]),c.state.screen.text];
 let verifiedQuotes=0;const invalidQuotes=[];
 for(const check of assessment?.grounding?.checks||[])for(const field of ['evidence','relatedEvidence','uncertainEvidence'])for(const quote of check[field]||[]){
  if(frames[quote.step-1]?.includes(quote.text))verifiedQuotes++;
  else invalidQuotes.push({field,id:quote.id,step:quote.step,text:quote.text});
 }
 const row={id:c.id,group:c.group,repeat:c.repeat,kind:c.kind,source:c.source,sourceStep:c.sourceStep,expectedComplete:c.expectedComplete,complete,error,elapsedMs:performance.now()-started,accounting:session.accounting(),assessment,verifiedQuotes,invalidQuotes,sessionPath,...(!error?{remainingGoalChecks:pendingGoalChecks(assessment)}:{})};
 out.results.push(row);await save();
 console.log(JSON.stringify({id:c.id,group:c.group,repeat:c.repeat,expectedComplete:c.expectedComplete,complete,error,elapsedMs:row.elapsedMs,remainingGoalChecks:row.remainingGoalChecks,grounding:assessment?.grounding?.checks.map(check=>({text:check.text,kind:check.informationKind?.choice,evidence:check.evidence.length,uncertain:check.uncertainEvidence.length,scope:check.scope?.choice,assessment:check.assessment?.choice,contradictions:check.contradictions?.choice}))}));
 consecutiveErrors=error?consecutiveErrors+1:0;
 if(consecutiveErrors>=3){out.stopped='three-consecutive-model-failures';break;}
 if(invalidQuotes.length){out.stopped='quote-provenance-failure';break;}
}
try{await unchanged();out.codeAndSourcesUnchanged=true;}catch{out.codeAndSourcesUnchanged=false;out.stopped??='source-or-production-changed';}
out.finishedAt=new Date().toISOString();
out.notRun=schedule.slice(out.results.length).map(c=>`${c.id}-${c.repeat}`);
out.summary={...confusion(out.results),groups:Object.fromEntries(['new-fixtures','recorded-step12','legacy-regression'].map(group=>[group,confusion(out.results.filter(r=>r.group===group))]))};
await save();console.log(JSON.stringify({report:join(root,'validation.json'),stopped:out.stopped,summary:out.summary,notRun:out.notRun.length,codeAndSourcesUnchanged:out.codeAndSourcesUnchanged}));
