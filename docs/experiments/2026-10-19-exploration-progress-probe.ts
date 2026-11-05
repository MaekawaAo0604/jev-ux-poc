/** Matched current-image-only diagnostic. No website visits or browser actions. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {evaluateChoices,safeRequestFailure,type ChoiceQuestion} from '../../jev/client.js';
import {ImageOnlyInput} from '../../jev/image-only-input.js';
import {ImageJudgmentMemory,type ImageJudgments} from '../../jev/image-judgments.js';

const guidance='探索履歴はコードが観測・実行した記録であり、情報を読み取れたことやGoal達成の証拠ではない。explorationProgressがある場合、pages.observedRangesは画面に表示した範囲、transitionsは操作の出発点と次に観測した地点。同じ表示・同じ操作を再び選ぶときは、未確認事項を調べる新しい理由があるか検討する。移動できただけでは情報が増えたとは限らない。未確認事項が残るなら、まだ表示していない範囲や未実行の入口も比較する。ただし既知の場所を通る必要がある移動を禁止せず、未観察の場所に答えがあるとも仮定しない。';
const viewport=(v:any)=>v&&['top','bottom','height'].every(k=>Number.isFinite(v[k]))?{top:v.top,bottom:v.bottom,height:v.height}:undefined;
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
try{process.loadEnvFile('.env');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const source=resolve(process.argv[2]??'reports/2026-10-19T04-26-26.191Z-public');
const original=await readFile(join(source,'exploration/result.json')),saved=JSON.parse(original.toString('utf8'));
const root=resolve('reports',`exploration-progress-probe-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const results:any[]=[],frames:any[]=[];
const selectedSteps=process.argv[3]?process.argv[3].split(',').map(Number):[6,22];
const frontierSelection=process.argv.includes('--frontier');
const prepareOnly=process.argv.includes('--prepare-only');
assert.ok(selectedSteps.length&&selectedSteps.every(n=>Number.isSafeInteger(n)&&n>1),'Supply comma-separated decision steps after the source report');
for(const number of selectedSteps){
 const step=saved.steps.find((s:any)=>s.number===number);assert.ok(step);
 const prefix=saved.steps.filter((s:any)=>s.number<number),input=new ImageOnlyInput();
 assert.ok(prefix.length&&prefix.every((s:any)=>s.result==='OK'&&s.recordedAction),'This targeted reconstruction requires successful, recorded prefix actions; no-ops and missing action records are unsupported');
 for(const p of prefix){
  input.pageId(p.state.screen.pageId);
  if(p.recordedAction)input.record(p.decision.action,{step:p.number,pageId:p.state.screen.pageId});
 }
 const previous=(frontierSelection?step:prefix.at(-1)).visualContext.imageJudgments as ImageJudgments;
 const ledger={...previous,representation:'current-state-and-latest-source' as const,requirements:previous.requirements.map(r=>({...r,recordCount:r.records.length,records:r.records.length?[[...r.records].reverse().find(v=>v.assessment===r.status)!]:[]})),routes:previous.routes.filter(r=>Object.hasOwn(step.frontier.targets,r.targetId))};
 const criteria=frontierSelection?[...Object.keys(step.frontier.targets),'stuck']:Object.keys(step.candidates);
 const questions:Record<string,ChoiceQuestion>={nextAction:{type:'choice',instructions:'',criteria:Object.fromEntries(criteria.map(k=>[k,k]))}};
 const targets=Object.fromEntries(Object.entries(step.frontier.targets).map(([id,t]:[string,any])=>[id,{...t,...(t.travelSteps===0&&t.kind==='click'?{visualTargetId:t.nextChoice}:{})}]));
 const request=input.request({goal:saved.goalText,currentDate:step.state.currentDate,...(frontierSelection?{targets}:{})},questions,{step:number,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},ledger);
 const bytes=await readFile(join(source,'exploration',step.screenshot));assert.equal(hash(bytes),step.visualObservation.sha256);
 const memory=new ImageJudgmentMemory();memory.bind(saved.goalText);
 const visible=Object.entries(step.frontier.targets).flatMap(([targetId,value]:[string,any])=>value.travelSteps===0&&value.kind==='click'&&/^e\d+$/.test(value.nextChoice)?[{targetId,visualTargetId:value.nextChoice}]:[]);
 if(!frontierSelection)Object.assign(request.questions,memory.questions({id:`v${number}`,step:number,pageId:request.frame.pageId,sha256:hash(bytes)},visible));
 const observations=[...prefix,step].map((s:any)=>({step:s.number,pageId:input.pageId(s.state.screen.pageId),viewport:viewport(s.state.screen.viewport)}));
 const pages=new Map<string,{pageId:string;observedRanges:NonNullable<ReturnType<typeof viewport>>[]}>();
 for(const o of observations){
  if(!o.pageId)continue;
  let page=pages.get(o.pageId);if(!page){page={pageId:o.pageId,observedRanges:[]};pages.set(o.pageId,page);}
  if(o.viewport&&!page.observedRanges.some(r=>JSON.stringify(r)===JSON.stringify(o.viewport)))page.observedRanges.push(o.viewport);
 }
 const progress={pages:[...pages.values()],transitions:prefix.filter((s:any)=>s.recordedAction).map((s:any)=>({step:s.number,from:{pageId:input.pageId(s.state.screen.pageId),...(viewport(s.state.screen.viewport)?{viewport:viewport(s.state.screen.viewport)}:{})},action:s.decision.action,result:s.result==='ACTION_NOOP'?'no-visible-change':'executed',to:((o:any)=>({pageId:o.pageId,...(o.viewport?{viewport:o.viewport}:{})}))(observations.find(o=>o.step>s.number))}))};
 const reference=randomUUID(),state={context:request.context,screenshot:reference,observations:[{...request.frame,current:true}]};
 const variants=['baseline','instruction','progress'] as const;
 frames.push({step:number,imageSha256:hash(bytes),originalFinalChoice:step.decision.choice,originalPrimaryChoice:step.decision.recovery?.initialDecision?.choice??step.decision.choice,progress});
 for(let repeat=0;repeat<3;repeat++)for(let j=0;j<variants.length;j++){
  const variant=variants[(j+repeat)%variants.length],q=structuredClone(request.questions),context=structuredClone(state);
  if(variant!=='baseline')q.nextAction.instructions+=' '+guidance;
  if(variant==='progress')Object.assign(context.context,{explorationProgress:progress});
  if(repeat===0)await writeFile(join(root,`step-${number}-${variant}.json`),JSON.stringify({state:context,questions:q},null,2));
  if(prepareOnly)continue;
  const started=performance.now();
  try{
   const answer=await evaluateChoices(context,q,{maxAttempts:1,maxElapsedMs:30000},{images:{[reference]:{mediaType:'image/png',data:bytes.toString('base64')}}});
   const choice=answer.answers.nextAction.choice;
   const row={step:number,repeat:repeat+1,variant,choice,probabilities:answer.answers.nextAction.probabilities,model:answer.model,elapsedMs:performance.now()-started,usage:answer.usage,costUSD:answer.costUSD};results.push(row);
   console.log(JSON.stringify(row));
  }catch(error){const row={step:number,repeat:repeat+1,variant,failure:safeRequestFailure(error),elapsedMs:performance.now()-started};results.push(row);console.log(JSON.stringify(row));}
  await writeFile(join(root,'diagnostic.json'),JSON.stringify({scope:frontierSelection?'offline-frontier-selection-only-not-an-end-to-end-run':'offline-action-selection-only-not-an-end-to-end-run',source,originalSha256:hash(original),frames,results},null,2));
 }
 await writeFile(join(root,`step-${number}-baseline.json`),JSON.stringify({state,questions:request.questions},null,2));
}
assert.deepEqual(await readFile(join(source,'exploration/result.json')),original);
if(prepareOnly)await writeFile(join(root,'diagnostic.json'),JSON.stringify({scope:'offline-input-preparation-no-model-calls',source,originalSha256:hash(original),frames,results},null,2));
console.log(JSON.stringify({root,calls:results.length,originalUnchanged:true}));
