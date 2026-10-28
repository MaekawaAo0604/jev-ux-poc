import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSemanticRun,compareSemanticRuns} from '../runner/semantic-analysis.js';
import type {BetaResult,BetaStep} from '../runner/virtual-beta-core.js';
import type {SemanticRunAudit} from '../jev/virtual-beta/semantic-types.js';
import type {BetaUIId} from '../jev/virtual-beta/ui-types.js';

type Result=BetaResult&{semantic?:SemanticRunAudit};
const initial={x:320,y:210,width:640,height:480};
const revealed={x:640,y:435,width:640,height:465};
const roi=[{id:'semantic-cue',rect:{x:1000,y:720,width:250,height:130},definition:'element-client-rect' as const},{id:'semantic-a',rect:{x:660,y:500,width:130,height:80},definition:'element-client-rect' as const},{id:'semantic-b',rect:{x:810,y:500,width:130,height:80},definition:'element-client-rect' as const}];
function step(number:number,choice:'A'|'B'|null=null):BetaStep {
 const selected=choice==='A'?'e7':choice==='B'?'e9':'look_3';
 return {number,inputSha256:number===1?'same-wire':'revealed-wire',audit:{screen:{title:'Notification',text:[],elements:[{id:'e7',type:'button',text:'設定Aを適用'},{id:'e9',type:'button',text:'設定Bを適用'}],canScrollUp:false,canScrollDown:false},url:'http://local/good',rawScreenshot:`audit-${number}.png`,sourceSha256:'raw-A',regionsOfInterest:structuredClone(roi)},vision:{sourceSha256:'raw-A',imageSha256:number===1?'same-initial-image':'revealed-image',width:640,height:number===1?480:465,sourceWidth:1280,sourceHeight:900,fixation:number===1?{x:640,y:450}:{x:960,y:675},clearRect:{...(number===1?initial:revealed)},transform:{offsetX:number===1?320:640,offsetY:number===1?210:435,scaleX:1,scaleY:1},mode:'crop',visibleTargets:[]},questions:{nextAction:{type:'choice',instructions:'Choose',criteria:{e7:'[e7]',e9:'[e9]',look_3:'Look',done:'Done'}}},selection:{selected,modelChoice:selected,raw:{[selected]:1},normalized:{[selected]:1},filtered:{[selected]:1},normalization:{rawTotal:1,filteredTotal:1},adjustments:[],mode:'argmax',seed:123,drawIndex:0,draw:null},action:choice?{type:'click',elementId:selected}:{type:'look',point:{x:960,y:675}},outcome:choice?'UI_PERFORMED':'FIXATION_MOVED'};
}
function run(mapping:'A'|'B'='A',choice:'A'|'B'|null=mapping,ui:BetaUIId='reference',replicate=1):Result {
 const steps=choice?[step(1),step(2,choice)]:[step(1),{...step(2),action:{type:'done' as const},outcome:'SUBJECTIVE_DONE'}];
 for(const s of steps){s.audit!.sourceSha256=`raw-${mapping}`;s.vision!.sourceSha256=`raw-${mapping}`;}
 const success=choice===mapping;
 return {schemaVersion:1,runId:`${ui}-${replicate}-${mapping}`,condition:'semantic',semantic:{trial:{id:`${ui}-${replicate}-${mapping}`,pairId:`${ui}-${replicate}`,replicate,fixture:{version:1,ui,mapping}},definitionHash:`definition-${ui}-${mapping}`,initialProductImage:{file:'initial.png',sha256:`raw-${mapping}`}},config:{schemaVersion:1,id:'semantic',vision:{mode:'crop',clearWidth:640,clearHeight:480,blurRadius:0},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:123},behavior:'goal',maxUIActions:4,maxLooks:4,maxDecisions:4,maxAPICalls:4,maxRunMs:120000,modeledActionMs:null},input:{} as Result['input'],initialFingerprint:`raw-${mapping}`,objectiveSuccess:success,perceivedDone:false,termination:'OBJECTIVE_SUCCESS',looks:1,uiActions:choice?1:0,decisions:2,apiCalls:2,apiMs:100,uiMs:0,modeledUserMs:null,elapsedMs:100,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:success},validForComparison:true,steps};
}
const all=(choice:(mapping:'A'|'B',ui:BetaUIId,rep:number)=>'A'|'B'|null=(m)=>m)=>['reference','position-only','wording-only'].flatMap(ui=>[1,2].flatMap(rep=>['A','B'].map(mapping=>run(mapping as 'A'|'B',choice(mapping as 'A'|'B',ui as BetaUIId,rep),ui as BetaUIId,rep))));

test('fully revealed cue and first correct choice receive strict behavioral success without mutating evidence',()=>{
 const r=run();const before=structuredClone(r);const a=analyzeSemanticRun(r);
 assert.equal(a.cue.initialWhollyAbsent,true);assert.equal(a.cue.acquiredBeforeOrAtFirstChoice,true);
 assert.equal(a.choice.first,'A');assert.equal(a.choice.correct,true);assert.equal(a.choice.bothOfferedInitially,true);assert.equal(a.choice.bothOfferedAtFirstChoice,true);
 assert.equal(a.metric.cueSupportedFirstChoiceCorrect,true);assert.equal(a.metric.score,1);assert.equal(a.cue.firstFullyVisibleDecision,2);
 assert.deepEqual(r,before);
});
test('a blind correct guess and a wrong exposed choice both score zero',()=>{
 const blind=run();blind.steps=[step(1,'A')];
 assert.equal(analyzeSemanticRun(blind).choice.correct,true);assert.equal(analyzeSemanticRun(blind).cue.acquiredBeforeOrAtFirstChoice,false);assert.equal(analyzeSemanticRun(blind).metric.score,0);
 const wrong=analyzeSemanticRun(run('A','B'));assert.equal(wrong.choice.correct,false);assert.equal(wrong.metric.score,0);
});
test('partial exposure and cue initially visible cannot establish newly acquired cue support',()=>{
 const partial=run();partial.steps[1].vision!.clearRect.height=400;
 assert.equal(analyzeSemanticRun(partial).cue.acquiredBeforeOrAtFirstChoice,false);
 const initialVisible=run();initialVisible.steps[0].vision!.clearRect={x:900,y:700,width:380,height:200};
 assert.equal(analyzeSemanticRun(initialVisible).cue.initialWhollyAbsent,false);assert.equal(analyzeSemanticRun(initialVisible).metric.score,0);
 const overlap=run();overlap.steps[0].vision!.clearRect={x:900,y:700,width:150,height:150};
 assert.equal(analyzeSemanticRun(overlap).cue.initialWhollyAbsent,false);
});
test('candidate gating is identified through audit control IDs and cannot earn semantic evidence',()=>{
 for(const index of [0,1]){const r=run();delete r.steps[index].questions!.nextAction.criteria.e9;
  const a=analyzeSemanticRun(r);assert.equal(a.metric.score,0);assert.equal(index===0?a.choice.bothOfferedInitially:a.choice.bothOfferedAtFirstChoice,false);
 }
 const r=run();r.steps[1].audit!.screen.elements[0].text='Another button';r.steps[1].questions!.nextAction.criteria.e7='設定Aを適用';
 assert.equal(analyzeSemanticRun(r).choice.first,null);assert.equal(analyzeSemanticRun(r).metric.cueSupportedFirstChoiceCorrect,null);
});
test('missing audit remains unknown, whereas complete no-choice evidence records zero and censoring',()=>{
 const missing=run();delete missing.steps[1].audit!.regionsOfInterest;
 assert.equal(analyzeSemanticRun(missing).cue.acquiredBeforeOrAtFirstChoice,null);assert.equal(analyzeSemanticRun(missing).metric.cueSupportedFirstChoiceCorrect,null);
 const noChoice=run('A',null);noChoice.termination='API_LIMIT';
 const a=analyzeSemanticRun(noChoice);assert.equal(a.choice.first,null);assert.equal(a.choice.correct,null);assert.equal(a.metric.cueSupportedFirstChoiceCorrect,false);assert.equal(a.classification.censored,true);assert.equal(a.metric.score,0);
 const noAudit=run();delete noAudit.semantic;assert.equal(analyzeSemanticRun(noAudit).classification.semanticValidity,'unknown');
});
test('infra errors, source changes and changed selected/action IDs remain visible and ineligible',()=>{
 const infra=run();infra.termination='API_ERROR';infra.validForComparison=false;
 assert.equal(analyzeSemanticRun(infra).classification.artifactValidity,'infra-invalid');assert.equal(analyzeSemanticRun(infra).metric.score,0);
 const changed=run();changed.steps[1].audit!.sourceSha256='new';changed.steps[1].vision!.sourceSha256='new';
 assert.equal(analyzeSemanticRun(changed).cue.rawScreenStableBeforeChoice,false);assert.equal(analyzeSemanticRun(changed).metric.score,0);
 const mismatch=run();mismatch.steps[1].selection!.selected='e9';assert.equal(analyzeSemanticRun(mismatch).metric.score,0);
});
test('the earliest A/B click is the endpoint even if a later click is correct',()=>{
 const r=run('A','B');r.steps.push(step(3,'A'));assert.equal(analyzeSemanticRun(r).choice.first,'B');assert.equal(analyzeSemanticRun(r).metric.score,0);
});
test('all correct reversed-mapping pairs have exact one-sided label-swap p=1/64 and UI p=1',()=>{
 const a=compareSemanticRuns(all());assert.equal(a.design.expectedTrials,12);assert.equal(a.counts.observed,12);assert.equal(a.counts.strictSuccesses,12);
 assert.equal(a.mappingTest.status,'available');assert.equal(a.mappingTest.permutations,64);assert.equal(a.mappingTest.pValue,1/64);
 assert.equal(a.uiTest.status,'available');assert.equal(a.uiTest.permutations,1296);assert.equal(a.uiTest.statistic,0);assert.equal(a.uiTest.pValue,1);
 assert.equal(a.pairs.length,6);assert.ok(a.pairs.every(p=>p.initialInputSha256Equal===true&&p.initialImageSha256Equal===true&&p.initialRawSourceSha256Equal===false));
});
test('always A is mapping-insensitive (six of twelve) and all blind guesses have a zero strict endpoint',()=>{
 const a=compareSemanticRuns(all(()=> 'A'));assert.equal(a.counts.strictSuccesses,6);assert.equal(a.mappingTest.pValue,1);assert.equal(a.uiTest.pValue,1);
 const blind=all();for(const r of blind)r.steps=[{...step(1,r.semantic!.trial.fixture.mapping),audit:{...step(1).audit!,sourceSha256:`raw-${r.semantic!.trial.fixture.mapping}`},vision:{...step(1).vision!,sourceSha256:`raw-${r.semantic!.trial.fixture.mapping}`}}];
 const b=compareSemanticRuns(blind);assert.equal(b.counts.strictSuccesses,0);assert.equal(b.mappingTest.pValue,1);assert.equal(b.uiTest.pValue,1);
});
test('one UI succeeding in every block has hand-computable omnibus range p=3/81',()=>{
 const a=compareSemanticRuns(all((mapping,ui)=>ui==='reference'?mapping:null));
 assert.equal(a.uiTest.statistic,1);assert.equal(a.uiTest.pValue,1/27);assert.equal(a.byUI.find(v=>v.ui==='reference')!.strictSuccessRate,1);assert.equal(a.byUI.find(v=>v.ui==='position-only')!.strictSuccessRate,0);
});
test('incomplete, duplicate, unknown, mismatched input, and infrastructure-invalid datasets keep denominator and disable tests',()=>{
 const variants=[all().slice(1),[...all(),run()],all(),all(),all()];
 delete variants[2][0].semantic;variants[3][0].steps[0].inputSha256='different';variants[4][0].validForComparison=false;
 for(const results of variants){const a=compareSemanticRuns(results);assert.equal(a.design.expectedTrials,12);assert.equal(a.mappingTest.status,'unavailable');assert.equal(a.mappingTest.pValue,null);assert.equal(a.uiTest.status,'unavailable');assert.ok(a.issues.length>0);}
 const missing=compareSemanticRuns(all().slice(1));assert.equal(missing.counts.missing,1);assert.equal(missing.byUI[0].expectedTrials,4);
});
test('different initial raw pixels across reversed mappings are allowed but image mismatch is not',()=>{
 const r=all();r[0].steps[0].vision!.imageSha256='different';const a=compareSemanticRuns(r);
 assert.equal(a.pairs[0].initialImageSha256Equal,false);assert.equal(a.mappingTest.status,'unavailable');
});

test('complete terminal observations without a chosen action are recorded no-choice rather than missing audits',()=>{
 const r=run('A',null);delete r.steps[1].action;r.termination='TIME_LIMIT';
 const a=analyzeSemanticRun(r);assert.equal(a.choice.noChoiceRecorded,true);assert.equal(a.metric.cueSupportedFirstChoiceCorrect,false);assert.equal(a.classification.semanticValidity,'semantic-valid');
});
test('filtering either A/B control after offering questions cannot create semantic evidence',()=>{
 const r=run();r.steps[1].selection!.adjustments=[{candidate:'e9',reason:'POLICY_EXCLUDED'}];
 assert.equal(analyzeSemanticRun(r).classification.semanticValidity,'design-invalid');assert.equal(analyzeSemanticRun(r).metric.cueSupportedFirstChoiceCorrect,false);assert.equal(analyzeSemanticRun(r).metric.score,0);
});
test('malformed fixture metadata stays inspectable and leaves both tests unavailable',()=>{
 const r=all();delete (r[0].semantic!.trial as any).fixture;
 assert.doesNotThrow(()=>compareSemanticRuns(r));assert.equal(compareSemanticRuns(r).mappingTest.status,'unavailable');
});
test('identical initial raw pixels cannot verify the reversed routing manipulation',()=>{
 const r=all();r[0].steps[0].audit!.sourceSha256='raw-B';r[0].steps[0].vision!.sourceSha256='raw-B';r[0].steps[1].audit!.sourceSha256='raw-B';r[0].steps[1].vision!.sourceSha256='raw-B';
 const a=compareSemanticRuns(r);assert.equal(a.mappingTest.status,'unavailable');assert.ok(a.issues.includes('REVERSED_MAPPING_RAW_IMAGE_NOT_DIFFERENT'));
});
test('all complete no-choice runs have a zero strict endpoint and exact p=1 in both tests',()=>{
 const a=compareSemanticRuns(all(()=>null));assert.equal(a.counts.noChoice,12);assert.equal(a.counts.strictSuccesses,0);assert.equal(a.mappingTest.pValue,1);assert.equal(a.uiTest.pValue,1);
});
