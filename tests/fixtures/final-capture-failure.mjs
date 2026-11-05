// Fail only the terminal evidence capture, not observation or navigation.
import {chromium} from 'playwright';
const launch=chromium.launch.bind(chromium);
let observedPage;
chromium.launch=async(...args)=>{
 const browser=await launch(...args),newContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>{
  const context=await newContext(...args),newPage=context.newPage.bind(context);
  context.newPage=async(...args)=>{
   const page=await newPage(...args),screenshot=page.screenshot.bind(page);
   observedPage=page;
   page.screenshot=async(options)=>{
    if(String(options?.path).endsWith('final.png'))throw new Error('Terminal capture unavailable');
    return screenshot(options);
   };
   return page;
  };
  return context;
 };
 return browser;
};
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel:()=>({
 specificationVersion:'v4',provider:'TEST',modelId:'TEST',supportedQuestionTypes:['choice'],
 async doEvaluate({state,questions}){
  if(state.history?.length&&questions.nextAction)await observedPage.evaluate(()=>history.pushState({},'',location.href));
  return {answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{
   const choice=id==='nextAction'?(state.history.length?'back':Object.keys(q.criteria).find(k=>/^e\d+$/.test(k))):id==='completion'?'supported':'relevant';
   return [id,{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];
  })),warnings:[]};
 }
})};
