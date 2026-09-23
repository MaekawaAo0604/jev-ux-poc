// Full production gate, not a substitute classifier. Expected labels stay local.
// Saved museum observations plus small adversarial fixtures; no site requests.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {assessGoal,isGoalComplete,pendingGoalChecks} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {createBudgetedEvaluator,safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const source='reports/2026-09-22T21-15-08.509Z-public/exploration/result.json';
const saved=JSON.parse(await readFile(source,'utf8'));
const expandedSource='reports/2026-09-23T07-28-29.669Z-public/exploration/result.json';
const expanded=JSON.parse(await readFile(expandedSource,'utf8'));
const make=(id,goal,checks,text,expectedComplete)=>({id,checks,expectedComplete,state:{goal,currentDate:'2026-09-23',history:[],screen:{title:'',text,elements:[],canScrollUp:false,canScrollDown:false}}});
const cases=[
 make('promotion-only','高校生向け制度の対象条件が知りたい',['対象条件'],['高校生向け制度','ヘルシアプレイスを必要とする高校生を応援します。'],false),
 make('question-only','当日の再入館可否が知りたい',['当日の再入館可否'],['再入館はできますか？'],false),
 make('negative-answer','施設の見学可否が知りたい',['見学可否'],['当施設の見学はできません。'],true),
 make('wrong-scheme','高校生向け制度の対象条件が知りたい',['対象条件'],['一般会員の対象条件','18歳以上の方が対象です。'],false),
 make('partial-fee','大人1人と高校生1人で総合文化展を見たい。2人分の観覧料が知りたい',['2人分の観覧料'],['総合文化展 観覧料','一般 1,000円'],false),
 {...make('distinct-facilities','A館の大人料金とB館の子ども料金を知りたい。',['A館の大人料金','B館の子ども料金'],['A館の大人料金 1000円'],false),expectedPending:['B館の子ども料金']},
 {id:'museum-saved-path',state:saved.steps.at(-1).state,checks:saved.settings.goalChecks,snapshot:saved.evidenceSession,expectedComplete:false,expectedPending:['当日の再入館可否']},
 {id:'museum-expanded-path',state:expanded.steps.at(-1).state,checks:expanded.settings.goalChecks,snapshot:expanded.evidenceSession,expectedComplete:false,expectedPending:['当日の再入館可否']},
];
const root=`reports/production-gate-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(root,{recursive:true});
const output={source,expandedSource,targetSiteCalls:0,browserActions:0,results:[]};
for(const c of cases){
 const started=performance.now();
 const session=createEvidenceSession({snapshot:c.snapshot,evaluate:createBudgetedEvaluator({maxAttempts:6,maxElapsedMs:90000,retryDelaysMs:[1000,2000,5000,10000,15000],retryInvalidResponse:true},300000)});
 let assessment,error;
 try{assessment=await assessGoal(c.state,c.checks,session);}catch(e){error={...safeRequestFailure(e),stage:e.stage};assessment=e.goalAssessment;}
 const complete=!error&&!!assessment&&isGoalComplete(assessment),pending=assessment?pendingGoalChecks(assessment):undefined;
 const pass=!error&&complete===c.expectedComplete&&(!c.expectedPending||JSON.stringify(pending)===JSON.stringify(c.expectedPending));
 const result={id:c.id,expectedComplete:c.expectedComplete,expectedPending:c.expectedPending,complete,pending,pass,error,elapsedMs:performance.now()-started,assessment,session:session.snapshot()};
 output.results.push(result);
 await writeFile(`${root}/results.json`,JSON.stringify(output,null,2));
 console.log(JSON.stringify({id:c.id,complete,pending,pass,error,elapsedMs:result.elapsedMs}));
}
output.pass=output.results.every(r=>r.pass);
await writeFile(`${root}/results.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify({pass:output.pass,report:`${root}/results.json`}));
if(!output.pass)process.exitCode=1;
