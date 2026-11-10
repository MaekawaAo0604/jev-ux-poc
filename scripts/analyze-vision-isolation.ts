import {readFile,writeFile,mkdir,realpath,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual as eq} from 'node:util';
import {sha,type BetaResult,type BetaStep} from '../runner/virtual-beta-core.js';
import {parseControlledComparisonPlan,scheduleControlledComparison} from '../runner/controlled-comparison-plan.js';
import {auditControlledTrialArtifacts,classifyControlledTrial} from '../runner/controlled-comparison.js';
import {sourceIdentity} from '../runner/virtual-beta-source.js';
import {reconstructReplayCandidates} from '../runner/virtual-beta-replay-candidates.js';
import {createSampler} from '../jev/virtual-beta/selection.js';
import {parsePersona,parseCharter,publicExploration} from '../jev/persona.js';

const studyPath='experiments/virtual-beta/vision-isolation-v1/study.json';
const allowedPostExecutionChanges:string[]=[];
const contained=(root:string,path:string)=>{const p=relative(root,path);return p===''||p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p);};
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const validCount=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
const sumKnown=(values:(number|null)[])=>values.every(v=>v!==null)?values.reduce<number>((s,v)=>s+v!,0):null;
const costKnown=(values:(number|null)[])=>values.length>0?sumKnown(values):null;
const uniq=(values:string[])=>[...new Set(values)];
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function safeFile(root:string,file:string){const absolute=resolve(root,file),canonical=await realpath(absolute);if(!contained(root,absolute)||!contained(root,canonical))throw Error('PATH_ESCAPE');return canonical;}
function differences(a:any,b:any,path=''):string[]{
 if(eq(a,b))return [];
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)||Array.isArray(b))return [path];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().flatMap(key=>differences(a[key],b[key],path?path+'.'+key:key));
}
function mapping(step:any){
 const criteria=step?.questions?.nextAction?.criteria;if(!criteria)return null;
 return Object.keys(criteria).sort().map(id=>({id,label:criteria[id],control:/^e\d+$/.test(id)?(step.audit?.screen?.elements??[]).filter((e:any)=>e.id===id).map((e:any)=>({type:e.type,text:e.text})):id}));
}
const tv=(a:Record<string,number>|undefined,b:Record<string,number>|undefined,keys:string[])=>a&&b&&keys.length&&keys.every(k=>Number.isFinite(a[k])&&a[k]>=0&&Number.isFinite(b[k])&&b[k]>=0)?keys.reduce((s,k)=>s+Math.abs(a[k]-b[k]),0)/2:null;
/** No direct distribution distance crosses a changed candidate mapping. */
export function compareDecisionDistributions(a:any,b:any){
 const ma=mapping(a),mb=mapping(b),keys=ma?.map(x=>x.id)??[],comparable=ma!==null&&mb!==null&&eq(ma,mb);
 const common=(ma??[]).filter(x=>(mb??[]).some(y=>eq(x,y))).map(x=>x.id),pa=a?.selection?.normalized??a?.response?.answers?.nextAction?.probabilities,pb=b?.selection?.normalized??b?.response?.answers?.nextAction?.probabilities;
 const massA=pa&&common.every(k=>Number.isFinite(pa[k])&&pa[k]>=0)?common.reduce((s,k)=>s+pa[k],0):null,massB=pb&&common.every(k=>Number.isFinite(pb[k])&&pb[k]>=0)?common.reduce((s,k)=>s+pb[k],0):null;
 const conditionalA=massA&&pa?Object.fromEntries(common.map(k=>[k,pa[k]/massA])):undefined,conditionalB=massB&&pb?Object.fromEntries(common.map(k=>[k,pb[k]/massB])):undefined;
 return {comparable,reason:comparable?null:'CANDIDATE_MAPPING_DIFFERS',candidateKeys:keys,totalVariation:comparable?tv(pa,pb,keys):null,rawTotalVariation:comparable?tv(a?.selection?.raw,b?.selection?.raw,keys):null,filteredTotalVariation:comparable?tv(a?.selection?.filtered,b?.selection?.filtered,keys):null,commonProjection:{label:'conditional distribution on explicitly shared candidate semantics; excludes nonshared probability mass',candidateKeys:common,massA,massB,totalVariation:tv(conditionalA,conditionalB,common)}};
}
const goalText='\u30e1\u30fc\u30eb\u901a\u77e5\u3092\u505c\u6b62\u3059\u308b';
const encloses=(outer:any,inner:any)=>!!outer&&!!inner&&[outer.x,outer.y,outer.width,outer.height,inner.x,inner.y,inner.width,inner.height].every(Number.isFinite)&&inner.width>0&&inner.height>0&&inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;
/** Offline fixture facts. These labels are never model inputs and measure no internal recognition. */
export function visionBoundaryFacts(result:BetaResult){
 const rawSeen=new Map<string,number>(),semanticSeen=new Map<string,number>(),rawUISeen=new Map<string,number>(),semanticUISeen=new Map<string,number>();
 let priorObjectiveObserved:boolean|null=null,lastRecordedObjective:boolean|null=null;
 return result.steps.map((step,index)=>{
  const elements=step.audit?.screen?.elements, matches=elements?.filter(e=>e.type==='button'&&e.text.trim()===goalText),ambiguous=!matches||matches.length>1;
  const control=matches?.length===1?matches[0]:null,target=control?step.audit?.targets?.find(t=>t.id===control.id):null;
  const criteria=step.questions?.nextAction?.criteria,offered=ambiguous?null:control&&criteria?Object.hasOwn(criteria,control.id):control?null:false;
  const selected=step.selection?.selected??null,actual=step.action?.type==='click'?elements?.find(e=>e.id===(step.action as any).elementId):null;
  const performed=step.outcome==='UI_PERFORMED',selectedGoal=!!control&&selected===control.id,actualGoal=!!control&&step.action?.type==='click'&&step.action.elementId===control.id;
  const boundary=ambiguous?'ambiguous':!control?'missing-audit-target':offered===null?'ambiguous':!offered?'audited-not-offered':!selected?'ambiguous':!selectedGoal?'offered-not-selected':!step.action?'selected-not-executed':actualGoal&&performed?'selected-performed':step.outcome==='ACTION_ERROR'||(step.error as any)?.code==='ACTION_ERROR'?'selected-execution-failed':'selected-result-unverified';
  const fullSharp=control&&target&&step.vision?encloses(step.vision.clearRect,target)&&(!target.badge||encloses(step.vision.clearRect,target.badge)):null;
  const delivered=(step.modelInput as any)?.memoryObservations,priorGoalControlPresentations:any[]=[];
  if(Array.isArray(delivered))for(const ref of delivered){
   if(!ref||typeof ref.observationId!=='string'||typeof ref.image!=='string'||typeof ref.imageSha256!=='string')continue;
   const sources=result.steps.slice(0,index).filter(s=>s.observationId===ref.observationId&&s.assetFiles?.current?.sha256===ref.imageSha256),asset=step.assetFiles?.[ref.image];
   if(sources.length!==1||!asset||asset.sha256!==ref.imageSha256)continue;
   const source=sources[0],goals=source.audit?.screen.elements.filter(e=>e.type==='button'&&e.text.trim()===goalText);
   if(goals?.length!==1||!source.questions?.nextAction?.criteria||!Object.hasOwn(source.questions.nextAction.criteria,goals[0].id))continue;
   priorGoalControlPresentations.push({observationId:ref.observationId,image:ref.image,imageSha256:ref.imageSha256,asset:{...asset},sourceDecision:source.number,offeredControlId:goals[0].id});
  }
  const semantics=elements?JSON.stringify({title:step.audit!.screen.title,elements:elements.map(e=>({type:e.type,text:e.text}))}):null,rawKey=semantics&&step.audit?.sourceSha256?JSON.stringify([step.audit.sourceSha256,semantics]):null;
  const occurrence=(seen:Map<string,number>,key:string|null)=>{if(!key)return null;const n=(seen.get(key)??0)+1;seen.set(key,n);return n;};
  const uiSignature=performed&&step.action&&['click','scroll','back'].includes(step.action.type)?JSON.stringify({screen:step.audit?.screen?.title??null,type:step.action.type,control:actual?{type:actual.type,text:actual.text}:null,direction:(step.action as any).direction??null}):null;
  const rawUISignature=uiSignature&&step.audit?.sourceSha256?JSON.stringify([step.audit.sourceSha256,uiSignature]):null;
  const next=result.steps[index+1],prev=result.steps[index-1],offeredClicks=(s:BetaStep|undefined)=>Object.keys(s?.questions?.nextAction?.criteria??{}).filter(id=>/^e\d+$/.test(id));
  const lookPair=step.action?.type==='look'?{nextDecision:next?.number??null,requestedFixation:step.action.point,uiOperationCount:step.counts&&(!prev||prev.counts)?step.counts.uiActions-(prev?.counts?.uiActions??0):null,nextFixationMatches:next?.vision?eq(next.vision.fixation,step.action.point):null,rawSourceUnchanged:step.audit?.sourceSha256&&next?.audit?.sourceSha256?step.audit.sourceSha256===next.audit.sourceSha256:null,newlyEligibleIds:next?.questions?offeredClicks(next).filter(id=>!offeredClicks(step).includes(id)):null}:null;
  const facts={decision:step.number,observationId:step.observationId??null,url:step.audit?.url??null,screen:step.audit?.screen?.title??null,boundary,priorObjectiveObserved,everGoalObserved:priorObjectiveObserved===true,lastRecordedObjective,recordedObjectiveAfterDecision:step.objectiveSuccess??null,goal:{identity:'offline exact trimmed button text',matchingControlIds:matches?.map(e=>e.id)??null,controlId:control?.id??null,presentInAudit:matches?matches.length>0:null,bodyAndBadgeFullySharp:fullSharp,geometry:target??null,offered},modelProposal:step.response?.answers?.nextAction?.choice??null,selected,actualAction:step.action??null,actualControl:actual?{id:actual.id,type:actual.type,text:actual.text,geometry:step.audit?.targets?.find(t=>t.id===actual.id)??null}:null,outcome:step.outcome??null,error:step.error??null,reasonEvidence:step.reasonEvidence??null,reasonResponse:step.response?.answers?.decisionBasis??null,responseDistribution:step.response?.answers?.nextAction?.probabilities??null,rawDistribution:step.selection?.raw??null,normalizedDistribution:step.selection?.normalized??null,filteredDistribution:step.selection?.filtered??null,priorGoalControlPresentations,rawScreenshot:step.audit?.rawScreenshot??null,rawSourceSha256:step.audit?.sourceSha256??null,preparedImage:step.assetFiles?.current??null,inputSha256:step.inputSha256??null,semanticControlSignature:semantics,rawScreenControlOccurrence:occurrence(rawSeen,rawKey),semanticControlOccurrence:occurrence(semanticSeen,semantics),rawScreenSelectedUIOccurrence:occurrence(rawUISeen,rawUISignature),semanticSelectedUIOccurrence:occurrence(semanticUISeen,uiSignature),lookPair};
  if(typeof step.objectiveSuccess==='boolean'){lastRecordedObjective=step.objectiveSuccess;if(priorObjectiveObserved!==true)priorObjectiveObserved=step.objectiveSuccess;}
  return facts;
 });
}
function auditStaticStudy(study:any,plans:any[]){
 if(study.id!=='vision-isolation-v1'||!eq(study.seeds,[4001,4002,4003])||!eq(study.visionModes,['full','crop','foveated'])||!eq(study.memoryCapacities,[0,3])||study.maxPhaseMs!==2700000||study.batchDurationMs!==600000||study.parallel!==1||study.retry!==0||plans.length!==6)throw Error('STUDY_PROTOCOL_MISMATCH');
 const expected={schemaVersion:1,id:'full-m0',vision:{mode:'full',clearWidth:960,clearHeight:620,blurRadius:12},state:{enabled:true,memoryCapacity:0},selection:{mode:'argmax',seed:20261027},behavior:'goal',maxUIActions:6,maxLooks:4,maxDecisions:10,maxAPICalls:12,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:true,reread:false,wait:false,abandon:false}}};
 const combinations=new Set<string>();
 for(const [i,p]of plans.entries()){
  const b=study.batches[i];if(b.group!=='vision-isolation'||![0,3].includes(b.memoryCapacity)||![4001,4002,4003].includes(b.seed)||p.id!==b.id||!eq(p.seeds,[b.seed])||p.maxTotalAPI!==36||p.maxDurationMs!==600000||b.allocatedAPIRequests!==36||b.plannedTrials!==3||p.configs.length!==3)throw Error('BATCH_PROTOCOL_MISMATCH');
  combinations.add(b.memoryCapacity+':'+b.seed);
  const order=['full','crop','foveated'],shift=b.seed-4001;for(const[c,cfg]of p.configs.entries()){const mode=order[(c+shift)%3],want=structuredClone(expected);want.id=mode+'-m'+b.memoryCapacity;want.vision.mode=mode;want.state.memoryCapacity=b.memoryCapacity;if(!eq(cfg,want))throw Error('ONE_AXIS_CONFIG_MISMATCH');}
 }
 if(combinations.size!==6)throw Error('BATCH_PROTOCOL_MISMATCH');
}
function auditVisionInitialPair(base:BetaResult,variant:BetaResult,mechanism:string){
 const a=base.steps[0],b=variant.steps[0];if(!a?.modelInput||!b?.modelInput||!a.questions||!b.questions||!a.audit?.sourceSha256||!b.audit?.sourceSha256)return {status:'unavailable',pixelMatch:null,differences:[],unintended:[],candidateMappingComparable:false};
 const allowed=['config.id','config.maxRunMs',...(mechanism==='vision.mode'?['config.vision.mode','input.observation.width','input.observation.height','input.observation.clearRect','input.observation.transform','input.observation.candidateIds','input.userState.lastObservation.imageSha256','input.userState.lastObservation.candidateIds','assets.current.sha256','questions.nextAction.criteria']:['config.state.memoryCapacity','input.userState.memory','input.memoryObservations'])];
 const project=(step:BetaStep)=>{const input=structuredClone(step.modelInput) as any;if(mechanism==='vision.mode'){for(const memory of input?.userState?.memory??[])memory.imageSha256='VISION_IMAGE';for(const ref of input?.memoryObservations??[])ref.imageSha256='VISION_IMAGE';}return input;};
 const diff=differences({config:base.config,input:project(a),questions:a.questions,assets:a.assetFiles},{config:variant.config,input:project(b),questions:b.questions,assets:b.assetFiles}),unintended=diff.filter(path=>!allowed.some(root=>path===root||path.startsWith(root+'.'))),pixelMatch=a.audit.sourceSha256===b.audit.sourceSha256;
 if(!pixelMatch)unintended.push('initial.rawPixels');return {status:unintended.length?'unintended-difference':'verified',pixelMatch,differences:diff,unintended,candidateMappingComparable:eq(mapping(a),mapping(b))};
}

export type StudyTrial={batchId:string;group:string;cap:number;memoryCapacity:number;visionMode:string;seed:number;condition:string;runId:string;status:'pending'|'missing'|'invalid'|'completed'|'censored';observedStatus:string|null;attempted:boolean;admitted:boolean;errors:string[];actualAPIRequests:number|null;reservedAPIRequests:number|null;simulatedAPIRequests:number|null;costUSD:number|null;modelWaitingMs:number|null;modeledUserMs:number|null;humanTaskMs:null;domainCollectionCostUSD:null;termination:string|null;objectiveSuccess:boolean|null;perceivedDone:boolean|null;rawSha256:string|null;resultPath:string|null;path:any[];repeatedUIActions:number;filteredDistributionChanges:number;initial:any};
function pathFor(result:BetaResult){
 const seen=new Map<string,number>();let repeated=0,changed=0,looks=0;
 const path=result.steps.map(step=>{
  const control=step.action?.type==='click'?step.audit?.screen.elements.find(e=>e.id===(step.action as any).elementId):undefined;
  const ui=!!step.action&&['click','scroll','back'].includes(step.action.type),signature=ui?JSON.stringify({screen:step.audit?.screen.title,type:step.action!.type,control:control?{type:control.type,text:control.text}:null,direction:(step.action as any).direction??null}):null;
  const occurrence=signature?(seen.get(signature)??0)+1:null;if(signature){seen.set(signature,occurrence!);if(occurrence!>1)repeated++;}
  const filteredChanged=step.selection?!eq(step.selection.normalized,step.selection.filtered):null;if(filteredChanged)changed++;
  let savedStateArgmax:any=null;
  if(step.selection?.mode==='sample'){
   const scope='Mathematical argmax of the retained distribution at this saved state; not a full-path or human counterfactual.';
   try{const candidates=reconstructReplayCandidates(step.audit!.screen,Object.keys(step.questions!.nextAction.criteria)),excluded:Record<string,string>={};for(const [id,c]of Object.entries(candidates))if(c.action.type==='look'&&looks>=result.config.maxLooks)excluded[id]='LOOK_BUDGET_EXHAUSTED';const answer=step.response!.answers.nextAction,selected=createSampler({mode:'argmax',seed:result.config.selection.seed}).select(answer.choice,answer.probabilities,candidates,excluded).selected;savedStateArgmax={status:'computed',scope,candidate:selected,action:candidates[selected].action,differsFromActualSelection:selected!==step.selection.selected};}catch{savedStateArgmax={status:'unavailable',scope,candidate:null,action:null,differsFromActualSelection:null};}
  }
  if(step.action?.type==='look'&&step.outcome==='FIXATION_MOVED')looks++;
  return {decision:step.number,observationId:step.observationId??null,url:step.audit?.url??null,screen:step.audit?.screen.title??null,modelProposal:step.response?.answers?.nextAction?.choice??null,sampledSelection:step.selection?.selected??null,actualAction:step.action??null,actualControlText:control?.text??null,outcome:step.outcome??null,reason:step.reasonEvidence??null,error:step.error??null,offered:mapping(step),responseDistribution:step.response?.answers?.nextAction?.probabilities??null,raw:step.selection?.raw??null,normalized:step.selection?.normalized??null,filtered:step.selection?.filtered??null,sampler:step.selection?{mode:step.selection.mode,seed:step.selection.seed,drawIndex:step.selection.drawIndex,draw:step.selection.draw}:null,adjustments:step.selection?.adjustments??null,filteredChanged,savedStateArgmax,uiActionOccurrence:occurrence,timing:step.timing??null};
 });return {path,repeatedUIActions:repeated,filteredDistributionChanges:changed};
}

export async function analyzeVisionIsolation(options:{phase:string;out?:string}){
 const phaseFile=resolve(options.phase),phaseBytes=await readFile(phaseFile),phase=JSON.parse(phaseBytes.toString()),studyBytes=await readFile(studyPath),study=JSON.parse(studyBytes.toString()),inputHashes=phase.inputHashes??phase.inputs;
 if((typeof phase.status!=='string'||!/^[A-Z][A-Z0-9_]*$/.test(phase.status))||phase.schemaVersion!==1||resolve(phase.study??'')!==resolve(studyPath)||phase.studySha256!==sha(studyBytes)||!phase.source||typeof phase.source.revision!=='string'||!/^[a-f0-9]{64}$/.test(phase.source.sourceHash??'')||typeof phase.mock!=='boolean'||!Array.isArray(phase.batches)||phase.batches.length!==study.batches.length)throw Error('INVALID_PHASE_BINDING');
 const inputPaths=[studyPath,study.charter,study.persona,...study.batches.map((b:any)=>b.plan)];
 if(!inputHashes||!eq(Object.keys(inputHashes).sort(),inputPaths.slice().sort()))throw Error('INPUT_HASH_SET_MISMATCH');
 for(const file of inputPaths)if(inputHashes[file]!==sha(await readFile(file)))throw Error('FROZEN_INPUT_HASH_MISMATCH');
 const plans=await Promise.all(study.batches.map(async(b:any)=>parseControlledComparisonPlan(await json(b.plan)))),schedules=plans.map(scheduleControlledComparison);
 if(study.plannedTrials!==18||study.allocatedAPIRequests!==216||schedules.reduce((s,a)=>s+a.length,0)!==18||plans.reduce((s,p)=>s+p.allocatedAPIRequests,0)!==216)throw Error('STUDY_ALLOCATION_MISMATCH');
 auditStaticStudy(study,plans);
 const persona=parsePersona(await json(study.persona)),charter=parseCharter(await json(study.charter)),expectedInput=publicExploration({persona,charter:{...charter,id:'notification-task',targetWebsite:'local:good'}});expectedInput.charter.targetWebsite='local:demo';
 const reportRoot=await realpath(resolve('reports')),phaseRoot=await realpath(dirname(phaseFile)),producerFile=fileURLToPath(import.meta.url),producerSource=await sourceIdentity();
 const observedPostExecutionChanges=new Set<string>();
 const errors:{code:string;batchId?:string;runId?:string}[]=[],trials:StudyTrial[]=[],results=new Map<string,BetaResult>(),batchEvidence:any[]=[];
 const issue=(code:string,batchId?:string,runId?:string)=>errors.push({code,...(batchId?{batchId}:{}),...(runId?{runId}:{})});
 for(const [index,descriptor] of study.batches.entries()){
  const snapshot=phase.batches[index],plan=plans[index],schedule=schedules[index];
  if(!snapshot||!eq(Object.fromEntries(Object.keys(descriptor).map(k=>[k,snapshot[k]])),descriptor)||!['PENDING','RUNNING','COMPLETED','STOPPED'].includes(snapshot.status))throw Error('BATCH_PLAN_BINDING_MISMATCH');
  const rows:StudyTrial[]=schedule.map(slot=>({batchId:descriptor.id,group:descriptor.group,cap:slot.config.maxAPICalls,memoryCapacity:descriptor.memoryCapacity,visionMode:slot.config.vision.mode,seed:slot.seed,condition:slot.condition,runId:slot.runId,status:(snapshot.status==='PENDING'||snapshot.status==='RUNNING')&&phase.status==='RUNNING'?'pending':'missing',observedStatus:null,attempted:false,admitted:false,errors:[],actualAPIRequests:snapshot.status==='RUNNING'?null:0,reservedAPIRequests:snapshot.status==='RUNNING'?null:0,simulatedAPIRequests:snapshot.status==='RUNNING'?null:0,costUSD:null,modelWaitingMs:null,modeledUserMs:null,humanTaskMs:null,domainCollectionCostUSD:null,termination:null,objectiveSuccess:null,perceivedDone:null,rawSha256:null,resultPath:null,path:[],repeatedUIActions:0,filteredDistributionChanges:0,initial:null}));
  trials.push(...rows);
  if(['PENDING','RUNNING'].includes(snapshot.status)){batchEvidence.push({id:descriptor.id,status:snapshot.status,read:false});continue;}
  const batchErrors:string[]=[],batchInputHashes:Record<string,string>={};let manifest:any,checkpoint:any,summary:any,batchRoot:string;
  try{
   batchRoot=await realpath(resolve(snapshot.outDir));if(!contained(reportRoot,batchRoot))throw Error('BATCH_PATH_ESCAPE');
   for(const name of ['manifest.json','checkpoint.json','comparison.json'])batchInputHashes[name]=sha(await readFile(await safeFile(batchRoot,name)));manifest=await json(await safeFile(batchRoot,'manifest.json'));checkpoint=await json(await safeFile(batchRoot,'checkpoint.json'));summary=await json(await safeFile(batchRoot,'comparison.json'));
   if(manifest.sourceHash!==phase.source.sourceHash||manifest.revision!==phase.source.revision)batchErrors.push('SOURCE_BINDING_MISMATCH');
   if(!manifest.sourceHashes||sha(JSON.stringify(manifest.sourceHashes))!==manifest.sourceHash)batchErrors.push('EXECUTION_SOURCE_MAP_MISMATCH');
   else{
    const changed=[...new Set([...Object.keys(manifest.sourceHashes),...Object.keys(producerSource.sourceHashes)])].filter(file=>manifest.sourceHashes[file]!==producerSource.sourceHashes[file]);for(const file of changed)observedPostExecutionChanges.add(file);
    if(changed.some(file=>!allowedPostExecutionChanges.includes(file)))batchErrors.push('REPLAY_IMPLEMENTATION_SOURCE_MISMATCH');
   }
   if(snapshot.summarySha256!==undefined&&snapshot.summarySha256!==sha(await readFile(await safeFile(batchRoot,'comparison.json'))))batchErrors.push('BATCH_SNAPSHOT_HASH_MISMATCH');
   if(!eq(manifest.plan,plan)||manifest.planHash!==sha(JSON.stringify(plan))||summary.planHash!==manifest.planHash||checkpoint.planHash!==manifest.planHash||!eq(manifest.schedule,schedule.map(t=>({...t,id:t.runId}))))batchErrors.push('PLAN_BINDING_MISMATCH');
   if(manifest.mock!==phase.mock||summary.mock!==phase.mock||!eq(manifest.persona,persona)||!eq(manifest.charter,charter))batchErrors.push('SHARED_INPUT_BINDING_MISMATCH');
   if(!Array.isArray(manifest.records)||!Array.isArray(checkpoint.trials)||!Array.isArray(checkpoint.requests)||checkpoint.requests.some((r:any)=>!r||typeof r!=='object')||checkpoint.trials.some((r:any)=>!r||typeof r!=='object'))throw Error('BATCH_RECORD_BINDING_MISMATCH');
   if(!eq(checkpoint.trials,summary.trials)||!eq(checkpoint.requests,summary.requests)||checkpoint.trials.length!==schedule.length||new Set(manifest.records.map((r:any)=>r.runId)).size!==manifest.records.length||manifest.records.some((r:any)=>!schedule.some(s=>s.runId===r.runId)))batchErrors.push('BATCH_RECORD_BINDING_MISMATCH');
  }catch{for(const row of rows){row.errors.push('BATCH_ARTIFACT_UNAVAILABLE');issue('BATCH_ARTIFACT_UNAVAILABLE',row.batchId,row.runId);}batchEvidence.push({id:descriptor.id,status:snapshot.status,read:true,errors:['BATCH_ARTIFACT_UNAVAILABLE']});continue;}
  const requests:any[]=checkpoint.requests??[];
  if(requests.some((r:any,i:number)=>r.ordinal!==i+1||!schedule.some(t=>t.runId===r.runId)||!['reserved','in-flight','ok','error','not-dispatched'].includes(r.status)||r.actualAPIRequests!==null&&(!validCount(r.actualAPIRequests)||r.actualAPIRequests>1)||!validCount(r.simulatedAPIRequests)||r.simulatedAPIRequests>1||phase.mock&&r.actualAPIRequests!==0))batchErrors.push('REQUEST_ACCOUNTING_MISMATCH');
  if(requests.some(r=>r.costUSD!==null&&(typeof r.costUSD!=='number'||!Number.isFinite(r.costUSD)||r.costUSD<0)||typeof r.apiMs!=='number'||!Number.isFinite(r.apiMs)||r.apiMs<0))batchErrors.push('COST_TIME_ACCOUNTING_MISMATCH');
  const reservationIds=requests.filter(r=>r.reservationId!==null).map(r=>r.reservationId);
  if(new Set(reservationIds).size!==reservationIds.length)batchErrors.push('REQUEST_ACCOUNTING_MISMATCH');
  if(!phase.mock){
   try{
    const ledgerFile=await safeFile(phaseRoot,snapshot.ledger),ledger=await json(ledgerFile),before=manifest.phaseBudget?.before;
    batchInputHashes['ledger']=sha(await readFile(ledgerFile));if(resolve(manifest.phaseBudget?.file??'')!==ledgerFile||ledger.schemaVersion!==1||ledger.status!=='APPROVED'||!validCount(ledger.newMaximum)||ledger.newMaximum<1||ledger.newMaximum>36||!validCount(ledger.perRunMaximum)||ledger.perRunMaximum<1||ledger.perRunMaximum>12||!Array.isArray(ledger.attempts)||ledger.used!==ledger.attempts.length||ledger.used>ledger.newMaximum||!before||ledger.used-before.used!==reservationIds.length||!eq(ledger.attempts.slice(0,before.used),before.attempts))throw Error('LEDGER_ACCOUNTING_MISMATCH');
    for(const [i,entry] of ledger.attempts.entries()){
     if(entry.ordinal!==i+1||!['RESERVED','OK','ERROR'].includes(entry.status))throw Error('LEDGER_ACCOUNTING_MISMATCH');
     if(i<before.used)continue;
     const r=requests.find(r=>r.reservationId===entry.id),slot=schedule.find(t=>t.runId===r?.runId);
     if(!r||!slot||entry.runKey!==batchRoot+'/'+r.runId||entry.condition!==slot.condition||entry.revision!==phase.source.revision||entry.sourceHash!==phase.source.sourceHash||entry.status!==(r.status==='ok'?'OK':['error','not-dispatched'].includes(r.status)?'ERROR':'RESERVED')||r.actualAPIRequests!==null&&entry.status!=='RESERVED'&&entry.metadata?.attempts!==r.actualAPIRequests)throw Error('LEDGER_ACCOUNTING_MISMATCH');
    }
   }catch{batchErrors.push('LEDGER_ACCOUNTING_MISMATCH');}
  }else if(reservationIds.length||manifest.phaseBudget!==null)batchErrors.push('REQUEST_ACCOUNTING_MISMATCH');
  const actual=sumKnown(requests.map(r=>r.actualAPIRequests)),simulated=sumKnown(requests.map(r=>r.simulatedAPIRequests));
  if(summary.actualAPIRequests!==actual||summary.simulatedAPIRequests!==simulated||summary.reservedAPIRequests!==reservationIds.length||manifest.totalRequests!==actual||snapshot.actualAPIRequests!==undefined&&snapshot.actualAPIRequests!==actual||requests.length>plan.allocatedAPIRequests)batchErrors.push('REQUEST_ACCOUNTING_MISMATCH');
  for(const [slotIndex,row] of rows.entries()){
   const slot=schedule[slotIndex],saved=checkpoint.trials.find((r:any)=>r.runId===row.runId),record=manifest.records.find((r:any)=>r.runId===row.runId),entries=requests.filter(r=>r.runId===row.runId);
   row.errors.push(...batchErrors);row.observedStatus=saved?.status??null;row.attempted=!!record||saved?.statusHistory?.some((s:any)=>s.status==='attempted')===true;
   row.actualAPIRequests=sumKnown(entries.map(r=>r.actualAPIRequests));row.simulatedAPIRequests=sumKnown(entries.map(r=>r.simulatedAPIRequests));row.reservedAPIRequests=entries.filter(r=>r.reservationId!==null).length;row.costUSD=costKnown(entries.map(r=>typeof r.costUSD==='number'?r.costUSD:null));row.modelWaitingMs=entries.length?entries.reduce((s,r)=>s+(typeof r.apiMs==='number'?r.apiMs:0),0):null;
   if(!saved||!eq(saved.config,slot.config)||saved.seed!==slot.seed||saved.perTrialAPICap!==slot.config.maxAPICalls)row.errors.push('TRIAL_PLAN_BINDING_MISMATCH');
   if(saved&&(saved.actualAPIRequests!==row.actualAPIRequests||saved.simulatedAPIRequests!==row.simulatedAPIRequests||saved.reservedAPIRequests!==row.reservedAPIRequests)||row.reservedAPIRequests!>slot.config.maxAPICalls||row.simulatedAPIRequests!>slot.config.maxAPICalls||record&&record.requests!==(phase.mock?0:row.actualAPIRequests))row.errors.push('REQUEST_ACCOUNTING_MISMATCH');
   if(!record||saved?.status==='missing'){row.status='missing';row.errors=uniq(row.errors);for(const code of row.errors)issue(code,row.batchId,row.runId);continue;}
   if(!record.rawSha256||!['RESULT','FAILED'].includes(record.status)){row.status='invalid';row.errors.push('RESULT_NOT_RETAINED');for(const code of uniq(row.errors))issue(code,row.batchId,row.runId);continue;}
   try{
    const runRoot=await realpath(join(batchRoot!,row.runId)),expectedPath=join(runRoot,'result.json');if(runRoot!==resolve(batchRoot!,row.runId)||!contained(batchRoot!,runRoot)||resolve(record.dir)!==runRoot||resolve(record.resultPath)!==expectedPath)throw Error('RESULT_PATH_ESCAPE');
    const file=await safeFile(runRoot,'result.json'),bytes=await readFile(file),result=JSON.parse(bytes.toString()) as BetaResult;row.rawSha256=sha(bytes);row.resultPath=file;row.termination=result.termination;row.objectiveSuccess=result.objectiveSuccess;row.perceivedDone=result.perceivedDone;row.modeledUserMs=result.modeledUserMs;Object.assign(row,pathFor(result));row.path=visionBoundaryFacts(result);row.initial={rawPixelHash:result.steps[0]?.audit?.sourceSha256??null,inputImageHash:result.steps[0]?.assetFiles?.current?.sha256??null,candidates:mapping(result.steps[0]),questions:result.steps[0]?.questions??null,input:result.steps[0]?.modelInput??null};
    if(record.rawSha256!==row.rawSha256||saved.rawSha256!==row.rawSha256)row.errors.push('RAW_RESULT_HASH_MISMATCH');
    const runtime=saved.runtimeMaxRunMs,effective=structuredClone(slot.config);
    if(!Number.isSafeInteger(runtime)||runtime<1||runtime>slot.config.maxRunMs)row.errors.push('RUNTIME_CLAMP_INVALID');else effective.maxRunMs=runtime;
    if(!eq(result.config,effective)||record.runtimeConfigHash!==sha(JSON.stringify(effective))||saved.runtimeConfigHash!==record.runtimeConfigHash)row.errors.push('RESULT_CONFIG_MISMATCH');
    if(result.runId!==row.runId||result.condition!==row.condition||!eq(result.code,phase.source)||!eq(result.input,expectedInput))row.errors.push('RESULT_IDENTITY_MISMATCH');
    if(!eq(record.artifactHashes,saved.artifactHashes)||record.artifactHashes?.['result.json']!==row.rawSha256||!record.artifactHashes?.['trace.zip'])row.errors.push('ARTIFACT_HASH_SET_MISMATCH');
    for(const [name,hash] of Object.entries(record.artifactHashes??{})){if(name!==name.split(/[\\/]/).at(-1)||typeof hash!=='string'||sha(await readFile(await safeFile(runRoot,name)))!==hash)row.errors.push('ARTIFACT_HASH_MISMATCH');}
    let looks=0;const sampler=createSampler(effective.selection);
    for(const step of result.steps){
     if(!eq(await json(await safeFile(runRoot,'step-'+step.number+'.json')),step))row.errors.push('STEP_RECORD_MISMATCH');
     if(step.audit){if(step.audit.rawScreenshot!=='audit-'+step.number+'.png'||sha(await readFile(await safeFile(runRoot,step.audit.rawScreenshot)))!==step.audit.sourceSha256||step.vision&&step.vision.sourceSha256!==step.audit.sourceSha256)row.errors.push('RAW_IMAGE_SOURCE_MISMATCH');}
     if(step.modelInput&&step.questions&&step.assetFiles&&step.inputSha256!==sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles})))row.errors.push('INPUT_HASH_MISMATCH');
     if(step.modelInput&&(!eq((step.modelInput.exploration as any)?.persona,persona)||step.modelInput.goal!==charter.goal||(step.modelInput.exploration as any)?.charter?.goal!==charter.goal))row.errors.push('STEP_SHARED_INPUT_MISMATCH');
     if(step.selection){try{
      const candidates=reconstructReplayCandidates(step.audit!.screen,Object.keys(step.questions!.nextAction.criteria)),excluded:Record<string,string>={};
      for(const [id,candidate] of Object.entries(candidates))if(candidate.action.type==='look'&&looks>=effective.maxLooks)excluded[id]='LOOK_BUDGET_EXHAUSTED';
      const answer=step.response?.answers?.nextAction;if(!answer)throw Error('MODEL_RESPONSE_MISSING');
      const selection=sampler.select(answer.choice,answer.probabilities,candidates,excluded);
      if(!eq(selection,step.selection)||step.action&&!eq(candidates[selection.selected]?.action,step.action)||!step.action&&!['SELECTION_AFTER_DEADLINE','SAFETY_STOP'].includes(step.outcome??''))row.errors.push('SELECTION_ACTION_BINDING_MISMATCH');
     }catch{row.errors.push('SELECTION_ACTION_BINDING_MISMATCH');}}
     if(step.action?.type==='look'&&step.outcome==='FIXATION_MOVED')looks++;
    }
    if(!phase.mock){
     const traces=result.steps.filter(s=>s.response?.request||(s.error as any)?.request).map(s=>({trace:s.response?.request??(s.error as any).request,costUSD:s.response?.costUSD??null}));
     const dispatched=entries.filter(e=>['ok','error'].includes(e.status)&&e.actualAPIRequests!==0);
     if(traces.length!==dispatched.length||traces.some((t,i)=>t.trace.attempts!==dispatched[i]?.actualAPIRequests||t.costUSD!==(dispatched[i]?.costUSD??null)))row.errors.push('REQUEST_TRACE_ACCOUNTING_MISMATCH');
    }
    if(!validCount(result.apiCalls)||!validCount(result.looks)||result.looks>effective.maxLooks||!validCount(result.uiActions)||result.uiActions>effective.maxUIActions||result.decisions!==result.steps.length||result.decisions>effective.maxDecisions)row.errors.push('RESULT_COUNTER_MISMATCH');
    const invocations=entries.filter(r=>['ok','error','in-flight'].includes(r.status)).length;if(result.apiCalls!==invocations&&saved.status!=='invalid')row.errors.push('REQUEST_ACCOUNTING_MISMATCH');
    try{await auditControlledTrialArtifacts(runRoot,{runId:row.runId,condition:row.condition,config:effective,code:phase.source},result);}catch{row.errors.push('SAVED_REPLAY_FAILED');}
    const classification=classifyControlledTrial(result,{requestFailureCodes:entries.map(r=>r.failureCode).filter(Boolean)});
    row.status=classification.status;if(saved.status!==classification.status&&!record.error)row.errors.push('STATUS_BINDING_MISMATCH');
    if(record.error||saved.status==='invalid'){row.status='invalid';row.errors.push('OPERATIONAL_TRIAL_INVALID');}
    row.errors=uniq(row.errors);if(row.errors.length)row.status='invalid';row.admitted=row.status==='completed'||row.status==='censored';
    if(row.admitted)results.set(row.batchId+'/'+row.runId,result);
   }catch{row.status='invalid';row.errors.push('RESULT_ARTIFACT_UNAVAILABLE');}
   row.errors=uniq(row.errors);for(const code of row.errors)issue(code,row.batchId,row.runId);
  }
  batchEvidence.push({id:descriptor.id,status:snapshot.status,read:true,inputHashes:batchInputHashes,errors:uniq(batchErrors),actualAPIRequests:actual,reservedAPIRequests:reservationIds.length,simulatedAPIRequests:simulated,requestFailures:requests.filter(r=>r.status==='error').length,requests});
 }
 const counts=(rows:StudyTrial[])=>({planned:rows.length,attempted:rows.filter(r=>r.attempted).length,admitted:rows.filter(r=>r.admitted).length,completed:rows.filter(r=>r.status==='completed').length,censored:rows.filter(r=>r.status==='censored').length,invalid:rows.filter(r=>r.status==='invalid').length,missing:rows.filter(r=>r.status==='missing').length,pending:rows.filter(r=>r.status==='pending').length});
 const aggregate=(rows:StudyTrial[])=>({...counts(rows),actualAPIRequests:sumKnown(rows.map(r=>r.actualAPIRequests)),reservedAPIRequests:sumKnown(rows.map(r=>r.reservedAPIRequests)),simulatedAPIRequests:sumKnown(rows.map(r=>r.simulatedAPIRequests)),costUSD:costKnown(rows.filter(r=>r.attempted).map(r=>r.costUSD)),objectiveSuccesses:rows.filter(r=>r.admitted&&r.objectiveSuccess===true).length,subjectiveDone:rows.filter(r=>r.admitted&&r.perceivedDone===true).length,voluntaryAbandonment:rows.filter(r=>r.admitted&&r.termination==='ABANDONED').length,repeatedUIActions:rows.filter(r=>r.admitted).reduce((s,r)=>s+r.repeatedUIActions,0),filteredDistributionChanges:rows.filter(r=>r.admitted).reduce((s,r)=>s+r.filteredDistributionChanges,0)});
 const visionGroups=[0,3].flatMap(memoryCapacity=>['full','crop','foveated'].map(visionMode=>({memoryCapacity,visionMode,...aggregate(trials.filter(r=>r.memoryCapacity===memoryCapacity&&r.visionMode===visionMode))})));
 const allInitial=[...results.values()].map(r=>r.steps[0]?.audit?.sourceSha256).filter(Boolean);if(new Set(allInitial).size>1)issue('INITIAL_RAW_PIXELS_MISMATCH');
 const pair=(a:StudyTrial|undefined,b:StudyTrial|undefined,mechanism:string)=>{
  const ar=a&&results.get(a.batchId+'/'+a.runId),br=b&&results.get(b.batchId+'/'+b.runId),initialAudit=ar&&br?auditVisionInitialPair(ar,br,mechanism):{status:'unavailable',pixelMatch:null,differences:[],unintended:[],candidateMappingComparable:false};
  if(initialAudit.status==='unintended-difference')issue('UNINTENDED_INITIAL_DIFFERENCE',b?.batchId,b?.runId);
  const admitted=!!a?.admitted&&!!b?.admitted&&initialAudit.status==='verified';return {seed:a?.seed??b?.seed,base:a?{batchId:a.batchId,runId:a.runId,status:a.status}:null,variant:b?{batchId:b.batchId,runId:b.runId,status:b.status}:null,mechanism,admitted,initialAudit,firstDistribution:admitted?compareDecisionDistributions(ar!.steps[0],br!.steps[0]):null,outcomes:admitted?{base:{termination:a!.termination,objectiveSuccess:a!.objectiveSuccess,perceivedDone:a!.perceivedDone,path:a!.path},variant:{termination:b!.termination,objectiveSuccess:b!.objectiveSuccess,perceivedDone:b!.perceivedDone,path:b!.path}}:null};
 };
 const visionPairs=[4001,4002,4003].flatMap(seed=>[0,3].flatMap(memoryCapacity=>[['full','crop'],['full','foveated'],['crop','foveated']].map(([a,b])=>({memoryCapacity,...pair(trials.find(r=>r.seed===seed&&r.memoryCapacity===memoryCapacity&&r.visionMode===a),trials.find(r=>r.seed===seed&&r.memoryCapacity===memoryCapacity&&r.visionMode===b),'vision.mode')}))));
 const memoryPairs=[4001,4002,4003].flatMap(seed=>['full','crop','foveated'].map(visionMode=>({visionMode,...pair(trials.find(r=>r.seed===seed&&r.memoryCapacity===0&&r.visionMode===visionMode),trials.find(r=>r.seed===seed&&r.memoryCapacity===3&&r.visionMode===visionMode),'state.memoryCapacity')})));
 const accounting={...aggregate(trials),complete:trials.every(r=>r.status!=='pending')&&errors.every(e=>!e.code.includes('ACCOUNTING'))&&trials.every(r=>r.actualAPIRequests!==null),knownFinishedBatchRequests:sumKnown(batchEvidence.filter(b=>b.read&&b.actualAPIRequests!==undefined).map(b=>b.actualAPIRequests)),requestErrors:batchEvidence.filter(b=>b.read).reduce((s,b)=>s+(b.requestFailures??0),0),modelWaitingMs:trials.some(r=>r.attempted)?trials.reduce((s,r)=>s+(r.modelWaitingMs??0),0):null,modeledUserMs:trials.some(r=>r.attempted)?sumKnown(trials.filter(r=>r.attempted).map(r=>r.modeledUserMs)):null,humanTaskMs:null,domainCollectionCostUSD:null};
 const report={schemaVersion:1,kind:'vision-isolation-offline-analysis',generatedAt:new Date().toISOString(),phaseStatus:phase.status,mock:phase.mock,producer:{file:'scripts/analyze-vision-isolation.ts',sha256:sha(await readFile(producerFile)),replaySourceHash:producerSource.sourceHash,executionSourceHash:phase.source.sourceHash,allowedPostExecutionChanges,observedPostExecutionChanges:[...observedPostExecutionChanges].sort()},protocol:{phase:phaseFile,phaseSha256:sha(phaseBytes),study:studyPath,studySha256:sha(studyBytes),inputHashes,source:phase.source,driverSha256:phase.driverSha256??null,preservation:{priorFiles:phase.priorFiles??null,before:phase.preservationBefore??null,after:phase.preservationAfter??null}},limits:{plannedTrials:18,allocatedAPIRequests:216,perTrialMaximum:12,perBatchMaximum:36,globalPhaseMs:study.maxPhaseMs,parallel:1,retry:0},denominators:counts(trials),accounting,integrity:{errors,passed:errors.length===0,conclusionsAllowed:errors.length===0,initialPairAudits:visionPairs.concat(memoryPairs as any).map(p=>({seed:p.seed,base:p.base,variant:p.variant,mechanism:p.mechanism,...p.initialAudit}))},batchEvidence,trials,visionGroups,visionPairs,memoryPairs,interpretation:['Seed pairing controls the local sampler only; external model determinism is unavailable.','Vision positions are fully cyclic balanced within each memory capacity. Memory-block order alternates across three seed blocks and two positions, so that order is only partially balanced; no randomization was used.','Initial audits precede model action; later path differences include generated actions and changed observations.','Distribution distances require identical candidate semantics; common projections are conditional summaries with excluded mass shown.','Budget-censored, invalid, missing and pending trials retain separate denominators. No forced replacements.','Repeated UI actions count recorded action attempts with the same screen title, action type, control text/type and direction; they are not abnormality scores. No human fidelity or performance inference is established.','priorObjectiveObserved is historical evidence accumulated before this decision; true means goal success was recorded at least once. lastRecordedObjective is the latest recorded boolean and does not assert unobserved current state.','Screen/control observation repeats include look and are not repeated UI operations. Selected-UI occurrence fields count only recorded UI_PERFORMED click/scroll/back events.','Offline fixture identity, sharpness, candidate presentation and selected execution measure observable boundaries only; recognition, comprehension, attention and forgetting are not measured.']};
 if(options.out){
  const out=resolve(options.out);if(!contained(reportRoot,out)||out===reportRoot)throw Error('OUTPUT_OUTSIDE_REPORTS');
  let parent=dirname(out);for(;;){try{if(!contained(reportRoot,await realpath(parent)))throw Error('OUTPUT_ESCAPE');break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;parent=dirname(parent);}}
  await mkdir(dirname(out),{recursive:true});try{await mkdir(out);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('OUTPUT_EXISTS');throw error;}
  await writeFile(join(out,'analysis.json'),JSON.stringify(report,null,2));await writeFile(join(out,'timeline.json'),JSON.stringify(trials.map(r=>({batchId:r.batchId,runId:r.runId,status:r.status,admitted:r.admitted,path:r.path})),null,2));
  const cols=['batchId','group','cap','memoryCapacity','visionMode','seed','condition','runId','status','attempted','admitted','termination','objectiveSuccess','perceivedDone','actualAPIRequests','reservedAPIRequests','simulatedAPIRequests','costUSD','modelWaitingMs','modeledUserMs','repeatedUIActions','filteredDistributionChanges','rawSha256'] as const,q=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
  await writeFile(join(out,'trials.csv'),cols.join(',')+'\n'+trials.map(r=>cols.map(c=>q(r[c])).join(',')).join('\n')+'\n');

 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),values:Record<string,string>={};for(let i=0;i<args.length;i++){const key=args[i];if(!['--phase','--out'].includes(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('INVALID_OPTION');values[key]=args[++i];}if(!values['--phase']||!values['--out'])throw Error('USAGE_PHASE_AND_OUT_REQUIRED');const report=await analyzeVisionIsolation({phase:values['--phase'],out:values['--out']});console.log(JSON.stringify({status:report.phaseStatus,denominators:report.denominators,integrityErrors:report.integrity.errors.length,actualAPIRequests:report.accounting.actualAPIRequests}));if(!report.integrity.passed)process.exitCode=1;}
