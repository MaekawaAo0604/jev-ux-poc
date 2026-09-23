// Measurement only: no browser actions and no changes to production prompts.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {assessGoal,isGoalComplete} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {safeRequestFailure} from '../../jev/client.ts';
import {preflight} from './2026-09-22-preflight.mjs';

const root=resolve('reports/measurement-2026-09-22');await mkdir(root,{recursive:true});
const source=resolve('reports/2026-09-22T08-46-15.934Z-public/exploration/result.json');
const log=JSON.parse(await readFile(source,'utf8'));
const whole=[log.goal||log.steps[0].state.goal],split=['施設を見学できるか','見学を申し込む方法'];
const cases=[];
for(const stepNumber of [1,12,24]) for(const mode of ['whole','split']){
 const step=log.steps.find(s=>s.number===stepNumber);
 cases.push({id:`recorded-${stepNumber}-${mode}`,state:step.state,checks:mode==='whole'?whole:split,kind:'recorded-state-checklist-ablation',sourceStep:stepNumber,expectedComplete:null});
}
function fixture(id,goal,text,expectedComplete){
 const heading='施設見学のご案内';
 return {id,kind:'constructed-counterexample',expectedComplete,checks:[goal],state:{goal,currentDate:'2026-09-22',history:[],screen:{title:heading,pageId:'fixture',text:[heading,text],elements:[],canScrollDown:false,canScrollUp:false,regions:[heading,text].map((value,i)=>({id:`t${i+1}`,source:'dom',text:value,context:{landmark:'main',section:'s1',headings:[heading]}}))}}};
}
cases.push(
 fixture('available-yes','入会前に施設を見学できるか知りたい。','入会前でも施設を無料で見学できます。',true),
 fixture('available-no-is-an-answer','入会前に施設を見学できるか知りたい。','当施設では入会前の施設見学を受け付けていません。',true),
 fixture('availability-navigation-only','入会前に施設を見学できるか知りたい。','施設見学について詳しくはこちら',false),
 fixture('method-phone-explicit','見学を申し込む方法を知りたい。','施設見学は希望する店舗に電話でお申し込みください。',true),
 fixture('method-no-reservation-needed','見学を申し込む方法を知りたい。','見学は予約不要です。スタッフの受付時間内に店舗へ直接お越しください。',true),
 fixture('method-cta-only','見学を申し込む方法を知りたい。','施設見学のお申し込みはこちら',false),
 fixture('method-recommended-not-how','見学を申し込む方法を知りたい。','施設の見学を希望する方には事前のご予約をおすすめしています。',false),
 fixture('wrong-subject','高校生無料制度で施設を見学できるか知りたい。','法人契約の担当者は、契約前に施設を無料で見学できます。',false),
);
// Expectations stay outside state/questions. They are agent annotations, not a human panel.
const out={startedAt:new Date().toISOString(),source,sourceHash:createHash('sha256').update(await readFile(source)).digest('hex'),
 annotationMethod:'single-agent explicit-text annotation; ambiguous recorded-state outcomes excluded from accuracy',
 planned:cases.map(({state,...c})=>c),repeats:2,results:[]};
const save=()=>writeFile(join(root,'scoring.json'),JSON.stringify(out,null,2));await save();
process.loadEnvFile('.env');
out.preflight=await preflight();await save();
if(!out.preflight.ok){out.notRun=cases.map(c=>c.id);await save();console.log(JSON.stringify({preflight:out.preflight,notRun:cases.length}));process.exit(1);}
for(let repeat=1;repeat<=2;repeat++)for(const c of cases){
 const start=performance.now(),session=createEvidenceSession();let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks,session);}catch(e){error={...safeRequestFailure(e),stage:e.stage};assessment=e.goalAssessment;}
 const snapshot=session.snapshot();
 await writeFile(join(root,`${c.id}-${repeat}-session.json`),JSON.stringify(snapshot,null,2));
 const complete=error?null:isGoalComplete(assessment);
 const summary={id:c.id,repeat,kind:c.kind,sourceStep:c.sourceStep,expectedComplete:c.expectedComplete,complete,error,
  elapsedMs:performance.now()-start,accounting:session.accounting(),coverage:assessment?.coverage,
  checks:assessment?.checks.map((check,i)=>({text:check.text,preliminary:check.choice,probabilities:check.probabilities,
   groundingExecuted:!!assessment.grounding?.checks[i].assessment,proof:assessment.grounding?.checks[i]}))};
 out.results.push(summary);await save();
 console.log(JSON.stringify({...summary,checks:summary.checks?.map(c=>({text:c.text,preliminary:c.preliminary,groundingExecuted:c.groundingExecuted,evidence:c.proof?.evidence.length,assessment:c.proof?.assessment?.choice}))}));
 // Keep systemic outages visible; do not burn the entire suite on repeated endpoint failures.
 if(out.results.slice(-3).length===3&&out.results.slice(-3).every(r=>r.error)){out.stopped='three-consecutive-model-failures';break;}
}
assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),out.sourceHash);
out.finishedAt=new Date().toISOString();
const labeled=out.results.filter(r=>r.expectedComplete!==null);
out.summary={planned:cases.length*2,executed:out.results.length,labeled:labeled.length,
 correct:labeled.filter(r=>!r.error&&r.complete===r.expectedComplete).length,
 falseComplete:labeled.filter(r=>!r.error&&r.complete&&!r.expectedComplete).length,
 falseIncomplete:labeled.filter(r=>!r.error&&!r.complete&&r.expectedComplete).length,
 errors:out.results.filter(r=>r.error).length};
await save();console.log(JSON.stringify(out.summary));
