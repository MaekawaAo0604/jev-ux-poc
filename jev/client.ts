import {experimental_evaluate as evaluate} from 'ai';
import {randomUUID} from 'node:crypto';

export type ChoiceQuestion={type:'choice';instructions:string;criteria:Record<string,string>};
export type ChoiceAnswers={model:string;answers:Record<string,{choice:string;probabilities:Record<string,number>;confidence?:number}>;request?:RequestTrace;usage?:{inputTokens?:number;outputTokens?:number};costUSD?:number};
export type ImageInput={mediaType:'image/png'|'image/jpeg';data:string};
export type ChoiceInputOptions={image?:ImageInput;images?:Record<string,ImageInput>;model?:string;gatewayHTTP?:boolean;recoverContextLimit?:boolean};
export type ChoiceEvaluator=(state:unknown,questions:Record<string,ChoiceQuestion>)=>Promise<ChoiceAnswers>;
export type RequestFailure={code:'HTTP_ERROR'|'TIMEOUT'|'REQUEST_FAILED'|'MISSING_CREDENTIALS'|'INVALID_RESPONSE';statusCode?:number;providerType?:string;providerCode?:'max_tokens_exceeded'};
export const safeProviderType=(value:unknown)=>typeof value==='string'&&['internal_server_error','rate_limit_exceeded','authentication_error','invalid_request_error','model_not_found','timeout_error','failed_dependency','forbidden','not_found','response_error'].includes(value)?value:undefined;
export type RequestTrace={attempts:number;failures:RequestFailure[];elapsedMs?:number;budgetExhausted?:boolean;longContext?:true};
export type RetryProgress={phase:'request'|'retry'|'recovered';attempt:number;maxAttempts:number;elapsedMs:number;failure?:RequestFailure;delayMs?:number};
export type RetryPolicy={maxAttempts:number;maxElapsedMs:number;retryDelaysMs?:number[];retryInvalidResponse?:boolean;onProgress?:(event:RetryProgress)=>void|Promise<void>};
export function createBudgetedEvaluator(policy:RetryPolicy,totalMs:number):ChoiceEvaluator{
 if(!Number.isSafeInteger(totalMs)||totalMs<1||totalMs>300000)throw new Error('Invalid aggregate inference budget');
 let started:number|undefined;
 return async(state,questions)=>{
  started??=performance.now();
  const remaining=Math.floor(totalMs-(performance.now()-started));
  if(remaining<=0)throw new ChoiceRequestError({code:'TIMEOUT'},{attempts:0,failures:[],elapsedMs:0,budgetExhausted:true});
  return evaluateChoices(state,questions,{...policy,maxElapsedMs:Math.min(policy.maxElapsedMs,remaining)});
 };
}
// Fixed control-flow codes; never provider messages or credentials.
export class InferenceInterruption extends Error{
 constructor(public kind:'SAFETY_BOUNDARY'|'OBSERVATION_CHANGED',public request?:RequestTrace){super(kind);}
}
export class ChoiceRequestError extends Error{
 constructor(public failure:RequestFailure,public request?:RequestTrace){super(`Choice API ${failure.code}${failure.statusCode?` HTTP ${failure.statusCode}`:''}`);}
}
// Deliberately whitelist metadata: raw SDK errors can include headers and inputs.
export function safeRequestFailure(error:unknown):RequestFailure{
 if(error instanceof ChoiceRequestError)return error.failure;
 const value=error as {statusCode?:unknown;name?:unknown;type?:unknown}|null;
 const status=value?.statusCode;
 const providerType=safeProviderType(value?.type);
 if(typeof status==='number'&&Number.isInteger(status)&&status>=400&&status<=599)return {code:'HTTP_ERROR',statusCode:status,...(providerType?{providerType}:{})};
 if(value?.name==='TimeoutError'||value?.name==='AbortError')return {code:'TIMEOUT'};
 if(value?.name==='AI_InvalidResponseDataError'||value?.name==='AI_TypeValidationError')return {code:'INVALID_RESPONSE'};
 return {code:'REQUEST_FAILED'};
}

export function validateChoice(answer:ChoiceAnswers['answers'][string]|undefined,criteria:Record<string,unknown>){
 if(!answer||!Object.hasOwn(criteria,answer.choice)||!answer.probabilities||typeof answer.probabilities!=='object')throw new Error('Invalid Choice response');
 const keys=Object.keys(criteria),p=answer.probabilities;
 if(Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)||typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1))throw new Error('Invalid probabilities');
 if(Math.abs(Object.values(p).reduce((a,b)=>a+b,0)-1)>0.02)throw new Error('Probabilities do not sum to one');
 return answer;
}

// Whitelist one structured provider code. Never retain messages, echoed inputs,
// headers, or arbitrary error fields; the gateway wraps provider JSON in message.
function contextLimitCode(body:any):'max_tokens_exceeded'|undefined{
 let nested;
 try{if(typeof body?.error?.message==='string')nested=JSON.parse(body.error.message);}catch{}
 return [body?.error_type,body?.error?.error_type,body?.error?.code,nested?.error_type].includes('max_tokens_exceeded')?'max_tokens_exceeded':undefined;
}

const evaluateOnce=async(state:unknown,questions:Record<string,ChoiceQuestion>,timeoutMs=30000,input?:ChoiceInputOptions,longContext=false):Promise<ChoiceAnswers>=>{
 // The installed SDK predates image file parts. Keep text calls on its existing
 // path and use the documented public endpoint for opt-in image experiments.
 if(input?.image||input?.images||input?.gatewayHTTP){
  const key=process.env.AI_GATEWAY_API_KEY;
  if(!key)throw new ChoiceRequestError({code:'MISSING_CREDENTIALS'});
  const signal=AbortSignal.timeout(timeoutMs);
  try{
   const context=JSON.parse(JSON.stringify(state));
   const reference=randomUUID();
   if(input.image&&input.images)throw new ChoiceRequestError({code:'REQUEST_FAILED'});
   const images=input.image?{[reference]:input.image}:input.images;
   const assets=Object.fromEntries(Object.entries(images??{}).map(([id,image])=>[id,{type:'image',format:image.mediaType==='image/png'?'png':'jpg',data_base64:image.data}]));
   const response=await fetch('https://ai-gateway.vercel.sh/typesafe/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...(images?{'TypeSafe-Danger-Zone-Images':'true'}:{}),...(longContext?{'TypeSafe-Danger-Zone-Long-Context':'true'}:{})},body:JSON.stringify({model:(input.model||'jev-1.14.0').replace(/^typesafe-ai\//,''),state:input.image?{context,screenshot:reference}:context,...(images?{assets}:{}),questions}),signal});
   if(!response.ok){
    let providerCode;
    if(response.status===400)try{providerCode=contextLimitCode(await response.json());}catch{}
    throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:response.status,...(providerCode?{providerCode}:{})});
   }
   let body:any;
   try{body=await response.json();}catch{throw new ChoiceRequestError({code:'INVALID_RESPONSE'});}
   const usage:NonNullable<ChoiceAnswers['usage']>={};
   for(const [k,alias] of [['inputTokens','input_tokens'],['outputTokens','output_tokens']] as const){const n=body?.usage?.[k]??body?.usage?.[alias];if(typeof n==='number'&&Number.isFinite(n)&&n>=0)usage[k]=n;}
   const cost=body?.providerMetadata?.gateway?.cost;
   const costUSD=(typeof cost==='string'&&cost.trim()!==''||typeof cost==='number')?Number(cost):NaN;
   return {model:body?.model,answers:body?.answers,...(Object.keys(usage).length?{usage}:{}),...(Number.isFinite(costUSD)&&costUSD>=0?{costUSD}:{})};
  }catch(error){throw new ChoiceRequestError(signal.aborted?{code:'TIMEOUT'}:safeRequestFailure(error));}
 }
 if(process.env.AI_GATEWAY_API_KEY){
  const signal=AbortSignal.timeout(timeoutMs);
  try{
   const result=await evaluate({model:input?.model||process.env.JEV_GATEWAY_MODEL||'typesafe-ai/jev',state:JSON.parse(JSON.stringify(state)),questions,maxRetries:0,abortSignal:signal});
   return {model:result.response.modelId,answers:result.answers as ChoiceAnswers['answers']};
  }catch(error){
   throw new ChoiceRequestError(signal.aborted?{code:'TIMEOUT'}:safeRequestFailure(error));
  }
 }
 const key=process.env.TYPESAFE_API_KEY;
 if(!key)throw new ChoiceRequestError({code:'MISSING_CREDENTIALS'});
 try{
  const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.JEV_MODEL||'jev-latest',state,questions}),signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok)throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:response.status});
  try{return await response.json() as ChoiceAnswers;}
  catch(error){throw new ChoiceRequestError(error instanceof SyntaxError?{code:'INVALID_RESPONSE'}:safeRequestFailure(error));}
 }catch(error){throw new ChoiceRequestError(safeRequestFailure(error));}
};

// Retry inference only, never browser actions. An explicit live policy may
// request one fresh response after malformed output; invalid answers are never used.
// Each attempt has its own 30s timeout. SDK retries stay disabled to avoid nesting.
export const evaluateChoices=async(state:unknown,questions:Record<string,ChoiceQuestion>,policy?:RetryPolicy,input?:ChoiceInputOptions):Promise<ChoiceAnswers>=>{
 if(policy&&(!Number.isSafeInteger(policy.maxAttempts)||policy.maxAttempts<1||policy.maxAttempts>10||!Number.isSafeInteger(policy.maxElapsedMs)||policy.maxElapsedMs<1||policy.maxElapsedMs>300000||policy.retryDelaysMs&&(!policy.retryDelaysMs.length||policy.retryDelaysMs.some(n=>!Number.isSafeInteger(n)||n<0||n>60000))))throw new Error('Invalid inference recovery policy');
 const started=performance.now(),maxAttempts=policy?.maxAttempts??3;
 let invalidResponseRetried=false,longContext=false,longContextUsed=false;
 const remaining=()=>policy?policy.maxElapsedMs-(performance.now()-started):Infinity;
 const failures:RequestFailure[]=[];
 const trace=(attempts:number,budgetExhausted=false):RequestTrace=>({attempts,failures:[...failures],...(longContextUsed?{longContext:true as const}:{}),...(policy?{elapsedMs:performance.now()-started,...(budgetExhausted?{budgetExhausted:true}:{})}:{})});
 const progress=async(event:RetryProgress,attempts:number)=>{
  try{await policy?.onProgress?.(event);}
  catch(error){if(error instanceof InferenceInterruption)error.request=trace(attempts);throw error;}
 };
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  // Callers may abort on a changed observation or a safety boundary. Such guards
  // must propagate unchanged, not be mistaken for retryable provider failures.
  await progress({phase:'request',attempt,maxAttempts,elapsedMs:performance.now()-started},attempt-1);
  if(remaining()<=0)throw new ChoiceRequestError(failures.at(-1)??{code:'TIMEOUT'},trace(attempt-1,true));
  let result:ChoiceAnswers;
  try{
   longContextUsed||=longContext;
   result=await evaluateOnce(state,questions,Math.max(1,Math.min(30000,Math.ceil(remaining()))),input,longContext);
   try{
    if(typeof result?.model!=='string'||!result.answers||Object.keys(result.answers).length!==Object.keys(questions).length)throw new Error('Invalid response');
    for(const [id,q] of Object.entries(questions))validateChoice(result.answers[id],q.criteria);
   }catch{throw new ChoiceRequestError({code:'INVALID_RESPONSE'});}
  }catch(error){
   const failure=safeRequestFailure(error);failures.push(failure);
   const retryInvalid:boolean=failure.code==='INVALID_RESPONSE'&&policy?.retryInvalidResponse===true&&!invalidResponseRetried;
   const retryContext:boolean=input?.recoverContextLimit===true&&!longContext&&!!(input.image||Object.keys(input.images??{}).length)&&failure.code==='HTTP_ERROR'&&failure.statusCode===400&&failure.providerCode==='max_tokens_exceeded';
   const retryable=retryContext||retryInvalid||failure.code==='TIMEOUT'||failure.code==='HTTP_ERROR'&&
    (failure.statusCode===408||failure.statusCode===429||failure.statusCode!>=500);
   const delay=retryContext?0:policy?.retryDelaysMs?.[Math.min(attempt-1,policy.retryDelaysMs.length-1)]??attempt*2000;
   if(!retryable||attempt===maxAttempts||remaining()<=delay)throw new ChoiceRequestError(failure,trace(attempt,remaining()<=delay));
   invalidResponseRetried||=retryInvalid;
   await progress({phase:'retry',attempt,maxAttempts,elapsedMs:performance.now()-started,failure,delayMs:delay},attempt);
   if(remaining()<=delay)throw new ChoiceRequestError(failure,trace(attempt,true));
   longContext||=retryContext;
   await new Promise(resolve=>setTimeout(resolve,delay));
   continue;
  }
  if(failures.length)await progress({phase:'recovered',attempt,maxAttempts,elapsedMs:performance.now()-started},attempt);
  return {...result,request:trace(attempt)};
 }
 throw new Error('Unreachable retry state');
};
