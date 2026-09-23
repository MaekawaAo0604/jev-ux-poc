// Test-only SDK provider: never contacts a model service.
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  if(process.env.TEST_LIMIT_MODE==='boundary'&&questions.nextAction){
   await fetch(process.env.TEST_BOUNDARY_SIGNAL_URL);
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const answers={};
  for(const [id,q] of Object.entries(questions)){
   const keys=Object.keys(q.criteria);
   const choice=id.startsWith('intent_')?'general':id.startsWith('screen_')?'relevant':id.startsWith('scope_')?'match':id.startsWith('evidence_')?'direct':id.startsWith('grounded_')||id.startsWith('contradiction_')?'present':id==='coverage'?'complete':id.startsWith('check_')
    ?(state.observations.some(o=>o.text.includes(id==='check_0'?'Condition A':'Condition B'))?'present':'absent')
    :id==='nextAction'
    ?state.targets?Object.entries(state.targets).find(([,target])=>target.kind==='scroll')?.[0]??'stuck':process.env.TEST_LIMIT_MODE==='back'
     ?(state.history.length>=2?'done':state.screen.title==='Next'?'back':keys.find(k=>k.startsWith('e')))
     :process.env.TEST_LIMIT_MODE?.startsWith('memory')
     ?(keys.includes('done')&&state.history.some(h=>h.observedText?.includes('Condition A'))&&state.screen.text.includes('Condition B')?'done':keys.includes('scroll_down')?'scroll_down':'stuck')
     :(state.screen.text.includes('Answer visible')&&process.env.TEST_LIMIT_MODE!=='continue'?'done':keys.find(k=>k.startsWith('e')))
    :id==='completion'?'supported':'relevant';
   answers[id]={type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))};
  }
  return {answers,warnings:[]};
 }
})};
