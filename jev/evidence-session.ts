import {createHash} from 'node:crypto';
import {ChoiceRequestError,InferenceInterruption,evaluateChoices,safeRequestFailure,safeProviderType,validateChoice,type ChoiceAnswers,type ChoiceQuestion,type RequestFailure,type ChoiceEvaluator} from './client.js';
import type {State} from './types.js';

export const EVIDENCE_PROMPT_VERSION='partial-fact-scope-v10';
type Counts={logicalCalls:number;successfulCalls:number;attempts:number;failures:number;questions:number;reusedCalls:number;reusedQuestions:number};
export type EvidenceAccounting=Counts&{byStage:Record<string,Counts>};
type Namespace={goal:string;goalChecks:string[];currentDate:string;model:string;promptVersion:string};
type Entry={key:string;stage:string;model:string;answers:ChoiceAnswers['answers'];units?:string[]};
type RequestRecord={key:string;stage:string;questions:number;attempts:number;failures:RequestFailure[];status:'success'|'failed'|'reused';elapsedMs?:number;inputBytes?:number};
export type EvidenceSessionSnapshot={version:1;namespace?:Namespace;entries:Entry[];requests:RequestRecord[];accounting:EvidenceAccounting;interruptedStage?:string};
const counts=():Counts=>({logicalCalls:0,successfulCalls:0,attempts:0,failures:0,questions:0,reusedCalls:0,reusedQuestions:0});
const fresh=():EvidenceSessionSnapshot=>({version:1,entries:[],requests:[],accounting:{...counts(),byStage:{}}});
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export const evidenceKey=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modelNamespace=()=>process.env.AI_GATEWAY_API_KEY?`gateway:${process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev'}`:`direct:${process.env.JEV_MODEL||'jev-latest'}`;

function restore(value:unknown):EvidenceSessionSnapshot{
 try{
  const v=value as EvidenceSessionSnapshot;
  if(!v||v.version!==1||!Array.isArray(v.entries)||!v.namespace||typeof v.namespace.goal!=='string'||!Array.isArray(v.namespace.goalChecks)||!v.namespace.goalChecks.every(x=>typeof x==='string')||typeof v.namespace.currentDate!=='string'||typeof v.namespace.model!=='string'||v.namespace.promptVersion!==EVIDENCE_PROMPT_VERSION)throw new Error();
  const out=fresh();out.namespace={goal:v.namespace.goal,goalChecks:[...v.namespace.goalChecks],currentDate:v.namespace.currentDate,model:v.namespace.model,promptVersion:v.namespace.promptVersion};
  const readCounts=(input:Counts)=>Object.fromEntries(Object.keys(counts()).map(k=>{const n=input?.[k as keyof Counts];if(!Number.isSafeInteger(n)||n<0)throw new Error();return [k,n];})) as Counts;
  out.accounting={...readCounts(v.accounting),byStage:{}};
  for(const [stage,c] of Object.entries(v.accounting.byStage))if(/^[a-z-]+$/.test(stage))out.accounting.byStage[stage]=readCounts(c);else throw new Error();
  for(const e of v.entries){
   if(!/^[a-f0-9]{64}$/.test(e.key)||!/^[a-z-]+$/.test(e.stage)||typeof e.model!=='string'||!e.answers||typeof e.answers!=='object')throw new Error();
   const answers:ChoiceAnswers['answers']={};
   for(const [id,a] of Object.entries(e.answers)){
    if(!/^[a-z0-9_]+$/.test(id)||typeof a.choice!=='string'||!a.probabilities||!Object.values(a.probabilities).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)||a.confidence!==undefined&&(!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1))throw new Error();
    answers[id]={choice:a.choice,probabilities:{...a.probabilities},...(a.confidence===undefined?{}:{confidence:a.confidence})};
   }
   if(e.units&&(!Array.isArray(e.units)||!e.units.every(k=>/^[a-f0-9]{64}$/.test(k))))throw new Error();
   out.entries.push({key:e.key,stage:e.stage,model:e.model,answers,...(e.units?{units:[...e.units]}:{})});
  }
  for(const r of v.requests??[]){
   if(!/^[a-f0-9]{64}$/.test(r.key)||!/^[a-z-]+$/.test(r.stage)||!['success','failed','reused'].includes(r.status)||!Number.isSafeInteger(r.questions)||r.questions<0||!Number.isSafeInteger(r.attempts)||r.attempts<0||!Array.isArray(r.failures))throw new Error();
   const failures=r.failures.map(f=>{if(!['HTTP_ERROR','TIMEOUT','REQUEST_FAILED','MISSING_CREDENTIALS','INVALID_RESPONSE'].includes(f.code)||f.statusCode!==undefined&&(!Number.isInteger(f.statusCode)||f.statusCode<400||f.statusCode>599))throw new Error();const providerType=safeProviderType(f.providerType);return {code:f.code,...(f.statusCode?{statusCode:f.statusCode}:{}),...(providerType?{providerType}:{})};});
   for(const n of [r.elapsedMs,r.inputBytes])if(n!==undefined&&(!Number.isFinite(n)||n<0))throw new Error();
   out.requests.push({key:r.key,stage:r.stage,questions:r.questions,attempts:r.attempts,failures,status:r.status,...(r.elapsedMs===undefined?{}:{elapsedMs:r.elapsedMs}),...(r.inputBytes===undefined?{}:{inputBytes:r.inputBytes})});
  }
  if(v.interruptedStage&&/^[a-z-]+$/.test(v.interruptedStage))out.interruptedStage=v.interruptedStage;
  return out;
 }catch{return fresh();}
}

export class EvidenceSession{
 private data:EvidenceSessionSnapshot;
 constructor(private options:{snapshot?:unknown;checkpoint?:(snapshot:EvidenceSessionSnapshot)=>Promise<void>;evaluate?:ChoiceEvaluator}={}){this.data=restore(options.snapshot);}
 bind(state:State,goalChecks:string[]){
  const namespace={goal:state.goal,goalChecks:[...goalChecks],currentDate:state.currentDate,model:modelNamespace(),promptVersion:EVIDENCE_PROMPT_VERSION};
  if(this.data.namespace&&evidenceKey(namespace)!==evidenceKey(this.data.namespace))this.data=fresh();
  this.data.namespace=namespace;
 }
 snapshot(){return copy(this.data);}
 accounting(){return copy(this.data.accounting);}
 private add(stage:string,values:Partial<Counts>){
  const local=this.data.accounting.byStage[stage]??=counts();
  for(const [key,n] of Object.entries(values)){local[key as keyof Counts]+=n;this.data.accounting[key as keyof Counts]+=n;}
 }
 // Reconstruct original batches only when EVERY original local input still exists.
 // Their actual input, order and question IDs therefore match the request cache key.
 groups(stage:string,units:{key:string;questions:number}[],limit=96):string[][]{
  const available=new Set(units.map(u=>u.key)),remaining=new Set(available),groups:string[][]=[];
  for(const entry of this.data.entries)if(entry.stage===stage&&entry.units?.length&&entry.units.every(k=>available.has(k))&&entry.units.some(k=>remaining.has(k))){groups.push([...entry.units]);entry.units.forEach(k=>remaining.delete(k));}
  let group:string[]=[],size=0;
  for(const u of units)if(remaining.has(u.key)){if(size+u.questions>limit&&group.length){groups.push(group);group=[];size=0;}group.push(u.key);size+=u.questions;remaining.delete(u.key);}
  if(group.length)groups.push(group);return groups;
 }
 async evaluate(stage:string,state:unknown,questions:Record<string,ChoiceQuestion>,units?:string[],cache=true):Promise<ChoiceAnswers>{
  const started=performance.now(),inputBytes=Buffer.byteLength(JSON.stringify({state,questions}),'utf8');
  const key=evidenceKey({namespace:this.data.namespace,state,questions});
  const hit=cache?this.data.entries.find(e=>e.stage===stage&&e.key===key):undefined;
  if(hit){
   try{if(Object.keys(hit.answers).length!==Object.keys(questions).length)throw new Error();for(const [id,q] of Object.entries(questions))validateChoice(hit.answers[id],q.criteria);}
   catch{this.data.entries=this.data.entries.filter(e=>e!==hit);return this.evaluate(stage,state,questions,units,cache);}
   this.add(stage,{reusedCalls:1,reusedQuestions:Object.keys(questions).length});
   this.data.requests.push({key,stage,questions:Object.keys(questions).length,attempts:0,failures:[],status:'reused',elapsedMs:performance.now()-started,inputBytes});
   return copy({model:hit.model,answers:hit.answers});
  }
  this.add(stage,{logicalCalls:1,questions:Object.keys(questions).length});
  let response:ChoiceAnswers;
  try{response=await (this.options.evaluate??evaluateChoices)(state,questions);}
  catch(error){const trace=error instanceof ChoiceRequestError||error instanceof InferenceInterruption?error.request:undefined;this.add(stage,{attempts:trace?.attempts??1,failures:trace?.failures.length??1});this.data.requests.push({key,stage,questions:Object.keys(questions).length,attempts:trace?.attempts??1,failures:trace?.failures??[safeRequestFailure(error)],status:'failed',elapsedMs:performance.now()-started,inputBytes});this.data.interruptedStage=stage;await this.options.checkpoint?.(this.snapshot());if(error instanceof InferenceInterruption)throw error;throw new ChoiceRequestError(safeRequestFailure(error),trace);}
  this.add(stage,{successfulCalls:1,attempts:response.request?.attempts??1,failures:response.request?.failures.length??0});delete this.data.interruptedStage;
  this.data.requests.push({key,stage,questions:Object.keys(questions).length,attempts:response.request?.attempts??1,failures:response.request?.failures??[],status:'success',elapsedMs:performance.now()-started,inputBytes});
  const answers=Object.fromEntries(Object.entries(response.answers).map(([id,a])=>[id,{choice:a.choice,probabilities:{...a.probabilities},...(a.confidence===undefined?{}:{confidence:a.confidence})}]));
  if(cache)this.data.entries.push({key,stage,model:response.model,answers,...(units?{units:[...units]}:{})});
  await this.options.checkpoint?.(this.snapshot());return copy({...response,answers});
 }
}
export function createEvidenceSession(options?:{snapshot?:unknown;checkpoint?:(snapshot:EvidenceSessionSnapshot)=>Promise<void>;evaluate?:ChoiceEvaluator}):EvidenceSession{return new EvidenceSession(options);}
