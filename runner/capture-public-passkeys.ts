import {mkdir,lstat,realpath,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium,errors,type Browser,type BrowserContext,type Page,type Request} from 'playwright';
import type {BetaPublicSiteSpec} from './beta-public-contracts.js';

export const PASSKEY_DOCUMENTS=[
 'https://docs.github.com/ja/authentication/authenticating-with-a-passkey',
 'https://docs.github.com/ja/authentication/authenticating-with-a-passkey/about-passkeys',
 'https://docs.github.com/ja/authentication/authenticating-with-a-passkey/managing-your-passkeys',
 'https://docs.github.com/ja/authentication/authenticating-with-a-passkey/signing-in-with-a-passkey',
] as const;
const ORIGIN='https://docs.github.com',PRODUCT='ExplorationCapture',MAX_MS=45000,SPACING_MS=1500,MAX_HAR_BYTES=128*1024*1024;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const fail=(code:string):never=>{throw new Error(code);};
const contained=(root:string,target:string)=>{const r=relative(root,target);return !!r&&r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
const samePath=(a:string,b:string)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
type Rule={allow:boolean;path:string};
type RobotGroup={agents:string[];rules:Rule[];hasRule:boolean};

/** RFC 9309 group/longest-match semantics, with stricter failure on unknown permission. */
export function robotsDecision(source:string,target:string,product=PRODUCT){
 if(typeof source!=='string'||!source.trim()||Buffer.byteLength(source)>512*1024||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source))fail('ROBOTS_INVALID');
 const groups:RobotGroup[]=[];let group:RobotGroup|undefined;
 for(const raw of source.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/)){
  const line=raw.replace(/#.*/,'').trim();if(!line)continue;
  const match=/^([a-z-]+)\s*:\s*(.*)$/i.exec(line);if(!match)fail('ROBOTS_INVALID');
  const key=match![1].toLowerCase(),value=match![2].trim();
  if(key==='user-agent'){
   if(!/^(?:\*|[a-z_-]+)$/i.test(value))fail('ROBOTS_INVALID_AGENT');
   if(!group||group.hasRule){group={agents:[],rules:[],hasRule:false};groups.push(group);}group.agents.push(value.toLowerCase());
  }else if(key==='allow'||key==='disallow'){
   if(!group)fail('ROBOTS_ORPHAN_RULE');group!.hasRule=true;
   if(value&&(!value.startsWith('/')||/\s/.test(value)))fail('ROBOTS_INVALID_RULE');
   if(value){normalizeOctets(value);group!.rules.push({allow:key==='allow',path:value});}
  }else if(key!=='sitemap')fail('ROBOTS_UNSUPPORTED_DIRECTIVE');
 }
 if(!groups.some(g=>g.agents.includes('*')))fail('ROBOTS_WILDCARD_GROUP_REQUIRED');
 const exact=groups.filter(g=>g.agents.includes(product.toLowerCase())),selected=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
 let url:URL;try{url=new URL(target);}catch{fail('ROBOTS_TARGET_INVALID');}
 const path=normalizeOctets(url!.pathname+url!.search);let winning:Rule|undefined,score=-1;
 for(const rule of selected.flatMap(g=>g.rules)){
  const anchored=rule.path.endsWith('$'),normalized=normalizeOctets(anchored?rule.path.slice(0,-1):rule.path);
  const pattern=normalized.split('*').map(part=>part.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*');
  const specificity=Buffer.byteLength(normalized.replaceAll('*','').replace(/%[a-f\d]{2}/gi,'x'));
  if(new RegExp('^'+pattern+(anchored?'$':'')).test(path)&&(specificity>score||specificity===score&&rule.allow)){
   winning=rule;score=specificity;
  }
 }
 return {allowed:winning?.allow??true,group:exact.length?product:'*',matchedRule:winning?.path??null,reason:winning?(winning.allow?'matching-allow':'matching-disallow'):'matched-group-no-restriction'};
}
function normalizeOctets(value:string){
 let out='';for(let i=0;i<value.length;i++){
  const c=value[i];if(c==='%'){const pair=value.slice(i+1,i+3);if(!/^[a-f\d]{2}$/i.test(pair))fail('ROBOTS_INVALID_ESCAPE');const char=String.fromCharCode(parseInt(pair,16));out+=/[a-z\d._~-]/i.test(char)?char:'%'+pair.toUpperCase();i+=2;}
  else if(c.charCodeAt(0)>127){const cp=String.fromCodePoint(value.codePointAt(i)!);out+=encodeURIComponent(cp);if(cp.length===2)i++;}
  else out+=c;
 }return out;
}

async function reserveOutput(input:string){
 if(typeof input!=='string'||!input.trim())fail('CAPTURE_OUTPUT_INVALID');
 const root=resolve('reports'),out=resolve(input);if(!contained(root,out))fail('CAPTURE_OUTPUT_OUTSIDE_REPORTS');
 try{
  const rootStat=await lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||!samePath(await realpath(root),root))fail('invalid');
  let current=root;const components=relative(root,dirname(out)).split(sep).filter(Boolean);
  for(const component of components){current=join(current,component);const stat=await lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory()||!samePath(await realpath(current),current))fail('invalid');}
  await mkdir(out);const stat=await lstat(out);if(stat.isSymbolicLink()||!stat.isDirectory()||!samePath(await realpath(out),out))fail('invalid');
 }catch{fail('CAPTURE_OUTPUT_MUST_BE_NEW_REAL_DIRECTORY');}
 return out;
}
function safeAsset(url:URL){
 try{const path=decodeURIComponent(url.pathname);return url.origin===ORIGIN&&!url.username&&!url.password&&/^\/(?:_next|assets)\//.test(path)&&!/[\\\x00-\x20]/.test(url.href)&&!/[\\\x00-\x20]/.test(path)&&! /\.(?:pdf|zip|7z|rar|tar|gz|exe|msi|dmg|apk|docx?|xlsx?)$/i.test(path);}catch{return false;}
}

type Omitted={url:string|null;method:string|null;status:number|null;reason:string};
/** Return a new embedded HAR; original capture bytes are never rewritten. */
export function normalizeCaptureHAR(input:Buffer){
 if(input.length>MAX_HAR_BYTES)fail('CAPTURE_HAR_TOO_LARGE');let har:any;
 try{har=JSON.parse(input.toString('utf8'));}catch{fail('CAPTURE_HAR_INVALID');}
 if(!Array.isArray(har?.log?.entries))fail('CAPTURE_HAR_INVALID');
 const omitted:Omitted[]=[];
 har.log.entries=har.log.entries.filter((entry:any)=>{
  const request=entry?.request,response=entry?.response,content=response?.content;
  let reason:string|undefined,url:URL|undefined;
  try{url=new URL(request?.url);}catch{reason='invalid-url';}
  if(!reason&&(!['GET','HEAD'].includes(request?.method)))reason='non-readonly-method';
  if(!reason&&(url!.origin!==ORIGIN||url!.username||url!.password))reason='foreign-origin-or-credentials';
  if(!reason&&!PASSKEY_DOCUMENTS.includes(url!.href as typeof PASSKEY_DOCUMENTS[number])&&!safeAsset(url!))reason='outside-document-and-static-asset-scope';
  if(!reason&&![200,304].includes(response?.status))reason='non-success-status';
  if(!reason&&(!content||typeof content.text!=='string'||content._file||content.encoding&&content.encoding!=='base64'))reason='body-not-self-contained';
  if(!reason&&content.encoding==='base64'&&!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content.text))reason='invalid-base64-body';
  if(!reason&&/text\/html|application\/xhtml\+xml/i.test(content.mimeType??'')&&!PASSKEY_DOCUMENTS.includes(url!.href as typeof PASSKEY_DOCUMENTS[number]))reason='html-outside-document-scope';
  if(reason)omitted.push({url:typeof request?.url==='string'?request.url:null,method:typeof request?.method==='string'?request.method:null,status:typeof response?.status==='number'?response.status:null,reason});
  return !reason;
 });
 return {bytes:Buffer.from(JSON.stringify(har)),omitted,retainedEntries:har.log.entries.length};
}

export type CaptureOptions={out:string;timeoutMs?:number};
export async function capturePublicPasskeys(options:CaptureOptions,launch:()=>Promise<Browser>=()=>chromium.launch({headless:true})){
 const timeoutMs=options.timeoutMs??MAX_MS;if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_MS)fail('CAPTURE_TIMEOUT_INVALID');
 const out=await reserveOutput(options.out),started=Date.now(),deadline=started+timeoutMs;
 const remaining=()=>{const time=deadline-Date.now();if(time<=0)fail('CAPTURE_TIMEOUT');return time;};
 const write=(name:string,bytes:string|Buffer)=>{remaining();return writeFile(join(out,name),bytes,{flag:'wx'});};
 let browser:Browser|undefined,context:BrowserContext|undefined,page:Page|undefined,expected:string|undefined,navigationSeen=false,fatal:string|undefined;
 const blocked:{code:string;url?:string;method?:string}[]=[],captures:{url:string;finalURL:string;status:number;title:string;screenshot:string;screenshotSha256:string;controls:number;elapsedMs:number}[]=[];
 const intentional=new WeakSet<Request>();let requests=0,robots:any;
 let timeout:ReturnType<typeof setTimeout>|undefined,expired=false;
 const timedOut=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{expired=true;reject(new Error('CAPTURE_TIMEOUT'));},timeoutMs);});
 try{
  await Promise.race([(async()=>{
   const launched=await launch();if(expired){await launched.close().catch(()=>{});fail('CAPTURE_TIMEOUT');}browser=launched;remaining();context=await browser.newContext({viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',userAgent:PRODUCT+'/1.0 (bounded readonly four-document archive)',serviceWorkers:'block',acceptDownloads:false,recordHar:{path:join(out,'original.har'),content:'embed',mode:'full'}});
   const response=await context.request.get(ORIGIN+'/robots.txt',{maxRedirects:0,maxRetries:0,timeout:remaining()});
   const body=await response.body();robots={url:ORIGIN+'/robots.txt',status:response.status(),text:body.toString('utf8')};await write('robots.txt',body);
   if(response.status()!==200)fail('ROBOTS_HTTP_NOT_200');if(body.length>512*1024)fail('ROBOTS_TOO_LARGE');
   robots.decisions=PASSKEY_DOCUMENTS.map(url=>({url,...robotsDecision(robots.text,url)}));if(robots.decisions.some((d:any)=>!d.allowed))fail('ROBOTS_SCOPE_DISALLOWED');
   await response.dispose();
   context.on('page',other=>{if(page&&other!==page){blocked.push({code:'POPUP_BLOCKED'});void other.close().catch(()=>{});}});
   await context.routeWebSocket('**/*',socket=>{blocked.push({code:'WEBSOCKET_BLOCKED',url:socket.url()});socket.close();});
   await context.route('**/*',async route=>{
    const request=route.request(),urlString=request.url();requests++;let code:string|undefined,url:URL|undefined;
    try{url=new URL(urlString);}catch{code='URL_BLOCKED';}
    if(requests>512){fatal='CAPTURE_REQUEST_LIMIT';code='REQUEST_LIMIT_BLOCKED';}
    if(!code&&!['GET','HEAD'].includes(request.method()))code='METHOD_BLOCKED';
    if(!code&&(url!.origin!==ORIGIN||url!.username||url!.password))code='ORIGIN_BLOCKED';
    if(!code&&request.isNavigationRequest()){
     let main=false;try{main=request.frame()===page?.mainFrame();}catch{}
     if(!main)code='FRAME_BLOCKED';
     else if(request.method()!=='GET'||urlString!==expected||navigationSeen||request.redirectedFrom())code='UNREQUESTED_DOCUMENT_BLOCKED';
     else navigationSeen=true;
    }else if(!code&&!safeAsset(url!))code='NONSTATIC_GET_BLOCKED';
    if(code){intentional.add(request);blocked.push({code,url:urlString,method:request.method()});await route.abort();return;}
    // Fallback preserves any lower-level recording transport; production falls through to network.
    await route.fallback();
   });
   page=await context.newPage();
   page.on('dialog',dialog=>{blocked.push({code:'DIALOG_BLOCKED'});void dialog.dismiss().catch(()=>{});});
   page.on('download',download=>{blocked.push({code:'DOWNLOAD_BLOCKED',url:download.url()});void download.cancel().catch(()=>{});});
   context.on('requestfailed',request=>{if(!intentional.has(request))fatal??='CAPTURE_RESOURCE_REQUEST_FAILED';});
   page.on('response',r=>{if(r.status()>=400&&!r.request().isNavigationRequest())fatal??='CAPTURE_RESOURCE_HTTP_ERROR';});
   for(let i=0;i<PASSKEY_DOCUMENTS.length;i++){
    if(i){remaining();await new Promise(r=>setTimeout(r,SPACING_MS));remaining();}
    expected=PASSKEY_DOCUMENTS[i];navigationSeen=false;const result=await page.goto(expected,{waitUntil:'networkidle',timeout:remaining()});
    if(!result)throw new Error('DOCUMENT_NOT_200');if(result.status()!==200)fail('DOCUMENT_NOT_200');if(page.url()!==expected||!navigationSeen)fail('DOCUMENT_IDENTITY_CHANGED');
    if(!/text\/html|application\/xhtml\+xml/i.test(result.headers()['content-type']??''))fail('DOCUMENT_NOT_HTML');
    await page.evaluate(()=>document.fonts.ready);remaining();if(fatal)fail(fatal);
    const screenshot='page-'+i+'.png',bytes=await page.screenshot({path:join(out,screenshot),timeout:remaining()});
    captures.push({url:expected,finalURL:page.url(),status:result.status(),title:await page.title(),screenshot,screenshotSha256:sha(bytes),controls:await page.locator('a,button').count(),elapsedMs:Date.now()-started});expected=undefined;
   }
   if(fatal)fail(fatal);await context.close();context=undefined;remaining();
   const original=await readFile(join(out,'original.har')),normalized=normalizeCaptureHAR(original),har=JSON.parse(normalized.bytes.toString('utf8'));
   for(const url of PASSKEY_DOCUMENTS)if(!har.log.entries.some((e:any)=>e.request.url===url&&e.request.method==='GET'&&e.response.status===200&&/text\/html|application\/xhtml\+xml/i.test(e.response.content.mimeType??'')))fail('CAPTURE_DOCUMENT_MISSING_IN_HAR');
   await write('site.har',normalized.bytes);
   const spec:BetaPublicSiteSpec={schemaVersion:1,id:'github-passkeys-ja-'+new Date().toISOString().slice(0,10).replaceAll('-',''),startURL:PASSKEY_DOCUMENTS[0],allowedDocuments:[...PASSKEY_DOCUMENTS],harPath:join(out,'site.har'),harSha256:sha(normalized.bytes),capturedAtUTC:new Date().toISOString(),sourceDescription:'GitHub Docs Japanese passkeys section; unmodified rendered UI; bounded four-document capture; frozen HAR replay without live fallback'};
   await write('site-spec.json',JSON.stringify(spec,null,2)+'\n');
   const manifest={schemaVersion:1,status:'captured',spec,robots,captures,blocked,omitted:normalized.omitted,retainedEntries:normalized.retainedEntries,originalHarSha256:sha(original),networkMode:'capture-once-replay-offline-no-fallback',bounds:{documents:4,robotsRequests:1,maxConcurrentDocuments:1,minDocumentIntervalMs:SPACING_MS,timeoutMs,requests},provenance:{originalHAR:'original.har',originalHARPreserved:true,source:PASSKEY_DOCUMENTS[0],capturedAtUTC:spec.capturedAtUTC},policy:{url:'https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies',scope:'Bounded public documentation acquisition; repeated trials use frozen HAR offline; no accounts, forms or production writes'},attribution:{creator:'GitHub and contributors',source:PASSKEY_DOCUMENTS[0],license:'CC-BY-4.0',licenseURL:'https://github.com/github/docs/blob/main/LICENSE'},transforms:'Replay HAR omits unsafe, failed, redirected, nonembedded and out-of-scope entries; every omission listed; original HAR and source screenshots retained; document HTML/CSS/text and rendered UI not edited'};
   await write('capture-manifest.json',JSON.stringify(manifest,null,2)+'\n');return manifest;
  })(),timedOut]);
  // Read the durable manifest only after every acquisition and write succeeded.
  return JSON.parse(await readFile(join(out,'capture-manifest.json'),'utf8'));
 }catch(error){
  // Budgeted Playwright operations may reject just before the timer for the same total deadline.
  const cause=error instanceof errors.TimeoutError?{name:'TimeoutError',code:'PLAYWRIGHT_OPERATION_TIMEOUT'}:undefined;
  const failure=cause?new Error('CAPTURE_TIMEOUT',{cause}):error;
  await context?.close().catch(()=>{});context=undefined;
  await writeFile(join(out,'capture-failure.json'),JSON.stringify({schemaVersion:1,status:'failed',error:failure instanceof Error?failure.message:String(failure),...(cause?{cause}:{}),robots,captures,blocked,elapsedMs:Date.now()-started,originalHAR:'original.har',partialEvidencePreserved:true},null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw failure;
 }finally{if(timeout)clearTimeout(timeout);await context?.close().catch(()=>{});await browser?.close().catch(()=>{});}
}

export function parseCaptureArgs(args:string[]):CaptureOptions{
 if(args.length!==2||args[0]!=='--out'||!args[1]||args[1].startsWith('--'))fail('CAPTURE_USAGE: npx tsx runner/capture-public-passkeys.ts --out reports/<new-directory>');
 return {out:args[1]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 capturePublicPasskeys(parseCaptureArgs(process.argv.slice(2))).then(result=>console.log(JSON.stringify({out:dirname(result.spec.harPath),spec:result.spec,captures:result.captures.length,retainedEntries:result.retainedEntries,omitted:result.omitted.length}))).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
