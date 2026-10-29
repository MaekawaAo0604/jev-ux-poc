import {isDeepStrictEqual} from 'node:util';
import {readFile} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {transferDefinition,transferFixtures,type TransferFixture} from '../app/transfer-fixture.js';
import {holdoutDefinition,type HoldoutFixture} from '../app/holdout-fixture.js';
import {humanJevProfile} from './human-jev-profiles.js';
import {sha,type BetaResult,type BetaStep} from './virtual-beta-core.js';
import {transformVision} from '../jev/virtual-beta/vision.js';
import {validateChoice} from '../jev/client.js';

export type TransferSlot={id:string;replicate:number;kind:'novel';fixture:TransferFixture}|{id:string;replicate:number;kind:'sentinel';fixture:HoldoutFixture};
export type TransferFrameCheck={step:number;stage:'assessment'|'action';observationId:string|null;imageSha256:string|null;validCurrentFrame:boolean;successfulResponse:boolean;scope:'full-viewport-current'|'unverified';reason?:string};
export type TransferRunRecord=TransferSlot&{slotId?:string;runId?:string;preparatoryInitialImageSha256?:string;resultPath?:string;budgetAfterEvidence?:{used:number;sha256:string;reserved:number;ok:number;errors:number};status:'RESULT'|'FAILED'|'ATTEMPTING';dir?:string;ledger?:string|null;initialImageSha256:string|null;requests:number;result?:BetaResult;error?:{code:string;statusCode?:number};frameChecks?:TransferFrameCheck[];replay?:{status:'OK'|'ERROR'|'MOCK_INJECTION';code?:string};ledgerEvidence?:{used:number;sha256:string;reserved:number;ok:number;errors:number}};
const object=(v:unknown):Record<string,unknown>|undefined=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:undefined;
const mean=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const counts=(values:string[])=>{const out:Record<string,number>={};for(const v of values)out[v]=(out[v]??0)+1;return out;};
const cellKey=(r:Pick<TransferSlot,'kind'|'fixture'>)=>`${r.kind}/${r.fixture.task}/${r.fixture.variant}`;
const image=(s:BetaStep)=>s.assetFiles?.current?.sha256??s.vision?.imageSha256??null;
/** Normalize only a local origin; every observed pathname, query, and hash stays intact. */
function route(url:string|undefined):string|null{if(!url)return null;try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)?u.pathname+u.search+u.hash:null;}catch{return null;}}
function localFile(directory:string,file:string){const path=resolve(directory,file),rel=relative(resolve(directory),path);if(!rel||isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw Error('UNSAFE_FRAME_PATH');return path;}
/** Verify saved current pixels and successful responses offline; retained images never qualify. */
export async function verifyTransferFrames(result:BetaResult,directory:string):Promise<TransferFrameCheck[]>{
 const checks:TransferFrameCheck[]=[];
 for(const step of result.steps)for(const stage of ['assessment','action'] as const){
  const part=stage==='assessment'?step.deliberation:step;
  if(!part)continue;
  const input=stage==='assessment'?step.deliberation?.modelInput:step.modelInput,questions=part.questions,assets=part.assetFiles,response=part.response;
  if(!input&&!assets&&!response)continue;
  const check:TransferFrameCheck={step:step.number,stage,observationId:step.observationId??null,imageSha256:assets?.current?.sha256??null,validCurrentFrame:false,successfulResponse:false,scope:'unverified'};
  try{
   if(!input||!questions||!assets?.current||!step.audit||!step.vision)throw Error('CURRENT_FRAME_METADATA_MISSING');
   const observation=object(input.observation),vision=step.vision;
   if(observation?.id!==step.observationId||observation?.image!=='current'||assets.current.sha256!==vision.imageSha256||step.userState?.lastObservation?.id!==step.observationId||step.userState?.lastObservation?.imageSha256!==assets.current.sha256)throw Error('CURRENT_FRAME_IDENTITY_MISMATCH');
   if(part.inputSha256!==sha(JSON.stringify({input,questions,assets})))throw Error('CURRENT_INPUT_HASH_MISMATCH');
   const raw=await readFile(localFile(directory,step.audit.rawScreenshot)),bytes=await readFile(localFile(directory,assets.current.file));
   if(sha(raw)!==step.audit.sourceSha256||sha(raw)!==vision.sourceSha256||sha(bytes)!==assets.current.sha256)throw Error('CURRENT_PIXELS_HASH_MISMATCH');
   const reconstructed=transformVision(raw,result.config.vision,vision.fixation,step.audit.targets??[]);
   if(reconstructed.imageSha256!==assets.current.sha256)throw Error('CURRENT_TRANSFORM_MISMATCH');
   if(vision.width!==1280||vision.height!==900||vision.sourceWidth!==1280||vision.sourceHeight!==900||!isDeepStrictEqual(vision.clearRect,{x:0,y:0,width:1280,height:900})||!isDeepStrictEqual(vision.transform,{offsetX:0,offsetY:0,scaleX:1,scaleY:1}))throw Error('CURRENT_FRAME_SCOPE_NOT_FULL_VIEWPORT');
   check.validCurrentFrame=true;check.scope='full-viewport-current';
   if(!response||(stage==='assessment'&&(part.error||!step.deliberation?.assessment))||(stage==='action'&&['API_ERROR','INVALID_DISTRIBUTION'].includes(step.outcome??'')))throw Error('NO_SUCCESSFUL_RESPONSE');
   for(const [id,q] of Object.entries(questions))validateChoice(response.answers[id],q.criteria);
   check.successfulResponse=true;
  }catch(error){check.reason=error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'CURRENT_FRAME_VERIFICATION_FAILED';}
  checks.push(check);
 }
 return checks;
}
function confirmation(record:TransferRunRecord){
 const definition=record.kind==='novel'?transferDefinition(record.fixture):holdoutDefinition(record.fixture);
 const required=definition.task==='help'?[definition.event,definition.place,definition.belongings]:[definition.objectiveText];
 const frames=(record.frameChecks??[]).flatMap(check=>{
  const step=record.result?.steps.find(s=>s.number===check.step&&s.observationId===check.observationId);
  if(!step||!check.validCurrentFrame||!check.successfulResponse||check.scope!=='full-viewport-current'||check.imageSha256!==image(step))return [];
  const visible=step.audit?.screen.text.join('\n')??'';
  if(!required.every(text=>visible.includes(text)))return [];
  return [{step:check.step,stage:check.stage,observationId:check.observationId,imageSha256:check.imageSha256,scope:check.scope}];
 });
 return {kind:record.kind==='novel'&&record.fixture.task==='help'?'help-required-information-exposure':'optional-confirmation-frame',credited:frames.length>0,frames,interpretation:'Correct required text in audited visible screen tied to verified current pixels and a successful model response; no claim of reading or understanding.'};
}
export function transferFailureCategories(record:Pick<TransferRunRecord,'result'|'error'|'status'>){
 const r=record.result,termination=r?.termination;
 return {infrastructure:record.status==='FAILED'||!r||['API_ERROR','ACTION_ERROR','OBSERVATION_ERROR'].includes(termination!)||r.objectiveAssessment?.status!=='OK'||r.terminalObservation?.status!=='RECORDED',invalidDistribution:termination==='INVALID_DISTRIBUTION',safety:termination==='SAFETY_STOP',limit:['UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT','API_LIMIT','TIME_LIMIT'].includes(termination!),abandoned:termination==='ABANDONED'};
}
/** Descriptive offline analysis. Trial failures remain attempted; only valid objective outcomes enter success/failure denominators. */
export function analyzeTransferRuns(records:TransferRunRecord[]){
 const errors:{code:string;ids:string[]}[]=[],per=records.map(()=>[] as string[]),expected=humanJevProfile('experience-goal-search-grounded').config;
 const add=(code:string,indexes:number[])=>{errors.push({code,ids:indexes.map(i=>records[i].id)});for(const i of indexes)per[i].push(code);};
 const byActual=new Map<string,number[]>(),byId=new Map<string,number[]>(),byCell=new Map<string,number[]>(),bySlot=new Map<string,number[]>();
 records.forEach((r,i)=>{
  const actual=r.runId??r.result?.runId??r.id;byActual.set(actual,[...(byActual.get(actual)??[]),i]);byId.set(r.id,[...(byId.get(r.id)??[]),i]);byCell.set(cellKey(r),[...(byCell.get(cellKey(r))??[]),i]);const key=cellKey(r)+'/r'+r.replicate;bySlot.set(key,[...(bySlot.get(key)??[]),i]);
  const fixtureOK=r.kind==='novel'?transferFixtures().some(f=>isDeepStrictEqual(f,r.fixture)):isDeepStrictEqual(r.fixture,{task:'direct',variant:'alpha'});
  if(!fixtureOK||![1,2,3].includes(r.replicate))add('UNEXPECTED_CELL',[i]);
  if(r.result){
   if((r.runId??r.id)!==r.result.runId)add('RUN_ID_MISMATCH',[i]);
   if(!isDeepStrictEqual(r.result.config,expected))add('CONFIG_MISMATCH',[i]);
   if(r.result.input.persona!==undefined&&r.result.input.persona!==null)add('PERSONA_MISMATCH',[i]);
   if(!r.result.code?.sourceHash||!r.result.code.revision)add('MISSING_CODE_IDENTITY',[i]);
   if(!r.initialImageSha256)add('MISSING_INITIAL_IMAGE',[i]);
   if(r.requests>24||r.result.apiCalls>24||r.result.decisions>12||r.result.uiActions>15||r.result.looks>3)add('TRIAL_CAP_EXCEEDED',[i]);
  }
 });
 for(const indexes of byActual.values())if(indexes.length>1)add('DUPLICATE_ACTUAL_RUN_ID',indexes);
 for(const indexes of byId.values())if(indexes.length>1)add('DUPLICATE_RUN_ID',indexes);
 for(const indexes of bySlot.values())if(indexes.length>1)add('DUPLICATE_SLOT',indexes);
 const resultIndexes=records.flatMap((r,i)=>r.result?[i]:[]);
 if(new Set(resultIndexes.map(i=>JSON.stringify(records[i].result!.code))).size>1)add('SOURCE_IDENTITY_MISMATCH',resultIndexes);
 const runs=records.map((record,index)=>{
  const r=record.result,categories=transferFailureCategories(record),steps=r?.steps??[];
  const reasons=[...per[index],...(record.error?['TRIAL_ERROR']:[]),...(record.status!=='RESULT'?['TRIAL_NOT_COMPLETED']:[]),...(!r?['NO_RESULT']:[]),...(r&&!r.validForComparison?['REPORTED_INVALID']:[]),...(categories.infrastructure?['INFRASTRUCTURE_FAULT']:[]),...(categories.invalidDistribution?['INVALID_DISTRIBUTION']:[]),...(categories.safety?['SAFETY_STOP']:[]),...(record.replay?.status==='ERROR'?['REPLAY_FAILED']:[]),...(r&&r.objectiveAssessment.value!==r.objectiveSuccess?['OBJECTIVE_VALUE_MISMATCH']:[])];
  const edges=steps.flatMap((step,i)=>{
   if(!step.action||!['click','back','scroll'].includes(step.action.type))return [];
   const performed=step.outcome==='UI_PERFORMED',from=route(step.audit?.url),to=performed?route(steps[i+1]?.audit?.url):null;
   const element=step.action.type==='click'?step.audit?.screen.elements.find(e=>e.id===(step.action as {elementId:string}).elementId):undefined;
   const label=element?.text??(step.action.type==='back'?'browser back':step.action.type==='scroll'?'scroll '+step.action.direction:null);
   return [{step:step.number,observationId:step.observationId??null,action:structuredClone(step.action),label,from,to,sourceImageSha256:image(step),destinationImageSha256:performed&&steps[i+1]?image(steps[i+1]):null,status:!performed&&step.outcome==='ACTION_ERROR'?'failed':performed&&from!==null&&to!==null?'observed':'unknown'}];
  });
  const visualCounts=counts(edges.filter(e=>e.status==='observed'&&e.sourceImageSha256&&e.destinationImageSha256).map(e=>JSON.stringify([e.sourceImageSha256,e.destinationImageSha256])));
  const choices=steps.flatMap(s=>s.selection?[{step:s.number,modelChoice:s.selection.modelChoice,selected:s.selection.selected,changed:s.selection.modelChoice!==s.selection.selected,raw:structuredClone(s.selection.raw),normalized:structuredClone(s.selection.normalized),filtered:structuredClone(s.selection.filtered),policy:s.selection.policy?structuredClone(s.selection.policy):null}]:[]);
  return {id:record.id,slotId:record.slotId??record.id,runId:record.runId??record.id,kind:record.kind,task:record.fixture.task,variant:record.fixture.variant,replicate:record.replicate,status:record.status,resultRunId:r?.runId??null,dir:record.dir??null,ledger:record.ledger??null,ledgerEvidence:record.ledgerEvidence??null,budgetAfterEvidence:record.budgetAfterEvidence??null,resultPath:record.resultPath??null,recordedAPICalls:r?.apiCalls??null,initialImageSha256:record.initialImageSha256,requests:record.requests,objectiveAssessment:r?.objectiveAssessment??null,perceivedDone:r?.perceivedDone??null,termination:r?.termination??null,error:record.error??null,validity:{valid:reasons.length===0,reasons},categories,metrics:{uiActions:r?.uiActions??null,looks:r?.looks??null,decisions:r?.decisions??null,controllerChangedChoices:choices.filter(c=>c.changed).length,repeatedVisualEdges:Object.values(visualCounts).reduce((n,v)=>n+Math.max(0,v-1),0)},timing:{apiMs:r?.apiMs??null,uiMs:r?.uiMs??null,elapsedMs:r?.elapsedMs??null,humanTimeMs:null},route:{identity:'observed-local-pathname-query-hash-origin-only-normalized',edges,complete:edges.every(e=>e.status==='observed'),signature:JSON.stringify(edges.map(e=>[e.action,e.label,e.from,e.to,e.status]))},choices,frameChecks:record.frameChecks??[],deliveredConfirmation:confirmation(record)};
 });
 const summarize=(items:typeof runs,planned:number)=>{
  const valid=items.filter(r=>r.validity.valid);
  return {planned,attempted:items.length,withResult:items.filter(r=>r.resultRunId!==null).length,valid:valid.length,invalid:items.length-valid.length,objectiveSuccesses:valid.filter(r=>r.objectiveAssessment?.value===true).length,objectiveFailures:valid.filter(r=>r.objectiveAssessment?.value===false).length,subjectiveDone:items.filter(r=>r.perceivedDone===true).length,infrastructure:items.filter(r=>r.categories.infrastructure).length,invalidDistributions:items.filter(r=>r.categories.invalidDistribution).length,safetyStops:items.filter(r=>r.categories.safety).length,limits:items.filter(r=>r.categories.limit).length,abandoned:items.filter(r=>r.categories.abandoned).length,requests:items.reduce((n,r)=>n+r.requests,0),terminations:counts(items.map(r=>r.termination??'NO_RESULT')),meanUIActions:mean(valid.map(r=>r.metrics.uiActions!)),meanLooks:mean(valid.map(r=>r.metrics.looks!)),meanRequests:mean(valid.map(r=>r.requests)),meanAPIMs:mean(valid.map(r=>r.timing.apiMs!))};
 };
 const plannedCells=[...transferFixtures().map(f=>({kind:'novel' as const,fixture:f})),{kind:'sentinel' as const,fixture:{task:'direct',variant:'alpha'} as HoldoutFixture}];
 const cells=plannedCells.map(cell=>{
  const key=cellKey(cell),indexes=byCell.get(key)??[],items=indexes.map(i=>runs[i]),results=indexes.filter(i=>records[i].result),initials=[...new Set(results.map(i=>records[i].initialImageSha256))],configs=[...new Set(results.map(i=>JSON.stringify(records[i].result!.config)))],initialConsistent=initials.length>1?false:results.length>1?true:null,configConsistent=configs.length>1?false:results.length>1?true:null;
  return {key,kind:cell.kind,task:cell.fixture.task,variant:cell.fixture.variant,...summarize(items,3),ids:items.map(r=>r.id),initialImages:{consistent:initialConsistent,hashes:initials},configs:{consistent:configConsistent},aggregationUncertain:initialConsistent===false||configConsistent===false,pathVariation:{completeValid:items.filter(r=>r.validity.valid&&r.route.complete).length,uniqueCompletePaths:new Set(items.filter(r=>r.validity.valid&&r.route.complete).map(r=>r.route.signature)).size},deliveredConfirmations:items.filter(r=>r.deliveredConfirmation.credited).length};
 });
 const missing=plannedCells.flatMap(cell=>[1,2,3].filter(rep=>!bySlot.has(cellKey(cell)+'/r'+rep)).map(rep=>cellKey(cell)+'/r'+rep));
 return {schemaVersion:1,kind:'offline-frozen-method-transfer-descriptive',completeness:{planned:21,attempted:records.length,withResult:resultIndexes.length,valid:runs.filter(r=>r.validity.valid).length,missing,complete:records.length===21&&missing.length===0&&[...bySlot.values()].every(v=>v.length===1)&&resultIndexes.length===21},integrity:{ok:errors.length===0,errors},novel:summarize(runs.filter(r=>r.kind==='novel'),18),sentinel:summarize(runs.filter(r=>r.kind==='sentinel'),3),cells,runs,limitations:['Three repeats describe variation; they do not prove human stability, generalization, or causality.','Known sentinel trials are reported separately and never counted as novel tasks.','Objective UI outcome and subjective done remain separate; faults are not task failures. Category counts may overlap.','Actual URLs retain query and hash with only local origin normalized; only the next recorded observation establishes destination. Unknown final destinations remain unknown.','Repeated visual edges describe identical saved image hashes, not semantic equivalence or route banning.','Config equality has no exclusions. Different same-cell initial images flag uncertainty; pooled descriptive counts require that caveat.','Help UI display differs from delivered exposure. Only verified current full-viewport pixels with correct audited visible text and a successful response qualify; retained images and unsent containers do not. This establishes neither reading nor understanding.','Elapsed, UI and API latency are not human time.']};
}




