// Diagnostic check on the actual post-change regression failure; no product edits.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {recordVisualCompletion} from '../../runner/visual-evidence.js';
import {evaluateChoices} from '../../jev/client.js';
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const source=resolve('reports/visual-semantics-live-2026-10-16T04-00-45.002Z/blocked-information');
const saved=JSON.parse(await readFile(join(source,'result.json'),'utf8'));
const root=resolve('reports',`semantic-followup-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const clarification='`goal` に書かれた利用者の目的が、保存画面 `observations` の観測結果として実際に満たされているかを判定する。操作を求める目的では、できない理由が分かったことや説明を読んだことだけを、操作が実現したことと混同しない。情報を知る目的では求める情報が確認できたかを判断する。';
const goals=[{id:'operate',text:'メール通知を停止したい',expected:'insufficient'},{id:'know',text:'現在のプランでメール通知を停止できるか知りたい',expected:'supported'}];
const rows:any[]=[];
for(let repeat=1;repeat<=3;repeat++)for(const goal of goals)for(const condition of (repeat%2?['criteria_only','clarified_question']:['clarified_question','criteria_only'])){
 let request:any;
 const audit=await recordVisualCompletion(goal.text,'2026-10-16',source,saved.audit.observations,async(state,questions,images)=>{
  if('readability' in questions){const screen=saved.audit.screens.find((s:any)=>s.observationId===state.observations[0].id);return {model:screen.model,answers:screen.answers};}
  const sent=structuredClone(questions);
  if(condition==='clarified_question'){
   const old=sent.completion.instructions;
   const suffix=old.indexOf('画像は step');if(suffix<0)throw new Error('Chronological instructions missing');
   sent.completion.instructions=clarification+old.slice(suffix);
  }
  request={state,questions:sent};
  return evaluateChoices(state,sent,{maxAttempts:1,maxElapsedMs:30000},{images,model:'jev-1.14.0'});
 });
 const row={repeat,goal:goal.id,condition,expected:goal.expected,status:audit.status,raw:audit.modelAssessment,assessment:audit.assessment,correct:audit.status==='RECORDED'&&audit.assessment===goal.expected,audit,request};
 rows.push(row);await writeFile(join(root,'results.json'),JSON.stringify({source,clarification,note:'Only the completion-question clarification changes between arms. Existing chronological/safety instructions, production criteria, evidence questions and actual failed-test images are retained. Prior screen judgments are replayed. No expected answers are sent.',rows},null,2));
 console.log(JSON.stringify({repeat,goal:goal.id,condition,status:row.status,raw:row.raw,assessment:row.assessment,correct:row.correct}));
}
console.log(JSON.stringify({root}));
