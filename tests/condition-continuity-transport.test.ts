import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildOpenAIVisualHypothesisRequest,extractOpenAIVisualHypotheses} from '../runner/openai-visual-hypotheses.js';
import {VisualHypothesisTransportError,type VisualHypothesisRequest} from '../jev/virtual-beta/visual-hypotheses-contracts.js';

const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const imageSha256=sha(Buffer.from(png,'base64'));
const goal='Change A and confirm saved under constraints.';
const previous={observationId:'o1',imageSha256};
const current={observationId:'o2',imageSha256};
function oldRequest():VisualHypothesisRequest{return {goal,currentDate:'2026-10-30',current:previous,sources:[{...previous,image:'current'}],candidates:[{id:'e1',type:'click'}],memory:{schemaVersion:1,records:[]},images:{current:{mediaType:'image/png',data:png}},timeoutMs:1000};}
function context(){return {schemaVersion:1,capacity:3,memory:{schemaVersion:1,goalSha256:sha(goal),lastObservation:{...previous},entries:[{id:'o1_c1',description:'The enabling condition was unmet.',lastGrounded:{status:'unmet',evidence:{...previous,quote:'Check is pending',quoteStatus:'model-transcribed-unverified'}},currentStatus:'unmet',lastAssessed:{...previous},transition:'introduced'}]}};}
function request():VisualHypothesisRequest{return {...oldRequest(),current:{...current},sources:[{...previous,image:'history'},{...current,image:'current'}],images:{current:{mediaType:'image/png',data:png},history:{mediaType:'image/png',data:png}},conditionContinuity:context()} as VisualHypothesisRequest;}
function output(){return {conditions:[],relations:[{candidateId:'e1',conditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null}],unknowns:['The previous condition is not visible here.'],continuity:[{priorId:'o1_c1',conditionId:null,change:'unobserved',explanation:'The current image does not show this condition.'}]};}
function envelope(value:unknown){return {model:'gpt-6-luna',status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:15,output_tokens:9,total_tokens:24}};}
async function stub(reply:(url:any,init:any)=>Promise<Response>,run:()=>Promise<void>){
 const fetchBefore=globalThis.fetch,keyBefore=process.env.OPENAI_API_KEY;globalThis.fetch=reply;process.env.OPENAI_API_KEY='LOCAL_CONTINUITY_TEST_KEY';
 try{await run();}finally{globalThis.fetch=fetchBefore;if(keyBefore===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=keyBefore;}
}
function input(body:ReturnType<typeof buildOpenAIVisualHypothesisRequest>){const first=body.input[0].content[0];assert.equal(first.type,'input_text');return JSON.parse((first as {text:string}).text);}

// Captured from the pre-change native adapter at HEAD 930be34; no feature builder computes this expectation.
test('absent continuity retains the exact native body bytes, schema and instructions',()=>{
 const body=buildOpenAIVisualHypothesisRequest(oldRequest());
 assert.equal(sha(JSON.stringify(body)),'f43ee86d9780c73b274975d468963224c21362481170d7f42dbff97588592e4a');
 assert.equal(Object.hasOwn(input(body),'conditionContinuity'),false);
 assert.equal(Object.hasOwn(body.text.format.schema.properties,'continuity'),false);
});

test('opt-in native body carries bounded historical claims and requires every prior reassessment in the same schema',()=>{
 const req=request(),body=buildOpenAIVisualHypothesisRequest(req),value=input(body),schema:any=body.text.format.schema;
 assert.deepEqual(value.conditionContinuity,context());
 assert.deepEqual([...schema.required].sort(),['conditions','continuity','relations','unknowns']);
 assert.equal(schema.additionalProperties,false);
 assert.equal(schema.properties.continuity.minItems,1);assert.equal(schema.properties.continuity.maxItems,1);
 assert.match(body.instructions,/every (?:previous|prior|remembered) (?:condition|claim)/i);
 assert.match(body.instructions,/unobserved/i);assert.match(body.instructions,/historical/i);assert.match(body.instructions,/current.image evidence/i);
 assert.match(body.instructions,/persona behavior/);assert.match(body.instructions,/do not choose an action or invent probabilities/i);
 assert.equal(body.model,'gpt-6-luna');assert.equal(body.max_output_tokens,4000);assert.equal(body.store,false);
 for(const field of ['tools','conversation','previous_response_id','reasoning','temperature','seed'])assert.equal(Object.hasOwn(body,field),false);
 assert.equal(body.input[0].content.filter(part=>part.type==='input_image').length,2);
});

test('validated native input never reads hidden root/candidate fields or inherited serialization hooks',()=>{
 const req:any=request();
 for(const key of ['DOM','audit','fixture','human','userState','labels','routes'])Object.defineProperty(req,key,{enumerable:true,get(){throw Error('HIDDEN_ROOT_LEAK');}});
 for(const key of ['label','coordinates','geometry','DOM'])Object.defineProperty(req.candidates[0],key,{enumerable:true,get(){throw Error('HIDDEN_CANDIDATE_LEAK');}});
 const remember=req.conditionContinuity.memory.entries[0];
 for(const value of [req.conditionContinuity,req.conditionContinuity.memory,remember,remember.lastGrounded,remember.lastGrounded.evidence])Object.defineProperty(value,'toJSON',{get(){throw Error('SERIALIZATION_HOOK_LEAK');}});
 const value=input(buildOpenAIVisualHypothesisRequest(req));
 assert.deepEqual(Object.keys(value).sort(),['candidates','conditionContinuity','current','currentDate','goal','memory','sources']);
 assert.deepEqual(value.candidates,[{id:'e1',type:'click'}]);assert.deepEqual(value.conditionContinuity,context());
});

test('invalid continuity fails before native dispatch without traversing unknown properties',async()=>{
 const req:any=request();Object.defineProperty(req.conditionContinuity,'audit',{enumerable:true,get(){throw Error('AUDIT_READ');}});
 let calls=0;await stub(async()=>{calls++;throw Error('UNEXPECTED_FETCH');},async()=>{
  assert.throws(()=>buildOpenAIVisualHypothesisRequest(req),error=>error instanceof Error&&!error.message.includes('AUDIT_READ'));
  await assert.rejects(extractOpenAIVisualHypotheses(req),error=>error instanceof VisualHypothesisTransportError&&error.evidence.attempts===0&&!error.evidence.httpReceived);
 });assert.equal(calls,0);
});

test('one native HTTP200 admits explicit unobserved continuity and keeps bounded provider text/accounting',async()=>{
 let calls=0;const value=output();await stub(async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(init.method,'POST');
  const sent=JSON.parse(init.body);assert.deepEqual(input(sent).conditionContinuity,context());assert.equal(Object.hasOwn(sent,'reasoning'),false);
  return Response.json(envelope(value));
 },async()=>{
  const response=await extractOpenAIVisualHypotheses(request());assert.equal(response.status,'completed');assert.deepEqual(response.output,value);assert.equal(response.rawText,JSON.stringify(value));
  assert.deepEqual(response.request,{attempts:1,httpReceived:true,statusCode:200});assert.deepEqual(response.usage,{inputTokens:15,outputTokens:9,totalTokens:24});assert.equal(response.costUSD,null);
 });assert.equal(calls,1);
});

for(const [name,change] of [
 ['missing reassessment',(value:any)=>{value.continuity=[];}],
 ['unknown prior',(value:any)=>{value.continuity[0].priorId='o99_c1';}],
 ['duplicate reassessment',(value:any)=>{value.continuity.push({...value.continuity[0]});}],
 ['unsupported resolution',(value:any)=>{value.continuity[0]={priorId:'o1_c1',conditionId:null,change:'resolved',explanation:'It must now be resolved.'};}],
 ['historical resolution',(value:any)=>{value.conditions=[{id:'c1',description:'The enabling condition is satisfied.',status:'satisfied',evidence:{observationId:'o1',quote:'Check is pending'},uncertainty:''}];value.continuity[0]={priorId:'o1_c1',conditionId:'c1',change:'resolved',explanation:'Only a historical quote is present.'};}],
] as const)test('HTTP200 '+name+' is rejected by native admission without retry or fabricated success',async()=>{
 const value=output();change(value);let calls=0;await stub(async()=>{calls++;return Response.json(envelope(value));},async()=>{
  const response=await extractOpenAIVisualHypotheses(request());assert.equal(response.status,'invalid-response');assert.deepEqual(response.output,value);assert.equal(response.rawText,JSON.stringify(value));assert.deepEqual(response.request,{attempts:1,httpReceived:true,statusCode:200});
 });assert.equal(calls,1);
});

test('opt-in response reading still rejects oversized envelopes and cancels the stream',async()=>{
 let calls=0,cancelled=false;await stub(async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(262145).fill(65));},cancel(){cancelled=true;}}),{status:200});},async()=>{
  const response=await extractOpenAIVisualHypotheses(request());assert.equal(response.status,'invalid-response');assert.deepEqual(response.output,{code:'ENVELOPE_TOO_LARGE_OR_INVALID_ENCODING'});assert.equal(response.rawText,'');assert.equal(response.request.httpReceived,true);
 });assert.equal(calls,1);assert.equal(cancelled,true);
});

test('first opt-in observation sends empty continuity and admits an empty transition list',async()=>{
 const req:any=oldRequest();req.conditionContinuity={schemaVersion:1,capacity:3,memory:{schemaVersion:1,goalSha256:sha(goal),lastObservation:null,entries:[]}};
 const body=buildOpenAIVisualHypothesisRequest(req),schema:any=body.text.format.schema;
 assert.deepEqual(input(body).conditionContinuity,req.conditionContinuity);
 assert.equal(schema.properties.continuity.minItems,0);assert.equal(schema.properties.continuity.maxItems,0);
 assert.ok(!JSON.stringify(schema).includes('"enum":[]'));
 const value={...output(),continuity:[]};await stub(async()=>Response.json(envelope(value)),async()=>{assert.equal((await extractOpenAIVisualHypotheses(req)).status,'completed');});
});

test('current-image evidence admits resolution through the existing native response parser',async()=>{
 const value:any=output();value.conditions=[{id:'c1',description:'The enabling condition is now satisfied.',status:'satisfied',evidence:{observationId:'o2',quote:'Check is complete'},uncertainty:''}];value.continuity=[{priorId:'o1_c1',conditionId:'c1',change:'resolved',explanation:'The current image confirms this condition.'}];
 await stub(async()=>Response.json(envelope(value)),async()=>{const response=await extractOpenAIVisualHypotheses(request());assert.equal(response.status,'completed');assert.deepEqual(response.output,value);});
});


test('opt-in instructions explicitly reassess every claim while preserving uncertainty and persona',()=>{
 const body=buildOpenAIVisualHypothesisRequest(request());
 assert.match(body.instructions,/every (?:previous|prior|remembered) (?:condition|claim)/i);
 assert.match(body.instructions,/unobserved/i);assert.match(body.instructions,/historical/i);assert.match(body.instructions,/current.image evidence/i);
 assert.match(body.instructions,/persona behavior/);assert.match(body.instructions,/do not choose an action or invent probabilities/i);
});
