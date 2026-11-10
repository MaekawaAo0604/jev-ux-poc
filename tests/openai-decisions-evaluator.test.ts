import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDecisionsRequest,evaluateOpenAIDecisionsRequest} from '../runner/openai-decisions-evaluator.js';
import {BetaResponseError,type ModelRequest} from '../runner/virtual-beta-core.js';
import {ChoiceRequestError} from '../jev/client.js';

const request:ModelRequest={input:{goal:'Find local item',observation:{image:'current'},userState:{memory:[{image:'memory-1',text:'Earlier local screen'}]}},timeoutMs:1000,images:{current:{mediaType:'image/png',data:'Y3VycmVudA=='},'memory-1':{mediaType:'image/png',data:'bWVtb3J5'}},questions:{nextAction:{type:'choice',instructions:'Choose the next action unchanged.',criteria:{done:'Finished',look:'Inspect the screen'}}}};
const validAnswer={name:'nextAction',type:'choice',choice:'look',confidence:0.75,probabilities:[{value:'done',probability:0.25},{value:'look',probability:0.75}]};
const validBody=()=>({model:'gpt-6-luna',answers:[structuredClone(validAnswer)],usage:{input_tokens:42,input_tokens_details:{cached_tokens:0,cache_write_tokens:0},output_tokens:0,output_tokens_details:{reasoning_tokens:0},total_tokens:42}});
async function stub(run:()=>Promise<void>,respond:(url:Parameters<typeof fetch>[0],init?:RequestInit)=>Promise<Response>=async()=>Response.json(validBody()),key:string|null='LOCAL_FAKE_KEY'){
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;
 globalThis.fetch=respond;if(key===null)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;
 try{await run();}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}
async function rejectedBody(body:unknown,code:string,kind='API_ERROR'){
 let calls=0;
 await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest(request),error=>{assert.ok(error instanceof BetaResponseError);assert.equal(error.code,code);assert.equal(error.kind,kind);assert.equal(error.response.request?.attempts,1);assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});},async()=>{calls++;return Response.json(body);});
 assert.equal(calls,1);
}

test('builds equivalent JSON, unchanged questions and every named current or memory image',()=>{
 const before=structuredClone(request),body=buildDecisionsRequest(request);
 assert.deepEqual(body,{model:'gpt-6-luna',input:[{role:'user',content:[{type:'input_json',data:request.input},{type:'input_text',text:'Image asset ID: "current"'},{type:'input_image',image_url:'data:image/png;base64,Y3VycmVudA==',detail:'original'},{type:'input_text',text:'Image asset ID: "memory-1"'},{type:'input_image',image_url:'data:image/png;base64,bWVtb3J5',detail:'original'}]}],questions:[{name:'nextAction',type:'choice',instructions:'Choose the next action unchanged.',choices:[{value:'done',description:'Finished'},{value:'look',description:'Inspect the screen'}]}]});
 assert.deepEqual(request,before);
 assert.deepEqual(JSON.parse(JSON.stringify(body)).input[0].content[0].data,before.input);
});

test('rejects unsupported request cardinalities without manufacturing choices',()=>{
 for(const questions of [{},{only:{type:'choice' as const,instructions:'One',criteria:{only:'Only'}}},Object.fromEntries(Array.from({length:401},(_,i)=>['q'+i,request.questions.nextAction])),{tooMany:{type:'choice' as const,instructions:'Many',criteria:Object.fromEntries(Array.from({length:256},(_,i)=>['v'+i,'Choice '+i]))}}])assert.throws(()=>buildDecisionsRequest({...request,questions}),ChoiceRequestError);
 const choices=Object.fromEntries(Array.from({length:255},(_,i)=>['v'+i,'Label '+i]));
 assert.equal(buildDecisionsRequest({...request,questions:{boundary:{type:'choice',instructions:'Boundary',criteria:choices}}}).questions[0].choices.length,255);
 assert.equal(buildDecisionsRequest({...request,questions:Object.fromEntries(Array.from({length:400},(_,i)=>['q'+i,request.questions.nextAction]))}).questions.length,400);
});

test('posts once to the fixed endpoint and normalizes typed probabilities and optional token usage',async()=>{
 let calls=0;
 await stub(async()=>{const result=await evaluateOpenAIDecisionsRequest(request);assert.deepEqual(result.answers,{nextAction:{choice:'look',probabilities:{done:0.25,look:0.75},confidence:0.75}});assert.equal(result.model,'gpt-6-luna');assert.deepEqual(result.usage,{inputTokens:42,outputTokens:0});assert.equal(result.request?.attempts,1);assert.deepEqual(result.request?.failures,[]);assert.equal(result.costUSD,undefined);},async(url,init)=>{calls++;assert.equal(url,'https://api.openai.com/v1/decisions');assert.equal(init?.method,'POST');assert.deepEqual(init?.headers,{Authorization:'Bearer LOCAL_FAKE_KEY','Content-Type':'application/json'});assert.ok(init?.signal instanceof AbortSignal);assert.deepEqual(JSON.parse(String(init?.body)),buildDecisionsRequest(request));return Response.json({...validBody(),secret:'PRIVATE_SENTINEL',costUSD:5});});
 assert.equal(calls,1);
});

test('does not invent usage, confidence, or probabilities when provider data is absent',async()=>{
 await stub(async()=>{const result=await evaluateOpenAIDecisionsRequest(request);assert.equal(result.usage,undefined);assert.equal(result.costUSD,undefined);},async()=>Response.json({model:'gpt-6-luna',answers:[validAnswer]}));
 await rejectedBody({model:'gpt-6-luna',answers:[{name:'nextAction',type:'choice',choice:'look'}]},'INVALID_DISTRIBUTION','INVALID_DISTRIBUTION');
 await rejectedBody({model:'gpt-6-luna',answers:[{...validAnswer,confidence:undefined}]},'INVALID_DISTRIBUTION','INVALID_DISTRIBUTION');
});

for(const [name,answers] of [
 ['missing name',[]],
 ['unexpected name',[validAnswer,{...validAnswer,name:'PRIVATE_SENTINEL'}]],
 ['duplicate name',[validAnswer,validAnswer]],
 ['wrong answer type',[{...validAnswer,type:'predicate'}]],
 ['missing answer name',[{...validAnswer,name:null}]],
] as const)test('rejects '+name,async()=>{await rejectedBody({model:'gpt-6-luna',answers},'INVALID_RESPONSE');});

for(const [name,answer] of [
 ['unknown choice',{...validAnswer,choice:'PRIVATE_SENTINEL'}],
 ['boolean choice',{...validAnswer,choice:true}],
 ['missing probability',{...validAnswer,probabilities:[{value:'look',probability:1}]}],
 ['duplicate value',{...validAnswer,probabilities:[...validAnswer.probabilities,{value:'look',probability:0}]}],
 ['unknown value',{...validAnswer,probabilities:[...validAnswer.probabilities,{value:'PRIVATE_SENTINEL',probability:0}]}],
 ['negative probability',{...validAnswer,probabilities:[{value:'done',probability:-0.1},{value:'look',probability:1.1}]}],
 ['string probability',{...validAnswer,probabilities:[{value:'done',probability:'0.25'},{value:'look',probability:0.75}]}],
 ['bad sum',{...validAnswer,probabilities:[{value:'done',probability:0.1},{value:'look',probability:0.1}]}],
 ['invalid confidence',{...validAnswer,confidence:2}],
] as const)test('rejects '+name+' while retaining safe numeric evidence',async()=>{await rejectedBody({model:'gpt-6-luna',answers:[{...answer,secret:'PRIVATE_SENTINEL'}],headers:{Authorization:'PRIVATE_SENTINEL'}},'INVALID_DISTRIBUTION','INVALID_DISTRIBUTION');});

test('preserves malformed safe numeric evidence with no arbitrary provider strings',async()=>{
 await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest(request),error=>{assert.ok(error instanceof BetaResponseError);assert.equal(error.response.answers.nextAction.choice,'UNRECOGNIZED_CHOICE');assert.equal(error.response.answers.nextAction.probabilities.done,0.8);assert.ok(Object.values(error.response.answers.nextAction.probabilities).some(Number.isNaN));assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});},async()=>Response.json({model:'gpt-6-luna',answers:[{name:'nextAction',type:'choice',choice:'PRIVATE_SENTINEL',probabilities:[{value:'done',probability:0.8},{value:'PRIVATE_SENTINEL',probability:'PRIVATE_SENTINEL'}],reason:'PRIVATE_SENTINEL'}]}));
});

test('refusals fail explicitly with no fabricated answer and preserve valid siblings',async()=>{
 const two={...request,questions:{...request.questions,second:request.questions.nextAction}};
 await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest(two),error=>{assert.ok(error instanceof BetaResponseError);assert.equal(error.code,'INVALID_RESPONSE');assert.deepEqual(Object.keys(error.response.answers),['nextAction']);assert.deepEqual(error.response.request?.failures,[{code:'INVALID_RESPONSE'}]);assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});},async()=>Response.json({model:'gpt-6-luna',answers:[validAnswer,{type:'refusal',name:'second',refusal:'PRIVATE_SENTINEL'}]}));
});

test('unexpected model takes precedence and only its safe sentinel reaches audit evidence',async()=>{await rejectedBody({model:'PRIVATE_SENTINEL',answers:[{...validAnswer,choice:'PRIVATE_SENTINEL'}]},'MODEL_MISMATCH');});

for(const status of [400,401,408,429,500,503])test('HTTP '+status+' stays sanitized with no retry',async()=>{
 let calls=0,bodyRead=false;
 await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest(request),error=>{assert.ok(error instanceof ChoiceRequestError);assert.deepEqual(error.failure,{code:'HTTP_ERROR',statusCode:status});assert.equal(error.request?.attempts,1);assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});},async()=>{calls++;const response=new Response('PRIVATE_SENTINEL',{status,headers:{Authorization:'PRIVATE_SENTINEL'}});response.json=async()=>{bodyRead=true;throw Error('PRIVATE_SENTINEL');};return response;});
 assert.equal(calls,1);assert.equal(bodyRead,false);
});

test('timeouts are sanitized and abort one request without retry',async()=>{
 let calls=0;
 await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest({...request,timeoutMs:5}),error=>{assert.ok(error instanceof ChoiceRequestError);assert.deepEqual(error.failure,{code:'TIMEOUT'});assert.equal(error.request?.attempts,1);return true;});},async(_url,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>{const alive=setTimeout(()=>reject(Error('test guard')),200);init?.signal?.addEventListener('abort',()=>{clearTimeout(alive);reject(new DOMException('PRIVATE_SENTINEL','AbortError'));},{once:true});});});
 assert.equal(calls,1);
});

test('transport exceptions and invalid JSON retain only fixed failure codes',async()=>{
 for(const [code,respond] of [['REQUEST_FAILED',async()=>{throw Object.assign(Error('PRIVATE_SENTINEL'),{headers:{Authorization:'PRIVATE_SENTINEL'}});}],['INVALID_RESPONSE',async()=>new Response('PRIVATE_SENTINEL',{status:200})]] as const){let calls=0;await stub(async()=>{await assert.rejects(evaluateOpenAIDecisionsRequest(request),error=>{assert.ok(error instanceof ChoiceRequestError);assert.deepEqual(error.failure,{code});assert.equal(error.request?.attempts,1);assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));return true;});},async()=>{calls++;return respond();});assert.equal(calls,1);}
});

test('missing credentials fail before HTTP and request construction remains credential-free',async()=>{
 let calls=0;
 await stub(async()=>{assert.equal(buildDecisionsRequest(request).model,'gpt-6-luna');await assert.rejects(evaluateOpenAIDecisionsRequest(request),error=>{assert.ok(error instanceof ChoiceRequestError);assert.deepEqual(error.failure,{code:'MISSING_CREDENTIALS'});assert.equal(error.request?.attempts,0);return true;});},async()=>{calls++;throw Error('must not call');},null);
 assert.equal(calls,0);
});
