import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {reconstructReplayCandidates} from './virtual-beta-replay-candidates.js';
import type {SelectionRecord} from '../jev/virtual-beta/contracts.js';
import {runHumanJev} from './human-jev-experiment.js';
import {sourceIdentity} from './virtual-beta-source.js';
import {sha,type BetaResult} from './virtual-beta-core.js';
import {replayDirectory} from './virtual-beta-replay.js';
import type {HoldoutFixture} from '../app/holdout-fixture.js';

export type ReasonComparison='deferral-reason'|'reason-admission'|'reason-grounding'|'deferral-scope'|'observation-correspondence'|'goal-search'|'goal-search-semantics';
type Options={out:string;mock:boolean;envFile?:string;limit?:number;comparison?:ReasonComparison};
export type ReasonSlot={id:string;scenario:'notifications'|'revisit-alpha'|'revisit-beta';replicate:1|2;condition:'old'|'reason'};
type RunRecord=ReasonSlot&{initialImageSha256:string;result:BetaResult};
const legacyModes={old:'experience-defer',reason:'experience-reason'} as const;
const admissionModes={old:'experience-reason',reason:'experience-reason-excursion'} as const;
const groundingModes={old:'experience-reason-excursion',reason:'experience-reason-grounded'} as const;
const scopeModes={old:'experience-reason-grounded',reason:'experience-reason-conditional'} as const;
const correspondenceModes={old:'experience-reason-conditional',reason:'experience-reason-correspondence'} as const;
const goalSearchSemanticsModes={old:'experience-goal-search',reason:'experience-goal-search-v2'} as const;
const isGoalSearchComparison=(comparison:ReasonComparison)=>comparison==='goal-search'||comparison==='goal-search-semantics';
const goalSearchModes={old:'experience-reason-correspondence',reason:'experience-goal-search'} as const;
function validateComparison(comparison:unknown):asserts comparison is ReasonComparison{if(comparison!=='deferral-reason'&&comparison!=='reason-admission'&&comparison!=='reason-grounding'&&comparison!=='deferral-scope'&&comparison!=='observation-correspondence'&&comparison!=='goal-search'&&comparison!=='goal-search-semantics')throw new Error('UNKNOWN_REASON_COMPARISON');}
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
const mean=(values:number[])=>values.length?sum(values)/values.length:null;
const faults=new Set(['API_ERROR','INVALID_DISTRIBUTION','ACTION_ERROR','OBSERVATION_ERROR','SAFETY_STOP']);
const terminalKinds=['done','stuck','abandon','other','unknown'] as const;
export function validateReasonExperimentOptions(options:Options){
 validateComparison(options.comparison===undefined?'deferral-reason':options.comparison);
 if(typeof options.out!=='string'||!options.out.trim())throw new Error('NEW_OUTPUT_DIRECTORY_REQUIRED');
 if(typeof options.mock!=='boolean')throw new Error('EXPLICIT_EXECUTION_KIND_REQUIRED');
 if(!Number.isInteger(options.limit??12)||(options.limit??12)<1||(options.limit??12)>12)throw new Error('TRIAL_LIMIT_1_TO_12');
 if(!options.mock&&(typeof options.envFile!=='string'||!options.envFile.trim()))throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
}
/** Fixed before results: scenario order is unchanged; paired condition order alternates and reverses. */
export function reasonSchedule():ReasonSlot[]{
 const slots:ReasonSlot[]=[];
 for(const replicate of [1,2] as const)for(const [index,scenario] of (['notifications','revisit-alpha','revisit-beta'] as const).entries()){
  const order:ReasonSlot['condition'][]=(index+replicate)%2===1?['old','reason']:['reason','old'];
  for(const condition of order)slots.push({id:scenario+'-r'+replicate+'-'+condition,scenario,replicate,condition});
 }
 return slots;
}
/** Fixed comparison declaration shared by pure audit tests and the ordinary runner. */
export function reasonComparisonPlan(comparison:ReasonComparison='deferral-reason',limit=12){
 validateReasonExperimentOptions({out:'comparison-plan',mock:true,comparison,limit});
 const modes={...(comparison==='goal-search-semantics'?goalSearchSemanticsModes:isGoalSearchComparison(comparison)?goalSearchModes:comparison==='observation-correspondence'?correspondenceModes:comparison==='deferral-scope'?scopeModes:comparison==='reason-grounding'?groundingModes:comparison==='reason-admission'?admissionModes:legacyModes)};
 const phase=comparison==='goal-search-semantics'?'goal-search-semantics-comparison':isGoalSearchComparison(comparison)?'goal-search-comparison':comparison==='observation-correspondence'?'observation-correspondence-comparison':comparison==='deferral-scope'?'deferral-scope-comparison':comparison==='reason-grounding'?'deferral-reason-grounding-comparison':comparison==='reason-admission'?'deferral-reason-admission-comparison':'deferral-reason-comparison';
 const ledgerPhase=comparison==='goal-search-semantics'?'goal-search-semantics':isGoalSearchComparison(comparison)?'goal-search':comparison==='observation-correspondence'?'observation-correspondence':comparison==='deferral-scope'?'deferral-scope':comparison==='reason-grounding'?'deferral-reason-grounding':comparison==='reason-admission'?'deferral-reason-admission':'deferral-reason';
 const fullSchedule=reasonSchedule(),schedule=fullSchedule.slice(0,limit);
 const limits={trials:schedule.length,maxRequests:schedule.length*24,phaseMaximumRequests:288,maxRequestsPerTrial:24,maxJudgmentsPerTrial:12,maxUIActionsPerTrial:15,maxLooksPerTrial:3,maxRunMs:180000,phaseMs:20*60*1000,parallel:1};
 const inputComponents:Record<'shared'|'old'|'reason',Record<string,unknown>>=isGoalSearchComparison(comparison)?{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,attempts:1,additionalAPIStages:0,initialQuestionsDiffer:true},old:{mode:modes.old,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'ui-conditional',correspondence:true,goalSearch:false},reason:{mode:modes.reason,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'ui-conditional',correspondence:true,goalSearchCapacity:8,maxGoalFragments:8,additionalImages:0,declaredDifference:'One bounded component adds current-view Goal questions, source-bound search memory, and fallible action criteria; initial model questions and inputs intentionally differ'}}:comparison==='observation-correspondence'?{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,attempts:1,additionalAPIStages:0},old:{mode:modes.old,maxUniqueImages:4,memoryCapacity:8,maxOriginalReasonImages:1,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'ui-conditional',correspondence:false},reason:{mode:modes.reason,maxUniqueImages:4,memoryCapacity:8,maxOriginalReasonImages:1,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'ui-conditional',archiveCapacity:8,maxCurrentCandidates:8,maxPastCandidates:12,retrievedImagesMaximum:1,annotations:'unchanged-links-only',declaredDifference:'One bounded component adds a retrieved past image, correspondence questions in the existing assessment, and fallible unchanged-link annotations; actual model inputs may differ'}}:comparison==='deferral-scope'?{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,attempts:1,additionalAPIStages:0},old:{mode:modes.old,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'global'},reason:{mode:modes.reason,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',selectionScope:'ui-conditional',declaredDifference:'Only positive deferral reweighting is conditional on the baseline sampler UI class; same images, questions, stages, and original draw'}}:comparison==='reason-grounding'?{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,attempts:1,additionalAPIStages:0},old:{mode:modes.old,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'separate'},reason:{mode:modes.reason,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'excursion-evidence',reviewMode:'grounded-choice',declaredDifference:'Only the review question form joins status and attached evidence choice; same actual images and API stages'}}:comparison==='reason-admission'?{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,attempts:1,additionalAPIStages:0},old:{mode:modes.old,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'negative-evidence'},reason:{mode:modes.reason,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,basisAdmission:'excursion-evidence',declaredDifference:'Only blocker-basis admission from the same performed excursion; no extra API stage or prompt change'}}:{shared:{fullViewport:true,recencyImages:3,experienceCapacity:8,longContext:true,additionalAPIStages:0},old:{mode:modes.old,fixedTemporaryDeferral:true,maxUniqueImages:3},reason:{mode:modes.reason,memoryCapacity:8,maxOriginalReasonImages:1,maxUniqueImages:4,declaredDifference:'Reason memory, source evidence image when needed, and capture/review questions within the existing assessment'}};
 if(comparison==='goal-search-semantics'){inputComponents.old={...inputComponents.reason,mode:modes.old,interpretation:'legacy',declaredDifference:'Legacy combined role/current-evidence classification and target-only finding'};inputComponents.reason={...inputComponents.reason,mode:modes.reason,interpretation:'role-state-v2',declaredDifference:'Separate full-Goal role/current-evidence questions and execute/navigation finding alternatives; same stages/images/actions/selection policy'};}
 return {modes,phase,ledgerPhase,fullSchedule,schedule,limits,inputComponents};
}
async function json(path:string){return JSON.parse(await readFile(path,'utf8'));}
/** Hash only the known predecessor manifests' ledgers; absent local reports are recorded honestly. */
export async function snapshotReasonPriorLedgers(comparison:ReasonComparison='deferral-reason',workspaceRoot=process.cwd()){
 validateComparison(comparison);
 const manifestPath=comparison==='goal-search-semantics'?'reports/goal-search-budget-fixed-2026-10-29/live/manifest.json':isGoalSearchComparison(comparison)?'reports/observation-correspondence-2026-10-29/live/manifest.json':comparison==='observation-correspondence'?'reports/notification-switch-2026-10-29/live/manifest.json':comparison==='deferral-scope'?'reports/deferral-grounding-2026-10-29/live/manifest.json':comparison==='reason-grounding'?'reports/deferral-admission-2026-10-29/live/manifest.json':comparison==='reason-admission'?'reports/deferral-reason-2026-10-28/live/manifest.json':'reports/holdout-stability-2026-10-28/live/manifest.json';let paths:string[]=[];
 try{
  const manifest=await json(resolve(workspaceRoot,manifestPath));
  paths=(manifest.priorLedgers??[]).map((item:{path:string})=>item.path);
  paths.push(...(manifest.records??[]).map((item:{id:string})=>join(dirname(manifestPath),item.id+'-budget.json')));
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const result:{path:string;sha256:string}[]=[];
 for(const path of [...new Set(paths)])try{result.push({path:path.replaceAll('\\','/'),sha256:sha(await readFile(resolve(workspaceRoot,path)))});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 return result;
}
function localURL(value:string|undefined){
 if(!value)return null;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)?url.pathname+url.search+url.hash:null;}catch{return null;}
}
function comparableConfig(config:BetaResult['config'],comparison:ReasonComparison){
 const {id:_id,...rest}=config;
 if(comparison==='goal-search-semantics'){rest.goalSearch={...rest.goalSearch!};delete rest.goalSearch.interpretation;}
 else if(isGoalSearchComparison(comparison))delete (rest as Record<string,unknown>).goalSearch;
 else if(comparison==='observation-correspondence')delete (rest as Record<string,unknown>).correspondence;
 else if(comparison==='deferral-scope'){if(rest.deferral){const {selectionScope:_selectionScope,...deferral}=rest.deferral;rest.deferral=deferral;}}
 else if(comparison==='deferral-reason')delete rest.deferralReason;
 else if(rest.deferralReason){if(comparison==='reason-grounding'){const {reviewMode:_reviewMode,...reason}=rest.deferralReason;rest.deferralReason=reason;}else{const {basisAdmission:_basisAdmission,...reason}=rest.deferralReason;rest.deferralReason=reason;}}
 return rest;
}
function groundingMetrics(result:BetaResult){
 let statusChangedWithoutCitation=0,groundedQuestionCount=0,groundedResponseCount=0;
 type Latency={identity:{imageSha256:string;candidateId:string;fromObservationId:string;toObservationId:string};firstReviewStep:number;firstReleaseStep:number|null;delaySteps:number|null;reviewCount:number};
 const generations=new Map<string,Latency>();
 for(const step of result.steps){
  groundedQuestionCount+=Object.keys(step.deliberation?.questions??{}).filter(key=>/^reasonReview\d+Grounded$/.test(key)).length;
  const record=object(object((step as unknown as Record<string,unknown>).deferralReason)?.record),raw=object(record?.rawChoices)??{};
  for(const [key,value] of Object.entries(raw)){
   if(/^reasonReview\d+Grounded$/.test(key))groundedResponseCount++;
   if(/^reasonReview\d+Status$/.test(key)&&object(value)?.choice==='basis_changed'&&object(raw[key.replace(/Status$/,'Evidence')])?.choice==='none')statusChangedWithoutCitation++;
  }
  for(const value of Array.isArray(record?.reviews)?record.reviews:[]){
   const review=object(value),id=object(review?.identity);
   if(!id||!['imageSha256','candidateId','fromObservationId','toObservationId'].every(key=>typeof id[key]==='string'))continue;
   const identity={imageSha256:id.imageSha256 as string,candidateId:id.candidateId as string,fromObservationId:id.fromObservationId as string,toObservationId:id.toObservationId as string},key=JSON.stringify(Object.values(identity));
   const entry=generations.get(key)??{identity,firstReviewStep:step.number,firstReleaseStep:null,delaySteps:null,reviewCount:0};
   entry.reviewCount++;entry.firstReviewStep=Math.min(entry.firstReviewStep,step.number);
   if(review?.released===true)entry.firstReleaseStep=entry.firstReleaseStep===null?step.number:Math.min(entry.firstReleaseStep,step.number);
   entry.delaySteps=entry.firstReleaseStep===null?null:entry.firstReleaseStep-entry.firstReviewStep;
   generations.set(key,entry);
  }
 }
 const entries=[...generations.values()],delays=entries.flatMap(entry=>entry.delaySteps===null?[]:[entry.delaySteps]);
 return {statusChangedWithoutCitation,groundedQuestionCount,groundedResponseCount,completedReviewLatency:{definition:'Per exact image/candidate/from/to generation; firstReviewStep records a completed admitted review, excluding question-only or failed assessment opportunities. Delay is measured in recorded model steps, not time or UI operations.',entries,meanReleasedDelaySteps:mean(delays),unreleasedGenerations:entries.filter(entry=>entry.firstReleaseStep===null).length}};
}
function reconstructedBaseline(selection:SelectionRecord){
 const before=selection.policy?.before??selection.filtered,keys=Object.keys(before).sort();
 if(!keys.length||keys.some(key=>!Number.isFinite(before[key])||before[key]<0)||sum(Object.values(before))<=0)return null;
 if(selection.mode==='argmax'){let selected=keys[0];for(const key of keys)if(before[key]>before[selected])selected=key;return selected;}
 if(selection.mode!=='sample'||typeof selection.draw!=='number'||!Number.isFinite(selection.draw)||selection.draw<0||selection.draw>=1)return null;
 let selected=keys.filter(key=>before[key]>0).at(-1)!,cumulative=0;
 for(const key of keys){cumulative+=before[key];if(selection.draw<cumulative){selected=key;break;}}
 return selected;
}
function scopeMetrics(result:BetaResult){
 type TerminalClass='done'|'stuck'|'abandon'|'other'|'unknown';
 const terminal=(id:string|null):TerminalClass=>id===null?'unknown':id==='done'||id==='stuck'||id==='abandon'?id:'other';
 const selectionTrace=result.steps.flatMap(step=>{
  const selection=step.selection;if(!selection)return [];
  const before=selection.policy?.before??selection.filtered,keys=Object.keys(before).sort(),baselineSelected=reconstructedBaseline(selection),scope=selection.policy?.scope;
  let uiCandidates:string[]|null=null;
  try{if(step.audit?.screen){const candidates=reconstructReplayCandidates(step.audit.screen,keys);uiCandidates=keys.filter(key=>['click','back','scroll'].includes(candidates[key].action.type));}}catch{/* Missing or invalid audit evidence remains unknown, without guessing action classes. */}
  const mass=(distribution:Record<string,number>,ids:string[]|null)=>ids===null||ids.some(id=>!Number.isFinite(distribution[id]))?null:sum(ids.map(id=>distribution[id]));
  const nonUI=uiCandidates===null?null:keys.filter(key=>!uiCandidates!.includes(key)),fullMarginal=scope?.marginal??selection.filtered;
  const baselineTerminal=terminal(baselineSelected),selectedTerminal=terminal(selection.selected),modelChoiceTerminal=terminal(selection.modelChoice);
  const baselineUIClass=uiCandidates===null||baselineSelected===null?'unknown':uiCandidates.includes(baselineSelected)?'ui':'non-ui';
  let drawMatchesSeed:boolean|null=selection.mode==='argmax'?selection.draw===null:null;
  if(selection.mode==='sample'&&Number.isInteger(selection.seed)&&selection.seed>=0&&selection.seed<=0xffffffff&&Number.isSafeInteger(selection.drawIndex)&&selection.drawIndex>=0){const expected=createHash('sha256').update(`jev-virtual-beta-selection:v1:${selection.seed}:${selection.drawIndex}`,'utf8').digest().readUInt32BE(0)/0x100000000;drawMatchesSeed=selection.draw===expected;}
  const baselineIsTerminal=baselineTerminal!=='other'&&baselineTerminal!=='unknown',selectedIsTerminal=selectedTerminal!=='other'&&selectedTerminal!=='unknown';
  return [{step:step.number,baselineSelected,selected:selection.selected,modelChoice:selection.modelChoice,baselineTerminal,selectedTerminal,modelChoiceTerminal,baselineUIClass,baselineSelectionChanged:baselineSelected!==null&&baselineSelected!==selection.selected,policyPromotedTerminal:baselineSelected!==null&&!baselineIsTerminal&&selectedIsTerminal,baselineTerminalPreserved:baselineIsTerminal&&baselineSelected===selection.selected,scopeRecorded:scope!==undefined,scopeBaselineMatches:scope===undefined?null:scope.baselineSelected===baselineSelected,scopeClassMatches:scope===undefined||baselineUIClass==='unknown'?null:scope.baselineClass===baselineUIClass,scopeUICandidatesMatch:scope===undefined||uiCandidates===null?null:isDeepStrictEqual([...scope.uiCandidates].sort(),uiCandidates),candidateClassEvidence:uiCandidates===null?'unavailable-or-invalid-audit':'audited-action-types',uiCandidates,uiMass:mass(before,uiCandidates),nonUIMass:mass(before,nonUI),weightedUIMass:uiCandidates===null?null:sum(uiCandidates.map(id=>before[id]*(selection.policy?.weights[id]??1))),fullMarginalUIMass:mass(fullMarginal,uiCandidates),fullMarginalNonUIMass:mass(fullMarginal,nonUI),fullMarginal,filtered:selection.filtered,recordedScope:scope??null,before,raw:selection.raw,mode:selection.mode,seed:selection.seed,drawIndex:selection.drawIndex,draw:selection.draw,drawMatchesSeed}];
 });
 const terminalCounts=(field:'baselineTerminal'|'selectedTerminal'|'modelChoiceTerminal')=>Object.fromEntries(terminalKinds.map(kind=>[kind,selectionTrace.filter(trace=>trace[field]===kind).length]));
 return {selectionTrace,policyPromotedTerminal:selectionTrace.filter(trace=>trace.policyPromotedTerminal).length,baselineTerminalPreserved:selectionTrace.filter(trace=>trace.baselineTerminalPreserved).length,baselineSelectionChanges:selectionTrace.filter(trace=>trace.baselineSelectionChanged).length,scopeRecorded:selectionTrace.filter(trace=>trace.scopeRecorded).length,scopeBaselineMismatches:selectionTrace.filter(trace=>trace.scopeBaselineMatches===false).length,baselineTerminalCounts:terminalCounts('baselineTerminal'),selectedTerminalCounts:terminalCounts('selectedTerminal'),modelChoiceTerminalCounts:terminalCounts('modelChoiceTerminal')};
}
function correspondenceMetrics(result:BetaResult){
 const objects=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(object).filter((entry):entry is Record<string,unknown>=>entry!==undefined):[];
 const strings=(value:unknown)=>Array.isArray(value)?value.filter((entry):entry is string=>typeof entry==='string'):[];
 function stageEvidence(input:Record<string,unknown>|undefined,assets:Record<string,unknown>|undefined,questions:Record<string,unknown>|undefined,preparationContext:Record<string,unknown>|undefined){
  const context=object(input?.correspondenceContext),prior=object(context?.prior),current=object(context?.current),observation=object(input?.observation);
  const assetHash=(image:unknown)=>typeof image==='string'?object(assets?.[image])?.sha256:undefined;
  const baseRefs=[observation,...objects(input?.memoryObservations),...objects(input?.reasonObservations)];
  const baseHashes=new Set(baseRefs.map(ref=>assetHash(ref?.image)).filter((hash):hash is string=>typeof hash==='string'));
  const references=objects(input?.correspondenceObservations).map(ref=>{
   const assetMatches=typeof ref.observationId==='string'&&typeof ref.imageSha256==='string'&&assetHash(ref.image)===ref.imageSha256;
   const sourceMatches=assetMatches&&ref.observationId===prior?.observationId&&ref.imageSha256===prior?.imageSha256;
   return {...ref,imageSha256:ref.imageSha256,assetMatches,sourceMatches,alreadyAttachedToBase:baseHashes.has(ref.imageSha256 as string)};
  });
  const matched=references.filter(ref=>ref.sourceMatches),unique=(refs:typeof references)=>new Set(refs.map(ref=>ref.imageSha256)).size;
  const preparationContextMatches=context!==undefined&&preparationContext!==undefined&&isDeepStrictEqual(context,preparationContext);
  const currentMatches=current!==undefined&&observation?.id===current.observationId&&typeof current.imageSha256==='string'&&assetHash(observation?.image)===current.imageSha256;
  const questionIds=Object.keys(questions??{}).filter(key=>key.startsWith('correspondence_')).sort();
  return {context:context??null,preparationContextMatches,currentMatches,references,sourceMatched:preparationContextMatches&&currentMatches&&references.length===1&&matched.length===1,attachedPriorUniqueImages:unique(matched),newlyAttachedUniqueImages:unique(matched.filter(ref=>!ref.alreadyAttachedToBase)),totalUniqueImages:new Set(Object.values(assets??{}).map(value=>object(value)?.sha256).filter((hash):hash is string=>typeof hash==='string')).size,questionIds,questions:Object.fromEntries(questionIds.map(key=>[key,questions![key]])),questionsMatchContext:questions===undefined?null:context!==undefined&&isDeepStrictEqual(questionIds,strings(context.currentCandidateIds).map(id=>'correspondence_'+id).sort())};
 }
 const correspondenceTrace=result.steps.map(step=>{
  const saved=object((step as unknown as Record<string,unknown>).correspondence),preparation=object(saved?.preparation),context=object(preparation?.context),record=object(saved?.record);
  const assessment=stageEvidence(step.deliberation?.modelInput,step.deliberation?.assetFiles,step.deliberation?.questions,context),actionStage=stageEvidence(step.modelInput,step.assetFiles,undefined,context);
  const response=object(step.deliberation?.response?.answers),rawChoices=object(record?.rawChoices)??Object.fromEntries(Object.entries(response??{}).filter(([key])=>key.startsWith('correspondence_'))),links=objects(record?.links);
  let noneChoices=0,rejectedChoices=0,unadmittedRawChoices=0;
  for(const [question,value] of Object.entries(rawChoices)){
   if(!question.startsWith('correspondence_'))continue;
   const choice=object(value)?.choice;if(choice==='none'){noneChoices++;continue;}
   const parsed=typeof choice==='string'?/^(unchanged|changed)_(.+)$/.exec(choice):null,candidateId=question.slice('correspondence_'.length);
   const admitted=parsed!==null&&links.some(link=>link.candidateId===candidateId&&link.status===parsed[1]&&link.priorCandidateId===parsed[2]);
   if(!admitted){if(record)rejectedChoices++;else unadmittedRawChoices++;}
  }
  const criteria=step.questions?.nextAction?.criteria??{},annotations=objects(saved?.annotations).map(annotation=>({...annotation,candidateId:annotation.candidateId,criteriaMatches:typeof annotation.candidateId==='string'&&typeof annotation.before==='string'&&typeof annotation.after==='string'&&annotation.before!==annotation.after&&criteria[annotation.candidateId]===annotation.after,hasUnchangedLink:links.some(link=>link.candidateId===annotation.candidateId&&link.status==='unchanged')}));
  const actualSelected=step.selection?.selected??null,selectedLink=links.find(link=>link.candidateId===actualSelected);
  return {step:step.number,preparation:preparation??null,record:record??null,archive:objects(saved?.archive),assessment,actionStage,rawChoices,rawChoicesSource:record?'admitted-record':Object.keys(rawChoices).length?'assessment-response':'none',links,noneChoices,rejectedChoices,unadmittedRawChoices,adjustments:strings(record?.adjustments),annotations,actualSelected,modelChoice:step.selection?.modelChoice??null,selectedLinkStatus:typeof selectedLink?.status==='string'?selectedLink.status:'none',selectedAnnotated:actualSelected!==null&&annotations.some(annotation=>annotation.candidateId===actualSelected&&annotation.criteriaMatches&&annotation.hasUnchangedLink),action:step.action??null,outcome:step.outcome??null,assessmentError:step.deliberation?.error??null,error:step.error??null};
 });
 return {correspondenceTrace,correspondenceProposals:correspondenceTrace.filter(trace=>trace.preparation?.reason==='PROPOSED').length,matchedAssessmentSources:correspondenceTrace.filter(trace=>trace.assessment.sourceMatched).length,matchedActionSources:correspondenceTrace.filter(trace=>trace.actionStage.sourceMatched).length,newlyAttachedAssessmentImages:sum(correspondenceTrace.map(trace=>trace.assessment.newlyAttachedUniqueImages)),newlyAttachedActionImages:sum(correspondenceTrace.map(trace=>trace.actionStage.newlyAttachedUniqueImages)),maxDeliveredUniqueImages:Math.max(0,...correspondenceTrace.flatMap(trace=>[trace.assessment.totalUniqueImages,trace.actionStage.totalUniqueImages])),correspondenceQuestions:sum(correspondenceTrace.map(trace=>trace.assessment.questionIds.length)),unchangedLinks:sum(correspondenceTrace.map(trace=>trace.links.filter(link=>link.status==='unchanged').length)),changedLinks:sum(correspondenceTrace.map(trace=>trace.links.filter(link=>link.status==='changed').length)),noneChoices:sum(correspondenceTrace.map(trace=>trace.noneChoices)),rejectedCorrespondenceChoices:sum(correspondenceTrace.map(trace=>trace.rejectedChoices)),unadmittedRawCorrespondenceChoices:sum(correspondenceTrace.map(trace=>trace.unadmittedRawChoices)),correspondenceAdjustmentCount:sum(correspondenceTrace.map(trace=>trace.adjustments.length)),correspondenceAnnotations:sum(correspondenceTrace.map(trace=>trace.annotations.length)),annotationCriteriaMatches:sum(correspondenceTrace.map(trace=>trace.annotations.filter(annotation=>annotation.criteriaMatches).length)),annotationsWithoutUnchangedLink:sum(correspondenceTrace.map(trace=>trace.annotations.filter(annotation=>!annotation.hasUnchangedLink).length)),selectedAnnotatedSteps:correspondenceTrace.filter(trace=>trace.selectedAnnotated).length};
}
const goalSearchFindingKinds=['target','navigation','prerequisite','guidance','no-target-in-view','uncertain','unknown'] as const;
const goalSearchRequirementKinds=['observed','not_shown','context','contradicted','uncertain','unknown'] as const;
function goalSearchMetrics(result:BetaResult){
 const objects=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(object).filter((entry):entry is Record<string,unknown>=>entry!==undefined):[];
 const prefixed=(value:unknown)=>Object.fromEntries(Object.entries(object(value)??{}).filter(([key])=>key.startsWith('goalSearch_')));
 const imageCount=(assets:unknown)=>new Set(Object.values(object(assets)??{}).map(value=>object(value)?.sha256).filter((hash):hash is string=>typeof hash==='string')).size;
 const goalSearchTrace=result.steps.map(step=>{
  const saved=object((step as unknown as Record<string,unknown>).goalSearch),record=object(saved?.record),memory=object(saved?.memory),source=object(record?.source),requirements=objects(record?.requirements),finding=object(record?.finding);
  const assessmentInput=step.deliberation?.modelInput,observation=object(assessmentInput?.observation),currentImage=typeof observation?.image==='string'?step.deliberation?.assetFiles[observation.image]:undefined;
  const questions=prefixed(step.deliberation?.questions),answers=prefixed(step.deliberation?.response?.answers),questionIds=Object.keys(questions),answerIds=Object.keys(answers);
  const assessmentMemory=object(assessmentInput?.userState)?.goalSearch??null,actionMemory=object(step.modelInput?.userState)?.goalSearch??null;
  const criteria=step.questions?.nextAction?.criteria??{},annotations=objects(saved?.annotations).map(annotation=>({...annotation,candidateId:annotation.candidateId,actualCriterion:typeof annotation.candidateId==='string'?criteria[annotation.candidateId]??null:null,criteriaMatches:typeof annotation.candidateId==='string'&&typeof annotation.before==='string'&&typeof annotation.after==='string'&&annotation.before!==annotation.after&&criteria[annotation.candidateId]===annotation.after}));
  const actualSelected=step.selection?.selected??null;
  return {step:step.number,questions,answers,missingResponses:questionIds.filter(id=>!Object.hasOwn(answers,id)),unsolicitedResponses:answerIds.filter(id=>!Object.hasOwn(questions,id)),record:record??null,source:source??null,sourceMatchesCurrentAsset:source!==undefined&&source.observationId===observation?.id&&typeof source.imageSha256==='string'&&currentImage?.sha256===source.imageSha256,requirements,finding:finding??null,recordedMemory:memory??null,assessmentMemory,actionMemory,assessmentWireMemory:assessmentInput?.goalSearchMemory??null,actionWireMemory:step.modelInput?.goalSearchMemory??null,actionMemoryMatchesRecorded:memory===undefined||actionMemory===null?null:isDeepStrictEqual(actionMemory,memory),currentRecordRemembered:record!==undefined&&objects(memory?.entries).some(entry=>isDeepStrictEqual(entry,record)),recordedMemoryEntryCount:objects(memory?.entries).length,assessmentMemoryEntryCount:objects(object(assessmentMemory)?.entries).length,actionMemoryEntryCount:objects(object(actionMemory)?.entries).length,assessmentUniqueImages:imageCount(step.deliberation?.assetFiles),actionUniqueImages:imageCount(step.assetFiles),annotations,actualSelected,modelChoice:step.selection?.modelChoice??null,selectedAnnotated:actualSelected!==null&&annotations.some(annotation=>annotation.candidateId===actualSelected&&annotation.criteriaMatches),selectedReportedTarget:actualSelected!==null&&finding?.kind==='target'&&finding.candidateId===actualSelected,action:step.action??null,outcome:step.outcome??null,assessmentError:step.deliberation?.error??null,error:step.error??null};
 });
 return {goalSearchTrace,goalSearchQuestionCount:sum(goalSearchTrace.map(trace=>Object.keys(trace.questions).length)),goalSearchResponseCount:sum(goalSearchTrace.map(trace=>Object.keys(trace.answers).filter(id=>Object.hasOwn(trace.questions,id)).length)),goalSearchMissingResponses:sum(goalSearchTrace.map(trace=>trace.missingResponses.length)),goalSearchUnsolicitedResponses:sum(goalSearchTrace.map(trace=>trace.unsolicitedResponses.length)),goalSearchRecords:goalSearchTrace.filter(trace=>trace.record!==null).length,sourceMatchedGoalSearchRecords:goalSearchTrace.filter(trace=>trace.sourceMatchesCurrentAsset).length,goalSearchAnnotations:sum(goalSearchTrace.map(trace=>trace.annotations.length)),goalSearchAnnotationCriteriaMatches:sum(goalSearchTrace.map(trace=>trace.annotations.filter(annotation=>annotation.criteriaMatches).length)),goalSearchSelectedAnnotatedSteps:goalSearchTrace.filter(trace=>trace.selectedAnnotated).length,selectedReportedTargetSteps:goalSearchTrace.filter(trace=>trace.selectedReportedTarget).length,goalSearchFindingCounts:Object.fromEntries(goalSearchFindingKinds.map(kind=>[kind,goalSearchTrace.filter(trace=>trace.record!==null&&(goalSearchFindingKinds.includes(trace.finding?.kind as typeof goalSearchFindingKinds[number])?trace.finding?.kind:'unknown')===kind).length])),goalSearchRequirementAssessments:Object.fromEntries(goalSearchRequirementKinds.map(kind=>[kind,sum(goalSearchTrace.map(trace=>trace.requirements.filter(requirement=>(goalSearchRequirementKinds.includes(requirement.assessment as typeof goalSearchRequirementKinds[number])?requirement.assessment:'unknown')===kind).length))])),maxGoalSearchMemoryEntries:Math.max(0,...goalSearchTrace.flatMap(trace=>[trace.recordedMemoryEntryCount,trace.assessmentMemoryEntryCount,trace.actionMemoryEntryCount])),maxDeliveredUniqueImages:Math.max(0,...goalSearchTrace.flatMap(trace=>[trace.assessmentUniqueImages,trace.actionUniqueImages]))};
}
function runSummary(record:RunRecord,comparison:ReasonComparison){
 const r=record.result;
 const fault=faults.has(r.termination)||r.objectiveAssessment.status!=='OK'||r.terminalObservation.status!=='RECORDED';
 const valid=r.validForComparison&&!fault&&typeof r.objectiveAssessment.value==='boolean'&&r.objectiveSuccess===r.objectiveAssessment.value;
 const policySelections=r.steps.flatMap(step=>{
  const selection=step.selection,policy=selection?.policy;if(!selection||!policy)return [];
  const ordered=Object.keys(policy.before).sort(),maximum=Math.max(...ordered.map(key=>policy.before[key])),before=ordered.find(key=>policy.before[key]===maximum&&maximum>0)??null;
  return [{step:step.number,beforeArgmax:before,selected:selection.selected,changed:before!==null&&before!==selection.selected,raw:selection.raw,policy}];
 });
 const edges=r.steps.flatMap((step,index)=>{
  if(!step.action||!['click','back','scroll'].includes(step.action.type))return [];
  const from=localURL(step.audit?.url),to=step.outcome==='UI_PERFORMED'?localURL(r.steps[index+1]?.audit?.url):null;
  return [{step:step.number,action:step.action,from,to,status:step.outcome==='UI_PERFORMED'?(from!==null&&to!==null?'observed':'unknown'):'failed'}];
 });
 const reasonRecords:({step:number}&Record<string,unknown>)[]=r.steps.flatMap(step=>{
  const value=object((step as unknown as Record<string,unknown>).deferralReason);return value?[{step:step.number,...value}]:[];
 });
 const reasonDetails=reasonRecords.map(value=>object(value.record)).filter((value):value is Record<string,unknown>=>value!==undefined);
 const captures=reasonDetails.flatMap(value=>object(value.capture)?[object(value.capture)!]:[]),reviews=reasonDetails.flatMap(value=>Array.isArray(value.reviews)?value.reviews.map(object).filter((entry):entry is Record<string,unknown>=>entry!==undefined):[]);
 const reasonMetrics={reasonCaptures:captures.length,admittedReasonCaptures:captures.filter(value=>value.admitted===true).length,reasonReviews:reviews.length,reasonBasisChangedReports:reviews.filter(value=>value.status==='basis_changed').length,actualReasonReleases:reviews.filter(value=>value.released===true).length};
 const deferralDecisions=r.steps.flatMap(step=>step.deferral?.decision?[{step:step.number,...step.deferral.decision}]:[]);
 return {id:record.id,scenario:record.scenario,replicate:record.replicate,condition:record.condition,valid,fault,objectiveAssessment:r.objectiveAssessment,success:valid&&r.objectiveAssessment.value===true,falseDone:valid&&r.perceivedDone&&r.objectiveAssessment.value===false,termination:r.termination,perceivedDone:r.perceivedDone,uiActions:r.uiActions,decisions:r.decisions,looks:r.looks,requests:r.apiCalls,timing:{apiMs:r.apiMs,uiMs:r.uiMs,elapsedMs:r.elapsedMs,humanTimeMs:null},policyChanges:policySelections.filter(s=>s.changed).length,policySelections,deferralDecisions,reasonRecords,...reasonMetrics,...(comparison==='reason-grounding'?groundingMetrics(r):{}),...(comparison==='deferral-scope'?scopeMetrics(r):{}),...(comparison==='observation-correspondence'?correspondenceMetrics(r):{}),...(isGoalSearchComparison(comparison)?goalSearchMetrics(r):{}),temporaryAlternativeExhaustionSteps:deferralDecisions.filter(d=>d.reason==='ALTERNATIVES_EXHAUSTED').length,route:{identity:'actual-audited-local-pathname-search-hash; no semantic aliases',edges},sameObservationEvidence:r.steps.flatMap(step=>{
  const context=object(step.modelInput?.experienceContext);return context?.returnedRoutes?[{step:step.number,observationId:step.observationId,returnedRoutes:context.returnedRoutes}]:[];
 })};
}
/** Descriptive only: model reasons are saved self-reports; route changes do not establish recovery. */
export function analyzeReasonRuns(records:RunRecord[],comparison:ReasonComparison='deferral-reason'){
 validateComparison(comparison);
 const runs=records.map(record=>runSummary(record,comparison)),pairs=[];
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const replicate of [1,2]){
  const group=records.filter(r=>r.scenario===scenario&&r.replicate===replicate);if(!group.length)continue;
  const old=group.filter(r=>r.condition==='old'),reason=group.filter(r=>r.condition==='reason'),errors:string[]=[];
  const status=old.length>1||reason.length>1?'ambiguous':old.length===0||reason.length===0?'missing-condition':'paired';
  if(status==='paired'){
   const a=old[0],b=reason[0];
   if(!a.result.code?.sourceHash||a.result.code.sourceHash!==b.result.code?.sourceHash)errors.push('SOURCE_HASH_MISMATCH');
   if(!a.result.code?.revision||a.result.code.revision!==b.result.code?.revision)errors.push('REVISION_MISMATCH');
   if(a.initialImageSha256!==b.initialImageSha256)errors.push('INITIAL_IMAGE_MISMATCH');
   if(!isDeepStrictEqual(comparableConfig(a.result.config,comparison),comparableConfig(b.result.config,comparison)))errors.push('CONFIG_MISMATCH');
   if(!isDeepStrictEqual(a.result.input.charter,b.result.input.charter))errors.push('CHARTER_MISMATCH');
   if(!isDeepStrictEqual(a.result.input.persona,b.result.input.persona))errors.push('PERSONA_MISMATCH');
   if(group.some(r=>r.id!==r.result.runId))errors.push('RUN_ID_MISMATCH');
  }
  pairs.push({scenario,replicate,status,consistent:status==='paired'&&errors.length===0,errors,ids:group.map(r=>r.id)});
 }
 const cells=[];
 for(const scenario of ['notifications','revisit-alpha','revisit-beta'])for(const condition of ['old','reason']){
  const group=runs.filter(r=>r.scenario===scenario&&r.condition===condition);if(!group.length)continue;
  const valid=group.filter(r=>r.valid);
  cells.push({scenario,condition,n:group.length,valid:valid.length,successes:valid.filter(r=>r.success).length,faults:group.filter(r=>r.fault).length,falseDone:valid.filter(r=>r.falseDone).length,meanUIActions:mean(valid.map(r=>r.uiActions)),meanDecisions:mean(valid.map(r=>r.decisions)),policyChanges:sum(valid.map(r=>r.policyChanges)),reasonRecordSteps:sum(valid.map(r=>r.reasonRecords.length)),reasonCaptures:sum(valid.map(r=>r.reasonCaptures)),admittedReasonCaptures:sum(valid.map(r=>r.admittedReasonCaptures)),reasonReviews:sum(valid.map(r=>r.reasonReviews)),reasonBasisChangedReports:sum(valid.map(r=>r.reasonBasisChangedReports)),actualReasonReleases:sum(valid.map(r=>r.actualReasonReleases)),temporaryAlternativeExhaustionSteps:sum(valid.map(r=>r.temporaryAlternativeExhaustionSteps)),...(comparison==='reason-grounding'?{statusChangedWithoutCitation:sum(valid.map(r=>r.statusChangedWithoutCitation??0)),groundedQuestionCount:sum(valid.map(r=>r.groundedQuestionCount??0)),groundedResponseCount:sum(valid.map(r=>r.groundedResponseCount??0)),meanCompletedReviewReleaseDelaySteps:mean(valid.flatMap(r=>r.completedReviewLatency?.entries.flatMap(entry=>entry.delaySteps===null?[]:[entry.delaySteps])??[])),unreleasedReviewedGenerations:sum(valid.map(r=>r.completedReviewLatency?.unreleasedGenerations??0))}:{}),...(comparison==='deferral-scope'?{policyPromotedTerminal:sum(valid.map(r=>r.policyPromotedTerminal??0)),baselineTerminalPreserved:sum(valid.map(r=>r.baselineTerminalPreserved??0)),baselineSelectionChanges:sum(valid.map(r=>r.baselineSelectionChanges??0)),scopeRecorded:sum(valid.map(r=>r.scopeRecorded??0)),scopeBaselineMismatches:sum(valid.map(r=>r.scopeBaselineMismatches??0)),baselineTerminalCounts:Object.fromEntries(terminalKinds.map(kind=>[kind,sum(valid.map(r=>r.baselineTerminalCounts?.[kind]??0))])),selectedTerminalCounts:Object.fromEntries(terminalKinds.map(kind=>[kind,sum(valid.map(r=>r.selectedTerminalCounts?.[kind]??0))])),modelChoiceTerminalCounts:Object.fromEntries(terminalKinds.map(kind=>[kind,sum(valid.map(r=>r.modelChoiceTerminalCounts?.[kind]??0))]))}:{}),...(comparison==='observation-correspondence'?{correspondenceProposals:sum(valid.map(r=>r.correspondenceProposals??0)),matchedAssessmentSources:sum(valid.map(r=>r.matchedAssessmentSources??0)),matchedActionSources:sum(valid.map(r=>r.matchedActionSources??0)),newlyAttachedAssessmentImages:sum(valid.map(r=>r.newlyAttachedAssessmentImages??0)),newlyAttachedActionImages:sum(valid.map(r=>r.newlyAttachedActionImages??0)),maxDeliveredUniqueImages:valid.length?Math.max(...valid.map(r=>r.maxDeliveredUniqueImages??0)):null,correspondenceQuestions:sum(valid.map(r=>r.correspondenceQuestions??0)),unchangedLinks:sum(valid.map(r=>r.unchangedLinks??0)),changedLinks:sum(valid.map(r=>r.changedLinks??0)),noneChoices:sum(valid.map(r=>r.noneChoices??0)),rejectedCorrespondenceChoices:sum(valid.map(r=>r.rejectedCorrespondenceChoices??0)),unadmittedRawCorrespondenceChoices:sum(valid.map(r=>r.unadmittedRawCorrespondenceChoices??0)),correspondenceAdjustmentCount:sum(valid.map(r=>r.correspondenceAdjustmentCount??0)),correspondenceAnnotations:sum(valid.map(r=>r.correspondenceAnnotations??0)),annotationCriteriaMatches:sum(valid.map(r=>r.annotationCriteriaMatches??0)),annotationsWithoutUnchangedLink:sum(valid.map(r=>r.annotationsWithoutUnchangedLink??0)),selectedAnnotatedSteps:sum(valid.map(r=>r.selectedAnnotatedSteps??0))}:{}),...(isGoalSearchComparison(comparison)?{goalSearchQuestionCount:sum(valid.map(r=>r.goalSearchQuestionCount??0)),goalSearchResponseCount:sum(valid.map(r=>r.goalSearchResponseCount??0)),goalSearchMissingResponses:sum(valid.map(r=>r.goalSearchMissingResponses??0)),goalSearchUnsolicitedResponses:sum(valid.map(r=>r.goalSearchUnsolicitedResponses??0)),goalSearchRecords:sum(valid.map(r=>r.goalSearchRecords??0)),sourceMatchedGoalSearchRecords:sum(valid.map(r=>r.sourceMatchedGoalSearchRecords??0)),goalSearchAnnotations:sum(valid.map(r=>r.goalSearchAnnotations??0)),goalSearchAnnotationCriteriaMatches:sum(valid.map(r=>r.goalSearchAnnotationCriteriaMatches??0)),goalSearchSelectedAnnotatedSteps:sum(valid.map(r=>r.goalSearchSelectedAnnotatedSteps??0)),selectedReportedTargetSteps:sum(valid.map(r=>r.selectedReportedTargetSteps??0)),goalSearchFindingCounts:Object.fromEntries(goalSearchFindingKinds.map(kind=>[kind,sum(valid.map(r=>r.goalSearchFindingCounts?.[kind]??0))])),goalSearchRequirementAssessments:Object.fromEntries(goalSearchRequirementKinds.map(kind=>[kind,sum(valid.map(r=>r.goalSearchRequirementAssessments?.[kind]??0))])),maxGoalSearchMemoryEntries:valid.length?Math.max(...valid.map(r=>r.maxGoalSearchMemoryEntries??0)):null,maxDeliveredUniqueImages:valid.length?Math.max(...valid.map(r=>r.maxDeliveredUniqueImages??0)):null}:{})});
 }
 return {schemaVersion:1,kind:isGoalSearchComparison(comparison)?'offline-goal-search-descriptive-comparison':comparison==='observation-correspondence'?'offline-observation-correspondence-descriptive-comparison':comparison==='deferral-scope'?'offline-deferral-scope-descriptive-comparison':comparison==='reason-grounding'?'offline-deferral-reason-grounding-descriptive-comparison':comparison==='reason-admission'?'offline-deferral-reason-admission-descriptive-comparison':'offline-deferral-reason-descriptive-comparison',...(comparison!=='deferral-reason'?{comparison}:{}),expectedTrials:12,received:records.length,runs,cells,pairs,limitations:['Two replicates per scenario and condition are descriptive, with no reliability or generalization estimate.','Model reason captures and reviews are self-reports. Actual release records and actual selected actions remain separate.','Images establish input equality only, not semantic identity or goal equivalence.','Only a subsequent audited observation establishes a performed action destination.','Mock scripted done output is a connectivity check and supplies no performance evidence.',comparison==='goal-search-semantics'?'Source, initial UI image, goal, persona, and config are paired with only config id and goalSearch.interpretation excluded. Role/current-evidence and execute/navigation questions intentionally differ.':isGoalSearchComparison(comparison)?'Source, initial UI image, goal, persona, and config are paired with only config id and goalSearch excluded. Initial model questions and model inputs intentionally differ.':comparison==='observation-correspondence'?'Source, initial image, goal, persona, and config are paired with only config id and the declared correspondence component excluded. Actual model images, correspondence questions, and action annotations may differ.':comparison==='deferral-scope'?'Source, initial image, goal, persona, and config are paired with only config id and deferral.selectionScope excluded.':comparison==='reason-grounding'?'Source, initial image, goal, persona, and config are paired with only config id and deferralReason.reviewMode excluded.':comparison==='reason-admission'?'Source, initial image, goal, persona, and config are paired with only config id and deferralReason.basisAdmission excluded.':'Source, initial image, goal, persona, and config are paired with only config id and the declared deferralReason component excluded.',...(comparison==='reason-grounding'?['The syntactic absence of changed-without-citation answers is enforced by the choice interface; it is not evidence of improved semantic understanding.','Review delay covers completed record.reviews by exact generation; it excludes question-only and failed assessment opportunities and does not measure all eligible opportunities.','groundedQuestionCount counts saved assessment question definitions, not independently confirmed delivery; groundedResponseCount counts recorded raw answers.','No completed review or release opportunity leaves false-release accuracy untested; a zero count is not evidence of correctness.']:[]),...(comparison==='deferral-scope'?['UI-conditional reweighting is a controller heuristic; its mechanical effect does not establish model intention, semantic correctness, goal success, or human fidelity.','Baseline selection is independently reconstructed from safe pre-policy probabilities using the saved mode and draw; the original modelChoice and actual sampler-selected choice remain separate. Seed/draw checks and recorded scope comparisons are audit evidence, not inferred preferences.','Candidate UI classes use actual audited click/back/scroll action types; missing or invalid audit evidence leaves class and mass unknown. Terminal classes name the fixed done/stuck/abandon controller candidates.','filtered is conditional within the chosen class; fullMarginal records the full distribution. Conditional zeros do not establish safety exclusions or permanent unavailability.','The retained legacy policyChanges count compares argmax; baselineSelectionChanges and selectionTrace use the actual saved sampler mode and draw.']:[]),...(comparison==='observation-correspondence'?['Retrieved pixels and admitted links are model hypotheses, not verified semantic equivalence or human behavior. Pixel ranking only selects an image to compare.','The declared component bundles retrieval, an optional past image, correspondence questions and unchanged-link annotations; this comparison does not identify individual subcomponent effects.','Source matching checks saved observation references against actual asset metadata; it does not prove image interpretation, semantic accuracy or network delivery. Raw choices, rejected proposals, admitted unchanged/changed links, annotations and actual selected actions remain separate.','Newly attached unique-image counts are per request relative to current, recency and reason references; the same past image delivered to both stages is counted separately. The per-request unique-image maximum is reported independently.','No proposal or admitted link leaves correspondence accuracy untested, not demonstrated by a zero rejection count. Faulted runs remain excluded from valid-run outcome and behavior summaries.']:[]),...(isGoalSearchComparison(comparison)?['Goal-search entries are structured model hypotheses, not a transcript, complete reading record, verified semantic understanding, or evidence of human fidelity. Literal Goal fragments are incomplete subdivisions, not a replacement for whole-Goal verification.',comparison==='goal-search-semantics'?'The intervention separates full-Goal role from current-view evidence and execute from navigation alternatives, retaining the existing bounded memory, images, stages, candidates, and controller. Initial questions and record annotations differ; individual subcomponent effects are not identified.':'The bundled intervention adds current-view questions, bounded source-bound memory and action criteria. Initial model questions differ; this comparison does not identify individual subcomponent effects.','Finding and requirement counts report model judgments about the delivered current view. No-target-in-view is not a claim about hidden content, an entire page, route impossibility, or a reason to forbid revisits. A reported target selected by the sampler is not objective Goal success.','Question and response counts describe saved objects. Full requested raw answers, missing and unsolicited answers, admitted records, source metadata, assessment/action memories, annotations and actual selected actions remain separate. Metadata matching does not establish correct interpretation or network delivery.','Annotation counts use the recorded before/after values and exact final action criteria. Audit and actual wire memory are saved separately; no additional top-level goalSearchMemory field is assumed. Faulted runs remain outside valid-run behavior and outcome totals.']:[])]};
}
export type BlockingGatewayFailure={code:'HTTP_ERROR';statusCode:402;step:number;stage:'assessment'|'action'};
/** A final recorded HTTP402 is an operational stop, without inferring the provider's cause. */
export function blockingGatewayFailure(result:BetaResult):BlockingGatewayFailure|undefined{
 if(result.termination!=='API_ERROR')return undefined;
 const step=result.steps.at(-1),error=object(step?.error);
 if(!step||error?.code!=='HTTP_ERROR'||error.statusCode!==402)return undefined;
 const assessment=object(step.deliberation?.error);
 return {code:'HTTP_ERROR',statusCode:402,step:step.number,stage:assessment?.code==='HTTP_ERROR'&&assessment.statusCode===402?'assessment':'action'};
}
/** Uses the ordinary wrapper; never resends old inputs, changes prior ledgers, or adds an API stage. */
export async function runDeferralReasonExperiment(options:Options){
 validateReasonExperimentOptions(options);
 const comparison=options.comparison??'deferral-reason';
 const {phase,ledgerPhase,modes,fullSchedule,schedule,limits,inputComponents}=reasonComparisonPlan(comparison,options.limit??12);
 const root=resolve(options.out);await mkdir(dirname(root),{recursive:true});await mkdir(root);
 const code=await sourceIdentity(),prior=await snapshotReasonPriorLedgers(comparison);
 const started=Date.now(),deadlineEpochMs=started+20*60*1000;
 const manifest={schemaVersion:1,phase,...(comparison!=='deferral-reason'?{comparison}:{}),...code,mock:options.mock,performanceEvidence:!options.mock,model:options.mock?'MOCK_SCRIPTED_DONE':'jev-1.14.0',modes,fullSchedule,schedule,limits,fixedPolicy:{capacity:8,weight:0.01,minAlternativeProbability:0.01},inputComponents,humanInputsRead:false,oldSourceInputsReplayed:false,startedAtUTC:new Date(started).toISOString(),deadlineEpochMs,priorLedgers:prior,budgetLedgers:[] as {id:string;path:string;used:number}[],requestAccounting:{used:0,maximum:schedule.length*24,source:options.mock?'mock-zero':'fresh-trial-ledgers-including-incomplete'},records:[] as (ReasonSlot&{dir:string;resultPath:string;initialImageSha256:string;requests:number;replayPath:string})[],status:'RUNNING'};
 const save=()=>writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await save();
 const records:RunRecord[]=[];
 try{
  for(const slot of schedule){
   if(Date.now()>=deadlineEpochMs){manifest.status='PHASE_TIME_LIMIT';break;}
   const current=await sourceIdentity();if(current.sourceHash!==code.sourceHash||current.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const fixture:HoldoutFixture|undefined=slot.scenario==='notifications'?undefined:{task:'revisit',variant:slot.scenario==='revisit-alpha'?'alpha':'beta'};
   const dir=join(root,slot.id),ledger=join(root,slot.id+'-budget.json');
   if(!options.mock){
    await writeFile(ledger,JSON.stringify({schemaVersion:1,status:'APPROVED',phase:ledgerPhase+'-'+slot.id,newMaximum:24,perRunMaximum:12,used:0,attempts:[]},null,2)+'\n',{flag:'wx'});
    manifest.budgetLedgers.push({id:slot.id,path:slot.id+'-budget.json',used:0});await save();
   }
   const saved=await runHumanJev({out:dir,mock:options.mock,mode:modes[slot.condition],longContext:true,...(fixture?{holdoutFixture:fixture}:{}),runId:slot.id,deadlineEpochMs,...(!options.mock?{phaseBudget:ledger,envFile:options.envFile}:{})});
   if(saved.result.code?.sourceHash!==code.sourceHash||saved.result.code.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const after=await sourceIdentity();if(after.sourceHash!==code.sourceHash||after.revision!==code.revision)throw new Error('SOURCE_CHANGED_DURING_BATCH');
   const initialImageSha256=sha(await readFile(join(dir,'initial-product.png'))),trialManifest=await json(join(dir,'manifest.json'));
   const requests=options.mock?0:trialManifest.actualAPIRequests;
   if(!Number.isInteger(requests)||requests<0||requests>24)throw new Error('TRIAL_REQUEST_ACCOUNTING_INVALID');
   records.push({...slot,initialImageSha256,result:saved.result});
   manifest.records.push({...slot,dir:slot.id,resultPath:slot.id+'/exploration/result.json',initialImageSha256,requests,replayPath:slot.id+'/offline-replay.json'});
   await save();
   const replay=await replayDirectory(join(dir,'exploration'));await writeFile(join(dir,'offline-replay.json'),JSON.stringify(replay,null,2)+'\n');
   const summary=analyzeReasonRuns(records,comparison);await writeFile(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
   if(summary.pairs.some(pair=>pair.status==='paired'&&!pair.consistent))throw new Error('PAIRED_INITIAL_OR_CONFIG_INTEGRITY_FAILED');
   const total=sum(manifest.records.map(r=>r.requests));if(total>manifest.limits.maxRequests)throw new Error('BATCH_REQUEST_ACCOUNTING_EXCEEDED');
   const gatewayFailure=blockingGatewayFailure(saved.result);
   if(gatewayFailure){manifest.status='GATEWAY_HTTP_402';Object.assign(manifest,{gatewayFailure:{...gatewayFailure,runId:slot.id,resultPath:slot.id+'/exploration/result.json'}});await save();}
   console.log(JSON.stringify({slot:manifest.records.length,total:schedule.length,id:slot.id,requests,totalRequests:total,objective:saved.result.objectiveAssessment.value,termination:saved.result.termination,uiActions:saved.result.uiActions,decisions:saved.result.decisions}));
   if(gatewayFailure)break;
  }
  if(manifest.status==='RUNNING')manifest.status=manifest.records.length===schedule.length?'COMPLETED':'INCOMPLETE';
 }catch(error){manifest.status='BATCH_ERROR';throw error;}
 finally{
  let accountingValid=true;
  for(const item of manifest.budgetLedgers){const ledger=await json(join(root,item.path));item.used=ledger.used;if(!Number.isInteger(item.used)||item.used<0||item.used>24)accountingValid=false;}
  manifest.requestAccounting.used=sum(manifest.budgetLedgers.map(item=>item.used));
  if(manifest.requestAccounting.used>manifest.limits.maxRequests)accountingValid=false;
  const checks=await Promise.all(prior.map(async item=>{try{return {...item,unchanged:sha(await readFile(item.path))===item.sha256};}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {...item,unchanged:false};throw error;}}));
  const unchanged=checks.every(c=>c.unchanged);await writeFile(join(root,'prior-ledger-check.json'),JSON.stringify({unchanged,checked:checks.length,ledgers:checks},null,2)+'\n');await save();if(!unchanged)throw new Error('PRIOR_LEDGER_CHANGED');if(!accountingValid)throw new Error('BATCH_REQUEST_ACCOUNTING_INVALID');
 }
 return {root,status:manifest.status,trials:records.length,requests:manifest.requestAccounting.used};
}
async function main(){
 const args=process.argv.slice(2),options:Options={out:'',mock:false};
 for(let i=0;i<args.length;i++){const key=args[i];if(key==='--mock'){options.mock=true;continue;}if(!['--out','--env-file','--limit','--comparison'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error('INVALID_OPTION');const value=args[++i];if(key==='--out')options.out=value;if(key==='--env-file')options.envFile=value;if(key==='--limit')options.limit=Number(value);if(key==='--comparison')options.comparison=value as ReasonComparison;}
 console.log(JSON.stringify(await runDeferralReasonExperiment(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
