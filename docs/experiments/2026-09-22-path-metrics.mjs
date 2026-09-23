import {readFileSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const normalText=text=>String(text??'').replace(/\s+/gu,' ').trim();
const pageKey=url=>{const value=new URL(url);value.hash='';return value.href;};
const ratio=(n,d)=>d?n/d:null;

export function measurePath(result) {
  const steps=result.steps??[];
  const executed=steps.filter(s=>s.result==='OK'&&['click','back','scroll'].includes(s.decision?.action?.type));
  if(executed.length!==result.actionCount)throw new Error(`actionCount mismatch: ${executed.length} recognized / ${result.actionCount} recorded`);
  const allText=new Set(),mainText=new Set();
  const novelty=steps.map(s=>{
    let total=0,main=0;
    for(const r of s.state?.screen?.regions??[]){
      const text=normalText(r.text);if(!text)continue;
      if(!allText.has(text)){allText.add(text);total++;}
      if(r.context?.landmark==='main'&&!mainText.has(text)){mainText.add(text);main++;}
    }
    return {total,main};
  });
  const actionTypes={},actions=[],visits=steps.length?[pageKey(steps[0].url)]:[],edges=[];
  let missingOutcomeObservations=0;
  for(let i=0;i<steps.length;i++){
    const s=steps[i];if(!executed.includes(s))continue;
    const type=s.decision.action.type;actionTypes[type]=(actionTypes[type]??0)+1;
    const after=steps[i+1],from=pageKey(s.url),to=after?pageKey(after.url):result.finalURL?pageKey(result.finalURL):null;
    if(!after)missingOutcomeObservations++;
    const changed=to!==null&&to!==from;
    const detail={step:s.number,type,from,to,urlChanged:changed,newTextFragmentsAfterAction:after?novelty[i+1].total:null,newMainTextFragmentsAfterAction:after?novelty[i+1].main:null};
    actions.push(detail);
    if(changed){edges.push({step:s.number,from,to});visits.push(to);}
  }
  const seenPages=new Set(),seenEdges=new Set();let revisitArrivals=0,repeatedDirectedEdgeTraversals=0,abaReturns=0;
  for(const [i,url] of visits.entries()){
    if(seenPages.has(url))revisitArrivals++;seenPages.add(url);
    if(i>=2&&url===visits[i-2])abaReturns++;
  }
  for(const edge of edges){const key=JSON.stringify([edge.from,edge.to]);edge.repeated=seenEdges.has(key);if(edge.repeated)repeatedDirectedEdgeTraversals++;seenEdges.add(key);}
  const magazineActions=actions.filter(a=>new URL(a.from).pathname.startsWith('/healthier-magazine/'));
  return {
    decisionSteps:steps.length,executedActions:executed.length,excludedDecisionSteps:steps.length-executed.length,actionTypes,
    transitions:edges.length,pageVisits:visits.length,uniquePages:seenPages.size,revisitArrivals,
    revisitArrivalRate:ratio(revisitArrivals,edges.length),repeatedDirectedEdgeTraversals,
    repeatedDirectedEdgeRate:ratio(repeatedDirectedEdgeTraversals,edges.length),abaReturns,
    abaWindows:Math.max(0,visits.length-2),abaReturnRate:ratio(abaReturns,Math.max(0,visits.length-2)),
    magazineActions:{count:magazineActions.length,denominator:executed.length,rate:ratio(magazineActions.length,executed.length),steps:magazineActions.map(a=>a.step)},
    initialObservedTextFragments:novelty[0]?.total??0,uniqueObservedTextFragments:allText.size,uniqueMainTextFragments:mainText.size,
    actionsWithObservedOutcome:actions.length-missingOutcomeObservations,missingOutcomeObservations,
    actionsWithZeroNewText:actions.filter(a=>a.newTextFragmentsAfterAction===0).length,
    actionsWithZeroNewMainText:actions.filter(a=>a.newMainTextFragmentsAfterAction===0).length,
    actions,visitSequence:visits,edges,
  };
}

function requestTotals(accounts) {
  const totals={logicalCalls:0,successfulCalls:0,attempts:0,failedAttempts:0,recoveredFailedAttempts:0,missingAccounting:0};
  for(const a of accounts){
    if(!a){totals.missingAccounting++;continue;}
    totals.logicalCalls+=a.logicalCalls??0;totals.successfulCalls+=a.successfulCalls??0;
    totals.attempts+=a.attempts??0;totals.failedAttempts+=a.failures??0;
    // Only credit recovery where every logical request completed successfully.
    if(a.logicalCalls===a.successfulCalls)totals.recoveredFailedAttempts+=a.failures??0;
  }
  return totals;
}

export function summarizeReplay(replay) {
  const results=replay.results??[],confusion={truePositive:0,trueNegative:0,falsePositive:0,falseNegative:0};
  let unscored=0,transportErrors=0;
  for(const r of results){
    if(r.error){transportErrors++;unscored++;continue;}
    if(typeof r.complete!=='boolean'||typeof r.expectedComplete!=='boolean'){unscored++;continue;}
    confusion[r.expectedComplete?(r.complete?'truePositive':'falseNegative'):(r.complete?'falsePositive':'trueNegative')]++;
  }
  const positiveCases=confusion.truePositive+confusion.falseNegative,negativeCases=confusion.trueNegative+confusion.falsePositive,evaluated=positiveCases+negativeCases;
  return {kind:'saved-observation completion judgment',planned:replay.plannedCases?.length??null,recorded:results.length,evaluated,unscored,transportErrors,positiveCases,negativeCases,confusion,
    accuracy:ratio(confusion.truePositive+confusion.trueNegative,evaluated),sensitivity:ratio(confusion.truePositive,positiveCases),specificity:ratio(confusion.trueNegative,negativeCases),
    requests:requestTotals(results.map(r=>r.assessment?.accounting)),
    cases:results.map(r=>({id:r.id,repeat:r.repeat??1,expectedComplete:r.expectedComplete,complete:r.complete??null,error:!!r.error})),
  };
}

export function summarizeLive(results) {
  const checked=results.filter(r=>typeof r.objectiveSuccess==='boolean');
  const completed=results.filter(r=>r.perceivedSuccess===true||r.reason==='JEV_DONE');
  return {kind:'autonomous live discovery',trials:results.length,modelCompleted:completed.length,modelCompletionRate:ratio(completed.length,results.length),
    objectiveVerifiedTrials:checked.length,objectiveSuccessRate:ratio(checked.filter(r=>r.objectiveSuccess).length,checked.length),
    terminalApiErrors:results.filter(r=>r.reason==='DECISION_ERROR').length,
    stopReasons:Object.fromEntries([...new Set(results.map(r=>r.reason))].map(reason=>[reason,results.filter(r=>r.reason===reason).length])),
    requests:requestTotals(results.map(r=>r.evidenceSession?.accounting)),
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
  const manifestPath=resolve(root,'reports/goal-check-live-2026-09-22T08-39-16.695Z/validation.json');
  const replayPath=resolve(root,'reports/contextual-replay-2026-09-22T07-46-29.012Z/validation.json');
  const read=path=>JSON.parse(readFileSync(path,'utf8'));
  const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
  const manifest=read(manifestPath),results=manifest.cases.map(c=>read(c.resultPath));
  const report={
    schema:'ux-path-measurement-v1',measuredAt:new Date().toISOString(),method:'Offline remeasurement of existing logs; no new site or model requests.',
    definitions:{
      executedActions:'step.result=OK and action.type in click/back/scroll. Must equal recorded actionCount; fail closed otherwise. Final LOOP/ACTION_LIMIT/JEV_DONE decisions are not actions.',
      page:'Absolute URL with fragment removed; query string retained. Same-page scrolls do not create visits.',
      transitions:'Changed URL between an executed action and the following recorded observation (or finalURL without text when there is no next step).',
      pageVisits:'Initial page plus arrivals after changed-URL transitions.',
      revisitArrivals:'Arrivals at URLs already observed; denominator = changed-URL transitions.',
      repeatedDirectedEdgeTraversals:'Traversals beyond the first occurrence of the same ordered from/to URL pair; denominator = changed-URL transitions.',
      abaReturns:'Overlapping A-B-A triples of URL visits after removing same-URL observations; denominator = pageVisits - 2.',
      novelText:'New whitespace-normalized exact region.text strings across all previous observations in the same run. Counts navigation, headings and clipping variants; not semantic answer progress.',
      novelMainText:'Same exact-string calculation restricted to region.context.landmark=main; inferred DOM landmarks may be imperfect.',
      actionNovelty:'New strings in the immediately following recorded observation, after execution; null when no outcome observation exists. Initial screen is not attributed to an action.',
      magazineActions:'Executed actions whose source URL pathname starts /healthier-magazine/; the click entering the magazine is excluded. Denominator = all executed actions.',
      replay:'Expected-complete labels compare with final grounded complete, not coarse coverage. Missing outcomes and records with error are unscored, not true negatives. transportErrors counts records with error; the raw error needs separate inspection to distinguish API transport from local errors.',
      live:'Model completion is counted separately from objectiveSuccess. null objectiveSuccess means unverified, not failure.',
      requestAccounting:'Sum final per-run evidenceSession.accounting or per-replay assessment.accounting only; do not sum cumulative per-step snapshots. Excludes preflight requests. Failures count failed attempts, not terminal run failures.',
    },
    sources:[manifestPath,replayPath,...manifest.cases.map(c=>c.resultPath)].map(path=>({path:relative(root,path).replaceAll('\\','/'),sha256:hash(path)})),
    live:summarizeLive(results),replay:summarizeReplay(read(replayPath)),
    trials:manifest.cases.map((c,i)=>({id:c.id,repeat:c.repeat,reason:results[i].reason,source:relative(root,c.resultPath).replaceAll('\\','/'),...measurePath(results[i])})),
    limitations:[
      'Three live runs cover two goals on one site; no estimate of cross-site population performance.',
      'Replay uses 16 curated saved observations/counterexamples, one repeat each. It is not a holdout or discovery benchmark.',
      'Revisits, back actions and A-B-A patterns are not intrinsically failures; legitimate exploration can use them.',
      'Text novelty measures acquisition of new strings, not relevance, correctness or completeness. Zero novel text does not prove zero semantic progress.',
      'Magazine location is an auditable URL proxy, not a model-certified irrelevance classification.',
      'Outcome observations can include dynamic site changes, so novelty is temporally after an action, not proven caused by it.',
      'Historical logs were produced before this measurement protocol; this is retrospective, not preregistered prospective testing.',
    ],
  };
  console.log(JSON.stringify(report,null,2));
}
