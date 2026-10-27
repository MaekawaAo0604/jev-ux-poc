import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {BetaCandidates,SelectionConfig,SelectionRecord} from './contracts.js';

export class InvalidDistributionError extends Error {
 readonly code='INVALID_DISTRIBUTION';
 constructor(message:string){super(message);this.name='InvalidDistributionError';}
}
const invalid=(message:string):never=>{throw new InvalidDistributionError(message);};
const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validateConfig(config:SelectionConfig){
 if(!config||!['argmax','sample'].includes(config.mode))invalid('Unsupported selection mode');
 if(!Number.isInteger(config.seed)||config.seed<0||config.seed>0xffffffff)invalid('Seed must be an unsigned 32-bit integer');
}
/** v1 counter format is persisted by the schema: SHA-256 -> first uint32 BE / 2^32. */
function drawAt(seed:number,drawIndex:number):number {
 return createHash('sha256').update(`jev-virtual-beta-selection:v1:${seed}:${drawIndex}`,'utf8').digest().readUInt32BE(0)/0x100000000;
}

function selectAt(config:SelectionConfig,drawIndex:number,modelChoice:string,raw:Record<string,number>,candidates:BetaCandidates,excluded:Record<string,string>):SelectionRecord {
 validateConfig(config);
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
 const filteredTotal=keys.reduce((sum,key)=>sum+(Object.hasOwn(excluded,key)?0:normalized[key]),0);
 if(!Number.isFinite(filteredTotal)||filteredTotal<=0)invalid('No positive probability mass remains after filtering');
 const filtered=Object.fromEntries(keys.map(key=>[key,Object.hasOwn(excluded,key)?0:normalized[key]/filteredTotal]));
 const adjustments=Object.keys(excluded).sort().map(candidate=>({candidate,reason:excluded[candidate]}));
 const draw=config.mode==='sample'?drawAt(config.seed,drawIndex):null;
 let selected:string;
 if(draw===null){
  selected=keys[0];
  for(const key of keys)if(filtered[key]>filtered[selected])selected=key;
 }else{
  // The final positive interval includes floating point accumulation residue.
  selected=keys.filter(key=>filtered[key]>0).at(-1)!;
  let cumulative=0;
  for(const key of keys){cumulative+=filtered[key];if(draw<cumulative){selected=key;break;}}
 }
 return {modelChoice,raw:copiedRaw,normalized,filtered,normalization:{rawTotal,filteredTotal},adjustments,mode:config.mode,seed:config.seed,drawIndex,draw,selected};
}

/** Each instance owns its counter. Invalid decisions do not consume a draw. */
export function createSampler(config:SelectionConfig){
 validateConfig(config);
 const fixedConfig={mode:config.mode,seed:config.seed};
 let drawIndex=0;
 return {select(modelChoice:string,raw:Record<string,number>,candidates:BetaCandidates,excluded:Record<string,string>={}):SelectionRecord {
  const record=selectAt(fixedConfig,drawIndex,modelChoice,raw,candidates,excluded);
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
 const replayed=selectAt({mode:record.mode,seed:record.seed},record.drawIndex,record.modelChoice,record.raw,candidates,excluded);
 if(!isDeepStrictEqual(record,replayed))invalid('Selection record does not match deterministic replay');
 return replayed;
}
