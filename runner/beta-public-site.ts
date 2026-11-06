import {readFile,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import type {Page,Request,Route} from 'playwright';
import {PublicSitePage} from '../pages/PublicSitePage.js';
import {publicControl} from '../pages/controls.js';
import type {Action} from '../jev/types.js';
import type {BetaPublicSiteController,BetaPublicSiteSpec} from './beta-public-contracts.js';

type Event={kind:string;url?:string;code?:string};
const documentURL=(value:string)=>{const url=new URL(value);url.hash='';return url.href;};
const contained=(root:string,path:string)=>{const rel=relative(root,path);return !!rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);};
const fail=(code:string):never=>{throw new Error(code);};

/** Readonly native controls over one hash-verified HAR. No resolver or route fetches live data. */
export async function createBetaPublicSite(page:Page,input:BetaPublicSiteSpec):Promise<BetaPublicSiteController>{
 const spec=structuredClone(input),events:Event[]=[];
 let origin:string,documents:Set<string>;
 const safeURL=(value:string)=>{try{return publicControl(value,origin).kind==='link';}catch{return false;}};
 try{
  if(spec.schemaVersion!==1||!spec.id?.trim()||!spec.sourceDescription?.trim()||!Number.isFinite(Date.parse(spec.capturedAtUTC))||!isAbsolute(spec.harPath)||!/^[a-f0-9]{64}$/i.test(spec.harSha256)||!Array.isArray(spec.allowedDocuments)||!spec.allowedDocuments.length)fail('invalid');
  origin=new URL(spec.startURL).origin;
  if(!safeURL(spec.startURL))fail('invalid');
  documents=new Set(spec.allowedDocuments.map(url=>{if(!safeURL(url))fail('invalid');return documentURL(url);}));
  if(!documents.has(documentURL(spec.startURL)))fail('invalid');
  if(!contained(resolve('reports'),resolve(spec.harPath)))fail('invalid');
 }catch{fail('SITE_SNAPSHOT_SPEC_INVALID');}
 let prepared:Promise<void>|undefined,ready=false,infrastructure:string|undefined,safety:string|undefined;
 let authorizedNavigation:string|undefined,localDisclosure=false;
 const intentional=new WeakSet<Request>(),replaying=new WeakSet<Request>(),pending=new Set<Request>(),keys=new Set<string>();
 const pendingWaiters=new Set<()=>void>();
 const settled=(request:Request)=>{pending.delete(request);if(!pending.size)for(const done of [...pendingWaiters])done();};
 const event=(kind:string,code:string,url?:string)=>{events.push({kind,code,...(url?{url}:{})});};
 const infrastructureFault=(code:string,url?:string)=>{infrastructure??=code;event('snapshot-error',code,url);};
 const assertReady=()=>{if(infrastructure)fail(infrastructure);if(safety)fail(safety);if(!ready)fail('SITE_SNAPSHOT_NOT_READY');if(pending.size)fail('SITE_SNAPSHOT_NETWORK_UNSETTLED');};
 const resolveNavigation=async(url:string)=>{
  if(!safeURL(url)||!documents!.has(documentURL(url))){event('blocked-navigation','DOCUMENT_SCOPE_BLOCKED',url);fail('SAFETY_BOUNDARY: destination outside frozen site scope');}
  authorizedNavigation=documentURL(url);return url;
 };
 const settleSnapshot=async()=>{
  try{
   // DOMContentLoaded does not wait for styles/images. POM's bounded idle wait
   // deliberately tolerates timeout; a frozen trial must additionally settle.
   await page.waitForLoadState('load',{timeout:15000});
   if(pending.size)await new Promise<void>((done,reject)=>{
    const finish=()=>{clearTimeout(timer);pendingWaiters.delete(finish);done();};
    const timer=setTimeout(()=>{pendingWaiters.delete(finish);reject(new Error('SITE_SNAPSHOT_NETWORK_UNSETTLED'));},5000);
    pendingWaiters.add(finish);if(!pending.size)finish();
   });
  }catch{if(!infrastructure)infrastructureFault('SITE_SNAPSHOT_NETWORK_UNSETTLED');}
  if(infrastructure)fail(infrastructure);
  if(pending.size){infrastructureFault('SITE_SNAPSHOT_NETWORK_UNSETTLED');fail(infrastructure!);}
 };
 class SnapshotPage extends PublicSitePage{
  async navigateTo(url:string){await super.navigateTo(url);await settleSnapshot();}
  async observe(font:boolean){
   await settleSnapshot();assertReady();const screen=await super.observe(font);await settleSnapshot();assertReady();let exclusions=0,unsupported=0;
   for(const element of screen.elements){
    const control=this.observedPublicControls.get(element.id);
    if(control?.kind==='link'&&!documents!.has(documentURL(control.href))){element.available=false;element.unavailableReason='UNSUPPORTED_CONTENT';exclusions++;}
    if(control?.kind==='blocked'&&control.reason==='SAFETY_BOUNDARY')unsupported++;
   }
   if(exclusions){(screen.warnings??=[]).push('SNAPSHOT_SCOPE_EXCLUSIONS');event('observation-scope',`EXCLUDED_LINKS_${exclusions}`);}
   if(unsupported)event('observation-scope',`UNSUPPORTED_OR_UNSAFE_CONTROLS_${unsupported}`);
   // Preserve every discovered control; schema overflow is an infrastructure issue for the caller.
   return screen;
  }
  async act(action:Action){
   assertReady();
   if(action.type==='click'){
    const control=await (await this.targetElement(action.elementId)).evaluate(publicControl);
    if(control.kind==='disclosure')localDisclosure=true;
   }
   try{await super.act(action);await settleSnapshot();assertReady();}
   catch(error){if(infrastructure)fail(infrastructure);throw error;}
  }
  async captureDecisionScreenshot(...args:Parameters<PublicSitePage['captureDecisionScreenshot']>){await settleSnapshot();assertReady();const capture=await super.captureDecisionScreenshot(...args);await settleSnapshot();assertReady();return capture;}
 }
 const pom=new SnapshotPage(page,resolveNavigation,async()=>{authorizedNavigation=undefined;},true,spec.allowedDocuments.map(documentURL));
 const validateHAR=async()=>{
  try{
   const root=await realpath(resolve('reports')),path=await realpath(spec.harPath),stat=await lstat(spec.harPath);
   if(!contained(root,path)||path.toLowerCase()!==resolve(spec.harPath).toLowerCase()||stat.isSymbolicLink()||!stat.isFile()||stat.size>128*1024*1024)fail('SITE_SNAPSHOT_SPEC_INVALID');
   const bytes=await readFile(path);if(createHash('sha256').update(bytes).digest('hex').toLowerCase()!==spec.harSha256.toLowerCase())fail('SITE_SNAPSHOT_HASH_MISMATCH');
   let har:any;try{har=JSON.parse(bytes.toString('utf8'));}catch{fail('SITE_SNAPSHOT_SPEC_INVALID');}
   if(!Array.isArray(har?.log?.entries)||!har.log.entries.length)fail('SITE_SNAPSHOT_SPEC_INVALID');
   const capturedDocuments=new Set<string>();
   for(const entry of har.log.entries){
    const request=entry?.request,response=entry?.response,content=response?.content;
    if(!request||!['GET','HEAD'].includes(request.method)||!safeURL(request.url)||!response||!Number.isInteger(response.status)||!content||content._file||(content.size>0&&typeof content.text!=='string')||(response.status>=300&&response.status<400&&response.status!==304))fail('SITE_SNAPSHOT_SPEC_INVALID');
    keys.add(`${request.method} ${documentURL(request.url)}`);
    if(request.method==='GET'&&response.status===200&&/text\/html|application\/xhtml\+xml/i.test(content.mimeType??'')){
     // HAR size may be unknown (-1) even when body capture was unfinished.
     // Declared documents must always carry embedded bytes before becoming UI.
     if(documents!.has(documentURL(request.url))&&typeof content.text!=='string')fail('SITE_SNAPSHOT_SPEC_INVALID');
     capturedDocuments.add(documentURL(request.url));
    }
   }
   if([...documents!].some(url=>!capturedDocuments.has(url)))fail('SITE_SNAPSHOT_SPEC_INVALID');
   return path;
  }catch(error){const code=error instanceof Error&&/^SITE_SNAPSHOT_/.test(error.message)?error.message:'SITE_SNAPSHOT_SPEC_INVALID';infrastructureFault(code);throw new Error(code);}
 };
 const block=async(route:Route,code:string)=>{const request=route.request();intentional.add(request);settled(request);event('blocked-side-effect',code,request.url());await route.abort();};
 const guard=async(route:Route)=>{
  const request=route.request(),url=request.url();
  if(!['GET','HEAD'].includes(request.method()))return block(route,'METHOD_BLOCKED');
  try{if(new URL(url).origin!==origin!)return block(route,'ORIGIN_BLOCKED');}catch{return block(route,'ORIGIN_BLOCKED');}
  if(!safeURL(url))return block(route,'AUTH_BLOCKED');
  if(request.isNavigationRequest()){
   let ownFrame=false;try{ownFrame=request.frame()===page.mainFrame();}catch{}
   if(!ownFrame)return block(route,'FRAME_BLOCKED');
   if(!documents!.has(documentURL(url)))return block(route,'DOCUMENT_SCOPE_BLOCKED');
   if(authorizedNavigation!==documentURL(url))return block(route,'UNREQUESTED_NAVIGATION_BLOCKED');
   localDisclosure=false;
  }
  if(localDisclosure)return block(route,'LOCAL_DISCLOSURE_NETWORK_BLOCKED');
  if(!keys.has(`${request.method()} ${documentURL(url)}`)){intentional.add(request);settled(request);infrastructureFault('SITE_SNAPSHOT_MISS',url);return route.abort();}
  replaying.add(request);return route.fallback();
 };
 const prepare=()=>prepared??=(async()=>{
  const harPath=await validateHAR();
  if(page.url()!=='about:blank'||page.context().serviceWorkers().length){infrastructureFault('SITE_SNAPSHOT_CONTEXT_NOT_FRESH');fail('SITE_SNAPSHOT_CONTEXT_NOT_FRESH');}
  await page.exposeBinding('__betaSnapshotBlocked',(_source,code:string)=>{if(['FORM_BLOCKED','SERVICE_WORKER_BLOCKED'].includes(code))event('blocked-side-effect',code);});
  // A literal script avoids TypeScript transpiler helpers in the browser realm.
  await page.context().addInitScript(`(() => {
   const blocked = code => { void window.__betaSnapshotBlocked(code); };
   window.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); blocked('FORM_BLOCKED'); }, true);
   HTMLFormElement.prototype.submit = function() { blocked('FORM_BLOCKED'); };
   HTMLFormElement.prototype.requestSubmit = function() { blocked('FORM_BLOCKED'); };
   if ('serviceWorker' in navigator) navigator.serviceWorker.register = async () => { blocked('SERVICE_WORKER_BLOCKED'); throw new Error('Readonly snapshot'); };
  })()`);  // The HAR handler aborts misses itself; no network fallback is installed anywhere.
  await page.context().routeFromHAR(harPath,{notFound:'abort',update:false});
  await pom.prepare();
  // These run before POM routes, which also keep delayed disclosure handlers local.
  await page.context().route('**/*',guard);await page.route('**/*',guard);
  await page.context().routeWebSocket('**/*',socket=>{event('blocked-side-effect','WEBSOCKET_BLOCKED',socket.url());socket.close();});
  page.context().on('page',popup=>{if(popup!==page){event('blocked-side-effect','POPUP_BLOCKED');void popup.close().catch(()=>{});}});
  page.on('dialog',dialog=>{event('blocked-side-effect','DIALOG_BLOCKED');void dialog.dismiss().catch(()=>{});});
  page.on('download',download=>{event('blocked-side-effect','DOWNLOAD_BLOCKED',download.url());void download.cancel().catch(()=>{});});
  page.on('filechooser',()=>event('blocked-side-effect','FILE_CHOOSER_BLOCKED'));
  page.context().on('request',request=>{try{if(request.frame().page()===page)pending.add(request);}catch{}});
  page.context().on('requestfinished',settled);
  page.context().on('requestfailed',request=>{settled(request);if(replaying.has(request)&&!intentional.has(request))infrastructureFault('SITE_SNAPSHOT_MISS',request.url());});
  page.on('response',response=>{if(response.status()>=400)infrastructureFault('SITE_SNAPSHOT_HTTP_ERROR',response.url());});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&(!safeURL(frame.url())||!documents!.has(documentURL(frame.url())))){safety='SAFETY_BOUNDARY';event('safety-stop','DOCUMENT_SCOPE_BLOCKED',frame.url());}});
  try{await pom.navigateTo(spec.startURL);}catch(error){if(infrastructure)fail(infrastructure);throw error;}
  ready=true;assertReady();event('snapshot-ready','HAR_VERIFIED',spec.startURL);
 })();
 return {adapter:pom,prepare,assertReady,isSafetyStopped:()=>!!safety,evidence:()=>({spec:structuredClone(spec),events:structuredClone(events),networkMode:'frozen-har-no-fallback'})};
}





