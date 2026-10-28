import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {auditGoalFragments, runGoalFragmentAudit} from '../docs/experiments/2026-10-29-goal-fragment-audit.js';
import {ImageJudgmentMemory} from '../jev/image-judgments.js';
const sha=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const goal='Using account A, disable mail, verify disabled, preserve display';
const statuses=['context','context','uncertain','observed'];
function fixture():any {
 const reader=new ImageJudgmentMemory();reader.bind(goal);
 const requirements=reader.view().requirements.map((r,i)=>({id:r.id,text:r.text,assessment:statuses[i]}));
 const questions=Object.fromEntries(Object.entries(reader.questions({id:'o1',step:1,sha256:sha('image')},[])).map(([id,q])=>['goalSearch_'+id,q]));
 questions.goal={type:'choice',instructions:'Whole Goal',criteria:{satisfied:'yes',unsatisfied:'no',uncertain:'unknown'}};
 const answers=Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=id==='goal'?'unsatisfied':statuses[Number(id.slice('goalSearch_image_check_'.length))];return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)])),providerSecret:'NEVER_COPY'}];}));
 const source={observationId:'o1',imageSha256:sha('image')};
 const record={kind:'model-goal-search-not-fact',scope:'delivered-current-view-only',goalSha256:sha(goal),source,requirements,finding:{kind:'uncertain'}};
 const memory={schemaVersion:1,entries:[structuredClone(record)]};
 const input={goal,exploration:{charter:{goal}},observation:{id:'o1',image:'current'},userState:{goalSearch:structuredClone(memory)}};
 return {schemaVersion:1,runId:'synthetic',config:{goalSearch:{enabled:true,capacity:8}},code:{revision:'old-producer',sourceHash:sha('producer')},input:{charter:{goal}},objectiveSuccess:false,perceivedDone:false,objectiveAssessment:{status:'OK',value:false},termination:'API_ERROR',validForComparison:false,steps:[{number:1,goalSearch:{record,memory},userState:{lastObservation:{id:'o1',imageSha256:sha('image')},goalSearch:structuredClone(memory)},modelInput:structuredClone(input),assetFiles:{current:{file:'image.png',sha256:sha('image')}},deliberation:{modelInput:structuredClone(input),questions,assetFiles:{current:{file:'image.png',sha256:sha('image')}},response:{answers,providerSecret:'NEVER_COPY'},assessment:{goal:'uncertain'}},outcome:'UI_PERFORMED'}]};
}
function rubric():any {return {schemaVersion:1,kind:'authored-goal-role-rubric',goalSha256:sha(goal),fragments:fixture().steps[0].goalSearch.record.requirements.map((r:any,i:number)=>({id:r.id,text:r.text,role:['context','required','undetermined','required'][i],rationale:'Independently authored expectation '+i}))};}

test('without rubric reports literal raw judgments without inventing semantic correctness',()=>{
 const r=fixture(),before=structuredClone(r),report=auditGoalFragments(r);
 assert.equal(report.rubric.status,'NOT_PROVIDED');assert.equal(report.classification.status,'AVAILABLE');
 assert.equal(report.frames.length,1);assert.equal(report.frames[0].fragments[1].recordedAssessment,'context');
 assert.deepEqual(report.frames[0].fragments[1].raw.probabilities,r.steps[0].deliberation.response.answers.goalSearch_image_check_1.probabilities);
 assert.equal(report.frames[0].fragments[1].rubricComparison,'NO_RUBRIC');
 assert.equal(report.frames[0].wholeGoal.raw.choice,'unsatisfied');assert.equal(report.frames[0].wholeGoal.admittedChoice,'uncertain');
 assert.deepEqual(report.success,{objectiveSuccess:false,perceivedDone:false,objectiveAssessment:{status:'OK',value:false},termination:'API_ERROR',validForComparison:false});
 assert.ok(!JSON.stringify(report).includes('NEVER_COPY'));assert.deepEqual(r,before);
});
test('authored required+context is a rubric conflict; context and undetermined stay distinct',()=>{
 const r=fixture(),labels=rubric(),before=structuredClone(labels),report=auditGoalFragments(r,labels),f=report.frames[0].fragments;
 assert.equal(report.rubric.status,'APPLIED');assert.equal(f[0].rubricComparison,'CONTEXT_SELECTED');assert.equal(f[1].rubricComparison,'RUBRIC_CONFLICT');assert.equal(f[2].rubricComparison,'UNDETERMINED');assert.equal(f[3].rubricComparison,'NO_REQUIRED_CONTEXT_CONFLICT');
 assert.equal(report.aggregates.fragments[1].requiredContextConflicts,1);assert.deepEqual(report.aggregates.fragments[1].contextProbabilities,[1]);assert.equal(report.aggregates.requiredContextAndWholeGoalUnsatisfied,1);
 assert.equal(report.humanFidelityEvaluated,false);assert.equal(report.causalEffectEvaluated,false);assert.deepEqual(labels,before);
});
for(const kind of ['schema','unknown-field','hash','text','coverage','duplicate','role','rationale','id'] as const)test('reject invalid rubric '+kind,()=>{
 const labels=rubric();if(kind==='schema')labels.schemaVersion=2;if(kind==='unknown-field')labels.extra='model input';if(kind==='hash')labels.goalSha256=sha('wrong');if(kind==='text')labels.fragments[1].text+='!';if(kind==='coverage')labels.fragments.pop();if(kind==='duplicate')labels.fragments[1]=labels.fragments[0];if(kind==='role')labels.fragments[1].role='correct';if(kind==='rationale')labels.fragments[1].rationale=' ';if(kind==='id')labels.fragments[1].id='g99';
 assert.throws(()=>auditGoalFragments(fixture(),labels),/INVALID_GOAL_ROLE_RUBRIC/);
});
test('rubric must match classified saved fragment identity as well as Goal',()=>{const r=fixture();r.steps[0].goalSearch.record.requirements[1].text='changed';assert.throws(()=>auditGoalFragments(r,rubric()),/INVALID_GOAL_ROLE_RUBRIC/);});
for(const kind of ['total','negative','extra-key','choice','missing'] as const)test('invalid raw '+kind+' distribution remains visible without normalization',()=>{
 const r=fixture(),answer=r.steps[0].deliberation.response.answers.goalSearch_image_check_1;if(kind==='total')answer.probabilities.context=.2;if(kind==='negative')answer.probabilities.context=-1;if(kind==='extra-key')answer.probabilities.extra=0;if(kind==='choice')answer.choice='alien';if(kind==='missing')delete r.steps[0].deliberation.response.answers.goalSearch_image_check_1;
 const before=structuredClone(r),report=auditGoalFragments(r,rubric()),f=report.frames[0].fragments[1];assert.equal(f.raw.validation.valid,false);assert.equal(f.rubricComparison,'INVALID_RAW');if(kind==='total')assert.equal(f.raw.probabilities?.context,.2);assert.deepEqual(r,before);assert.ok(report.frames[0].issues.includes('INVALID_FRAGMENT_DISTRIBUTION:g2'));
});
test('raw to record and record to action memory mismatches are explicit',()=>{
 const r=fixture();r.steps[0].goalSearch.record.requirements[1].assessment='observed';r.steps[0].modelInput.userState.goalSearch.entries=[];
 const report=auditGoalFragments(r);assert.equal(report.frames[0].fragments[1].rawMatchesRecord,false);assert.equal(report.frames[0].consistency.actionMemoryMatchesRecorded,false);assert.equal(report.frames[0].consistency.currentRecordInActionMemory,false);assert.ok(report.frames[0].issues.includes('RAW_RECORD_MISMATCH:g2'));
});
test('all four full-Goal fields and current image provenance are independently checked',()=>{
 const r=fixture();r.steps[0].deliberation.modelInput.goal='changed';r.steps[0].modelInput.exploration.charter.goal='changed';r.steps[0].goalSearch.record.source.imageSha256=sha('wrong');
 const frame=auditGoalFragments(r).frames[0];assert.deepEqual(frame.goalPreservation,{assessmentGoal:false,assessmentCharterGoal:true,actionGoal:true,actionCharterGoal:false});assert.equal(frame.consistency.sourceMatchesCurrent,false);assert.ok(frame.issues.includes('FULL_GOAL_CHANGED_OR_MISSING'));
});
test('raw/record text, missing records, missing questions and extra fragment answers remain visible',()=>{
 const r=fixture();delete r.steps[0].goalSearch.record;delete r.steps[0].deliberation.questions.goalSearch_image_check_0;r.steps[0].deliberation.response.answers.goalSearch_image_check_99={choice:'context',probabilities:{context:1}};
 const report=auditGoalFragments(r);assert.ok(report.frames[0].issues.includes('CURRENT_RECORD_MISSING'));assert.ok(report.frames[0].issues.includes('FRAGMENT_QUESTION_COVERAGE_MISMATCH'));assert.ok(report.frames[0].issues.includes('FRAGMENT_ANSWER_COVERAGE_MISMATCH'));
});
test('no-response HTTP402 is separate from current classifications and excludes arbitrary error fields',()=>{
 const r=fixture(),partial=structuredClone(r.steps[0]);partial.number=2;delete partial.goalSearch.record;delete partial.deliberation.response;delete partial.deliberation.assessment;partial.error={code:'HTTP_ERROR',statusCode:402,message:'NEVER_COPY'};partial.deliberation.error=partial.error;partial.outcome='ASSESSMENT_ERROR';r.steps.push(partial);
 const report=auditGoalFragments(r,rubric());assert.equal(report.frames.length,1);assert.equal(report.faultSteps.length,1);assert.equal(report.faultSteps[0].assessmentResponsePresent,false);assert.deepEqual(report.faultSteps[0].error,{code:'HTTP_ERROR',statusCode:402});assert.equal(report.faultSteps[0].carriedMemoryEntryCount,1);assert.equal(report.aggregates.fragments[1].classifiedCount,1);assert.ok(!JSON.stringify(report).includes('NEVER_COPY'));
});
test('disabled and legacy absence is no classification and no comparison; sidecar does not invent samples',()=>{
 const r=fixture();r.config={};r.steps=[{number:1,outcome:'UI_PERFORMED'}];
 const report=auditGoalFragments(r,rubric());assert.equal(report.classification.status,'ABSENT');assert.equal(report.rubric.status,'NOT_APPLICABLE');assert.equal(report.frames.length,0);assert.equal(report.aggregates.fragments.length,0);assert.equal(report.aggregates.requiredContextAndWholeGoalUnsatisfied,0);
});

async function savedLegacy(){const root=await mkdtemp(join(tmpdir(),'goal-fragment-audit-')),run=join(root,'run');await mkdir(run);const r=fixture();r.config={};r.steps=[];await writeFile(join(run,'result.json'),JSON.stringify(r));return {root,run,bytes:await readFile(join(run,'result.json'))};}
test('replay-first wrapper hashes analyzer/result and distinguishes current vs producer without mutating input',async()=>{
 const {root,run,bytes}=await savedLegacy(),out=join(root,'audit.json'),report=await runGoalFragmentAudit({runDirectory:run,out});
 assert.equal(report.replay.verified,true);assert.equal(report.provenance.resultSha256,sha(bytes));assert.equal(report.provenance.analyzerSha256,sha(await readFile(resolve('docs/experiments/2026-10-29-goal-fragment-audit.ts'))));assert.equal(report.provenance.producer.revision,'old-producer');assert.equal(report.provenance.identicalProductSource,false);assert.match(report.provenance.sourceInterpretation,/compatibility/i);assert.deepEqual(await readFile(join(run,'result.json')),bytes);assert.deepEqual(JSON.parse(await readFile(out,'utf8')),report);
 await assert.rejects(runGoalFragmentAudit({runDirectory:run,out}),{code:'EEXIST'});assert.deepEqual(JSON.parse(await readFile(out,'utf8')),report);
});
test('replay failure leaves no output and no partial report',async()=>{
 const {root,run}=await savedLegacy(),path=join(run,'result.json'),r=JSON.parse(await readFile(path,'utf8'));r.steps=[{number:1,deliberation:{modelInput:{},questions:{},assetFiles:{},inputSha256:'bad'}}];await writeFile(path,JSON.stringify(r));const out=join(root,'bad.json');await assert.rejects(runGoalFragmentAudit({runDirectory:run,out}),/ASSESSMENT_INPUT_HASH_MISMATCH/);await assert.rejects(readFile(out),{code:'ENOENT'});
});
test('CLI requires explicit flags, import is inert, and normal replay creates only requested new report',async()=>{
 const {root,run}=await savedLegacy(),module=resolve('docs/experiments/2026-10-29-goal-fragment-audit.ts'),out=join(root,'cli.json');
 const imported=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(module).href)})`],{cwd:process.cwd(),encoding:'utf8'});assert.equal(imported.status,0,imported.stderr);assert.equal(imported.stdout,'');
 const cli=spawnSync(process.execPath,['--import','tsx',module,'--run',run,'--out',out],{cwd:process.cwd(),encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(await readFile(out,'utf8')).replay.verified,true);assert.equal(JSON.parse(cli.stdout).out,out);
 for(const args of [[],['--run',run],['--run',run,'--out',join(root,'x.json'),'--unknown','x']]){const bad=spawnSync(process.execPath,['--import','tsx',module,...args],{cwd:process.cwd(),encoding:'utf8'});assert.notEqual(bad.status,0);assert.match(bad.stderr,/Usage:/);}
});

test('saved malformed or mismatched rubric rejects explicitly before output; valid CLI sidecar is auditor-only',async()=>{
 const {root,run,bytes}=await savedLegacy(),sidecar=join(root,'rubric.json'),out=join(root,'rubric-audit.json');
 await writeFile(sidecar,'{broken JSON');await assert.rejects(runGoalFragmentAudit({runDirectory:run,out,rubricPath:sidecar}),/INVALID_GOAL_ROLE_RUBRIC/);await assert.rejects(readFile(out),{code:'ENOENT'});
 const wrong=rubric();wrong.goalSha256=sha('other');await writeFile(sidecar,JSON.stringify(wrong));await assert.rejects(runGoalFragmentAudit({runDirectory:run,out,rubricPath:sidecar}),/INVALID_GOAL_ROLE_RUBRIC/);
 await writeFile(sidecar,JSON.stringify(rubric()));const module=resolve('docs/experiments/2026-10-29-goal-fragment-audit.ts'),cli=spawnSync(process.execPath,['--import','tsx',module,'--run',run,'--out',out,'--rubric',sidecar],{cwd:process.cwd(),encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);const report=JSON.parse(await readFile(out,'utf8'));assert.equal(report.rubric.status,'NOT_APPLICABLE');assert.equal(report.provenance.rubricSha256,sha(await readFile(sidecar)));assert.deepEqual(await readFile(join(run,'result.json')),bytes);
});

test('whole-Goal raw answer validates against the legitimate Goal choice set as well as saved criteria',()=>{
 const r=fixture();r.steps[0].deliberation.questions.goal.criteria={sneaky:'not a Goal status'};r.steps[0].deliberation.response.answers.goal={choice:'sneaky',probabilities:{sneaky:1}};
 const frame=auditGoalFragments(r).frames[0];assert.equal(frame.wholeGoal.raw.choice,'sneaky');assert.deepEqual(frame.wholeGoal.raw.probabilities,{sneaky:1});assert.equal(frame.wholeGoal.raw.validation.valid,false);assert.equal(frame.wholeGoal.raw.validation.code,'CRITERIA_MISMATCH');assert.ok(frame.issues.includes('INVALID_WHOLE_GOAL_DISTRIBUTION'));
});

test('assessment-only saved inputs preserve Goal without establishing an action response or transmission',()=>{
 const r=fixture();r.steps[0].outcome='ASSESSMENT_ONLY_API_LIMIT';
 const report=auditGoalFragments(r),frame=report.frames[0];assert.deepEqual(frame.responseEvidence,{assessmentResponseRecorded:true,actionResponseRecorded:false});assert.equal(frame.goalPreservation.actionGoal,true);assert.equal(frame.goalPreservation.actionCharterGoal,true);assert.ok(report.limitations.some(text=>/saved model inputs.*transmission/i.test(text)&&/missing response/i.test(text)));
});
test('fault saved inputs retain Goal while response evidence makes no transmission inference',()=>{
 const r=fixture(),step=r.steps[0];delete step.deliberation.response;delete step.deliberation.assessment;delete step.goalSearch.record;step.outcome='ASSESSMENT_ERROR';step.deliberation.error={code:'HTTP_ERROR',statusCode:402};
 const report=auditGoalFragments(r),fault=report.faultSteps[0];assert.equal(report.frames.length,0);assert.deepEqual(fault.responseEvidence,{assessmentResponseRecorded:false,actionResponseRecorded:false});assert.equal(fault.goalPreservation.actionGoal,true);assert.equal(fault.goalPreservation.assessmentGoal,true);
});
test('recorded action response is distinguished from preserved prepared action input',()=>{
 const r=fixture();r.steps[0].response={model:'synthetic',answers:{nextAction:{choice:'done',probabilities:{done:1}}}};
 const frame=auditGoalFragments(r).frames[0];assert.deepEqual(frame.responseEvidence,{assessmentResponseRecorded:true,actionResponseRecorded:true});assert.equal(frame.goalPreservation.actionGoal,true);
});

for(const part of ['observation','attached-image'] as const)test('both model-input stages verify current source: action '+part,()=>{
 const r=fixture(),step=r.steps[0];if(part==='observation')step.modelInput.observation.id='o99';else step.assetFiles.current.sha256=sha('other action image');
 const frame=auditGoalFragments(r).frames[0];assert.equal(frame.consistency.sourceMatchesCurrent,false);assert.equal(frame.consistency.actionSourceMatchesCurrent,false);assert.ok(frame.issues.includes('INCONSISTENT:sourceMatchesCurrent'));
});
for(const kind of ['kind','scope','schema','capacity','entry-count','source-id','source-hash','goal-hash','literal-text','status','finding','target-id','chronology'] as const)test('memory structure diagnostics are independent of equal copies: '+kind,()=>{
 const r=fixture(),step=r.steps[0],copies=[step.goalSearch.memory,step.modelInput.userState.goalSearch,step.userState.goalSearch,step.deliberation.modelInput.userState.goalSearch];
 for(const memory of copies){if(kind==='schema')memory.schemaVersion=99;if(kind==='entry-count')memory.entries.push(structuredClone(memory.entries[0]));if(kind==='chronology'){const prior=structuredClone(memory.entries[0]);prior.source.observationId='o2';memory.entries.unshift(prior);}const e=memory.entries.at(-1);if(kind==='kind')e.kind='fact';if(kind==='scope')e.scope='all-history';if(kind==='source-id')e.source.observationId='o01';if(kind==='source-hash')e.source.imageSha256='not-a-hash';if(kind==='goal-hash')e.goalSha256=sha('other goal');if(kind==='literal-text')e.requirements[0].text='other fragment';if(kind==='status')e.requirements[0].assessment='alien';if(kind==='finding')e.finding={kind:'all-information'};if(kind==='target-id')e.finding={kind:'target',candidateId:'secret'};}
 if(kind==='capacity')r.config.goalSearch.capacity=0;if(kind==='kind')step.goalSearch.record.kind='fact';if(kind==='scope')step.goalSearch.record.scope='all-history';
 const before=structuredClone(r),frame=auditGoalFragments(r).frames[0];assert.deepEqual(r,before);assert.equal(frame.consistency.actionMemoryMatchesRecorded,true);assert.equal(frame.consistency.userStateMemoryMatchesRecorded,true);assert.equal(frame.consistency.recordedMemoryStructureValid,false);assert.equal(frame.consistency.actionMemoryStructureValid,false);assert.equal(frame.consistency.userStateMemoryStructureValid,false);assert.equal(frame.consistency.assessmentMemoryStructureValid,false);assert.ok(frame.issues.includes('INCONSISTENT:recordedMemoryStructureValid'));
 if(kind==='kind'||kind==='scope')assert.equal(frame.consistency.currentRecordStructureValid,false);
});
test('admitted whole-Goal enum is validated while raw unsatisfied and admitted uncertain remain legal',()=>{
 const r=fixture();let frame=auditGoalFragments(r).frames[0];assert.equal(frame.wholeGoal.admittedChoiceValid,true);assert.ok(!frame.issues.includes('INVALID_ADMITTED_WHOLE_GOAL_STATUS'));
 r.steps[0].deliberation.assessment.goal='alien';frame=auditGoalFragments(r).frames[0];assert.equal(frame.wholeGoal.admittedChoice,'alien');assert.equal(frame.wholeGoal.admittedChoiceValid,false);assert.ok(frame.issues.includes('INVALID_ADMITTED_WHOLE_GOAL_STATUS'));
});
test('fault carried memory structure is diagnosed without inventing a current classification',()=>{
 const r=fixture(),step=r.steps[0];delete step.deliberation.response;delete step.goalSearch.record;step.error={code:'HTTP_ERROR',statusCode:402};step.goalSearch.memory.schemaVersion=99;step.modelInput.userState.goalSearch.schemaVersion=99;step.userState.goalSearch.schemaVersion=99;step.deliberation.modelInput.userState.goalSearch.schemaVersion=99;
 const report=auditGoalFragments(r);assert.equal(report.frames.length,0);assert.equal(report.faultSteps[0].consistency.recordedMemoryStructureValid,false);assert.ok(report.faultSteps[0].issues.includes('INCONSISTENT:recordedMemoryStructureValid'));
});
