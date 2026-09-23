import {request} from 'playwright';
import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
import {navigationFailureCategory} from '../../runner/public-navigation.ts';

// Diagnostic calls are reported separately, never mixed with exploration scores.
export async function preflight(urls=[]){
 const result={startedAt:new Date().toISOString(),pages:[]};
 if(urls.length){
  const context=await request.newContext();
  try{for(const url of [...new Set(urls)]){
   const start=performance.now();
   try{
    const response=await context.get(url,{maxRedirects:0,timeout:15000});
    result.pages.push({url,status:response.status(),ok:response.status()>=200&&response.status()<400,elapsedMs:performance.now()-start});
    await response.dispose();
   }catch(error){result.pages.push({url,ok:false,category:navigationFailureCategory(error),elapsedMs:performance.now()-start});}
  }}finally{await context.dispose();}
 }
 const start=performance.now();
 try{
  const response=await evaluateChoices({text:'開館時間は10時から17時です。'},{read:{type:'choice',instructions:'本文に開館時間の情報が書かれているか。',criteria:{yes:'書かれている',no:'書かれていない'}}});
  result.model={ok:response.answers.read.choice==='yes',model:response.model,answer:response.answers.read,request:response.request,elapsedMs:performance.now()-start};
 }catch(error){result.model={ok:false,error:safeRequestFailure(error),request:error.request,elapsedMs:performance.now()-start};}
 result.ok=result.pages.every(p=>p.ok)&&result.model.ok;
 return result;
}
