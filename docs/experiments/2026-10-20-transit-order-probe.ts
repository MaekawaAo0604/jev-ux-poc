import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {jevDecide} from '../../jev/decide.js';
import type {ChoiceEvaluator} from '../../jev/client.js';

// Offline replay of archived provider answers. No inference or public request.
const dir=resolve('reports/2026-10-19T16-37-44.906Z-public/exploration');
const sources:any[]=[];
async function load(n:number){const file=join(dir,`step-${n}.json`),bytes=await readFile(file);sources.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});return JSON.parse(bytes.toString());}
const a=await load(6),b=await load(7),target='f51';
assert.equal(a.frontier.targets.f45.travelSteps,1);
assert.equal(a.frontier.targets[target].travelSteps,1);
assert.equal(a.frontier.targets[target].nextChoice,'scroll_down');
assert.equal(b.frontier.targets[target].nextChoice,'e10');
assert.notEqual(b.state.screen.elements.find((e:any)=>e.id==='e10').available,false);
assert.equal(b.candidates.e10.action.elementId,'e10');
const judgments=a.visualContext.imageJudgments.routes;
assert.equal(judgments.find((r:any)=>r.targetId==='f45').assessment,'unrelated');
assert.equal(judgments.find((r:any)=>r.targetId===target).assessment,'promising');

async function replay(step:any,frontier:any){
 const records=step.visualContext.requests.filter((r:any)=>r.step===step.number&&r.stage==='decision');let calls=0;
 const evaluate:ChoiceEvaluator=async(_input,questions)=>{
  const record=records[calls++];assert.ok(record,'unexpected extra model call');
  assert.ok(Object.keys(questions).every(id=>record.answers[id]));
  return {...record,answers:Object.fromEntries(Object.keys(questions).map(id=>[id,record.answers[id]]))};
 };
 const unresolved=step.visualContext.imageJudgments.requirements.filter((r:any)=>!['observed','context'].includes(r.status)).map((r:any)=>r.id);
 const decision=await jevDecide(step.state,step.candidates,{verifyCompletion:true,preserveTransit:true,frontier,completionEvidence:()=>({supported:false,unresolved})},evaluate);
 assert.equal(calls,records.length);return {choice:decision.choice,targetId:decision.frontier?.targetId,selectionSource:decision.frontier?.selectionSource,mode:decision.frontier?.mode,calls};
}
const original=[await replay(a,a.frontier),await replay(b,b.frontier)];
assert.equal(original[0].targetId,a.decision.frontier.targetId);assert.equal(original[1].choice,b.decision.choice);
const reordered={...a.frontier,targets:{[target]:a.frontier.targets[target],...Object.fromEntries(Object.entries(a.frontier.targets).filter(([id])=>id!==target))}};
const first=await replay(a,reordered);
assert.equal(first.targetId,target);assert.equal(first.choice,original[0].choice);
const second=await replay(b,{...b.frontier,continuation:{...b.frontier.continuation,targetId:target}});
assert.equal(second.choice,'e10');assert.equal(second.targetId,target);
for(const s of sources)assert.equal(createHash('sha256').update(await readFile(s.file)).digest('hex'),s.sha256);
const result={method:'Offline exact-answer replay; change target enumeration order only at step 6, carry that selected endpoint into step 7. Not a live improved exploration.',sources,original,counterfactual:[first,second],sameProviderAnswers:true,publicRequests:0,jevCalls:0,productionCodeChanged:false,findings:['The archived primary action scroll_down does not select an endpoint. Sorting equal-distance transit targets preserves enumeration order and commits f45, despite its unrelated route judgment.','Keeping the same model answers but listing f51 first changes the committed endpoint to the promising FAQ. The next action becomes e10 instead of the room entry e4.','This proves this two-step detour is code-order-sensitive. It does not prove FAQ answer readability or whole-Goal completion.']};
const root=resolve('reports',`transit-order-probe-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});await writeFile(join(root,'probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({root,...result},null,2));
