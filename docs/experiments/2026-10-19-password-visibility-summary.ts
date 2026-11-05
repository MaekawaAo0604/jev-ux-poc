import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const dir=process.argv[2];assert.ok(dir,'Pass the completed audit directory');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const sourceHashes:{file:string;sha256:string}[]=[];
async function source(file:string){const b=await readFile(file);sourceHashes.push({file,sha256:hash(b)});return b;}
const data=JSON.parse((await source(join(dir,'audit.json'))).toString());
assert.equal(data.responses.length,data.requests.length);assert.equal(data.responses.filter((r:any)=>r.status==='ERROR').length,0);
for(const [file,sha] of Object.entries(data.codeSha256))assert.equal(hash(await readFile(file)),sha);
for(const f of data.audit)assert.equal(hash(await readFile(f.file)),f.sha256);
const real=data.responses.filter((r:any)=>!data.inputs[r.id].synthetic);
const controls=['synthetic-answer','synthetic-heading','synthetic-unrelated'].map(id=>{
 const rows=data.responses.filter((r:any)=>r.id===id),expected=data.inputs[id].expectedPassword;
 assert.equal(rows.length,3);
 const choices=rows.map((r:any)=>r.response.answers.image_check_0.choice);
 assert.ok(choices.every((c:string)=>c===expected));
 return {id,synthetic:true,expectedPassword:expected,choices,interpretation:'Test fixture only; not an official website statement'};
});
assert.equal(data.audit.length,23);assert.equal(real.length,17);
assert.ok(real.every((r:any)=>r.response.answers.image_check_0.choice==='not_shown'));
assert.ok(data.audit.every((r:any)=>r.offlineDOMPasswordMatches.length===0));
assert.ok(data.audit.every((r:any)=>r.originalCurrentJudgments.password==='not_shown'));
const finalFile=join(data.source,'step-23.json'),supportFile=join(data.source,'step-19.json');
const final=JSON.parse((await source(finalFile)).toString()),support=JSON.parse((await source(supportFile)).toString());
assert.equal(final.result,'STUCK');assert.equal(final.decision.choice,'stuck');
assert.equal(final.decision.recovery.initialDecision.choice,'scroll_up');
assert.ok(final.decision.recovery.requests.length>0);
const forum=support.state.screen.elements.find((e:any)=>e.id==='e18');
assert.equal(forum.text,"7-Zip's Forum at SourceForge");assert.equal(forum.available,false);assert.equal(forum.unavailableReason,'SAFETY_BOUNDARY');
const selected=final.visualContext.imageJudgments.requirements.map((r:any)=>{
 const latest=[...r.records].reverse().find((v:any)=>v.assessment===r.status);
 return {id:r.id,text:r.text,status:r.status,selectedSource:latest?.source};
});
const repairDisagreements=data.audit.flatMap((f:any)=>{
 const id=Object.keys(data.inputs).find(id=>data.inputs[id].sha256===f.sha256);
 const isolated=real.find((r:any)=>r.id===id)?.response.answers.image_check_1.choice;
 return isolated&&f.originalCurrentJudgments.repair!==isolated?[{step:f.step,original:f.originalCurrentJudgments.repair,isolated,file:f.file,sha256:f.sha256}]:[];
});
const summary={
 baseCommit:'f4fc21e',source:data.source,auditDirectory:resolve(dir),
 method:data.method,productionModified:false,siteRequests:0,modelResponses:data.responses.length,
 password:{originalScreens:23,originalNotShown:23,uniqueImages:17,isolatedNotShown:17,offlineDOMKeywordHits:0,controls,conclusion:'No password-recovery answer was established in the visited images; visual-reading failure or loss of a previously observed password answer is not supported by this sample.'},
 stop:{primaryChoice:'scroll_up',secondaryChoice:'stuck',mechanism:'jevDecide replaced an action without a matching fresh/transit frontier endpoint with chooseFrontier; the second model decision was stuck.',source:finalFile},
 scope:{blockedObservedForum:{step:19,label:forum.text,reason:forum.unavailableReason,source:supportFile},answerInForum:'NOT_CHECKED',otherUnvisitedRoutes:'NOT_CHECKED'},
 selectedMemorySources:selected,repairJudgmentDisagreements:repairDisagreements,
 limitations:[
  'The isolated current-image requests are not exact original action request replays: they omit history, prior judgments and action selection. The results do not isolate which omitted factor caused repair-judgment disagreements.',
  'No password keywords in captured DOM text is supporting offline inspection, not a proof that all image content lacks an answer. No DOM text was sent to Jev.',
  'The forum was visibly suggested by Support but disallowed by execution scope. Its contents and whether it answers this Goal were not inspected.',
  'A secondary stuck decision is not equivalent to no primary action being selected; permitting the original upward scroll is not proven to find the answer or solve the Goal.',
  'Synthetic positive/negative controls establish only limited reading discrimination. They are not real-site success-rate measurements or evidence that all images are read correctly.',
  'The audit does not prove that the whole site lacks the answer, that the site UX is defective, or that the middleware is generally error-free.',
 ],
 codeSha256:data.codeSha256,sourceHashes,originalsUnchanged:true,
};
const output='docs/experiments/2026-10-19-password-visibility-results.json';
await writeFile(output,JSON.stringify(summary,null,2));
await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({output,responses:data.responses.length,password:summary.password,stop:summary.stop,repairDisagreements:repairDisagreements.length,originalsUnchanged:true}));
