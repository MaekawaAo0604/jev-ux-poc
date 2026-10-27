import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PNG} from 'pngjs';
import {CompletionFrames} from '../jev/completion-frames.js';
import {captureVisualObservation} from '../runner/visual-evidence.js';
import {jevDecide} from '../jev/decide.js';
import type {ChoiceQuestion,ChoiceAnswers} from '../jev/client.js';
import type {State} from '../jev/types.js';
const questions={completionCoverage:{type:'choice' as const,instructions:'ALL ORIGINAL REQUIREMENTS',criteria:{complete:'all',incomplete:'missing',uncertain:'unknown'}}};
function response(q:Record<string,ChoiceQuestion>,choice:string):ChoiceAnswers{return {model:'TEST',answers:Object.fromEntries(Object.entries(q).map(([id,v])=>[id,{choice,probabilities:Object.fromEntries(Object.keys(v.criteria).map(k=>[k,Number(k===choice)]))}]))};}
async function fixture(run:(dir:string,frames:CompletionFrames,calls:any[])=>Promise<void>,assessment='complete'){
 const dir=await mkdtemp(join(tmpdir(),'jev-completion-')),calls:any[]=[];
 const frames=new CompletionFrames(dir,3,async(input,q,images)=>{calls.push({input,q,images});return response(q,assessment);});
 try{for(let step=1;step<=3;step++){const png=new PNG({width:2,height:2});png.data.fill(step*60);const bytes=PNG.sync.write(png),file='step-'+step+'.png';await writeFile(join(dir,file),bytes);frames.capture(captureVisualObservation(bytes,step,file,'https://example.com'));}await run(dir,frames,calls);}finally{await rm(dir,{recursive:true,force:true});}
}
test('completion receives every real frame in chronological order, with current exactly once and original context',async()=>fixture(async(_dir,frames,calls)=>{
 const input={goal:'Compare before and after without saving',exploration:{persona:{id:'A'}},screen:{text:['current only']}};
 await frames.evaluate(input,questions);
 assert.equal(calls.length,1);const {input:sent,q,images}=calls[0];assert.equal(sent.goal,input.goal);assert.deepEqual(sent.exploration,input.exploration);assert.deepEqual(sent.screen,input.screen);
 assert.deepEqual(sent.completionObservations.map((o:any)=>[o.id,o.current]),[['v1',false],['v2',false],['v3',true]]);assert.equal(Object.keys(images).length,3);
 for(const o of sent.completionObservations)assert.ok(images[o.screenshot]);
 assert.match(q.completionCoverage.instructions,/ALL ORIGINAL REQUIREMENTS/);assert.equal(frames.snapshot().requests[0].assessment,'complete');assert.equal(frames.snapshot().objectiveVerified,false);
 assert.ok(!JSON.stringify(frames.snapshot()).includes('base64'));assert.throws(()=>frames.capture(frames.snapshot().observations[0]),/INVALID_SOURCE/);
}));
for(const failure of ['changed','missing','path'] as const)test('untrusted completion source fails before inference: '+failure,async()=>fixture(async(dir,frames,calls)=>{
 if(failure==='changed')await writeFile(join(dir,'step-1.png'),'different');
 else if(failure==='missing')await rm(join(dir,'step-1.png'));
 else{const observation=frames.snapshot().observations[0];assert.throws(()=>new CompletionFrames(dir,3).capture({...observation,file:'../private.png'}),/INVALID_SOURCE/);return;}
 await assert.rejects(()=>frames.evaluate({goal:'Goal'},questions));assert.equal(calls.length,0);assert.equal(frames.snapshot().requests[0].status,'error');assert.equal(frames.evidence().supported,false);
}));
test('past frames cannot be injected into navigation requests',async()=>fixture(async(_dir,frames,calls)=>{
 await assert.rejects(()=>frames.evaluate({goal:'Goal'},{nextAction:{type:'choice',instructions:'choose',criteria:{done:'done'}}}),/COMPLETION_ONLY/);assert.equal(calls.length,0);
}));
for(const assessment of ['incomplete','uncertain','complete'])test('frame availability alone never bypasses whole-goal verdict: '+assessment,async()=>fixture(async(_dir,frames)=>{
 const state:State={goal:'Compare both states; do not save',currentDate:'2026-10-26',history:[],screen:{title:'latest',text:['later state'],elements:[],canScrollUp:false,canScrollDown:true}};
 const candidates={scroll_down:{label:'scroll',action:{type:'scroll' as const,direction:'down' as const}},done:{label:'done',action:{type:'done' as const}}};
 const decision=await jevDecide(state,candidates,{verifyCompletion:true,completionEvidence:()=>frames.evidence()},async(input,q)=>q.completionCoverage?frames.evaluate(input,q):response(q,'scroll_down'));
 assert.equal(decision.action.type,assessment==='complete'?'done':'scroll');assert.equal(decision.completionCheck?.assessment,assessment);assert.equal(frames.snapshot().requests.length,1);
},assessment));

test('completion uses existing long-context recovery without dropping source frames',async()=>fixture(async(dir,originalFrames)=>{
 const fetchBefore=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY,requests:any[]=[];process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{requests.push({body:JSON.parse(String(init?.body)),headers:init?.headers});return requests.length===1?Response.json({error:{code:'max_tokens_exceeded'}},{status:400}):Response.json(response(questions,'incomplete'));};
 try{const frames=new CompletionFrames(dir,3);for(const source of originalFrames.snapshot().observations)frames.capture(source);const result=await frames.evaluate({goal:'Compare before and after'},questions);assert.equal(result.answers.completionCoverage.choice,'incomplete');assert.equal(requests.length,2);assert.equal(requests[1].headers['TypeSafe-Danger-Zone-Long-Context'],'true');assert.deepEqual(requests[0].body,requests[1].body);assert.equal(Object.keys(requests[1].body.assets).length,3);assert.equal(frames.snapshot().requests[0].request?.longContext,true);}
 finally{globalThis.fetch=fetchBefore;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
}));
