import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeSemanticRun,compareSemanticRuns} from '../runner/semantic-analysis.js';
import {createSemanticTrials} from '../runner/semantic-protocol.js';

// Independent adversarial evidence construction: object positions and identities differ
// from the ordinary semantic-analysis fixtures; deliberately do not import their helper.
function evidence(ui='reference',mapping='A',replicate=1,choice=mapping):any {
 const controls=[{id:'alpha',type:'button',text:'設定Aを適用'},{id:'beta',type:'button',text:'設定Bを適用'}];
 const regions=[{id:'semantic-cue',rect:{x:1050,y:740,width:150,height:80},definition:'element-client-rect'}, {id:'semantic-a',rect:{x:680,y:510,width:80,height:40},definition:'element-client-rect'}, {id:'semantic-b',rect:{x:830,y:510,width:80,height:40},definition:'element-client-rect'}];
 const observations=[{x:320,y:210,width:640,height:480},{x:640,y:435,width:640,height:465}].map((clearRect,i)=>({number:i+1,inputSha256:i?'later':'identical-wire',audit:{screen:{title:'test',text:[],elements:structuredClone(controls),canScrollUp:false,canScrollDown:false},url:'local',rawScreenshot:'raw.png',sourceSha256:'raw-'+mapping,regionsOfInterest:structuredClone(regions)},vision:{sourceSha256:'raw-'+mapping,imageSha256:i?'later-image':'identical-image',clearRect,mode:'crop'},questions:{nextAction:{type:'choice',instructions:'Choose',criteria:{alpha:'[alpha]',beta:'[beta]',look_3:'look',done:'done'}}},selection:{selected:i?(choice==='A'?'alpha':'beta'):'look_3',adjustments:[]},action:i?{type:'click',elementId:choice==='A'?'alpha':'beta'}:{type:'look',point:{x:960,y:675}}}));
 return {schemaVersion:1,runId:`${ui}-${mapping}-${replicate}`,condition:'semantic',config:{schemaVersion:1,id:'semantic-capability',vision:{mode:'crop',clearWidth:640,clearHeight:480,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'goal',maxAPICalls:4,maxDecisions:4,maxUIActions:4,maxLooks:3,maxRunMs:90000},input:{goal:'fixed'},initialFingerprint:'raw-'+mapping,semantic:{trial:{id:`${ui}-${mapping}-${replicate}`,pairId:`${ui}-${replicate}`,replicate,fixture:{version:1,ui,mapping}},definitionHash:'definition',initialProductImage:{file:'initial.png',sha256:'raw-'+mapping}},objectiveSuccess:choice===mapping,perceivedDone:false,termination:'OBJECTIVE_SUCCESS',looks:1,uiActions:1,decisions:2,apiCalls:2,terminalObservation:{status:'RECORDED'},objectiveAssessment:{status:'OK',value:choice===mapping},validForComparison:true,steps:observations};
}
function complete(){return ['reference','position-only','wording-only'].flatMap(ui=>[1,2].flatMap(rep=>['A','B'].map(mapping=>evidence(ui,mapping,rep))));}

test('independent: the committed twelve-slot assignment is regenerated exactly before outcomes',()=>{
 const protocol=JSON.parse(readFileSync('experiments/virtual-beta/semantic-protocol.json','utf8'));
 assert.equal(protocol.assignmentSeed,313977649);
 assert.deepEqual(createSemanticTrials(['reference','position-only','wording-only'],2,protocol.assignmentSeed),protocol.trials);
 assert.equal(protocol.maximumRequests,12*protocol.perTrialMaximum);
});

test('independent: duplicate or non-finite ROI evidence fails closed instead of manufacturing acquisition',()=>{
 for(const mutate of [(r:any)=>r.steps[1].audit.regionsOfInterest.push(structuredClone(r.steps[1].audit.regionsOfInterest[0])),(r:any)=>r.steps[1].audit.regionsOfInterest[0].rect.width=Infinity]){
  const r=evidence();mutate(r);const a=analyzeSemanticRun(r);
  assert.equal(a.cue.acquiredBeforeOrAtFirstChoice,null);assert.equal(a.metric.score,0);assert.equal(a.classification.eligible,false);
 }
});

test('independent: prompt label spoofing cannot replace missing literal audited control identity',()=>{
 const r=evidence();r.steps[1].audit.screen.elements[0].text='Other';r.steps[1].questions.nextAction.criteria.alpha='設定Aを適用';
 const a=analyzeSemanticRun(r);assert.equal(a.choice.first,null);assert.equal(a.metric.score,0);assert.equal(a.classification.eligible,false);
});

test('independent: prior whole exposure survives a later crop while altered raw source invalidates it',()=>{
 const r=evidence();const last=structuredClone(r.steps[1]);r.steps[1].action={type:'look',point:{x:640,y:450}};r.steps[1].selection.selected='look_3';last.number=3;last.vision.clearRect=structuredClone(r.steps[0].vision.clearRect);r.steps.push(last);
 assert.equal(analyzeSemanticRun(r).metric.score,1);
 r.steps[1].vision.sourceSha256='changed';assert.equal(analyzeSemanticRun(r).metric.score,0);assert.equal(analyzeSemanticRun(r).cue.rawScreenStableBeforeChoice,false);
});

test('independent: a single failed trial disables both exact tests and remains in the fixed denominator',()=>{
 const results=complete();results[4].termination='API_ERROR';results[4].validForComparison=false;
 const a=compareSemanticRuns(results);assert.equal(a.counts.observed,12);assert.equal(a.counts.infraInvalid,1);assert.equal(a.counts.strictSuccesses,11);assert.equal(a.counts.strictSuccessRate,11/12);
 assert.equal(a.mappingTest.status,'unavailable');assert.equal(a.mappingTest.pValue,null);assert.equal(a.uiTest.status,'unavailable');assert.equal(a.uiTest.pValue,null);
});

test('independent: five perfect pairs and an always-A pair give exact mapping p=1/32',()=>{
 const results=complete();const b=results.find(r=>r.semantic.trial.fixture.ui==='wording-only'&&r.semantic.trial.replicate===2&&r.semantic.trial.fixture.mapping==='B')!;
 b.steps[1].action.elementId='alpha';b.steps[1].selection.selected='alpha';b.objectiveSuccess=false;b.objectiveAssessment.value=false;
 const a=compareSemanticRuns(results);assert.equal(a.counts.strictSuccesses,11);assert.equal(a.mappingTest.status,'available');assert.equal(a.mappingTest.pValue,1/32);
 // Five paired binary orientations must match; the insensitive pair contributes one
 // under either orientation. Exactly two of the 64 assignments reach eleven.
});

test('independent: preservation oracle rejects earlier display changes even after display is restored',async()=>{
 const [{createServer},{chromium},{mkdtemp},{tmpdir},{join},{runBeta},{parseCharter}]=await Promise.all([import('vite'),import('playwright'),import('node:fs/promises'),import('node:os'),import('node:path'),import('../runner/virtual-beta-core.js'),import('../jev/persona.js')]);
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');
 const baseURL='http://127.0.0.1:'+address.port,browser=await chromium.launch({headless:true}),root=await mkdtemp(join(tmpdir(),'independent-semantic-policy-'));
 const charter=parseCharter(JSON.parse(readFileSync('experiments/persona/charter-semantic-preservation.json','utf8')));
 const config=JSON.parse(readFileSync('experiments/virtual-beta/semantic-capability.json','utf8')).find((c:any)=>c.id==='semantic-capability');
 try{for(const mapping of ['A','B'] as const)for(const wrongCount of [0,1,2]){
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort());
  try{const page=await context.newPage(),correct=mapping==='A'?'e1':'e2',wrong=mapping==='A'?'e2':'e1',script=[...Array(wrongCount).fill(wrong),correct,'done'];let n=0;
   const result=await runBeta(page,{runId:mapping+'-'+wrongCount,dir:join(root,mapping+'-'+wrongCount),baseURL,charter,config,preserveDisplay:true,semanticTrial:{id:'test',pairId:'test',replicate:1,fixture:{version:1,ui:'reference',mapping}},evaluate:async({questions,input})=>{
    assert.doesNotMatch(JSON.stringify({questions,input}),/objectivePolicy|displayChanges|data-change-count|mapping|semanticFixture/);
    const choice=script[n++];return {model:'INDEPENDENT_LOCAL_SCRIPT',answers:Object.fromEntries(Object.entries(questions).map(([key,q])=>{const value=key==='nextAction'?choice:'goal';return [key,{choice:value,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===value?1:0]))}];}))};
   }});
   assert.equal(result.objectiveAssessment.status,'OK');assert.equal(result.objectiveSuccess,wrongCount===0,`${mapping}, wrong clicks ${wrongCount}`);
   assert.equal(result.semantic?.objectivePolicy,'mail-and-display-preserved');
   assert.equal(await page.locator('.semantic-display-state').innerText(),wrongCount===1?'コンパクト':'標準');
   assert.equal(await page.locator('.semantic-display-state').getAttribute('data-change-count'),String(wrongCount));
  }finally{await context.close();}
 }}finally{await browser.close();await server.close();}
});
