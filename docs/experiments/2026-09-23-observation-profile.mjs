// Diagnostic preload only. No production edits, no actions, and no inference.
// Run with the existing public CLI to reuse its complete navigation safety guard.
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
import {AccountPage} from '../../pages/AccountPage.ts';
import {AutoPage} from '../../pages/AutoPage.ts';
import {controlSelector} from '../../pages/controls.ts';

// Prevent the diagnostic process from loading/using credentials even if a hook fails.
process.loadEnvFile=()=>{};
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.TYPESAFE_API_KEY;
const output=resolve('reports',`observation-profile-${new Date().toISOString().replaceAll(':','-')}.json`);
const metrics={kind:'observation-only-diagnostic',startedAt:new Date().toISOString(),inferenceEnabled:false,actionsExecuted:0,spans:{},locatorCalls:{},sourceSha256:{}};
for(const path of ['pages/AccountPage.ts','pages/AutoPage.ts','pages/PublicSitePage.ts','pages/control-observation.ts','pages/visible-text.ts','pages/controls.ts','runner/public-site.ts']){
 metrics.sourceSha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
}
let phase='readiness';
const accountObserve=AccountPage.prototype.observeReady;
AccountPage.prototype.observeReady=async function(...args){
 const started=performance.now(),previous=phase;phase='account-observation';
 try{return await accountObserve.apply(this,args);}
 finally{metrics.spans.accountObservationMs=performance.now()-started;phase=previous;}
};
const controls=AutoPage.prototype.controls;
AutoPage.prototype.controls=async function(...args){
 const started=performance.now(),previous=phase;phase='control-discovery';
 try{const value=await controls.apply(this,args);metrics.discoveredControls=value.length;return value;}
 finally{metrics.spans.controlDiscoveryMs=performance.now()-started;phase=previous;console.log('PROFILE: control discovery finished');}
};
const publicObserve=PublicSitePage.prototype.observe;
PublicSitePage.prototype.observe=async function(...args){
 const page=this.page,originalEvaluate=page.evaluate;
 const connection=page._connection,originalSend=connection.sendMessageToServer;
 const protocolMethods={};
 connection.sendMessageToServer=function(owner,method,...args){
  protocolMethods[method]=(protocolMethods[method]||0)+1;
  return originalSend.call(this,owner,method,...args);
 };
 let browserRequests=0;
 const requestListener=()=>browserRequests++;
 page.on('request',requestListener);
 const locatorPrototype=Object.getPrototypeOf(page.locator('body'));
 const originals={count:locatorPrototype.count,evaluate:locatorPrototype.evaluate};
 page.evaluate=async function(fn,...rest){
  const started=performance.now();
  try{return await originalEvaluate.call(this,fn,...rest);}
  finally{if(fn.name==='visibleText'){metrics.spans.visibleTextMs=performance.now()-started;console.log('PROFILE: visible text finished');}}
 };
 for(const name of ['count','evaluate'])locatorPrototype[name]=async function(...args){
  const key=`${phase}.${name}`,bucket=metrics.locatorCalls[key]??={count:0,elapsedMs:0};
  const started=performance.now();bucket.count++;
  try{return await originals[name].apply(this,args);}
  finally{bucket.elapsedMs+=performance.now()-started;}
 };
 let observation;
 const started=performance.now();
 try{observation=await publicObserve.apply(this,args);}
 finally{
  metrics.spans.publicObservationMs=performance.now()-started;
  connection.sendMessageToServer=originalSend;
  metrics.protocolMethodsDuringObservation=protocolMethods;
  page.off('request',requestListener);
  metrics.browserRequestsDuringObservation=browserRequests;
  page.evaluate=originalEvaluate;
  Object.assign(locatorPrototype,originals);
 }
 metrics.output={regions:observation.regions?.length,textCharacters:observation.text.join('').length,visibleControls:observation.elements.length,warnings:observation.warnings};
 metrics.observation=observation;
 metrics.dom=await page.evaluate(selector=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let textNodes=0,textCharacters=0;
  for(let node=walker.nextNode();node;node=walker.nextNode()){textNodes++;textCharacters+=node.textContent?.length||0;}
  return {elements:document.querySelectorAll('*').length,controlMatches:document.querySelectorAll(selector).length,textNodes,textCharacters};
 },controlSelector);
 const screenshotStarted=performance.now();await page.screenshot();metrics.spans.screenshotMs=performance.now()-screenshotStarted;
 metrics.url=page.url();metrics.completedAt=new Date().toISOString();
 await mkdir(resolve('reports'),{recursive:true});
 await writeFile(output,JSON.stringify(metrics,null,2)+'\n',{flag:'wx'});
 const {observation:_,...summary}=metrics;
 console.log(JSON.stringify({profile:output,...summary}));
 throw new Error('DIAGNOSTIC_COMPLETE: observation-only profile; intentionally stopped before Jev');
};
