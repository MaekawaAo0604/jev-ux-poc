// Only external inference is replaced; the CLI observes and acts in Chromium.
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  return {answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
   const keys=Object.keys(q.criteria);
   const choice=id==='nextAction'?(state.screen.text.includes('Answer visible')?'done':keys.find(k=>k.startsWith('e'))??'stuck'):id==='completion'?'supported':'relevant';
   return [id,{type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];
  })),warnings:[]};
 }
})};
