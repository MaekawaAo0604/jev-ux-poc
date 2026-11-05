export type ReliabilityCapture={step:number;sha256:string;facts:string[];probes:{kind:'text'|'control';text:string;visible:boolean;candidateId?:string}[]};
export type ReliabilityWire={step:number;kind:string;imageHashes:string[];seenFacts:string[];availableFacts:string[];oracleLeaked:boolean;memoryChecks?:{ok:boolean;code:string}[];imageBytes?:number;requestBytes?:number;derivedImagesVerified?:boolean};
export type ReliabilityEffect={step:number;action:any;expectedUrl?:string;actualUrl?:string;effectCorrect?:boolean;error?:string};
export type ReliabilityInput={oracle:{achievable:boolean;requiredFacts:string[]};result:{reason:string;steps:any[]};captures:ReliabilityCapture[];wires:ReliabilityWire[];effects:ReliabilityEffect[]};
type Metric={checked:number;failed:number;status:'PASS'|'FAIL'|'NOT_MEASURED';issues:{step:number;code:string}[]};
export function measureReliability(input:ReliabilityInput){
 const metric=():Metric=>({checked:0,failed:0,status:'NOT_MEASURED',issues:[]});
 const metrics={observation:metric(),images:metric(),execution:metric(),history:metric(),routeContinuation:metric(),retention:metric(),memoryFidelity:metric(),falseCompletion:metric(),separation:metric()};
 const check=(m:Metric,ok:boolean,step:number,code:string)=>{m.checked++;if(!ok){m.failed++;m.issues.push({step,code});}};
 const normalize=(v:string)=>v.replace(/\s+/g,' ').trim();
 for(const capture of input.captures){
  const step=input.result.steps.find(s=>s.number===capture.step);
  if(!step){check(metrics.observation,false,capture.step,'CAPTURE_WITHOUT_STEP');continue;}
  const text=normalize(step.state.screen.text.join(' '));
  for(const probe of capture.probes){
   if(probe.kind==='text')check(metrics.observation,probe.visible?text.includes(normalize(probe.text)):!text.includes(normalize(probe.text)),capture.step,probe.visible?'VISIBLE_TEXT_MISSING':'NONVISIBLE_TEXT_LEAK');
   else if(probe.visible)check(metrics.observation,step.state.screen.elements.some((e:any)=>e.id===probe.candidateId&&normalize(e.text)===normalize(probe.text)&&e.available!==false),capture.step,'VISIBLE_CONTROL_MISSING_OR_MISLABELLED');
  }
 }
 for(const wire of input.wires){
  check(metrics.separation,!wire.oracleLeaked,wire.step,'EVALUATOR_TRUTH_LEAK');
  for(const note of wire.memoryChecks??[])check(metrics.memoryFidelity,note.ok,wire.step,note.code);
  if(wire.kind==='audit')continue;
  const capture=input.captures.find(c=>c.step===wire.step);
  check(metrics.images,!!capture&&wire.imageHashes.includes(capture.sha256),wire.step,'WRONG_OR_MISSING_CURRENT_IMAGE');
  if(wire.derivedImagesVerified!==undefined)check(metrics.images,wire.derivedImagesVerified,wire.step,'WRONG_OR_UNVERIFIED_CURRENT_DETAIL');
  if(wire.kind==='screen'||wire.kind==='completion')for(const fact of wire.seenFacts.filter(id=>input.oracle.requiredFacts.includes(id)))check(metrics.retention,wire.availableFacts.includes(fact),wire.step,`OBSERVED_FACT_NOT_OFFERED:${fact}`);
 }
 for(const effect of input.effects){
  const step=input.result.steps.find(s=>s.number===effect.step),decision=step?.decision;
  const chosen=decision?.action,actual=effect.action;
  const same=chosen?.type===actual.type&&(actual.type!=='click'||chosen.elementId===actual.elementId)&&(actual.type!=='scroll'||chosen.direction===actual.direction);
  check(metrics.execution,same,effect.step,'CHOSEN_ACTION_MISMATCH');
  if(effect.action.type==='click')check(metrics.execution,step?.recordedAction?.target?.anonymousId===effect.action.elementId,effect.step,'TRACE_TARGET_MISMATCH');
  if(effect.expectedUrl!==undefined)check(metrics.execution,effect.expectedUrl===effect.actualUrl,effect.step,'BROWSER_DESTINATION_MISMATCH');
  if(effect.effectCorrect!==undefined)check(metrics.execution,effect.effectCorrect,effect.step,'BROWSER_EFFECT_MISMATCH');
  if(effect.error)check(metrics.execution,false,effect.step,'ACTION_ERROR');
 }
 const pageIds=new Map<string,string>(),documents=new Map<string,string>();
 for(const step of input.result.steps){
  const page=new URL(step.url);page.hash='';const previous=pageIds.get(page.href),pageId=step.state.screen.pageId;
  check(metrics.history,typeof pageId==='string'&&(!previous||pageId===previous),step.number,'PAGE_ID_CHANGED_OR_MISSING');pageIds.set(page.href,pageId);
  check(metrics.history,!documents.has(pageId)||documents.get(pageId)===page.href,step.number,'PAGE_ID_COLLISION');documents.set(pageId,page.href);
  const expected=input.result.steps.filter(s=>s.number<step.number&&s.result==='OK'&&s.recordedAction),history=step.state.history;
  check(metrics.history,history.length===expected.length,step.number,'EXECUTED_HISTORY_LENGTH_MISMATCH');
  expected.forEach((before:any,i:number)=>check(metrics.history,!!history[i]&&history[i].pageId===before.state.screen.pageId&&JSON.stringify(history[i].observedText)===JSON.stringify(before.state.screen.text),step.number,'OBSERVED_HISTORY_CHANGED_OR_MISSING'));
  if(step.frontier?.continuation&&step.result==='OK')check(metrics.routeContinuation,step.decision?.frontier?.mode==='continue'&&step.decision.frontier.targetId===step.frontier.continuation.targetId,step.number,'COMMITTED_ROUTE_DROPPED');
 }
 const normal=['JEV_DONE','STUCK'].includes(input.result.reason);
 const observed=new Set(input.captures.flatMap(c=>c.facts));
 const evidenceSatisfied=input.oracle.achievable&&input.oracle.requiredFacts.every(id=>observed.has(id));
 if(input.result.reason==='JEV_DONE')check(metrics.falseCompletion,evidenceSatisfied,input.result.steps.at(-1)?.number??0,'DONE_WITHOUT_REQUIRED_OBSERVATIONS');
 for(const m of Object.values(metrics))m.status=!m.checked?'NOT_MEASURED':m.failed?'FAIL':'PASS';
 return {metrics,middlewareFailures:Object.values(metrics).reduce((sum,m)=>sum+m.failed,0),evidenceSatisfied,normalTermination:normal};
}
