import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groundGoal,goalEvidenceInput,type GoalGrounding} from '../jev/goal-evidence.js';
import {createEvidenceSession} from '../jev/evidence-session.js';
import {isGoalComplete,type GoalAssessment} from '../jev/goal-status.js';
import type {ChoiceEvaluator} from '../jev/client.js';
import type {State} from '../jev/types.js';
import {contradictionBatches} from '../jev/contradiction-batches.js';

const quote='Hours 10–17';
function fixture(oversized=false):State{
 return {goal:'Read hours',currentDate:'2026-09-23',history:[
  ...Array.from({length:4},(_,i)=>({screen:`Page ${i}`,action:'next',result:'observed',pageId:`p${i}`,observedText:[`${i}: ${'界'.repeat(oversized&&i===1?7000:3000)}`],observedWarnings:i===2?['PARTIAL_TEXT']:[]})),
  ...Array.from({length:2},()=>({screen:'Hours',action:'back',result:'observed',pageId:'hours',observedText:[quote]}))
 ],screen:{title:'Hours',pageId:'hours',text:[quote],elements:[],canScrollDown:false,canScrollUp:false}};
}
const progress=():GoalGrounding=>({checks:[{text:'hours',evidence:[],relatedEvidence:[],uncertainEvidence:[]}],requests:[]});
const choiceAnswer=(choice:string,keys:string[])=>({choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))});
const complete=(p:GoalGrounding)=>isGoalComplete({coverage:choiceAnswer('complete',['complete','incomplete','uncertain']),checks:[{text:'hours',...choiceAnswer('present',['present','absent','uncertain'])}],grounding:p,model:'TEST'} satisfies GoalAssessment);
function evaluator(calls:{state:any;questions:any}[],veto:(index:number)=>string=()=> 'present',fail?:(index:number)=>boolean):ChoiceEvaluator{
 let index=0;
 return async(state:any,questions)=>{
  calls.push({state:structuredClone(state),questions});
  const contradiction=Object.keys(questions).some(id=>id.startsWith('contradiction_'));
  if(contradiction){index++;if(fail?.(index))throw Object.assign(new Error('PRIVATE_FAILURE'),{statusCode:401});}
  return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,choiceAnswer(id.startsWith('intent_')?'time':id.startsWith('evidence_')?'direct':id.startsWith('scope_quote_')?'match':contradiction?veto(index):'present',Object.keys(q.criteria))])),request:{attempts:1,failures:[]}};
 };
}
async function run(state:State,calls:{state:any;questions:any}[],veto?:(i:number)=>string){
 const p=progress(),session=createEvidenceSession({evaluate:evaluator(calls,veto)});
 const retained=goalEvidenceInput(state,['hours']).blocks.filter(b=>b.local.text.includes(quote));
 await groundGoal(state,['hours'],p,session,retained);return {p,session,retained};
}

test('ordinary contradiction batches retain every old and new block toward the whole-page byte target',async()=>{
 const state=fixture(),calls:any[]=[];
 state.history[0].observedText!.unshift('Old heading');
 state.history[0].observedRegions=state.history[0].observedText!.map((text,i)=>({id:`r${i}`,source:'dom',text,bbox:{x0:0,y0:i,x1:10,y1:i+1},context:{landmark:'main',section:'old-section',headings:['Old heading']}}));
 const {p}=await run(state,calls);
 const batches=calls.filter(c=>c.state.observedBlocks).map(c=>c.state.observedBlocks);
 assert.ok(batches.length>1,'large observation set must be split');
 assert.ok(batches.every(b=>Buffer.byteLength(JSON.stringify(b),'utf8')<=16000||new Set(b.map((block:any)=>block.pageId)).size===1));
 assert.deepEqual(batches.flat(),goalEvidenceInput(state,['hours']).blocks.map(b=>b.local));
 assert.deepEqual(batches[0][0].context,{landmark:'main',section:'old-section',headings:['Old heading']});
 assert.deepEqual(batches.flat()[2].warnings,['PARTIAL_TEXT']);
 assert.equal(complete(p),true);assert.equal((p.checks[0] as any).contradictionSource,'batch-vetoes');
 assert.equal((p.checks[0] as any).contradictionBatches.length,batches.length);
 assert.equal(p.checks[0].contradictionBatchCount,batches.length);
});

test('interleaved page observations keep title, legend and rows together in original within-page order',()=>{
 const blocks=[
  {pageId:'calendar',text:['Crowd calendar','Legend: X means crowded', 'a'.repeat(9000)]},
  {pageId:'fees',text:['Fees','b'.repeat(9000)]},
  {pageId:'calendar',text:['Sunday X','c'.repeat(9000)]},
  {pageId:'fees',text:['New fee exception']},
 ];
 const before=JSON.stringify(blocks),batches=contradictionBatches(blocks);
 assert.deepEqual(batches.map(b=>b.map(block=>blocks.indexOf(block))),[[0,2],[1,3]]);
 assert.ok(Buffer.byteLength(JSON.stringify(batches[0]),'utf8')>16000,'an oversized complete page stays intact');
 assert.equal(batches.flat().length,4);assert.equal(new Set(batches.flat()).size,4);
 assert.equal(JSON.stringify(blocks),before,'source observations remain unchanged');
 assert.deepEqual(contradictionBatches(blocks),batches,'packing is deterministic');
});

test('legacy frames retain their context while unidentified observations remain independent units',()=>{
 const blocks:{legacyFrame?:number;text:string[]}[]=[
  {legacyFrame:2,text:['Legacy legend','a'.repeat(9000)]},
  {text:['Unknown one','b'.repeat(9000)]},
  {legacyFrame:2,text:['Legacy row','c'.repeat(9000)]},
  {text:['Unknown two','d'.repeat(9000)]},
 ];
 assert.deepEqual(contradictionBatches(blocks).map(b=>b.map(block=>blocks.indexOf(block))),[[0,2],[1],[3]]);
});

test('an oversized single block is preserved verbatim in its own batch',async()=>{
 const calls:any[]=[];await run(fixture(true),calls);
 const oversized=calls.filter(c=>c.state.observedBlocks&&Buffer.byteLength(JSON.stringify(c.state.observedBlocks),'utf8')>16000);
 assert.equal(oversized.length,1);assert.equal(oversized[0].state.observedBlocks.length,1);
 assert.equal(oversized[0].state.observedBlocks[0].text[0],`1: ${'界'.repeat(7000)}`);
});

test('identical accepted semantic quotes are deduplicated only in model payloads',async()=>{
 const calls:any[]=[];const {p}=await run(fixture(),calls);
 assert.deepEqual(p.checks[0].evidence.map(e=>e.id),['s5-t1','s6-t1','s7-t1']);
 const payloads=calls.filter(c=>c.state.checks);assert.ok(payloads.length>1);
 assert.ok(payloads.every(c=>c.state.checks[0].evidence.length===1));
 assert.deepEqual(p.checks[0].evidence.map(e=>e.text),[quote,quote,quote]);
});

test('equal accepted text on another page remains distinct in model inputs',async()=>{
 const state=fixture(),calls:any[]=[];
 state.history.push({screen:'Other hours',action:'back',result:'observed',pageId:'other-hours',observedText:[quote]});
 const {p}=await run(state,calls);
 assert.equal(p.checks[0].evidence.length,4);
 assert.ok(calls.filter(c=>c.state.checks).every(c=>c.state.checks[0].evidence.length===2));
});

test('later uncertain or absent batches veto completion without skipping remaining batches',async()=>{
 for(const veto of ['uncertain','absent']){
  const calls:any[]=[];const {p}=await run(fixture(),calls,index=>index===2?veto:'present');
  const batches=calls.filter(c=>c.state.observedBlocks);
  assert.ok(batches.length>2);assert.equal(complete(p),false);assert.equal(p.checks[0].contradictions?.choice,veto);
  const records=(p.checks[0] as any).contradictionBatches;
  assert.equal(records.length,batches.length);assert.deepEqual(p.checks[0].contradictions,records[1].assessment);
 }
});

test('an absent batch overrides an uncertain batch while preserving every raw assessment',async()=>{
 const calls:any[]=[];const {p}=await run(fixture(),calls,i=>i===1?'uncertain':i===3?'absent':'present');
 assert.equal(p.checks[0].contradictions?.choice,'absent');assert.equal(complete(p),false);
 assert.deepEqual((p.checks[0] as any).contradictionBatches.slice(0,3).map((b:any)=>b.assessment.choice),['uncertain','present','absent']);
});

test('late failures leave contradiction aggregation incomplete and restore requests only missing batches',async()=>{
 const state=fixture(),calls:any[]=[],p=progress();let fail=true;
 const evaluate=evaluator(calls,()=> 'present',i=>fail&&i===2),session=createEvidenceSession({evaluate});
 const retained=goalEvidenceInput(state,['hours']).blocks.filter(b=>b.local.text.includes(quote));
 await assert.rejects(groundGoal(state,['hours'],p,session,retained));
 assert.equal(p.checks[0].contradictions,undefined);assert.equal(complete(p),false);
 assert.equal((p.checks[0] as any).contradictionBatches.length,1);
 assert.ok(p.checks[0].contradictionBatchCount!>1);
 const oldSuccessful=calls.filter(c=>c.state.observedBlocks).slice(0,1).map(c=>JSON.stringify(c.state));
 const snapshot=JSON.parse(JSON.stringify(session.snapshot()));assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_FAILURE/);
 fail=false;const before=calls.length,restored=createEvidenceSession({snapshot,evaluate}),resumed=progress();
 await groundGoal(state,['hours'],resumed,restored,retained);
 assert.equal(complete(resumed),true);
 assert.ok(calls.slice(before).every(c=>!oldSuccessful.includes(JSON.stringify(c.state))));
 const completed=calls.length;await groundGoal(state,['hours'],progress(),restored,retained);assert.equal(calls.length,completed);
});
