import {prepareJevImageRequest} from './jev-image-references.js';
import {evaluateChoices,validateChoice,ChoiceRequestError,type ChoiceAnswers} from '../jev/client.js';
import {BetaResponseError,type ModelRequest} from './virtual-beta-core.js';
/** Preserve candidate/probability evidence without arbitrary provider fields or unknown text. */
function answerEvidence(response:ChoiceAnswers,request:ModelRequest):ChoiceAnswers{
 const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const answers=Object.fromEntries(Object.entries(request.questions).filter(([id])=>Object.hasOwn(object(response.answers),id)).map(([id,q])=>{
  const original=object(object(response.answers)[id]);let unknown=0;
  const probabilities=Object.fromEntries(Object.entries(object(original.probabilities)).map(([key,value])=>[Object.hasOwn(q.criteria,key)?key:'__unexpected_'+unknown++,typeof value==='number'?value:Number.NaN]));
  return [id,{choice:typeof original.choice==='string'&&Object.hasOwn(q.criteria,original.choice)?original.choice:'UNRECOGNIZED_CHOICE',probabilities,...(typeof original.confidence==='number'&&Number.isFinite(original.confidence)?{confidence:original.confidence}:{})}];
 }));
 return {model:response.model==='jev-1.14.0'?response.model:'UNEXPECTED_MODEL',answers,...(response.request?{request:response.request}:{}),...(response.usage?{usage:response.usage}:{}),...(response.costUSD===undefined?{}:{costUSD:response.costUSD})};
}
/** Capture only the client's answer fields, never a raw provider error or headers. */
export async function evaluateBetaRequest(request:ModelRequest,options:{longContext?:boolean}={}):Promise<ChoiceAnswers>{
 let captured:ChoiceAnswers|undefined;
 let prepared:ReturnType<typeof prepareJevImageRequest>;
 try{prepared=prepareJevImageRequest(request);}catch{throw new ChoiceRequestError({code:'REQUEST_FAILED'},{attempts:0,failures:[{code:'REQUEST_FAILED'}]});}
 const actual=prepared.request,withBindings=(response:ChoiceAnswers):ChoiceAnswers=>({...response,request:{...(response.request??{attempts:1,failures:[]}),imageBindings:prepared.imageBindings}});
 try{
  const response=await evaluateChoices(actual.input,actual.questions,{maxAttempts:1,maxElapsedMs:request.timeoutMs},{images:actual.images,model:'jev-1.14.0',gatewayHTTP:true,...(options.longContext===true?{longContext:true}:{}),onResponse:response=>{captured=response;}});
  if(response.model!=='jev-1.14.0')throw new BetaResponseError('API_ERROR','MODEL_MISMATCH',answerEvidence(withBindings(response),request));
  return answerEvidence(withBindings(response),request);
 }catch(error){
  if(error instanceof BetaResponseError)throw error;
  if(captured&&error instanceof ChoiceRequestError&&error.failure.code==='INVALID_RESPONSE'){
   const response={...captured,...(error.request?{request:error.request}:{})};
   if(response.model!=='jev-1.14.0')throw new BetaResponseError('API_ERROR','MODEL_MISMATCH',answerEvidence(withBindings(response),request));
   try{for(const id of request.questions.nextAction?['nextAction']:Object.keys(request.questions))validateChoice(response.answers?.[id],request.questions[id].criteria);}catch{throw new BetaResponseError('INVALID_DISTRIBUTION','INVALID_DISTRIBUTION',answerEvidence(withBindings(response),request));}
   throw new BetaResponseError('API_ERROR','INVALID_RESPONSE',answerEvidence(withBindings(response),request));
  }
  if(error instanceof ChoiceRequestError)throw new ChoiceRequestError(error.failure,{...(error.request??{attempts:0,failures:[]}),imageBindings:prepared.imageBindings});
  throw error;
 }
}
