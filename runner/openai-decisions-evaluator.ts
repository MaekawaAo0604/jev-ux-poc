import {ChoiceRequestError,validateChoice,type ChoiceAnswers,type RequestFailure,type RequestTrace} from '../jev/client.js';
import {BetaResponseError,type ModelRequest} from './virtual-beta-core.js';

const model='gpt-6-luna' as const;
const endpoint='https://api.openai.com/v1/decisions';
type ContentPart={type:'input_json';data:Record<string,unknown>}|{type:'input_text';text:string}|{type:'input_image';image_url:string;detail:'original'};
type DecisionsRequest={model:typeof model;input:{role:'user';content:ContentPart[]}[];questions:{name:string;type:'choice';instructions:string;choices:{value:string;description:string}[]}[]};
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const unit=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;

/** Translate only the already bounded model input, questions and supplied image assets. */
export function buildDecisionsRequest(request:ModelRequest):DecisionsRequest{
 const entries=Object.entries(request.questions);
 if(entries.length<1||entries.length>400)throw new ChoiceRequestError({code:'REQUEST_FAILED'});
 const questions=entries.map(([name,question])=>{
  const choices=Object.entries(question.criteria).map(([value,description])=>({value,description}));
  if(question.type!=='choice'||typeof question.instructions!=='string'||choices.length<2||choices.length>255||choices.some(choice=>typeof choice.description!=='string'))throw new ChoiceRequestError({code:'REQUEST_FAILED'});
  return {name,type:'choice' as const,instructions:question.instructions,choices};
 });
 const content:ContentPart[]=[{type:'input_json',data:request.input}];
 for(const [id,image] of Object.entries(request.images)){
  content.push({type:'input_text',text:'Image asset ID: '+JSON.stringify(id)},{type:'input_image',image_url:`data:${image.mediaType};base64,${image.data}`,detail:'original'});
 }
 return {model,input:[{role:'user',content}],questions};
}

/** Only supplied names and safe numeric evidence survive; unknown values use sentinels. */
function parseEvidence(body:unknown,request:ModelRequest):{response:ChoiceAnswers;structureValid:boolean;distributionValid:boolean}{
 const raw=object(body),answers:ChoiceAnswers['answers']={},seenNames=new Set<string>();
 const items=Array.isArray(raw.answers)?raw.answers:[];
 let structureValid=Array.isArray(raw.answers)&&items.length===Object.keys(request.questions).length,distributionValid=true;
 for(const item of items){
  const answer=object(item),name=answer.name;
  if(typeof name!=='string'||!Object.hasOwn(request.questions,name)||seenNames.has(name)){structureValid=false;continue;}
  seenNames.add(name);
  if(answer.type!=='choice'){structureValid=false;continue;}
  const criteria=request.questions[name].criteria,probabilities:Record<string,number>={},seenValues=new Set<string>();
  let valid=Array.isArray(answer.probabilities)&&unit(answer.confidence),unexpected=0;
  for(const part of Array.isArray(answer.probabilities)?answer.probabilities:[]){
   const probability=object(part),value=probability.value;
   const known=typeof value==='string'&&Object.hasOwn(criteria,value)&&!seenValues.has(value);
   let key=known?value:'';
   if(!known){valid=false;do{key='__unexpected_'+unexpected++;}while(Object.hasOwn(criteria,key)||Object.hasOwn(probabilities,key));}
   if(typeof value==='string')seenValues.add(value);
   Object.defineProperty(probabilities,key,{value:typeof probability.probability==='number'?probability.probability:Number.NaN,enumerable:true,configurable:true,writable:true});
  }
  const choice=typeof answer.choice==='string'&&Object.hasOwn(criteria,answer.choice)?answer.choice:'UNRECOGNIZED_CHOICE';
  if(typeof answer.choice!=='string'||!Object.hasOwn(criteria,answer.choice))valid=false;
  const normalized={choice,probabilities,...(typeof answer.confidence==='number'&&Number.isFinite(answer.confidence)?{confidence:answer.confidence}:{})};
  Object.defineProperty(answers,name,{value:normalized,enumerable:true,configurable:true,writable:true});
  try{validateChoice(normalized,criteria);}catch{valid=false;}
  distributionValid&&=valid;
 }
 if(Object.keys(request.questions).some(name=>!Object.hasOwn(answers,name)))structureValid=false;
 const usage:NonNullable<ChoiceAnswers['usage']>={};
 const rawUsage=object(raw.usage);
 for(const [source,target] of [['input_tokens','inputTokens'],['output_tokens','outputTokens']] as const){const value=rawUsage[source];if(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0)usage[target]=value;}
 return {response:{model:raw.model===model?model:'UNEXPECTED_MODEL',answers,...(Object.keys(usage).length?{usage}:{})},structureValid,distributionValid};
}

/** One native HTTP attempt, with credentials read only at this execution boundary. */
export async function evaluateOpenAIDecisionsRequest(request:ModelRequest):Promise<ChoiceAnswers>{
 const started=performance.now();
 const trace=(attempts:number,failures:RequestFailure[]=[]):RequestTrace=>({attempts,failures,elapsedMs:performance.now()-started});
 const key=process.env.OPENAI_API_KEY;
 if(!key?.trim())throw new ChoiceRequestError({code:'MISSING_CREDENTIALS'},trace(0,[{code:'MISSING_CREDENTIALS'}]));
 let body:DecisionsRequest;
 try{
  if(!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>300000)throw new Error('INVALID_TIMEOUT');
  body=buildDecisionsRequest(request);
 }catch{throw new ChoiceRequestError({code:'REQUEST_FAILED'},trace(0,[{code:'REQUEST_FAILED'}]));}
 const signal=AbortSignal.timeout(request.timeoutMs);
 let parsed:unknown;
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.ok)throw new ChoiceRequestError({code:'HTTP_ERROR',statusCode:response.status});
  try{parsed=await response.json();}catch{throw new ChoiceRequestError({code:signal.aborted?'TIMEOUT':'INVALID_RESPONSE'});}
 }catch(error){
  const failure:RequestFailure=signal.aborted?{code:'TIMEOUT'}:error instanceof ChoiceRequestError?error.failure:{code:object(error).name==='AbortError'||object(error).name==='TimeoutError'?'TIMEOUT':'REQUEST_FAILED'};
  throw new ChoiceRequestError(failure,trace(1,[failure]));
 }
 const {response,structureValid,distributionValid}=parseEvidence(parsed,request);
 response.request=trace(1);
 if(response.model!==model){response.request.failures=[{code:'INVALID_RESPONSE'}];throw new BetaResponseError('API_ERROR','MODEL_MISMATCH',response);}
 if(!structureValid){response.request.failures=[{code:'INVALID_RESPONSE'}];throw new BetaResponseError('API_ERROR','INVALID_RESPONSE',response);}
 if(!distributionValid){response.request.failures=[{code:'INVALID_RESPONSE'}];throw new BetaResponseError('INVALID_DISTRIBUTION','INVALID_DISTRIBUTION',response);}
 return response;
}
