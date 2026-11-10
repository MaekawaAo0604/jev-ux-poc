import {validateConfig} from '../jev/virtual-beta/config.js';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';

export type ControlledComparisonPlan={schemaVersion:1;id:string;configs:BetaConfig[];seeds:number[];maxTotalAPI:number;maxDurationMs:number;allocatedAPIRequests:number};
export type ControlledTrial={ordinal:number;runId:string;condition:string;replicate:number;seed:number;position:number;config:BetaConfig};
const integer=(n:unknown,minimum:number,maximum:number)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=minimum&&n<=maximum;
/** Pure, complete preflight. No filesystem, credentials, browser or model calls. */
export function parseControlledComparisonPlan(value:unknown):ControlledComparisonPlan{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_COMPARISON_PLAN');
 const p=value as Record<string,unknown>;
 if(Object.keys(p).some(k=>!['schemaVersion','id','configs','seeds','maxTotalAPI','maxDurationMs'].includes(k))||p.schemaVersion!==1||typeof p.id!=='string'||!/^[-a-z0-9]{1,64}$/.test(p.id))throw Error('INVALID_COMPARISON_PLAN');
 if(!Array.isArray(p.configs)||p.configs.length<1||p.configs.length>8||!Array.isArray(p.seeds)||p.seeds.length<1||p.seeds.length>3||p.seeds.some(s=>!integer(s,0,0xffffffff))||new Set(p.seeds).size!==p.seeds.length)throw Error('INVALID_COMPARISON_CONDITIONS_OR_SEEDS');
 const configs=p.configs.map(c=>validateConfig(c));
 if(new Set(configs.map(c=>c.id)).size!==configs.length)throw Error('DUPLICATE_COMPARISON_CONDITION');
 for(const c of configs){
  if(c.maxAPICalls>12)throw Error('COMPARISON_PER_TRIAL_CAP_EXCEEDED');
  for(const stage of ['deliberation','experience','deferral','goalSearch','actionRelations','visualHypotheses','correspondence','deferralReason'] as const)if(c[stage]?.enabled)throw Error('COMPARISON_REQUIRES_SINGLE_STAGE');
 }
 if(!integer(p.maxTotalAPI,1,48)||!integer(p.maxDurationMs??2700000,1,2700000))throw Error('INVALID_COMPARISON_BUDGET');
 const allocatedAPIRequests=configs.reduce((sum,c)=>sum+c.maxAPICalls,0)*p.seeds.length;
 if(allocatedAPIRequests>(p.maxTotalAPI as number))throw Error('COMPARISON_ALLOCATION_EXCEEDS_BATCH_CAP');
 return {schemaVersion:1,id:p.id,configs,seeds:[...p.seeds] as number[],maxTotalAPI:p.maxTotalAPI as number,maxDurationMs:(p.maxDurationMs??2700000) as number,allocatedAPIRequests};
}
/** Paired seeds; cyclic rotations spread serial positions without outcome-adaptive ordering. */
export function scheduleControlledComparison(plan:ControlledComparisonPlan):ControlledTrial[]{
 return plan.seeds.flatMap((seed,index)=>plan.configs.map((_,position)=>{
  const original=plan.configs[(position+index)%plan.configs.length],config=structuredClone(original);config.selection.seed=seed;
  return {ordinal:index*plan.configs.length+position+1,runId:original.id+'-seed-'+seed,condition:original.id,replicate:index+1,seed,position:position+1,config};
 }));
}
