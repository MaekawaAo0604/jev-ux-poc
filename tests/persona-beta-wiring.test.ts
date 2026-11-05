import test from'node:test';import assert from'node:assert/strict';import{readFile,mkdir,access}from'node:fs/promises';
import{runHumanJev}from'../runner/human-jev-experiment.js';import{humanJevProfile}from'../runner/human-jev-profiles.js';import{parsePersona}from'../jev/persona.js';import{replayDirectory}from'../runner/virtual-beta-replay.js';
const root='reports/persona-beta-2026-11-05/parent/wiring-'+Date.now();
test('persona profile changes common behavior only while retaining unweighted legacy capabilities',()=>{
 const base=humanJevProfile('experience-inquiry-policy-off',300000,60000),p=humanJevProfile('experience-persona-unweighted' as any,300000,60000);
 assert.deepEqual(p,{...base,config:{...base.config,id:'human-screen-persona-unweighted',behavior:'user'}});
 assert.equal(humanJevProfile('experience-inquiry-policy-off').config.behavior,'goal');
});
test('invalid Persona is rejected before output or mocked dispatch',async()=>{
 await mkdir(root,{recursive:true});const out=root+'/invalid';let calls=0;await assert.rejects(runHumanJev({out,mock:true,persona:{schemaVersion:0}} as any,async()=>{calls++;throw Error('UNEXPECTED_DISPATCH');}),(error:unknown)=>error instanceof Error&&error.message==='Unsupported persona schemaVersion');
 assert.equal(calls,0);await assert.rejects(access(out));
});
test('baseline A B C reach native assessment and action without cross-run Persona or state leakage',async()=>{
 await mkdir(root,{recursive:true});const initials:string[]=[];
 for(const actor of['baseline','A','B','C']){
  const persona=actor==='baseline'?undefined:parsePersona(JSON.parse(await readFile('experiments/persona/persona-'+actor.toLowerCase()+'.json','utf8'))),expected=structuredClone(persona);let native=0,assessment=0,action=0;
  const saved=await runHumanJev({out:root+'/'+actor,mock:true,mode:'experience-persona-unweighted' as any,recoveryFixture:{version:1,task:'workshop',condition:'unchanged'},maxRunMs:300000,visualRequestMs:60000,...(persona?{persona}:{})} as any,async request=>{
   const p=(request.input.exploration as any)?.persona;assert.deepEqual(p,expected);assert.deepEqual((request.input.userState as any).expectations,expected?.expectations??[]);
   assert.equal((request.input.observation as any).screen,undefined);assert.equal((request.input.exploration as any).charter.oracle,undefined);
   if(request.questions.nextAction)action++;else assessment++;
   return{model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
    const fallback=['unknown','none','uncertain'].find(k=>Object.hasOwn(q.criteria,k))??Object.keys(q.criteria)[0];
    const choice=id==='nextAction'?'done':id==='decisionBasis'?'goal':id==='workingInquiry_plan'?Object.keys(q.criteria).at(-1)!:id==='knowledge'?'insufficient':id==='goal'?'uncertain':fallback;
    return[id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
   }))};
  },async request=>{
   native++;assert.deepEqual(request.persona,expected);return{model:'gpt-6-luna',status:'completed',output:{continuity:[],conditions:[],relations:request.candidates.map(c=>({candidateId:c.id,conditionIds:[],priorConditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]},rawText:JSON.stringify({continuity:[],conditions:[],relations:request.candidates.map(c=>({candidateId:c.id,conditionIds:[],priorConditionIds:[],relation:'unknown',currentEvidence:null,expectedResult:null})),unknowns:[]}),request:{attempts:1,httpReceived:true,statusCode:200},costUSD:null};
  });
  assert.equal(native,1);assert.equal(assessment,1);assert.equal(action,1);assert.deepEqual(saved.result.input.persona,expected);assert.deepEqual(persona,expected);
  const m=JSON.parse(await readFile(root+'/'+actor+'/manifest.json','utf8'));assert.deepEqual(m.persona,expected??null);assert.equal(m.actualAPIRequests,0);initials.push(saved.result.steps[0].assetFiles!.current.sha256);
  assert.equal((await replayDirectory(root+'/'+actor+'/exploration')).verified,true);
 }
 assert.equal(new Set(initials).size,1);
});
