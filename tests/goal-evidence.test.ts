import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jevDecide} from '../jev/decide.js';
import {candidatesFor,type State} from '../jev/types.js';
import {goalEvidenceInput} from '../jev/goal-evidence.js';
import {assessGoal,pendingGoalChecks} from '../jev/goal-status.js';
import {createEvidenceSession} from '../jev/evidence-session.js';

const state:State={goal:'条件と時間を知りたい。',currentDate:'2026-09-21',history:[{screen:'案内',action:'下へ',result:'操作結果は根拠にしない',observedText:['会員のみ対象'],observedWarnings:[]}],screen:{title:'時間',text:['平日10時から17時'],elements:[],canScrollDown:true,canScrollUp:true}};
const select=(id:string)=>id==='coverage'?'complete':id==='nextAction'?'scroll_down':id.startsWith('intent_')?'general':id.startsWith('screen_')?'relevant':id.startsWith('scope_')?'match':id.startsWith('evidence_')?'direct':'present';
async function withProvider(run:()=>Promise<void>,respond:(input:any)=>Promise<any>){
 const previous=globalThis.AI_SDK_DEFAULT_PROVIDER,key=process.env.AI_GATEWAY_API_KEY;
 globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],doEvaluate:respond})} as any;
 process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 try{await run();}finally{globalThis.AI_SDK_DEFAULT_PROVIDER=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}
function answers(questions:any,pick:(id:string)=>string){return {answers:Object.fromEntries(Object.entries(questions).map(([id,q]:[string,any])=>[id,{type:'choice',choice:pick(id),probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===pick(id)?1:0]))}])),warnings:[]};}
const decide=(s=state)=>jevDecide(s,candidatesFor(s.screen,true),{goalChecks:['条件','時間']});

test('content-classification contract defers subject matching and completeness while separating eligibility from procedures',async()=>{
 const sent:any[]=[];
 await withProvider(async()=>{await decide();},async({state:input,questions})=>{
  if(questions.evidence_0)sent.push(input);
  return answers(questions,select);
 });
 assert.equal(sent.length,2);
 for(const input of sent)assert.deepEqual(input.task,{
  acceptPartialAnswer:true,
  subjectApplicability:'deferred-to-quote-scope',
  completeness:'deferred-to-sufficiency',
  eligibilityExcludes:['registration-procedure','place','time'],
 });
 assert.deepEqual(sent.map(input=>input.quote),['会員のみ対象','平日10時から17時']);
});

test('information-category guesses cannot replace the actual user question in evidence and sufficiency requests',async()=>{
 for(const part of ['入会前に施設を見学できるか','見学を申し込む方法']){
  const inputs:any[]=[],requirements:string[]=[];
  for(const kind of ['general','procedure'])await withProvider(async()=>{
   await assessGoal({...state,goal:`${part}を知りたい。`,history:[],screen:{...state.screen,text:['施設の見学はできません。']}},[part]);
  },async({state:input,questions})=>{
   if(questions.evidence_0)inputs.push({input,questions});
   if(questions.grounded_0)requirements.push(input.checks[0].requestedInformation);
   return answers(questions,id=>id.startsWith('intent_')?kind:select(id));
  });
  // Sufficiency is voted, so each run issues several requests. Every one of
  // them must still carry the user's own question rather than the guessed
  // category, which is stricter than pinning the old count of two.
  assert.ok(requirements.length>=2,'both category runs issued a sufficiency request');
  assert.deepEqual([...new Set(requirements)],[part],'the requirement must not become the guessed category description');
  assert.equal(inputs.length,2);
  assert.deepEqual(inputs[0],inputs[1],'a guessed category must not change which quote content can qualify');
  assert.ok(inputs[0].questions.evidence_0.instructions.includes(part),'content must answer the actual information item');
 }
});

test('partial completion grounds only present items using original check indexes and retains exact provenance',async()=>{
 for(const presentIndex of [0,1])await withProvider(async()=>{
  const assessment=await assessGoal(state,['条件','時間']);
  assert.deepEqual(pendingGoalChecks(assessment),[presentIndex===0?'時間':'条件']);
  const proof=assessment.grounding!.checks[presentIndex];
  assert.equal(proof.assessment?.choice,'present');
  assert.deepEqual(proof.evidence.map(e=>[e.id,e.step,e.text]),presentIndex===0?[['s1-t1',1,'会員のみ対象']]:[['s2-t1',2,'平日10時から17時']]);
  assert.equal(assessment.grounding!.checks[1-presentIndex].assessment,undefined);
 },async({state:input,questions})=>{
  for(const prefix of ['intent_','evidence_','grounded_','contradiction_'])assert.ok(!questions[`${prefix}${1-presentIndex}`],'unavailable items must not consume grounding calls');
  if(questions[`grounded_${presentIndex}`])assert.deepEqual(Object.keys(input.checks),[String(presentIndex)]);
  return answers(questions,id=>id===`check_${1-presentIndex}`?'absent':id.startsWith('evidence_')?(input.quote===(presentIndex===0?'会員のみ対象':'平日10時から17時')?'direct':'related'):select(id));
 });
});

test('a partial present answer remains pending when its direct quote cannot be grounded',async()=>{
 await withProvider(async()=>{
  const assessment=await assessGoal(state,['条件','時間']);
  assert.deepEqual(pendingGoalChecks(assessment),['条件','時間']);
  assert.equal(assessment.grounding!.checks[0].evidence.length,0);
 },async({questions})=>answers(questions,id=>id==='check_1'?'absent':id.startsWith('evidence_')?'related':select(id)));
});

test('partial grounding can expand to full grounding without borrowing an earlier item or losing cached provenance',async()=>{
 let full=false;const calls:any[]=[];
 await withProvider(async()=>{
  const session=createEvidenceSession();
  const partial=await assessGoal(state,['条件','時間'],session);
  assert.equal(partial.grounding!.checks[1].assessment?.choice,'present');
  const saved=JSON.stringify(partial),before=calls.length;
  full=true;
  const expanded:State={...state,screen:{...state.screen,text:[...state.screen.text,'会員のみ対象']}};
  const assessment=await assessGoal(expanded,['条件','時間'],session);
  assert.deepEqual(pendingGoalChecks(assessment),[]);
  assert.deepEqual(assessment.grounding!.checks[0].evidence.map(e=>e.id),['s1-t1','s2-t2']);
  assert.deepEqual(assessment.grounding!.checks[1].evidence.map(e=>e.id),['s2-t1']);
  assert.equal(JSON.stringify(partial),saved);
  assert.ok(calls.slice(before).some(input=>input.questions.evidence_0));
  const after=calls.length,again=await assessGoal(expanded,['条件','時間'],session);
  assert.equal(calls.length,after,'only requests with the same input may be reused');
  assert.deepEqual(again.grounding!.checks.map(c=>c.evidence),assessment.grounding!.checks.map(c=>c.evidence));
  assert.ok(again.accounting!.reusedCalls>0);
 },async(input)=>{
  calls.push(input);const {state:received,questions}=input;
  return answers(questions,id=>id==='check_0'&&!full?'absent':id.startsWith('evidence_')?((id==='evidence_0'&&received.quote==='会員のみ対象'||id==='evidence_1'&&received.quote==='平日10時から17時')?'direct':'related'):select(id));
 });
});

test('a direct content choice is checked for scope and sufficiency instead of discarded by an uncalibrated score',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'done');
  assert.ok(decision.goalAssessment!.grounding!.checks.every(c=>c.evidence.length>0&&c.scope?.choice==='match'&&c.assessment?.choice==='present'));
 },async({questions})=>{
  const response=answers(questions,select);
  for(const [id,answer] of Object.entries(response.answers) as [string,any][])if(id.startsWith('evidence_'))answer.probabilities={direct:.6,related:.4,uncertain:0};
  return response;
 });
});

test('low-score direct candidates still cannot bypass applicability, sufficiency or contradiction checks',async()=>{
 for(const veto of ['scope_quote_','grounded_','contradiction_'])await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.deepEqual(pendingGoalChecks(decision.goalAssessment!),['条件','時間']);
 },async({questions})=>{
  const response=answers(questions,id=>id.startsWith(veto)?(veto==='scope_quote_'?'mismatch':'absent'):select(id));
  for(const [id,a] of Object.entries(response.answers) as [string,any][])if(id.startsWith('evidence_'))a.probabilities={direct:.6,related:.4,uncertain:0};
  return response;
 });
});

test('scope qualifies each requested person independently and defers whole-party coverage to sufficiency',async()=>{
 const compound:State={...state,goal:'大人と子どもの料金を知りたい。',history:[],screen:{...state.screen,text:['大人 1000円','子ども 無料']}};
 const scoped:string[]=[],instructions:string[]=[];
 await withProvider(async()=>{
  const assessment=await assessGoal(compound,['料金']);
  assert.deepEqual(pendingGoalChecks(assessment),[]);
  assert.deepEqual(assessment.grounding!.checks[0].evidence.map(e=>e.text),compound.screen.text);
 },async({state:input,questions})=>{
  for(const [id,q] of Object.entries(questions) as [string,any][])if(id.startsWith('scope_quote_')){
   instructions.push(q.instructions);
   scoped.push(input.quotes[Number(id.slice('scope_quote_'.length))].text);
  }
  return answers(questions,select);
 });
 assert.deepEqual(scoped,compound.screen.text);
 for(const instruction of instructions){
  assert.match(instruction,/少なくとも1人・1対象に適用する事実ならmatch/);
  assert.match(instruction,/十分性は後段で判定/);
  assert.match(instruction,/requestedInformationに対応する/);
  assert.match(instruction,/別項目の対象・施設・制度への適用で代用しない/);
 }
});

test('a quote for another goal item cannot fill a missing party even if coarse and sufficiency say present',async()=>{
 const compound:State={...state,goal:'A館の大人料金とB館の子ども料金を知りたい。',history:[],screen:{...state.screen,text:['A館の大人料金 1000円']}};
 await withProvider(async()=>{
  const assessment=await assessGoal(compound,['A館の大人料金','B館の子ども料金']);
  assert.deepEqual(pendingGoalChecks(assessment),['B館の子ども料金']);
  assert.equal(assessment.grounding!.checks[1].evidence.length,0);
 },async({state:input,questions})=>answers(questions,id=>id.startsWith('scope_quote_')
  ?(input.quotes[Number(id.slice('scope_quote_'.length))].requestedInformation==='A館の大人料金'?'match':'mismatch'):select(id)));
});

test('explicitly uncertain content is retained for inspection but never treated as proof',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.ok(decision.goalAssessment!.grounding!.checks.every(c=>c.evidence.length===0&&c.uncertainEvidence.length>0));
 },async({questions})=>answers(questions,id=>id.startsWith('evidence_')?'uncertain':select(id)));
});

test('a content request never contains two different observed quotes, even across question instructions',async()=>{
 await withProvider(async()=>{await decide();},async({state:input,questions})=>{
  if(Object.keys(questions).some(id=>id.startsWith('evidence_'))){
   const payload=JSON.stringify({input,questions});
   assert.ok(!(payload.includes('会員のみ対象')&&payload.includes('平日10時から17時')));
  }
  return answers(questions,select);
 });
});

test('sufficiency cannot see unqualified source paragraphs; contradictions use a separate veto',async()=>{
 await withProvider(async()=>{const d=await decide();assert.equal(d.action.type,'scroll');},async({state:input,questions})=>{
  if(questions.grounded_0){assert.equal(input.retainedBlocks,undefined);assert.equal(input.observedInput,undefined);assert.equal(input.checks[0].relatedEvidence,undefined);}
  return answers(questions,id=>id.startsWith('contradiction_')?'absent':select(id));
 });
});

test('sufficiency for one information item cannot borrow another items accepted quotes',async()=>{
 await withProvider(async()=>{await decide();},async({state:input,questions})=>{
  if(Object.keys(questions).some(id=>id.startsWith('grounded_')))assert.equal(Object.keys(input.checks).length,1);
  return answers(questions,select);
 });
});

test('locally verified subject applicability is preserved instead of being rejudged without its source context',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'done');
  assert.equal(decision.goalAssessment!.grounding!.checks[0].scope?.choice,'match');
 },async({questions})=>{
  assert.ok(!questions.scope_0&&!questions.scope_1,'scope must come from the contextual per-quote judgments');
  return answers(questions,select);
 });
});

test('quote content classification sees only one quote and the fixed task contract, never page context or adjacent answers',async()=>{
 await withProvider(async()=>{await decide();},async({questions,state:input})=>{
  if(Object.keys(questions).some(id=>id.startsWith('evidence_'))){
   assert.deepEqual(Object.keys(input),['quote','task']);
   assert.ok(['会員のみ対象','平日10時から17時'].includes(input.quote));
  }
  return answers(questions,select);
 });
});

test('a matching final scope answer cannot promote individually mismatched quotes to usable evidence',async()=>{
 let scopeRequests=0;
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.ok(scopeRequests>0);
  assert.ok(decision.goalAssessment!.grounding!.checks.every(c=>c.evidence.length===0));
 },async({questions})=>answers(questions,id=>{
  if(id.startsWith('scope_quote_')){scopeRequests++;return 'mismatch';}
  return select(id);
 }));
});

// Catches the current early-return branch that trusts all `present` answers without evidence.
test('unanimous completion answers cannot finish without any direct observed evidence',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.ok(decision.goalAssessment?.grounding);
  assert.ok(decision.goalAssessment.grounding.checks.every(c=>c.evidence.length===0));
 },async({questions,state:input})=>{
  if(questions.nextAction)assert.deepEqual(input.remainingGoalChecks,['条件','時間']);
  return answers(questions,id=>id.startsWith('evidence_')?'related':select(id));
 });
});

test('present sufficiency never overrides mismatched or uncertain subject applicability',async()=>{
 for(const scope of ['mismatch','uncertain'])await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  const proof=decision.goalAssessment?.grounding?.checks[0] as any;
  assert.equal(proof.scope.choice,scope);assert.equal(proof.assessment.choice,'present');
 },async({questions})=>answers(questions,id=>id.startsWith('scope_')?scope:select(id)));
});

test('completion retains exact observed quotes and their steps, separately from model assessments',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'done');
  assert.deepEqual(decision.probabilities,{});
  const proof=decision.goalAssessment?.grounding;
  assert.ok(proof);assert.ok(proof.requests.length>=2);
  assert.deepEqual(proof.checks[0].evidence.map(e=>[e.id,e.step,e.text]),[['s1-t1',1,'会員のみ対象']]);
  assert.deepEqual(proof.checks[1].evidence.map(e=>[e.id,e.step,e.text]),[['s2-t1',2,'平日10時から17時']]);
  assert.equal(proof.checks[0].assessment?.choice,'present');
 },async({questions,state:input})=>answers(questions,id=>id.startsWith('evidence_')
  ?((id==='evidence_0'&&input.quote==='会員のみ対象'||id==='evidence_1'&&input.quote==='平日10時から17時')?'direct':'related'):select(id)));
});

test('direct but incomplete evidence keeps only the insufficient item in the next-action input',async()=>{
 await withProvider(async()=>{
  const decision=await decide();assert.equal(decision.action.type,'scroll');
  assert.equal(decision.goalAssessment?.grounding?.checks[0].assessment?.choice,'absent');
 },async({questions,state:input})=>{
  if(questions.nextAction)assert.deepEqual(input.remainingGoalChecks,['条件']);
  return answers(questions,id=>id==='grounded_0'?'absent':select(id));
 });
});

test('evidence requests preserve observation warnings without copying hidden fields or action summaries',async()=>{
 const augmented={...state,referenceAnswer:'ORACLE',targetURL:'SECRET_URL',screen:{...state.screen,selector:'HIDDEN_SELECTOR'},history:[{...state.history[0],observedWarnings:['PARTIAL_TEXT'],observationOmitted:true}]};
 await withProvider(async()=>{
  const decision=await decide(augmented);assert.ok(decision.goalAssessment?.grounding);
 },async({questions,state:input})=>{
  if(questions.scope_quote_0){
   assert.equal(input.blocks.length,1,'applicability must never borrow another local block');
   assert.doesNotMatch(JSON.stringify(input),/ORACLE|SECRET_URL|HIDDEN_SELECTOR|操作結果は根拠にしない/);
   if(input.quotes.some((e:any)=>e.text==='会員のみ対象')){
    const blockId=input.quotes.find((e:any)=>e.text==='会員のみ対象').blockId;
    const quote=input.blocks.find((b:any)=>b.id===blockId);
    assert.deepEqual(quote.warnings,['PARTIAL_TEXT']);assert.equal(quote.omitted,true);
   }
  }
  return answers(questions,select);
 });
});

test('grounding failure preserves the preliminary assessment and safe error metadata',async()=>{
 await withProvider(async()=>{
  await assert.rejects(decide(),(e:any)=>{assert.equal(e.stage,'goal-evidence');assert.equal(e.goalAssessment.checks[0].choice,'present');assert.equal(e.failure.statusCode,401);assert.doesNotMatch(JSON.stringify(e),/SECRET/);return true;});
 },async({questions})=>{
  if(Object.keys(questions).some(id=>id.startsWith('evidence_')))throw Object.assign(new Error('SECRET'),{statusCode:401});
  return answers(questions,select);
 });
});

test('identical wording in different contexts retains each observed occurrence and source step',()=>{
 const contextual={...state,history:[{...state.history[0],observedText:['一般会員','平日10時から17時']}],screen:{...state.screen,text:['高校生制度','平日10時から17時']}};
 const input=goalEvidenceInput(contextual,['時間']);
 assert.deepEqual(input.evidence.filter(e=>e.text==='平日10時から17時').map(e=>[e.id,e.step]),[['s1-t2',1],['s2-t2',2]]);
});

test('legacy quotes retain an unambiguous link to their local block in final subject assessment',async()=>{
 let finalInput:any;const scopedBlocks=new Map<string,any>();
 const legacy={...state,history:[{...state.history[0],observedText:['General scheme','Hours 10–17']}],screen:{...state.screen,text:['Student scheme','Hours 10–17']}};
 await withProvider(async()=>{await decide(legacy);},async({questions,state:input})=>{if(questions.grounded_0)finalInput=input;if(questions.scope_quote_0)for(const b of input.blocks)scopedBlocks.set(b.id,b);return answers(questions,select);});
 const quotes=finalInput.checks[0].evidence.filter((e:any)=>e.text==='Hours 10–17');
 assert.equal(quotes.length,2);assert.ok(quotes.every((e:any)=>typeof e.blockKey==='string'));
 assert.notEqual(quotes[0].blockKey,quotes[1].blockKey);
 assert.deepEqual(quotes.map((e:any)=>scopedBlocks.get(e.blockKey).text[0]),['General scheme','Student scheme']);
});

test('screened-out blocks remain auditable and uncertain blocks still reach quote classification',async()=>{
 const classified:string[]=[];
 await withProvider(async()=>{
  const decision=await decide();const screening=decision.goalAssessment!.grounding!.screening!;
  assert.deepEqual(screening.map(b=>b.assessment.choice),['irrelevant','uncertain']);
  assert.equal(screening[0].evidence[0].text,'会員のみ対象');
  assert.deepEqual(classified,['平日10時から17時']);
 },async({questions,state:input})=>{
  if(Object.keys(questions).some(id=>id.startsWith('evidence_')))classified.push(input.quote);
  return answers(questions,id=>id==='screen_0'?'irrelevant':id==='screen_1'?'uncertain':select(id));
 });
});

test('stale region arrays never resurrect filtered text or removed headings',()=>{
 const context={landmark:'main' as const,section:'s1',headings:['Removed heading']};
 const s={...state,history:[],screen:{...state.screen,text:['Remaining'],regions:['Removed heading','Removed answer','Remaining'].map((text,i)=>({id:`r${i}`,source:'dom' as const,text,bbox:{x0:0,y0:i,x1:10,y1:i+1},context}))}};
 const input=goalEvidenceInput(s,['条件']);assert.equal(input.evidence.length,1);
 assert.doesNotMatch(JSON.stringify(input),/Removed heading|Removed answer/);
});

test('batched evidence classification retains older and newer quotes without silently truncating',async()=>{
 const many={...state,history:[],screen:{...state.screen,text:Array.from({length:110},(_,i)=>`条件 ${i}`)}};
 const classified:string[]=[];
 await withProvider(async()=>{
  const decision=await decide(many);assert.equal(decision.action.type,'done');
  assert.equal(decision.goalAssessment?.grounding?.checks[0].evidence.length,110);
  assert.equal(new Set(classified).size,110);
  assert.ok(classified.includes('s1-t1'));assert.ok(classified.includes('s1-t110'));
 },async({questions,state:input})=>{
  if(Object.keys(questions).some(id=>id.startsWith('evidence_'))){
   assert.ok(Object.keys(questions).length<=96);
   classified.push(`s1-t${Number(input.quote.split(' ')[1])+1}`);
  }
  return answers(questions,select);
 });
});
