import {currentJevImage} from './jev-image-wire.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium, type Browser, type Page} from 'playwright';
import {mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
import {parseCharter} from '../jev/persona.js';
import {ChoiceRequestError} from '../jev/client.js';
import {evaluateBetaRequest} from '../runner/virtual-beta-evaluator.js';
import {runBeta, BetaBudgetError, type BetaEvaluator} from '../runner/virtual-beta-core.js';
import {replayDirectory} from '../runner/virtual-beta-replay.js';

const charter=()=>parseCharter({schemaVersion:1,id:'independent',targetWebsite:'local:good',goal:'メール通知を停止する',initialState:{description:'Fresh independent local fixture',currentDate:'2026-09-19'},scope:['Local fixture'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:4,oracle:'notifications'});
const html=`<!doctype html><meta charset="utf-8"><title>AUDIT_TITLE_SECRET</title><h1>AUDIT_BODY_SECRET</h1><style>button{position:fixed;left:600px;top:420px;width:100px;height:40px}</style><button onclick="document.getElementById('result').innerHTML='<p role=status>メール通知を停止しました</p>'">AUDIT_CONTROL_SECRET</button><div id="result"></div>`;
function answer(request:Parameters<BetaEvaluator>[0],choice:string,probabilities?:Record<string,number>,model='INDEPENDENT_LOCAL_STUB'){
 return {model,answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:key==='nextAction'&&probabilities?probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))};
}
async function fixture(fn:(page:Page,dir:string)=>Promise<void>,browser?:Browser){
 const owned=browser??await chromium.launch({headless:true});
 const context=await owned.newContext({viewport:{width:1280,height:900}});
 try{await context.route('http://independent.test/**',route=>route.fulfill({contentType:'text/html',body:html}));const dir=await mkdtemp(join(tmpdir(),'jev-independent-'));console.log('independent evidence '+dir);await fn(await context.newPage(),dir);}
 finally{await context.close();if(!browser)await owned.close();}
}

test('independent: final allowed click is checked by objective oracle, even without another evaluation',async()=>{
 await fixture(async(page,dir)=>{const config=comparisonConfigs()[0];config.maxUIActions=1;let evaluations=0;
 const result=await runBeta(page,{runId:'last-click',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{evaluations++;return answer(request,'e1');}});
 assert.equal(result.objectiveSuccess,true);assert.equal(result.perceivedDone,false);assert.equal(result.termination,'UI_ACTION_LIMIT');assert.equal(result.uiActions,1);assert.equal(evaluations,1);
 assert.equal(result.steps[0].objectiveSuccess,true);assert.ok(result.steps[0].audit!.screen.text.every(t=>!t.includes('メール通知を停止しました')));
 assert.ok((await readFile(join(dir,'final.png'))).length>100);
 });
});

test('independent: full, crop and foveated PNGs reach actual gateway adapter with resolvable image references',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_SENTINEL';
 try{for(const mode of ['full','crop','foveated'] as const)await fixture(async(page,dir)=>{
 const config=comparisonConfigs()[3];config.vision.mode=mode;let calls=0;let requestForReply:Parameters<BetaEvaluator>[0];
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options!.body));calls++;
 assert.equal(body.model,'jev-1.14.0');assert.ok(currentJevImage(body));const pixels=PNG.sync.read(Buffer.from(currentJevImage(body).data_base64,'base64'));assert.equal(pixels.width,mode==='crop'?(calls===1?960:800):1280);
 const references=new Set<string>();function collect(value:unknown){if(typeof value==='string')references.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}collect(body.state);
 for(const id of Object.keys(body.assets))assert.ok(references.has(id),'unreferenced image '+id);
 if(mode!=='full'){const wire=JSON.stringify({state:body.state,questions:body.questions});for(const secret of ['AUDIT_TITLE_SECRET','AUDIT_BODY_SECRET','AUDIT_CONTROL_SECRET'])assert.ok(!wire.includes(secret));assert.equal(body.state.history,undefined);assert.equal(body.state.observation.screen,undefined);}
 const result=answer(requestForReply,calls===1?'look_0':'done',undefined,'jev-1.14.0');return new Response(JSON.stringify(result),{status:200});};
 const result=await runBeta(page,{runId:'wire-'+mode,dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{requestForReply=request;return evaluateBetaRequest(request);}});
 assert.equal(calls,2);assert.equal(result.termination,'SUBJECTIVE_DONE');assert.ok(result.steps.every(s=>s.assetFiles!.current.sha256===s.vision!.imageSha256));assert.equal((await replayDirectory(dir)).verified,true);
 });}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});

test('independent: runner samples nondegenerate probabilities across fresh seeds rather than model choice',async()=>{
 const browser=await chromium.launch({headless:true});let clicks=0,abandons=0;
 try{for(let seed=0;seed<16;seed++)await fixture(async(page,dir)=>{const config=comparisonConfigs(seed)[2];config.maxDecisions=1;
 const result=await runBeta(page,{runId:'sample-'+seed,dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>answer(request,'done',Object.fromEntries(Object.keys(request.questions.nextAction.criteria).map(k=>[k,k==='e1'||k==='abandon'?0.5:0])))});
 const selected=result.steps[0].selection!;assert.equal(selected.modelChoice,'done');assert.equal(selected.drawIndex,0);assert.notEqual(selected.selected,'done');assert.equal((await replayDirectory(dir)).verified,true);
 if(selected.selected==='e1'){clicks++;assert.equal(result.uiActions,1);assert.equal(result.objectiveSuccess,true);}else{abandons++;assert.equal(selected.selected,'abandon');assert.equal(result.termination,'ABANDONED');assert.equal(result.uiActions,0);}
 },browser);}finally{await browser.close();}
 assert.ok(clicks>=4&&clicks<=12,JSON.stringify({clicks,abandons}));assert.equal(clicks+abandons,16);console.log('independent sampling evidence '+JSON.stringify({seeds:16,clicks,abandons}));
});

test('independent requirement: late evaluation must not execute UI beyond maxRunMs',async()=>{
 await fixture(async(page,dir)=>{const config=comparisonConfigs()[0];config.maxRunMs=3000;let evaluated=false;
 const result=await runBeta(page,{runId:'late-response',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{evaluated=true;await new Promise(resolve=>setTimeout(resolve,request.timeoutMs+80));return answer(request,'e1');}});
 assert.equal(evaluated,true,'fixture must reach evaluator');assert.equal(result.termination,'TIME_LIMIT');assert.equal(result.uiActions,0,'No click may start after the deadline');assert.equal(result.objectiveSuccess,false);
 });
});

test('independent requirement: malformed gateway distribution must remain INVALID_DISTRIBUTION, not API_ERROR',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_SENTINEL';
 try{await fixture(async(page,dir)=>{const config=comparisonConfigs()[0];let current:Parameters<BetaEvaluator>[0];globalThis.fetch=async()=>new Response(JSON.stringify(answer(current,'done',{done:1},'jev-1.14.0')),{status:200});
 const result=await runBeta(page,{runId:'bad-gateway-distribution',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{current=request;return evaluateBetaRequest(request);}});
 assert.equal(result.termination,'INVALID_DISTRIBUTION');assert.ok(result.steps[0].response,'Malformed probabilities must remain inspectable');assert.equal(result.perceivedDone,false);
 });}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});

test('independent requirement: exhausted look probability records filter reason before failure',async()=>{
 await fixture(async(page,dir)=>{const config=comparisonConfigs()[1];config.maxLooks=0;
 const result=await runBeta(page,{runId:'look-filter',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>answer(request,'look_0')});
 assert.equal(result.looks,0);assert.equal(result.uiActions,0);assert.equal(result.termination,'INVALID_DISTRIBUTION');assert.ok(JSON.stringify(result.steps[0]).includes('LOOK_BUDGET_EXHAUSTED'),'Saved step must explain why valid raw probability mass was removed');
 });
});

test('independent requirement: gateway response model identity mismatch cannot be silently accepted',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='INDEPENDENT_LOCAL_SENTINEL';
 try{await fixture(async(page,dir)=>{let current:Parameters<BetaEvaluator>[0];globalThis.fetch=async()=>new Response(JSON.stringify(answer(current,'done',undefined,'OTHER_MODEL')),{status:200});
 const result=await runBeta(page,{runId:'wrong-model',dir,baseURL:'http://independent.test',charter:charter(),config:comparisonConfigs()[0],evaluate:async request=>{current=request;return evaluateBetaRequest(request);}});
 assert.equal(result.perceivedDone,false,'An unrequested model cannot produce an accepted experimental decision');assert.equal(result.termination,'API_ERROR');
 });}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldKey;}
});

test('independent requirement: terminal screenshot failure must be recorded as observation failure',async()=>{
 await fixture(async(page,dir)=>{const original=page.screenshot.bind(page);page.screenshot=async options=>{if(String(options?.path).endsWith('final.png'))throw new Error('INDEPENDENT_FINAL_CAPTURE_FAILURE');return original(options);};
 const result=await runBeta(page,{runId:'final-capture-failure',dir,baseURL:'http://independent.test',charter:charter(),config:comparisonConfigs()[0],evaluate:async request=>answer(request,'done')});
 assert.equal(result.termination,'SUBJECTIVE_DONE','Preserve the known user termination');assert.equal(result.terminalObservation?.status,'ERROR','Terminal observation failure cannot disappear from saved results');assert.equal(result.validForComparison,false);assert.ok(JSON.stringify(result.terminalObservation).includes('OBSERVATION_ERROR'));
 });
});


test('independent requirement: rejected global API reservation must not count as an actual call',async()=>{
 await fixture(async(page,dir)=>{
 const result=await runBeta(page,{runId:'global-api-exhausted',dir,baseURL:'http://independent.test',charter:charter(),config:comparisonConfigs()[0],evaluate:async()=>{throw new BetaBudgetError('API_LIMIT');}});
 assert.equal(result.termination,'API_LIMIT');assert.equal(result.apiCalls,0,'Budget rejection happens before a gateway request exists');
 });
});


test('independent requirement: slow observation cannot start a new API call after maxRunMs',async()=>{
 await fixture(async(page,dir)=>{const config=comparisonConfigs()[0];config.maxRunMs=3000;let evaluations=0;const original=page.screenshot.bind(page);
 page.screenshot=async options=>{if(!options?.path)await new Promise(resolve=>setTimeout(resolve,config.maxRunMs));return original(options);};
 const result=await runBeta(page,{runId:'slow-observation',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{evaluations++;return answer(request,'done');}});
 assert.equal(result.termination,'TIME_LIMIT');assert.equal(evaluations,0,'Expired observation must not be sent for a fresh evaluation');assert.equal(result.apiCalls,0);
 });
});

test('independent requirement: inference exhausting the remaining run time is TIME_LIMIT',async()=>{
 await fixture(async(page,dir)=>{const config=comparisonConfigs()[0];config.maxRunMs=3000;let evaluations=0;
 const result=await runBeta(page,{runId:'deadline-timeout',dir,baseURL:'http://independent.test',charter:charter(),config,evaluate:async request=>{evaluations++;await new Promise(resolve=>setTimeout(resolve,request.timeoutMs+80));throw new ChoiceRequestError({code:'TIMEOUT'});}});
 assert.equal(evaluations,1);assert.equal(result.termination,'TIME_LIMIT');assert.equal(result.uiActions,0);assert.equal(result.apiCalls,1);assert.equal(result.perceivedDone,false);
 });
});

test('independent: failed terminal oracle is unknown and invalidates comparison independently of final capture',async()=>{
 await fixture(async(page,dir)=>{const original=page.getByRole.bind(page);
 const result=await runBeta(page,{runId:'final-oracle-error',dir,baseURL:'http://independent.test',charter:charter(),config:comparisonConfigs()[0],evaluate:async request=>{page.getByRole=(role,options)=>{if(role==='status')throw new Error('INDEPENDENT_ORACLE_FAILURE');return original(role,options);};return answer(request,'done');}});
 assert.equal(result.termination,'SUBJECTIVE_DONE');assert.equal(result.perceivedDone,true);assert.equal(result.objectiveAssessment.status,'ERROR');assert.equal(result.objectiveAssessment.value,null);assert.equal(result.objectiveAssessment.code,'ORACLE_ERROR');assert.equal(result.terminalObservation.status,'RECORDED');assert.equal(result.validForComparison,false);
 });
});

