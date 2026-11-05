// Local HTTP integration only; never calls Jev or any external provider.
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  const answers={};
  for(const [id,q] of Object.entries(questions)){
   const keys=Object.keys(q.criteria);
   const choice=id==='nextAction'?(state.screen.text.includes('Answer visible')?'done':keys.find(k=>k.startsWith('e'))??'stuck'):keys[0];
   answers[id]={type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))};
  }
  return {answers,warnings:[]};
 }
})};
