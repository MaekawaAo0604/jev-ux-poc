// External inference only is replaced; Chromium, observation and actions stay real.
let failures=0;
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  const mode=process.env.TEST_RECOVERY_MODE||'';
  if(mode==='invalid'&&questions.nextAction&&state.screen.text.includes('Answer visible')&&failures++===0)return {answers:{},warnings:[]};
  if(mode.startsWith('changed')&&questions.nextAction&&state.screen.text.includes('Original')){
   if(failures++===0){
    if(mode==='changed')await fetch(process.env.TEST_BOUNDARY_SIGNAL_URL);
    throw Object.assign(new Error('PRIVATE'),{statusCode:503});
   }
   if(mode==='changed-success'){
    await fetch(process.env.TEST_BOUNDARY_SIGNAL_URL);
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }
  if(!mode&&questions.nextAction&&state.screen.text.includes('Answer visible')&&failures++<3)throw Object.assign(new Error('PRIVATE'),{statusCode:503});
  const answers={};
  for(const [id,q] of Object.entries(questions)){
   const keys=Object.keys(q.criteria);
   const choice=id==='nextAction'?(state.screen.text.includes('Answer visible')?'done':keys.find(k=>k.startsWith('e'))):id==='completion'?'supported':'relevant';
   answers[id]={type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))};
  }
  return {answers,warnings:[]};
 }
})};
