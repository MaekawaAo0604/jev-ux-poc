import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTransferRuns,type TransferRunRecord} from '../runner/transfer-analysis.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {transferDefinition,type TransferFixture} from '../app/transfer-fixture.js';
import type {BetaResult} from '../runner/virtual-beta-core.js';
function fixture(task:'catalog'|'draft',text:string):TransferRunRecord{
 const f:TransferFixture={version:1,task,variant:'alpha'};
 const result:BetaResult={schemaVersion:1,runId:'confirmation',condition:'human-screen-goal-search-grounded',code:{revision:'producer',sourceHash:'fixed'},config:humanJevProfile('experience-goal-search-grounded').config,input:{charter:{schemaVersion:1,id:'fixture',targetWebsite:'local:good',goal:transferDefinition(f).goal,initialState:{description:'initial',currentDate:'2026-10-29'},scope:[],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15}},initialFingerprint:'fp',objectiveSuccess:true,objectiveAssessment:{status:'OK',value:true},terminalObservation:{status:'RECORDED'},validForComparison:true,perceivedDone:true,termination:'SUBJECTIVE_DONE',looks:0,uiActions:0,decisions:1,apiCalls:2,apiMs:1,uiMs:1,elapsedMs:2,modeledUserMs:null,steps:[{number:1,observationId:'o1',audit:{url:'http://localhost/good/',rawScreenshot:'raw.png',sourceSha256:'raw',screen:{title:'fixture',text:[text],elements:[],canScrollUp:false,canScrollDown:false}},assetFiles:{current:{file:'input.png',sha256:'current'}}}]};
 return {id:task+'-alpha-r1',kind:'novel',fixture:f,replicate:1,status:'RESULT',requests:2,initialImageSha256:'initial',result,frameChecks:[{step:1,stage:'action',observationId:'o1',imageSha256:'current',validCurrentFrame:true,successfulResponse:true,scope:'full-viewport-current'}]};
}
const credited=(r:TransferRunRecord)=>analyzeTransferRuns([r]).runs[0].deliveredConfirmation.credited;
test('saved catalog confirmation survives React text-node whitespace without changing target or punctuation',()=>{
 const r=fixture('catalog','「 川辺の記録 」をマイリストに追加しました');assert.equal(credited(r),true);
 r.result!.steps[0].audit!.screen.text=['「 朝の港 」をマイリストに追加しました'];assert.equal(credited(r),false);
 r.result!.steps[0].audit!.screen.text=['川辺の記録をマイリストに追加しました'];assert.equal(credited(r),false);
 r.result!.steps[0].audit!.screen.text=['「 川辺の記録 」をマイリストに追加'];assert.equal(credited(r),false);
});
test('saved scope confirmation survives extracted spacing; unsaved or wrong scope/target remains uncredited',()=>{
 const r=fixture('draft','「 水辺の散歩 」の公開範囲を チーム内 に保存しました');assert.equal(credited(r),true);
 for(const text of ['「 水辺の散歩 」の公開範囲を 自分だけ に保存しました','「 星を見に行く 」の公開範囲を チーム内 に保存しました','編集中の公開範囲：チーム内 · 未保存']){r.result!.steps[0].audit!.screen.text=[text];assert.equal(credited(r),false);}
});
test('whitespace tolerance never bypasses successful current-image identity or proves understanding',()=>{
 const r=fixture('catalog','「 川辺の記録 」をマイリストに追加しました');assert.equal(credited(r),true);
 r.frameChecks![0].successfulResponse=false;assert.equal(credited(r),false);
 r.frameChecks![0].successfulResponse=true;r.frameChecks![0].imageSha256='retained';assert.equal(credited(r),false);
 r.frameChecks![0].imageSha256='current';r.frameChecks![0].validCurrentFrame=false;assert.equal(credited(r),false);
});
