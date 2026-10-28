import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {BetaCandidates,SelectionConfig,SelectionRecord,SelectionPolicyScope} from './contracts.js';

/** Safe, validated probability/filter evidence; intentionally has no selected action. */
export type SelectionFailureDetails={
 stage:'filter';reason:'ZERO_SURVIVING_MASS';
 raw:Record<string,number>;normalized:Record<string,number>;filteredWeights:Record<string,number>;
 normalization:{rawTotal:number;filteredTotal:number};adjustments:SelectionRecord['adjustments'];
};

export class InvalidDistributionError extends Error {
 readonly code='INVALID_DISTRIBUTION';
 constructor(message:string,readonly details?:SelectionFailureDetails){super(message);this.name='InvalidDistributionError';}
}
const invalid=(message:string,details?:SelectionFailureDetails):never=>{throw new InvalidDistributionError(message,details);};
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validateConfig(config:SelectionConfig){
 if(!config||!['argmax','sample'].includes(config.mode))invalid('Unsupported selection mode');
 if(!Number.isInteger(config.seed)||config.seed<0||config.seed>0xffffffff)invalid('Seed must be an unsigned 32-bit integer');
}
/** v1 counter format is persisted by the schema: SHA-256 -> first uint32 BE / 2^32. */
function drawAt(seed:number,drawIndex:number):number {
 return createHash('sha256').update(`jev-virtual-beta-selection:v1:${seed}:${drawIndex}`,'utf8').digest().readUInt32BE(0)/0x100000000;
}

function choose(keys:string[],distribution:Record<string,number>,draw:number|null):string {
 if(draw===null){let selected=keys[0];for(const key of keys)if(distribution[key]>distribution[selected])selected=key;return selected;}
 let selected=keys.filter(key=>distribution[key]>0).at(-1)!;
 let cumulative=0;
 for(const key of keys){cumulative+=distribution[key];if(draw<cumulative){selected=key;break;}}
 return selected;
}
/** Keep a mapped sample inside its original UI CDF interval despite rounding at an endpoint. */
function conditionalQuantile(keys:string[],ui:Set<string>,before:Record<string,number>,baseline:string,uiMass:number,draw:number):number {
 let rawPrefix=0,uiPrefix=0;
 for(const key of keys){if(key===baseline)break;rawPrefix+=before[key];if(ui.has(key))uiPrefix+=before[key]/uiMass;}
 const upper=Math.min(1,uiPrefix+before[baseline]/uiMass);
 if(!(upper>uiPrefix))invalid('Conditional probability interval underflow');
 const bits=new DataView(new ArrayBuffer(8));bits.setFloat64(0,upper);bits.setBigUint64(0,bits.getBigUint64(0)-1n);
 const quantile=Math.max(uiPrefix,Math.min(bits.getFloat64(0),uiPrefix+(draw-rawPrefix)/uiMass));
 if(!Number.isFinite(quantile)||quantile<0||quantile>=1)invalid('Invalid conditional draw');
 return quantile;
}
function conditionalPolicy(keys:string[],candidates:BetaCandidates,policy:NonNullable<SelectionRecord['policy']>,globalFiltered:Record<string,number>,draw:number|null):{filtered:Record<string,number>;selected:string}{
 const uiCandidates=keys.filter(key=>{
  const action=candidates[key]?.action;
  if(!isRecord(action)||!['click','back','scroll','done','stuck','look','reread','wait','abandon'].includes(action.type as string))invalid('Unsupported conditional candidate action type');
  return ['click','back','scroll'].includes(action.type);
 });
 const ui=new Set(uiCandidates),before=policy.before,weights=policy.weights;
 if(keys.some(key=>!ui.has(key)&&weights[key]!==1))invalid('Conditional policy requires non-UI weights to be one');
 const baselineSelected=choose(keys,before,draw),baselineClass=ui.has(baselineSelected)?'ui' as const:'non-ui' as const;
 const uiMass=uiCandidates.reduce((mass,key)=>mass+before[key],0),weightedUIMass=uiCandidates.reduce((mass,key)=>mass+before[key]*weights[key],0);
 if(!Number.isFinite(uiMass)||!Number.isFinite(weightedUIMass)||uiMass>0&&weightedUIMass<=0)invalid('Invalid conditional UI mass');
 const uniform=uiCandidates.every(key=>weights[key]===weights[uiCandidates[0]]);
 const marginal=Object.fromEntries(keys.map(key=>[key,!ui.has(key)||uniform||uiMass===0?before[key]:(before[key]*weights[key]/weightedUIMass)*uiMass]));
 if(keys.some(key=>!Number.isFinite(marginal[key])||marginal[key]<0||before[key]>0&&marginal[key]===0))invalid('Conditional policy underflow erased positive marginal mass');
 let filtered:Record<string,number>,conditionalDraw:number|null=null;
 if(baselineClass==='non-ui')filtered=Object.fromEntries(keys.map(key=>[key,Number(key===baselineSelected)]));
 else {
  const onlyUI=keys.every(key=>ui.has(key)||before[key]===0);
  filtered=onlyUI?{...globalFiltered}:Object.fromEntries(keys.map(key=>[key,!ui.has(key)?0:uniform?before[key]/uiMass:before[key]*weights[key]/weightedUIMass]));
  if(draw!==null){
   if(onlyUI)conditionalDraw=draw;
   else conditionalDraw=conditionalQuantile(keys,ui,before,baselineSelected,uiMass,draw);
   if(!Number.isFinite(conditionalDraw))invalid('Invalid conditional draw');
  }
 }
 policy.scope={kind:'ui-conditional-v1',baselineSelected,baselineClass,uiCandidates:[...uiCandidates],uiMass,weightedUIMass,marginal,conditionalDraw};
 return {filtered,selected:choose(keys,filtered,baselineClass==='ui'?conditionalDraw:draw)};
}

function selectAt(config:SelectionConfig,drawIndex:number,modelChoice:string,raw:Record<string,number>,candidates:BetaCandidates,excluded:Record<string,string>,weights?:Record<string,number>,scope?:SelectionPolicyScope):SelectionRecord {
 validateConfig(config);
 if(scope!==undefined&&scope!=='global'&&scope!=='ui-conditional')invalid('Unsupported selection policy scope');
 if(scope==='ui-conditional'&&weights===undefined)invalid('Conditional policy requires weights');
 if(!Number.isSafeInteger(drawIndex)||drawIndex<0)invalid('Draw index must be a nonnegative safe integer');
 if(!isRecord(candidates)||!Object.keys(candidates).length)invalid('Candidates must be a nonempty record');
 const keys=Object.keys(candidates).sort();
 if(typeof modelChoice!=='string'||!Object.hasOwn(candidates,modelChoice))invalid('Model choice is not a candidate');
 if(!isRecord(raw)||Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))invalid('Distribution must contain exactly the candidate keys');
 if(keys.some(key=>typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<0||raw[key]>1))invalid('Probabilities must be finite numbers between zero and one');
 const rawTotal=keys.reduce((sum,key)=>sum+raw[key],0);
 if(rawTotal<=0||Math.abs(rawTotal-1)>0.02)invalid('Probability sum must be within 0.02 of one');
 if(!isRecord(excluded)||Object.keys(excluded).some(key=>!Object.hasOwn(candidates,key)||typeof excluded[key]!=='string'||!excluded[key].trim()))invalid('Exclusions require known candidate keys and nonempty reasons');
 const copiedRaw=Object.fromEntries(keys.map(key=>[key,raw[key]]));
 const normalized=Object.fromEntries(keys.map(key=>[key,raw[key]/rawTotal]));
 const filteredWeights=Object.fromEntries(keys.map(key=>[key,Object.hasOwn(excluded,key)?0:normalized[key]]));
 const filteredTotal=keys.reduce((sum,key)=>sum+filteredWeights[key],0);
 const adjustments=Object.keys(excluded).sort().map(candidate=>({candidate,reason:excluded[candidate]}));
 if(!Number.isFinite(filteredTotal))invalid('Nonfinite probability mass remains after filtering');
 if(filteredTotal<=0)invalid('No positive probability mass remains after filtering',{stage:'filter',reason:'ZERO_SURVIVING_MASS',raw:copiedRaw,normalized,filteredWeights,normalization:{rawTotal,filteredTotal},adjustments});
 let filtered=Object.fromEntries(keys.map(key=>[key,filteredWeights[key]/filteredTotal]));
 let policy:SelectionRecord['policy'];
 if(weights!==undefined){
  if(!isRecord(weights)||Object.keys(weights).length!==keys.length||keys.some(key=>!Object.hasOwn(weights,key)||typeof weights[key]!=='number'||!Number.isFinite(weights[key])||weights[key]<=0||weights[key]>1))invalid('Policy weights must contain every candidate with finite positive weights at most one');
  const before={...filtered},copiedWeights=Object.fromEntries(keys.map(key=>[key,weights[key]])),weighted=Object.fromEntries(keys.map(key=>[key,before[key]*copiedWeights[key]]));
  if(keys.some(key=>before[key]>0&&weighted[key]===0))invalid('Policy underflow erased positive mass');
  const weightedTotal=keys.reduce((sum,key)=>sum+weighted[key],0);
  if(!Number.isFinite(weightedTotal)||weightedTotal<=0)invalid('Invalid policy total');
  if(keys.some(key=>copiedWeights[key]!==1))filtered=Object.fromEntries(keys.map(key=>[key,weighted[key]/weightedTotal]));
  policy={kind:'temporary-deferral',weights:copiedWeights,before,weightedTotal};
 }
 const draw=config.mode==='sample'?drawAt(config.seed,drawIndex):null;
 let selected:string;
 if(scope==='ui-conditional'){const conditional=conditionalPolicy(keys,candidates,policy!,filtered,draw);filtered=conditional.filtered;selected=conditional.selected;}
 else selected=choose(keys,filtered,draw);
 return {...(policy?{policy}:{}),modelChoice,raw:copiedRaw,normalized,filtered,normalization:{rawTotal,filteredTotal},adjustments,mode:config.mode,seed:config.seed,drawIndex,draw,selected};
}

/** Each instance owns its counter. Invalid decisions do not consume a draw. */
export function createSampler(config:SelectionConfig){
 validateConfig(config);
 const fixedConfig={mode:config.mode,seed:config.seed};
 let drawIndex=0;
 return {select(modelChoice:string,raw:Record<string,number>,candidates:BetaCandidates,excluded:Record<string,string>={},weights?:Record<string,number>,scope?:SelectionPolicyScope):SelectionRecord {
  const record=selectAt(fixedConfig,drawIndex,modelChoice,raw,candidates,excluded,weights,scope);
  drawIndex++;
  return record;
 }};
}

/** Reconstruct and verify the complete persisted record without mutable PRNG state. */
export function replaySelection(record:SelectionRecord,candidates:BetaCandidates):SelectionRecord {
 if(!isRecord(record)||!Array.isArray(record.adjustments))invalid('Malformed selection record');
 const excluded:Record<string,string>=Object.fromEntries(record.adjustments.map(adjustment=>{
  if(!isRecord(adjustment)||typeof adjustment.candidate!=='string'||typeof adjustment.reason!=='string')invalid('Malformed recorded exclusion');
  return [adjustment.candidate,adjustment.reason];
 }));
 if(Object.keys(excluded).length!==record.adjustments.length)invalid('Duplicate recorded exclusion');
 const scope=record.policy?.scope;
 if(scope!==undefined&&(!isRecord(scope)||scope.kind!=='ui-conditional-v1'))invalid('Unsupported recorded selection policy scope');
 const replayed=selectAt({mode:record.mode,seed:record.seed},record.drawIndex,record.modelChoice,record.raw,candidates,excluded,record.policy?.weights,scope===undefined?undefined:'ui-conditional');
 if(!isDeepStrictEqual(record,replayed))invalid('Selection record does not match deterministic replay');
 return replayed;
}
