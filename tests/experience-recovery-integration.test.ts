import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';
import {validateConfig} from '../jev/virtual-beta/config.js';

const answer=(request:any,selected:string)=>({model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q]:[string,any])=>{
 const choice=id==='nextAction'?selected:id==='decisionBasis'?'goal':id==='knowledge'?'insufficient':id==='goal'?'unsatisfied':id==='goalEvidence'?request.input.observation.id:id==='experienceProgress'?'neutral':id==='experienceExpectation'?'not_supported':id==='experienceEvidence'?request.input.observation.id:id.startsWith('effect_')?'advances':id.startsWith('evidence_')?request.input.observation.id:'none';
 assert.ok(Object.hasOwn(q.criteria,choice),id+':'+choice);return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];
}))});

test('experience is an opt-in difference from deliberation with identical exploration/request limits',()=>{
 const old=humanJevProfile('deliberation'),next=humanJevProfile('experience' as any);
 assert.deepEqual(next.config.experience,{enabled:true,capacity:8});
 const {id,experience,...rest}=next.config;const {id:oldId,...oldRest}=old.config;assert.deepEqual(rest,oldRest);
 assert.equal(next.maximumRequests,24);assert.equal(next.reviewMaximum,0);assert.equal(old.config.experience,undefined);
 assert.throws(()=>validateConfig({...next.config,state:{enabled:true,memoryCapacity:1}}),/EXPERIENCE/);
 assert.throws(()=>validateConfig({...next.config,deliberation:undefined}),/EXPERIENCE/);
});

test('executed excursion is remembered beyond image buffer, judged in existing stage, and never forces selection',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-experience-'));let actions=0,assessments=0;
 try{
  const saved=await runHumanJev({out:join(dir,'trial'),mock:true,mode:'experience' as any},async request=>{
   const input:any=request.input,state=input.userState,experience=state.experience;
   assert.equal(input.observation.screen,undefined);assert.ok(state.memory.every((m:any)=>m.visibleText.length===0));assert.ok(experience);
   if(request.questions.knowledge){
    assessments++;
    if(assessments===1)assert.equal(request.questions.experienceProgress,undefined);
    else {assert.ok(request.questions.experienceProgress);assert.deepEqual(Object.keys(request.questions.experienceEvidence.criteria),[input.observation.id,'none']);assert.equal(experience.transitions.at(-1).result.observationId,input.observation.id);}
   }else{
    actions++;assert.deepEqual(Object.keys(request.questions.nextAction.criteria),input.observation.candidateIds);
    if(actions>1){const transition=experience.transitions.at(-1);assert.equal(transition.judgment.progress,'neutral');assert.equal(transition.judgment.expectation,'not_supported');assert.equal(transition.judgment.kind,'model-assessment-not-fact');}
    if(actions===4){
     assert.equal(experience.transitions.length,3);assert.equal(experience.transitions[0].intent.source.observationId,'o1');assert.ok(!state.memory.some((m:any)=>m.observationId==='o1'));
     assert.ok(input.experienceContext.returnedRoutes.length>0);assert.ok(request.questions.nextAction.criteria.e4);assert.ok(request.questions.nextAction.criteria.e5);assert.ok(request.questions.nextAction.criteria.done);
    }
   }
   // Deliberately revisits the same entry after returning, despite negative model judgments.
   return answer(request,actions===3?'e3':actions===5?'done':'e4');
  });
  assert.equal(assessments,5);assert.equal(actions,5);assert.equal(saved.result.apiCalls,10);assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.objectiveSuccess,false);
  assert.equal(saved.result.steps[3].selection!.selected,'e4');assert.deepEqual(saved.result.steps[3].selection!.adjustments,[]);
  assert.equal(saved.review.reason,'PROFILE_DISABLED');
  const manifest=JSON.parse(await readFile(join(saved.root,'manifest.json'),'utf8'));assert.equal(manifest.mode,'experience');assert.equal(manifest.humanInputsRead,false);
  const replay=await replayDirectory(join(saved.root,'exploration'));assert.equal(replay.choices,5);assert.equal(replay.assessments,5);
  const file=join(saved.root,'exploration/result.json'),tampered=JSON.parse(await readFile(file,'utf8'));tampered.steps[3].userState.experience.transitions[0].intent.prediction='conflicts';await writeFile(file,JSON.stringify(tampered));await assert.rejects(replayDirectory(join(saved.root,'exploration')),/EXPERIENCE/);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'jev-experience-')));await rm(dir,{recursive:true,force:true});}
});


test('basis wording is a declared opt-in; all limits, candidates and none admission remain unchanged',async()=>{
 const previous=humanJevProfile('experience'),next=humanJevProfile('experience-basis' as any);
 assert.deepEqual(next.config.experience,{enabled:true,capacity:8,evidenceMode:'basis'});
 const {id,experience,...unchanged}=next.config;const {id:previousId,experience:previousExperience,...old}=previous.config;assert.deepEqual(unchanged,old);
 const dir=await mkdtemp(join(tmpdir(),'jev-experience-basis-'));let calls=0;
 try{
  const saved=await runHumanJev({out:join(dir,'trial'),mock:true,mode:'experience-basis' as any},async request=>{
   if(request.questions.nextAction)calls++;
   if(request.questions.experienceEvidence){assert.deepEqual(Object.keys(request.questions.experienceEvidence.criteria),[(request.input.observation as any).id,'none']);assert.match(request.questions.experienceEvidence.instructions,/basis/i);}
   return answer(request,calls<2?'wait':'done');
  });
  assert.equal(saved.result.apiCalls,4);assert.equal(saved.result.uiActions,0);assert.equal(saved.result.termination,'SUBJECTIVE_DONE');assert.equal(saved.result.objectiveSuccess,false);
  assert.equal((await replayDirectory(join(saved.root,'exploration'))).assessments,2);
 }finally{assert.ok(dir.startsWith(join(tmpdir(),'jev-experience-basis-')));await rm(dir,{recursive:true,force:true});}
});
