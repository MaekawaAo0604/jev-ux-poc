import type {BetaResult,BetaStep} from './virtual-beta-core.js';
import {analyzeRun} from './virtual-beta-analysis.js';
import type {Rect} from '../jev/virtual-beta/contracts.js';
import type {SemanticRunAudit} from '../jev/virtual-beta/semantic-types.js';
import type {BetaUIId} from '../jev/virtual-beta/ui-types.js';

type SemanticResult=BetaResult&{semantic?:SemanticRunAudit};
type Evidence=boolean|null;
type Control='A'|'B';
const uis:BetaUIId[]=['reference','position-only','wording-only'];
const mappings:Control[]=['A','B'];
const labels={A:'設定Aを適用',B:'設定Bを適用'};
const budgetTerminations=new Set(['API_LIMIT','TIME_LIMIT','UI_ACTION_LIMIT','LOOK_LIMIT','DECISION_LIMIT']);
const nonempty=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const validRect=(r:Rect|undefined):r is Rect=>!!r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const conjunction=(values:Evidence[]):Evidence=>values.includes(false)?false:values.includes(null)?null:true;
function geometry(s:BetaStep,id:string){
 const regions=s.audit?.regionsOfInterest?.filter(r=>r.id===id),rect=regions?.length===1?regions[0].rect:undefined,clear=s.vision?.clearRect;
 if(!validRect(rect)||!validRect(clear))return {fullyVisible:null as Evidence,whollyAbsent:null as Evidence};
 return {fullyVisible:rect.x>=clear.x&&rect.y>=clear.y&&rect.x+rect.width<=clear.x+clear.width&&rect.y+rect.height<=clear.y+clear.height,whollyAbsent:rect.x+rect.width<=clear.x||clear.x+clear.width<=rect.x||rect.y+rect.height<=clear.y||clear.y+clear.height<=rect.y};
}
function controlIds(s:BetaStep){
 const elements=s.audit?.screen?.elements;
 if(!Array.isArray(elements))return null;
 const matches=(control:Control)=>elements.filter(e=>e.text===labels[control]);
 const a=matches('A'),b=matches('B');
 return a.length===1&&b.length===1&&nonempty(a[0].id)&&nonempty(b[0].id)&&a[0].id!==b[0].id?{A:a[0].id,B:b[0].id}:null;
}
function bothOffered(s:BetaStep|undefined):Evidence{
 if(!s)return null;
 const ids=controlIds(s),criteria=s.questions?.nextAction?.criteria;
 return ids&&criteria?Object.hasOwn(criteria,ids.A)&&Object.hasOwn(criteria,ids.B):null;
}
function validTrial(a:SemanticRunAudit|undefined){
 const t=a?.trial,f=t?.fixture;
 return !!t&&nonempty(t.id)&&nonempty(t.pairId)&&(t.replicate===1||t.replicate===2)&&!!f&&f.version===1&&uis.includes(f.ui)&&mappings.includes(f.mapping)&&nonempty(a?.definitionHash)&&nonempty(a?.initialProductImage?.file)&&nonempty(a?.initialProductImage?.sha256);
}
function fixedCondition(result:BetaResult){
 const c=result.config;
 return c?.vision?.mode==='crop'&&c.vision.clearWidth===640&&c.vision.clearHeight===480&&c.state?.enabled===true&&c.state.memoryCapacity===3&&c.selection?.mode==='argmax'&&c.behavior==='goal'&&c.maxAPICalls<=4;
}

/** Offline evidence projection. Assignment/ground truth is audit-only and never sent to a model. */
export function analyzeSemanticRun(result:SemanticResult){
 const audit=result.semantic,base=analyzeRun(result),reasons:string[]=[];
 const timeline=result.steps.map(s=>{
  const ids=controlIds(s),elementId=s.action?.type==='click'?s.action.elementId:null;
  const firstControl:Control|null=ids&&elementId?(elementId===ids.A?'A':elementId===ids.B?'B':null):null;
  const sourceConsistent=nonempty(s.audit?.sourceSha256)&&nonempty(s.vision?.sourceSha256)?s.audit!.sourceSha256===s.vision!.sourceSha256:null;
  return {decision:s.number,controlIds:ids,bothOffered:bothOffered(s),cue:geometry(s,'semantic-cue'),a:geometry(s,'semantic-a'),b:geometry(s,'semantic-b'),firstControl,selected:s.selection?.selected??null,action:s.action?structuredClone(s.action):null,outcome:s.outcome??null,sourceSha256:s.audit?.sourceSha256??null,inputSha256:s.inputSha256??null,imageSha256:s.vision?.imageSha256??null,sourceConsistent,probabilities:s.selection?{raw:{...s.selection.raw},normalized:{...s.selection.normalized},filtered:{...s.selection.filtered}}:null};
 });
 const firstIndex=timeline.findIndex(s=>s.firstControl!==null),first=firstIndex>=0?timeline[firstIndex]:null,initial=timeline[0];
 const beforeChoice=firstIndex>=0?timeline.slice(0,firstIndex+1):timeline;
 const fullySeen=beforeChoice.find(s=>s.cue.fullyVisible===true);
 // A missing observation cannot prove absence of exposure; a recorded complete set can.
 const acquired:Evidence=fullySeen?true:beforeChoice.length&&beforeChoice.every(s=>s.cue.fullyVisible!==null)?false:null;
 const sourceKnown=beforeChoice.length>0&&beforeChoice.every(s=>s.sourceConsistent===true&&nonempty(s.sourceSha256));
 const rawStable:Evidence=sourceKnown?beforeChoice.every(s=>s.sourceSha256===initial?.sourceSha256):beforeChoice.some(s=>s.sourceConsistent===false)?false:null;
 const noChoiceKnown=timeline.length>0&&timeline.every(s=>s.controlIds!==null);
  const selectionGated=beforeChoice.some((s,i)=>{
  const ids=s.controlIds,record=result.steps[i].selection??result.steps[i].selectionFailure;
  return !!ids&&!!record?.adjustments?.some(a=>a.candidate===ids.A||a.candidate===ids.B);
 });
 const firstChoice=first?.firstControl??null;
 const correct:Evidence=firstChoice&&validTrial(audit)?firstChoice===audit!.trial.fixture.mapping:null;
 const selectionMatches:Evidence=first?.action?.type==='click'?first.selected===null?null:first.selected===first.action.elementId:null;
 const initialHidden=initial?.cue.whollyAbsent??null;
 const offeredInitially=initial?.bothOffered??null;
 const offeredAtChoice=first?.bothOffered??null;
 const controlsVisibleInitially=initial?conjunction([initial.a.fullyVisible,initial.b.fullyVisible]):null;
 const controlsVisibleAtChoice=first?conjunction([first.a.fullyVisible,first.b.fullyVisible]):null;
 const cueSupported:Evidence=!first&&noChoiceKnown?false:conjunction([!selectionGated,initialHidden,offeredInitially,offeredAtChoice,controlsVisibleInitially,controlsVisibleAtChoice,rawStable,acquired,correct,selectionMatches]);
 if(!audit)reasons.push('SEMANTIC_AUDIT_MISSING');
 else if(!validTrial(audit))reasons.push('SEMANTIC_AUDIT_INVALID');
 if(!fixedCondition(result))reasons.push('FIXED_CONDITION_MISMATCH');
 if(initialHidden===false)reasons.push('CUE_NOT_WHOLELY_ABSENT_INITIALLY');
 if(offeredInitially===false||offeredAtChoice===false)reasons.push('CONTROL_CANDIDATE_GATING');
 if(controlsVisibleInitially===false||controlsVisibleAtChoice===false)reasons.push('CONTROL_NOT_FULLY_VISIBLE');
 if(rawStable===false)reasons.push('RAW_SCREEN_CHANGED_OR_SOURCE_INCONSISTENT_BEFORE_CHOICE');
 if(selectionMatches===false)reasons.push('SELECTED_ACTION_MISMATCH');
 if(selectionGated)reasons.push('CONTROL_SELECTION_FILTERED');
 const missingEvidence=initialHidden===null||offeredInitially===null||controlsVisibleInitially===null||rawStable===null||acquired===null||(!!first&&(offeredAtChoice===null||controlsVisibleAtChoice===null||selectionMatches===null))||(!first&&!noChoiceKnown);
 if(missingEvidence)reasons.push('SEMANTIC_OBSERVATION_METADATA_MISSING_OR_AMBIGUOUS');
 const violated=reasons.some(r=>!['SEMANTIC_AUDIT_MISSING','SEMANTIC_OBSERVATION_METADATA_MISSING_OR_AMBIGUOUS'].includes(r));
 const semanticValidity=violated?'design-invalid' as const:!audit||missingEvidence?'unknown' as const:'semantic-valid' as const;
 const eligible=base.classification.artifactValidity==='artifact-valid'&&semanticValidity==='semantic-valid';
 return {schemaVersion:1 as const,runId:result.runId,trial:audit?.trial?structuredClone(audit.trial):null,definitionHash:audit?.definitionHash??null,
  classification:{artifactValidity:base.classification.artifactValidity,semanticValidity,eligible,censored:budgetTerminations.has(result.termination),reasons:[...base.classification.reasons,...reasons]},
  choice:{first:firstChoice,decision:first?.decision??null,correct,bothOfferedInitially:offeredInitially,bothOfferedAtFirstChoice:offeredAtChoice,selectedActionMatches:selectionMatches,noChoiceRecorded:!first&&noChoiceKnown,controlsFullyVisibleInitially:controlsVisibleInitially,controlsFullyVisibleAtFirstChoice:controlsVisibleAtChoice},
  cue:{initialWhollyAbsent:initialHidden,acquiredBeforeOrAtFirstChoice:acquired,firstFullyVisibleDecision:fullySeen?.decision??null,rawScreenStableBeforeChoice:rawStable,interpretation:'Whole-ROI clear-image availability only; does not prove reading or internal understanding.'},
  metric:{name:'cue-supported-first-choice-correct' as const,cueSupportedFirstChoiceCorrect:cueSupported,score:eligible&&cueSupported===true?1:0,interpretation:'Behavioral association under reversed routing mappings; blind correct guesses and candidate-gated choices are not cue-supported evidence.'},
  outcomes:{objectiveSuccess:result.objectiveSuccess,perceivedDone:result.perceivedDone,termination:result.termination,objectiveAssessment:structuredClone(result.objectiveAssessment??null)},
  initial:{inputSha256:initial?.inputSha256??null,imageSha256:initial?.imageSha256??null,rawSourceSha256:initial?.sourceSha256??null,initialProductImage:audit?.initialProductImage?{...audit.initialProductImage}:null},
  counters:{looks:result.looks,uiActions:result.uiActions,apiCalls:result.apiCalls,decisions:result.decisions},
  actionPath:timeline.map(s=>({decision:s.decision,action:s.action,control:s.firstControl,selected:s.selected,outcome:s.outcome,probabilities:s.probabilities})),timeline,
 };
}
export type SemanticRunAnalysis=ReturnType<typeof analyzeSemanticRun>;
const equality=(a:string|null|undefined,b:string|null|undefined):Evidence=>nonempty(a)&&nonempty(b)?a===b:null;
const permutations3=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
const range=(values:number[])=>Math.max(...values)-Math.min(...values);

/** Fixed 12-trial comparison. No silent exclusions, replacement runs, or post-hoc endpoints. */
export function compareSemanticRuns(results:SemanticResult[]){
 const analyses=results.map(analyzeSemanticRun),issues:string[]=[];
 const slots=uis.flatMap(ui=>[1,2].flatMap(replicate=>mappings.map(mapping=>{
  const matches=analyses.filter(a=>a.trial?.fixture?.ui===ui&&a.trial.replicate===replicate&&a.trial.fixture.mapping===mapping);
  return {ui,replicate,mapping,matches,analysis:matches.length===1?matches[0]:null};
 })));
 if(results.length!==12)issues.push('EXPECTED_EXACTLY_12_RESULTS');
 if(results.some(r=>!validTrial(r.semantic)))issues.push('MISSING_OR_INVALID_TRIAL_ASSIGNMENT');
 if(slots.some(s=>s.matches.length===0))issues.push('MISSING_TRIALS');
 if(slots.some(s=>s.matches.length>1))issues.push('DUPLICATE_TRIALS');
 if(new Set(analyses.map(a=>a.runId)).size!==analyses.length)issues.push('DUPLICATE_RUN_IDS');
 if(analyses.some(a=>!a.classification.eligible))issues.push('INVALID_OR_UNKNOWN_TRIAL_EVIDENCE');
 const ids=analyses.map(a=>a.trial?.id).filter(nonempty);
 if(new Set(ids).size!==ids.length)issues.push('DUPLICATE_TRIAL_IDS');
 const pairs=uis.flatMap(ui=>[1,2].map(replicate=>{
  const a=slots.find(s=>s.ui===ui&&s.replicate===replicate&&s.mapping==='A')!.analysis,b=slots.find(s=>s.ui===ui&&s.replicate===replicate&&s.mapping==='B')!.analysis;
  return {ui,replicate,pairId:a?.trial?.pairId??b?.trial?.pairId??null,runIds:{A:a?.runId??null,B:b?.runId??null},complete:!!a&&!!b,pairIdEqual:a&&b?a.trial!.pairId===b.trial!.pairId:null,initialInputSha256Equal:equality(a?.initial.inputSha256,b?.initial.inputSha256),initialImageSha256Equal:equality(a?.initial.imageSha256,b?.initial.imageSha256),initialRawSourceSha256Equal:equality(a?.initial.rawSourceSha256,b?.initial.rawSourceSha256)};
 }));
 if(pairs.some(p=>!p.complete||p.pairIdEqual!==true))issues.push('INCOMPLETE_OR_MISMATCHED_PAIRS');
 if(new Set(pairs.map(p=>p.pairId).filter(nonempty)).size!==6)issues.push('PAIR_IDS_NOT_UNIQUE');
 if(pairs.some(p=>p.initialInputSha256Equal!==true||p.initialImageSha256Equal!==true))issues.push('PAIRED_INITIAL_MODEL_INPUT_NOT_IDENTICAL');
 if(pairs.some(p=>p.initialRawSourceSha256Equal===true))issues.push('REVERSED_MAPPING_RAW_IMAGE_NOT_DIFFERENT');
 const invariant=(r:SemanticResult)=>JSON.stringify({vision:r.config.vision,state:r.config.state,selectionMode:r.config.selection.mode,behavior:r.config.behavior,maxAPICalls:r.config.maxAPICalls,maxDecisions:r.config.maxDecisions,maxUIActions:r.config.maxUIActions,maxLooks:r.config.maxLooks,maxRunMs:r.config.maxRunMs,input:r.input,code:r.code??null});
 if(new Set(results.map(invariant)).size>1)issues.push('NON_UI_EXPERIMENT_SETTINGS_DIFFER');
 const byUI=uis.map(ui=>{
  const cells=slots.filter(s=>s.ui===ui),recorded=cells.flatMap(s=>s.matches);
  const strictSuccesses=cells.reduce((sum,s)=>sum+(s.analysis?.metric.score??0),0);
  return {ui,expectedTrials:4,observed:recorded.length,missing:cells.filter(s=>s.matches.length===0).length,duplicateCells:cells.filter(s=>s.matches.length>1).length,invalid:recorded.filter(a=>!a.classification.eligible).length,noChoice:recorded.filter(a=>a.choice.noChoiceRecorded).length,censored:recorded.filter(a=>a.classification.censored).length,strictSuccesses,strictSuccessRate:strictSuccesses/4,objectiveSuccesses:recorded.filter(a=>a.outcomes.objectiveSuccess).length,firstChoices:{A:recorded.filter(a=>a.choice.first==='A').length,B:recorded.filter(a=>a.choice.first==='B').length,none:recorded.filter(a=>a.choice.first===null).length},repetitions:mappings.map(mapping=>{const a=cells.find(s=>s.mapping===mapping&&s.replicate===1)!.analysis,b=cells.find(s=>s.mapping===mapping&&s.replicate===2)!.analysis;return {mapping,firstChoiceAgreement:a&&b?a.choice.first===b.choice.first:null,actionPathAgreement:a&&b?JSON.stringify(a.actionPath.map(s=>s.control??s.action))===JSON.stringify(b.actionPath.map(s=>s.control??s.action)):null};})};
 });
 const total=byUI.reduce((sum,u)=>sum+u.strictSuccesses,0),available=issues.length===0;
 let mappingP:number|null=null,uiP:number|null=null;
 const uiStatistic=range(byUI.map(u=>u.strictSuccessRate));
 if(available){
  let extreme=0;
  for(let mask=0;mask<64;mask++){
   let score=0;
   for(let p=0;p<6;p++){
    const {ui,replicate}=pairs[p];
    for(const mapping of mappings){
     const a=slots.find(s=>s.ui===ui&&s.replicate===replicate&&s.mapping===mapping)!.analysis!;
     const assigned=(mask&(1<<p))?(mapping==='A'?'B':'A'):mapping;
     // The gate excludes factual correctness, which is recomputed after swapping labels.
     const supported=a.cue.initialWhollyAbsent===true&&a.cue.acquiredBeforeOrAtFirstChoice===true&&a.choice.bothOfferedInitially===true&&a.choice.bothOfferedAtFirstChoice===true&&a.choice.controlsFullyVisibleInitially===true&&a.choice.controlsFullyVisibleAtFirstChoice===true&&a.cue.rawScreenStableBeforeChoice===true&&a.choice.selectedActionMatches===true;
     if(supported&&a.choice.first===assigned)score++;
    }
   }
   if(score>=total)extreme++;
  }
  mappingP=extreme/64;
  const blocks=[1,2].flatMap(replicate=>mappings.map(mapping=>uis.map(ui=>slots.find(s=>s.ui===ui&&s.replicate===replicate&&s.mapping===mapping)!.analysis!.metric.score)));
  let uiExtreme=0;
  for(let n=0;n<1296;n++){
   let code=n;const sums=[0,0,0];
   for(const block of blocks){const permutation=permutations3[code%6];code=Math.floor(code/6);for(let i=0;i<3;i++)sums[i]+=block[permutation[i]];}
   if(range(sums.map(v=>v/4))>=uiStatistic-1e-12)uiExtreme++;
  }
  uiP=uiExtreme/1296;
 }
 const assumptions=['Complete 3 UI × 2 mapping × 2 replicate factorial assigned at random to 12 pre-existing execution slots before outcomes, with assignment seed/manifest preserved externally.','Mapping test conditions on UI × replicate; each of six paired mapping labels is exchangeable under the sharp null. UI test conditions on replicate × mapping; UI labels are exchangeable in each of four blocks.','Independent fresh run contexts, no carryover/interference, fixed model/persona/goal/config/source and stable measurement. Random execution order does not by itself verify these assumptions.','One small exploratory experiment: 12 trials, six pairs and four UI blocks. P-values are conditional reference probabilities, not probabilities about human behavior, internal understanding, effect size, or adequate power.'];
 const test=(name:string,statistic:number,permutations:number,pValue:number|null)=>({name,status:available?'available' as const:'unavailable' as const,statistic:available?statistic:null,permutations:available?permutations:0,pValue,unavailableReasons:available?[]:[...issues]});
 return {schemaVersion:1 as const,design:{expectedTrials:12,uiCount:3,mappingCount:2,replicates:2,pairs:6,uiBlocks:4,endpoint:'cue-supported-first-choice-correct',fixedDenominator:12,assumptions},counts:{observed:results.length,missing:slots.filter(s=>s.matches.length===0).length,duplicateCells:slots.filter(s=>s.matches.length>1).length,infraInvalid:analyses.filter(a=>a.classification.artifactValidity==='infra-invalid').length,unknownOrDesignInvalid:analyses.filter(a=>a.classification.semanticValidity!=='semantic-valid').length,noChoice:analyses.filter(a=>a.choice.noChoiceRecorded).length,censored:analyses.filter(a=>a.classification.censored).length,strictSuccesses:total,strictSuccessRate:total/12},issues,pairs,byUI,trials:analyses,mappingTest:test('one-sided paired mapping label-swap',total,64,mappingP),uiTest:test('omnibus UI range of strict-success rates',uiStatistic,1296,uiP)};
}
