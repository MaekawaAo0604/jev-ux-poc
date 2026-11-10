/** Exact paired sign test on discordant binary completion outcomes.
 * Condition order is randomized within each pair before either request. */
export function analyzeStoppingConfirmation(rows:any[],spec:any){
 const issues:string[]=[],key=(r:any)=>r.phase+':'+r.repeat+':'+r.condition,expected=new Set<string>();
 for(const phase of ['primary','confirmation'])for(let repeat=1;repeat<=spec.pairs[phase];repeat++)for(const condition of spec.conditions)expected.add(key({phase,repeat,condition}));
 if(rows.length!==expected.size||new Set(rows.map(key)).size!==rows.length||rows.some(r=>!expected.has(key(r))))issues.push('MISSING_DUPLICATE_OR_UNPLANNED_TRIAL');
 if(rows.some(r=>r.status!=='RECORDED'||r.fake||r.model!==spec.model||!['complete','incomplete','uncertain'].includes(r.assessment)))issues.push('INVALID_OR_WRONG_MODEL_TRIAL');
 if(rows.some(r=>!r.inputWithoutPersonaSha256||!r.imageSha256)||new Set(rows.map(r=>r.inputWithoutPersonaSha256)).size!==1||new Set(rows.map(r=>r.imageSha256)).size!==1)issues.push('UNMATCHED_CONTEXT_OR_IMAGES');
 const stages=['primary','confirmation'].map(phase=>{
  const pairs=Array.from({length:spec.pairs[phase]},(_,i)=>({baseline:rows.find(r=>r.phase===phase&&r.repeat===i+1&&r.condition==='baseline'),A:rows.find(r=>r.phase===phase&&r.repeat===i+1&&r.condition==='A')}));
  const valid=pairs.every(p=>p.baseline&&p.A),continues=(r:any)=>r?.assessment!=='complete';
  const supporting=pairs.filter(p=>p.baseline&&p.A&&!continues(p.baseline)&&continues(p.A)).length,opposing=pairs.filter(p=>p.baseline&&p.A&&continues(p.baseline)&&!continues(p.A)).length,n=supporting+opposing;
  let combination=1,tail=0;for(let k=0;k<=n;k++){if(k)combination=combination*(n-k+1)/k;if(k>=supporting)tail+=combination;}
  const pOneSided=n?Math.min(1,tail/2**n):1;
  const baselineContinue=pairs.filter(p=>p.baseline&&continues(p.baseline)).length,aContinue=pairs.filter(p=>p.A&&continues(p.A)).length,difference=valid?(aContinue-baselineContinue)/pairs.length:null;
  return {phase,n:pairs.length,baselineContinue,aContinue,supporting,opposing,ties:pairs.length-n,pOneSided,difference,passes:issues.length===0&&valid&&pOneSided<spec.analysis.alpha&&difference!==null&&difference>=spec.analysis.minDifference};
 });
 return {schemaVersion:1,kind:'FRESH_PAIRED_STOPPING_CONFIRMATION',complete:issues.length===0,issues,stages,qualified:stages.every(s=>s.passes),humanValidityEstablished:false,knowledgeUseEstablished:false,fullExplorationEffectEstablished:false,method:'One-sided exact binomial sign test on discordant paired outcomes; H1: A continues more often than baseline. Ties are excluded from p, all pairs contribute to the rate difference. Each fresh cohort must independently satisfy p<.01 and >=15 percentage points. No data pooling for qualification.',scope:'A whole persona vs no persona on one selected real-site stopping state and literal Goal. Hypothesis and state selected after prior exploratory datasets; those datasets are not counted here.'};
}
