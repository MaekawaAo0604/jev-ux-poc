import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {validateChoice} from '../../jev/client.js';
import {ImageJudgmentMemory} from '../../jev/image-judgments.js';
import {goalSearchCriteria} from '../../jev/virtual-beta/goal-search.js';
import type {GoalSearchMemory} from '../../jev/virtual-beta/goal-search-contracts.js';
import type {UserObservation} from '../../jev/virtual-beta/contracts.js';
import type {BetaResult} from '../../runner/virtual-beta-core.js';
import {replayDirectory} from '../../runner/virtual-beta-replay.js';
import {sourceIdentity} from '../../runner/virtual-beta-source.js';

/** Auditor-only expectations. These roles never become model input or runtime corrections. */
export type GoalRoleRubric = {
 schemaVersion:1; kind:'authored-goal-role-rubric'; goalSha256:string;
 fragments:{id:string;text:string;role:'context'|'required'|'undetermined';rationale:string}[];
};
type ObjectValue=Record<string,any>;
const object=(value:unknown):ObjectValue|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:undefined;
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const ownKeys=(value:unknown)=>Object.keys(object(value)??{});
const same=(left:unknown,right:unknown)=>isDeepStrictEqual(left,right);
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0;
const exactKeys=(value:unknown,keys:string[])=>same(ownKeys(value).sort(),[...keys].sort());
const identity=(value:unknown)=>{const code=object(value);return {revision:typeof code?.revision==='string'?code.revision:null,sourceHash:typeof code?.sourceHash==='string'?code.sourceHash:null};};
const source=(value:unknown)=>{const s=object(value);return {observationId:typeof s?.observationId==='string'?s.observationId:null,imageSha256:typeof s?.imageSha256==='string'?s.imageSha256:null};};
const fragmentKeys=(value:unknown)=>ownKeys(value).filter(key=>key.startsWith('goalSearch_image_check_')).sort();
const statuses=['observed','not_shown','context','contradicted','uncertain'];
function literalFragments(goal:string){const reader=new ImageJudgmentMemory();reader.bind(goal);return reader.view().requirements.map(({id,text})=>({id,text}));}
/** Reuse the existing GoalSearch contract for structure; equality alone proves no legality. */
function memoryStructureValid(value:unknown,goal:string,current:unknown,capacity:unknown){
 const memory=object(value);
 if(!memory||memory.schemaVersion!==1||!Array.isArray(memory.entries)||typeof capacity!=='number'||!Number.isSafeInteger(capacity)||capacity<1||capacity>8||memory.entries.length>capacity)return false;
 try{goalSearchCriteria({},memory as GoalSearchMemory,goal,current as UserObservation,undefined);return true;}catch{return false;}
}
function memoryStructureChecks(step:ObjectValue,goal:string,capacity:unknown){
 const current=step.userState?.lastObservation;
 return {recordedMemoryStructureValid:memoryStructureValid(step.goalSearch?.memory,goal,current,capacity),actionMemoryStructureValid:memoryStructureValid(step.modelInput?.userState?.goalSearch,goal,current,capacity),userStateMemoryStructureValid:memoryStructureValid(step.userState?.goalSearch,goal,current,capacity),assessmentMemoryStructureValid:memoryStructureValid(step.deliberation?.modelInput?.userState?.goalSearch,goal,current,capacity)};
}
function stageSourceMatches(input:unknown,assets:unknown,current:ReturnType<typeof source>){
 const observation=object(object(input)?.observation),attached=object(assets);
 return current.observationId!==null&&current.imageSha256!==null&&observation?.id===current.observationId&&typeof observation?.image==='string'&&attached!==undefined&&Object.hasOwn(attached,observation.image)&&attached[observation.image]?.sha256===current.imageSha256&&attached.current?.sha256===current.imageSha256;
}
function validateRubric(value:unknown,goalSha256:string,fragments:{id:string;text:string}[],records:unknown[]):GoalRoleRubric {
 const bad=():never=>{throw Error('INVALID_GOAL_ROLE_RUBRIC');};
 const rubric=object(value);
 if(!rubric||!exactKeys(rubric,['schemaVersion','kind','goalSha256','fragments'])||rubric.schemaVersion!==1||rubric.kind!=='authored-goal-role-rubric'||rubric.goalSha256!==goalSha256||!Array.isArray(rubric.fragments)||rubric.fragments.length!==fragments.length)return bad();
 const byId=new Map<string,GoalRoleRubric['fragments'][number]>();
 for(const raw of rubric.fragments){const f=object(raw);if(!f||!exactKeys(f,['id','text','role','rationale'])||!nonempty(f.id)||!nonempty(f.text)||!nonempty(f.rationale)||!['context','required','undetermined'].includes(f.role)||byId.has(f.id))return bad();byId.set(f.id,{id:f.id,text:f.text,role:f.role,rationale:f.rationale});}
 for(const f of fragments)if(byId.get(f.id)?.text!==f.text)return bad();
 for(const record of records){const r=object(record);if(!r||!Array.isArray(r.requirements)||r.requirements.length!==fragments.length||!same(r.requirements.map((f:any)=>({id:f?.id,text:f?.text})),fragments)||r.goalSha256!==goalSha256)return bad();}
 return {schemaVersion:1,kind:'authored-goal-role-rubric',goalSha256,fragments:fragments.map(f=>byId.get(f.id)!)};
}
/** Only choice/probability fields are retained; no provider metadata, confidence or error messages. */
function rawChoice(value:unknown,criteria:unknown,expectedKeys?:string[]){
 const answer=object(value),provided=object(answer?.probabilities),questionCriteria=object(criteria);
 const probabilities:Record<string,unknown>|null=provided?Object.fromEntries(Object.entries(provided).map(([key,p])=>[key,p===null||['number','string','boolean'].includes(typeof p)?p:'[INVALID_NON_SCALAR]'])):null;
 let code:string|null=null;
 if(!answer)code='MISSING_RESPONSE';
 else if(!questionCriteria)code='MISSING_CRITERIA';
 else if(expectedKeys&&!same(ownKeys(questionCriteria).sort(),[...expectedKeys].sort()))code='CRITERIA_MISMATCH';
 else try{validateChoice(answer as any,questionCriteria);}catch{code='INVALID_DISTRIBUTION';}
 return {choice:typeof answer?.choice==='string'?answer.choice:null,probabilities,validation:{valid:code===null,code}};
}
function goalPreservation(step:ObjectValue,goal:string){
 const assessment=object(step.deliberation)?.modelInput,action=step.modelInput;
 return {assessmentGoal:assessment?.goal===goal,assessmentCharterGoal:assessment?.exploration?.charter?.goal===goal,actionGoal:action?.goal===goal,actionCharterGoal:action?.exploration?.charter?.goal===goal};
}
const responseEvidence=(step:ObjectValue)=>({assessmentResponseRecorded:object(step.deliberation?.response)!==undefined,actionResponseRecorded:object(step.response)!==undefined});
function safeError(value:unknown){
 const error=object(value);if(!error)return null;
 const allowed=['HTTP_ERROR','TIMEOUT','REQUEST_FAILED','MISSING_CREDENTIALS','INVALID_RESPONSE','INVALID_DISTRIBUTION','OBSERVATION_ERROR','ORACLE_ERROR','API_ERROR','MODEL_MISMATCH','BUDGET_ADMISSION_ERROR','BUDGET_SETTLEMENT_AFTER_REQUEST'];
 return {code:allowed.includes(error.code)?error.code:'UNRECOGNIZED_ERROR',...(Number.isInteger(error.statusCode)&&error.statusCode>=400&&error.statusCode<=599?{statusCode:error.statusCode}: {})};
}

/** Pure descriptive audit. No file, environment, network, model, UI, or oracle execution. */
export function auditGoalFragments(result:BetaResult,rubric?:unknown){
 const goal=result?.input?.charter?.goal;
 if(!nonempty(goal)||!Array.isArray(result.steps))throw Error('INVALID_GOAL_FRAGMENT_AUDIT_RESULT');
 const goalSha256=sha(goal),literal=literalFragments(goal),steps=result.steps as ObjectValue[];
 const classified=steps.filter(s=>object(s.deliberation?.response)&&(s.goalSearch?.record!==undefined||fragmentKeys(s.deliberation?.questions).length>0||fragmentKeys(s.deliberation?.response?.answers).length>0));
 const authored=rubric===undefined?undefined:validateRubric(rubric,goalSha256,literal,classified.filter(s=>s.goalSearch?.record!==undefined).map(s=>s.goalSearch.record));
 const frames=classified.map(step=>{
  const d=step.deliberation,record=object(step.goalSearch?.record),requirements=Array.isArray(record?.requirements)?record.requirements:[],answers=object(d.response?.answers)??{},issues:string[]=[];
  const keys=literal.map((_,i)=>'goalSearch_image_check_'+i),current=source(record?.source),observation=source({observationId:step.userState?.lastObservation?.id,imageSha256:step.userState?.lastObservation?.imageSha256});
  const memory=object(step.goalSearch?.memory),actionMemory=object(step.modelInput?.userState?.goalSearch),userMemory=object(step.userState?.goalSearch);
  const entries=Array.isArray(actionMemory?.entries)?actionMemory.entries:[];
  const recordSourceEntries=entries.filter((e:any)=>same(source(e?.source),current));
  const assessmentSourceMatchesCurrent=stageSourceMatches(d.modelInput,d.assetFiles,current),actionSourceMatchesCurrent=stageSourceMatches(step.modelInput,step.assetFiles,current);
  const sourceMatchesCurrent=record!==undefined&&current.observationId===`o${step.number}`&&same(current,observation)&&assessmentSourceMatchesCurrent&&actionSourceMatchesCurrent;
  const currentRecordStructureValid=memoryStructureValid({schemaVersion:1,entries:[record]},goal,step.userState?.lastObservation,8);
  const consistency={sourceMatchesCurrent,assessmentSourceMatchesCurrent,actionSourceMatchesCurrent,currentRecordStructureValid,...memoryStructureChecks(step,goal,result.config.goalSearch?.capacity),recordGoalMatches:record?.goalSha256===goalSha256,recordFragmentsMatchLiteral:same(requirements.map((r:any)=>({id:r?.id,text:r?.text})),literal),actionMemoryMatchesRecorded:memory!==undefined&&actionMemory!==undefined&&same(memory,actionMemory),userStateMemoryMatchesRecorded:memory!==undefined&&userMemory!==undefined&&same(memory,userMemory),currentRecordInActionMemory:record!==undefined&&recordSourceEntries.length===1&&same(recordSourceEntries[0],record)};
  if(!record)issues.push('CURRENT_RECORD_MISSING');
  if(!same(fragmentKeys(d.questions),[...keys].sort()))issues.push('FRAGMENT_QUESTION_COVERAGE_MISMATCH');
  if(!same(fragmentKeys(answers),[...keys].sort()))issues.push('FRAGMENT_ANSWER_COVERAGE_MISMATCH');
  for(const [key,valid] of Object.entries(consistency))if(!valid)issues.push('INCONSISTENT:'+key);
  const preserved=goalPreservation(step,goal);if(Object.values(preserved).some(v=>!v))issues.push('FULL_GOAL_CHANGED_OR_MISSING');
  const fragments=literal.map((f,i)=>{
   const qid=keys[i],saved=requirements[i],raw=rawChoice(answers[qid],d.questions?.[qid]?.criteria,statuses),rawMatchesRecord=raw.choice!==null&&saved?.id===f.id&&saved?.text===f.text&&raw.choice===saved?.assessment;
   if(!raw.validation.valid)issues.push('INVALID_FRAGMENT_DISTRIBUTION:'+f.id);
   if(!rawMatchesRecord)issues.push('RAW_RECORD_MISMATCH:'+f.id);
   const expected=authored?.fragments[i],rubricComparison=!authored?'NO_RUBRIC':!raw.validation.valid?'INVALID_RAW':expected?.role==='undetermined'?'UNDETERMINED':expected?.role==='required'&&raw.choice==='context'?'RUBRIC_CONFLICT':expected?.role==='context'&&raw.choice==='context'?'CONTEXT_SELECTED':expected?.role==='context'?'CONTEXT_NOT_SELECTED':'NO_REQUIRED_CONTEXT_CONFLICT';
   return {...f,recordedFragment:saved?{id:saved.id??null,text:saved.text??null}:null,recordedAssessment:typeof saved?.assessment==='string'?saved.assessment:null,raw,rawMatchesRecord,expectedRole:expected?.role??null,rationale:expected?.rationale??null,rubricComparison};
  });
  const wholeRaw=rawChoice(answers.goal,d.questions?.goal?.criteria,['satisfied','unsatisfied','uncertain']),admittedChoice=typeof d.assessment?.goal==='string'?d.assessment.goal:null;
  if(!wholeRaw.validation.valid)issues.push('INVALID_WHOLE_GOAL_DISTRIBUTION');
  const admittedChoiceValid=admittedChoice!==null&&['satisfied','unsatisfied','uncertain'].includes(admittedChoice);
  if(!admittedChoiceValid)issues.push('INVALID_ADMITTED_WHOLE_GOAL_STATUS');
  return {step:step.number,responseEvidence:responseEvidence(step),source:current,scope:typeof record?.scope==='string'?record.scope:null,fragments,wholeGoal:{raw:wholeRaw,admittedChoice,admittedChoiceValid},goalPreservation:preserved,consistency,issues};
 });
 const faultSteps=steps.filter(s=>s.error!==undefined||s.deliberation?.error!==undefined||(!s.deliberation?.response&&(s.goalSearch?.record!==undefined||fragmentKeys(s.deliberation?.questions).length>0))).map(step=>{
  const consistency:Partial<ReturnType<typeof memoryStructureChecks>>=step.goalSearch===undefined?{}:memoryStructureChecks(step,goal,result.config.goalSearch?.capacity),issues=Object.entries(consistency).filter(([,valid])=>!valid).map(([key])=>'INCONSISTENT:'+key);
  if(step.goalSearch?.record!==undefined&&!memoryStructureValid({schemaVersion:1,entries:[step.goalSearch.record]},goal,step.userState?.lastObservation,8))issues.push('INVALID_CURRENT_RECORD_STRUCTURE');
  return {step:step.number,responseEvidence:responseEvidence(step),outcome:typeof step.outcome==='string'?step.outcome:null,assessmentResponsePresent:object(step.deliberation?.response)!==undefined,currentRecordPresent:step.goalSearch?.record!==undefined,carriedMemoryEntryCount:Array.isArray(step.goalSearch?.memory?.entries)?step.goalSearch.memory.entries.length:0,error:safeError(step.deliberation?.error??step.error),goalPreservation:goalPreservation(step,goal),consistency,issues};
 });
 const aggregateFragments=frames.length?literal.map((f,i)=>{const rows=frames.map(frame=>frame.fragments[i]),valid=rows.filter(row=>row.raw.validation.valid);return {...f,classifiedCount:rows.length,validDistributionCount:valid.length,invalidDistributionCount:rows.length-valid.length,selections:Object.fromEntries([...new Set(rows.map(r=>r.raw.choice).filter((c):c is string=>c!==null))].map(choice=>[choice,rows.filter(r=>r.raw.choice===choice).length])),contextProbabilities:rows.map(r=>r.raw.probabilities?.context).filter((p):p is number=>typeof p==='number'),requiredContextConflicts:rows.filter(r=>r.rubricComparison==='RUBRIC_CONFLICT').length,undeterminedRoleCount:rows.filter(r=>r.expectedRole==='undetermined').length,rawRecordMismatchCount:rows.filter(r=>!r.rawMatchesRecord).length};}):[];
 return {schemaVersion:1,kind:'saved-goal-fragment-audit',runId:result.runId,goal,goalSha256,producer:identity(result.code),humanFidelityEvaluated:false,causalEffectEvaluated:false,savedInputsResent:false,classification:{status:frames.length?'AVAILABLE':'ABSENT',classifiedFrames:frames.length,unclassifiedSteps:steps.length-frames.length,interpretation:frames.length?'Current saved responses only; carried memory is not a new classification.':'No saved fragment classifications; semantic comparison is unavailable.'},rubric:{status:!authored?'NOT_PROVIDED':frames.length?'APPLIED':'NOT_APPLICABLE',interpretation:'Independently authored role expectations, not model input, rendered-view ground truth, or an automatic global correctness score.'},success:{objectiveSuccess:result.objectiveSuccess,perceivedDone:result.perceivedDone,objectiveAssessment:result.objectiveAssessment?{status:result.objectiveAssessment.status,value:result.objectiveAssessment.value,...(result.objectiveAssessment.code?{code:result.objectiveAssessment.code}:{})}:null,termination:result.termination,validForComparison:result.validForComparison},frames,faultSteps,aggregates:{fragments:aggregateFragments,framesWithIssues:frames.filter(f=>f.issues.length>0).length,requiredContextAndWholeGoalUnsatisfied:frames.filter(f=>f.wholeGoal.raw.validation.valid&&f.wholeGoal.raw.choice==='unsatisfied'&&f.fragments.some(r=>r.rubricComparison==='RUBRIC_CONFLICT')).length},limitations:['Saved model inputs document preserved preparation; request transmission cannot be established from those fields, and a missing response does not establish whether transmission occurred.','Literal fragments are not a complete decomposition of the whole Goal.','Required+context is a conflict with an authored rubric, not proof of global semantic failure or a cause of repeated actions.','Context probability values are original raw values, not normalized, calibrated confidence, or independent samples.','Whole-Goal raw choice and admitted choice can differ; original subjective/objective/termination fields remain separate.','Source consistency and replay compatibility do not prove semantic correctness, human fidelity, performance, or identical producer code.']};
}

export async function runGoalFragmentAudit({runDirectory,out,rubricPath}:{runDirectory:string;out:string;rubricPath?:string}){
 if(!nonempty(runDirectory)||!nonempty(out))throw Error('EXPLICIT_RUN_AND_NEW_OUTPUT_REQUIRED');
 // Replay admission happens before any report write. Never send saved inputs to a model.
 const replay=await replayDirectory(resolve(runDirectory));
 const resultPath=join(resolve(runDirectory),'result.json'),bytes=await readFile(resultPath),result:BetaResult=JSON.parse(bytes.toString('utf8'));
 const rubricBytes=rubricPath===undefined?undefined:await readFile(resolve(rubricPath));
 let parsedRubric:unknown;
 if(rubricBytes!==undefined)try{parsedRubric=JSON.parse(rubricBytes.toString('utf8'));}catch{throw Error('INVALID_GOAL_ROLE_RUBRIC');}
 const audit=auditGoalFragments(result,parsedRubric);
 const current=await sourceIdentity(),producer=identity(result.code);
 const report={...audit,replay,provenance:{analyzerSha256:sha(await readFile(fileURLToPath(import.meta.url))),resultSha256:sha(bytes),rubricSha256:rubricBytes===undefined?null:sha(rubricBytes),producer,current,identicalProductSource:producer.sourceHash===null?null:producer.sourceHash===current.sourceHash,identicalRevision:producer.revision===null?null:producer.revision===current.revision,sourceInterpretation:'Successful replay establishes compatibility with current replay checks; it does not establish identical producer code.'}};
 await writeFile(resolve(out),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return report;
}
function cliArguments(args:string[]){
 const usage=()=>{throw Error('Usage: node --import tsx docs/experiments/2026-10-29-goal-fragment-audit.ts --run DIRECTORY --out NEW_JSON [--rubric JSON]');};
 const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--run','--out','--rubric'].includes(key)||Object.hasOwn(values,key)||!nonempty(value)||value.startsWith('--'))return usage();values[key]=value;}
 if(!values['--run']||!values['--out'])return usage();
 return {runDirectory:values['--run'],out:values['--out'],...(values['--rubric']?{rubricPath:values['--rubric']}:{})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const options=cliArguments(process.argv.slice(2)),report=await runGoalFragmentAudit(options);
 console.log(JSON.stringify({out:resolve(options.out),classifiedFrames:report.frames.length,faultSteps:report.faultSteps.length,resultSha256:report.provenance.resultSha256,analyzerSha256:report.provenance.analyzerSha256,identicalProductSource:report.provenance.identicalProductSource}));
}
