// Local integration only: no model or public-site requests.
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  return {answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
   const keys=Object.keys(q.criteria);
   const choice=id==='nextAction'
    ?state.history.length<2?keys.find(k=>k.startsWith('e')):state.screen.title==='Home'?'done':keys.includes('back')?'back':'stuck'
    :id==='completion'?'supported':'relevant';
   return [id,{type:'choice',choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];
  })),warnings:[]};
 }
})};
