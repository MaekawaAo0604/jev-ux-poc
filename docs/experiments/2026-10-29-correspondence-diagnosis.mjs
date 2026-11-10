import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {PNG} from 'pngjs';
import {experienceContext,experienceCriteria} from '../../jev/virtual-beta/experience.ts';
import {updateDeferrals,deferralDecision} from '../../jev/virtual-beta/deferral.ts';
const root='reports/notification-switch-2026-10-29/live';
const names=['notifications-r1-reason','notifications-r2-reason'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const files=names.flatMap(n=>walk(path.join(root,n))).sort();
const before=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(p))]));
function pixelDiff(a,b){
 const x=PNG.sync.read(fs.readFileSync(a)),y=PNG.sync.read(fs.readFileSync(b));
 if(x.width!==y.width||x.height!==y.height)return {sameDimensions:false};
 let changed=0,changedChannels=0,maxChannel=0,total=0,x0=x.width,y0=x.height,x1=-1,y1=-1;
 for(let i=0;i<x.data.length;i+=4){let differs=false;for(let c=0;c<4;c++){let d=Math.abs(x.data[i+c]-y.data[i+c]);if(d){changedChannels++;differs=true;maxChannel=Math.max(maxChannel,d);total+=d;}}if(differs){changed++;let xx=i/4%x.width,yy=Math.floor(i/4/x.width);x0=Math.min(x0,xx);y0=Math.min(y0,yy);x1=Math.max(x1,xx);y1=Math.max(y1,yy);}}
 return {sameDimensions:true,width:x.width,height:x.height,changedPixels:changed,pixelFraction:changed/(x.width*x.height),changedChannels,maxChannel,absoluteChannelDifference:total,bbox:changed?{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1}:null};
}
function candidates(s){return Object.fromEntries(s.modelInput.observation.candidateIds.map(id=>[id,{label:id,action:/^e\d+$/.test(id)?{type:'click',elementId:id}:id.startsWith('scroll_')?{type:'scroll',direction:id.slice(7)}:id.startsWith('look_')?{type:'look',point:{x:0,y:0}}:{type:id}}]));}
const output={kind:'read-only-saved-input-diagnosis',date:'2026-10-29',newAPICalls:0,scope:'notifications new conditional runs only; audit text/URL kept separate from model input',runs:[],controlled:[],originalArtifactHashes:before};
for(const name of names){
 const dir=path.join(root,name,'exploration'),result=read(path.join(dir,'result.json'));
 const steps=Array.from({length:12},(_,i)=>read(path.join(dir,`step-${i+1}.json`)));
 const rows=steps.map(s=>{
  const exp=s.userState.experience,ctx=s.deliberation.modelInput.experienceContext,current=s.userState.lastObservation;
  const cs=candidates(s),prior=s.number===1?undefined:steps[s.number-2].deferral.state;
  const reproduced=updateDeferrals(prior,exp,current,s.deliberation.assessment,result.config.deferral);
  if(!isDeepStrictEqual(reproduced,s.deferral.state))throw Error('RECORDED_DEFERRAL_REPLAY_MISMATCH '+name+' '+s.number);
  const criteria=Object.fromEntries(current.candidateIds.map(id=>[id,id]));
  const regenerated=experienceCriteria(criteria,exp,current);
  return {observation:current.id,imageSha256:s.vision.imageSha256,pngHashVerified:hash(fs.readFileSync(path.join(dir,`input-${s.number}.png`)))===s.vision.imageSha256,auditOnly:{title:s.audit.screen.title,url:s.audit.url,visibleElements:s.audit.screen.elements},modelCandidates:current.candidateIds,visibleGeometry:s.vision.visibleTargets,actualAttachedImages:s.assetFiles,recency:s.userState.memory.map(m=>({observationId:m.observationId,imageSha256:m.imageSha256,action:m.action})),experienceTransitions:exp.transitions,assessmentInputExperience:ctx,rawAssessment:s.deliberation.response.answers,admittedAssessment:s.deliberation.assessment,rawAction:s.response.answers,selected:s.selection.selected,action:s.action,selectionScope:s.selection.policy?.scope,deferral:s.deferral,reasonContext:s.deliberation.modelInput.deferralReasonContext,reasonRecord:s.deferralReason.record,experienceEpisodeCriteria:regenerated,actualNextCriteria:s.questions.nextAction.criteria,deferralReproducedExactly:true};
 });
 const pixels=[];
 for(const [a,b] of [[2,6],[6,8],[8,10],[10,12],[2,12],[3,7],[7,9]])pixels.push({from:'o'+a,to:'o'+b,...pixelDiff(path.join(dir,`input-${a}.png`),path.join(dir,`input-${b}.png`)),sameCandidateGeometry:isDeepStrictEqual(steps[a-1].vision.visibleTargets,steps[b-1].vision.visibleTargets)});
 output.runs.push({name,termination:result.termination,objectiveSuccess:result.objectiveSuccess,decisions:result.decisions,apiCallsAlreadyRecorded:result.apiCalls,rows,pixels});
 // Hash-only control: not a proposal to equate images. Preserve IDs, judgments, path and choices.
 for(const [from,to] of [[2,6],[6,8],[8,10],[10,12]]){
  const s=steps[to-1],sourceStep=steps[from-1],current=structuredClone(s.userState.lastObservation),exp=structuredClone(s.userState.experience),assessment=structuredClone(s.deliberation.assessment),prior=structuredClone(steps[to-2].deferral.state),cs=candidates(s);
  const originalCriteria=experienceCriteria({e4:'e4'},exp,current),originalRoutes=experienceContext(exp,current).returnedRoutes;
  const oldHash=current.imageSha256,newHash=sourceStep.vision.imageSha256;
  current.imageSha256=newHash;assessment.imageSha256=newHash;
  const latest=exp.transitions.at(-1);latest.result.imageSha256=newHash;if(latest.judgment?.evidence?.observationId===current.id)latest.judgment.evidence.imageSha256=newHash;
  const rebound=updateDeferrals(prior,exp,current,assessment,result.config.deferral);
  const reboundCriteria=experienceCriteria({e4:'e4'},exp,current),reboundRoutes=experienceContext(exp,current).returnedRoutes;
  output.controlled.push({name,from:'o'+from,to:'o'+to,description:'Synthetic identity-gate control only: set current/final-result/current-assessment hash to earlier observation hash; do not modify raw artifacts or infer semantic equivalence',oldHash,newHash,hashWasDifferent:oldHash!==newHash,originalRoutes:originalRoutes.map(r=>({from:r.fromObservationId,to:r.toObservationId,path:r.path.map(p=>p.candidateId)})),reboundRoutes:reboundRoutes.map(r=>({from:r.fromObservationId,to:r.toObservationId,path:r.path.map(p=>p.candidateId)})),originalE4Criteria:originalCriteria.e4,reboundE4Criteria:reboundCriteria.e4,reboundEntries:rebound.entries,reboundDecision:deferralDecision(rebound,current,cs,assessment,s.selection.raw,result.config.deferral)});
 }
 // Application gate: r1 learned o8 e4 deferral does not apply at o12; compare exact same saved memory/action distribution under hash-only control.
 const s=steps[11],entry=s.deferral.state.entries.find(e=>e.candidateId==='e4'&&e.fromObservationId==='o8');
 if(entry){const current={...s.userState.lastObservation,imageSha256:entry.imageSha256},assessment={...s.deliberation.assessment,imageSha256:entry.imageSha256};output.controlled.push({name,to:'o12',description:'Synthetic application-gate control; use existing learned entry hash for current and assessment only',actualDecision:s.deferral.decision,reboundDecision:deferralDecision(s.deferral.state,current,candidates(s),assessment,s.selection.raw,result.config.deferral)});}
}
const after=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(p))]));
output.originalArtifactCount=files.length;output.originalArtifactsUnchanged=isDeepStrictEqual(before,after);if(!output.originalArtifactsUnchanged)throw Error('RAW_ARTIFACT_CHANGED');
fs.writeFileSync('reports/observation-correspondence-2026-10-29/diagnosis-evidence.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({originalArtifactCount:files.length,unchanged:output.originalArtifactsUnchanged,pixels:output.runs.map(r=>({name:r.name,pixels:r.pixels})),controls:output.controlled.map(c=>({name:c.name,from:c.from,to:c.to,originalRoutes:c.originalRoutes,reboundRoutes:c.reboundRoutes,actualDecision:c.actualDecision?.reason,reboundDecision:c.reboundDecision.reason,reboundApplied:c.reboundDecision.appliedCandidates,reboundEntries:c.reboundEntries?.map(e=>[e.candidateId,e.fromObservationId,e.toObservationId])}))},null,2));
