import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

// Independent reference inspection, NEVER input to navigation/reading Jev.
// Only linked same-origin static HTML, no query variants, files or external
// destinations. A closed graph here does not mean every resource on the site.
const origin='https://www.7-zip.org',root=resolve('reports',`reference-closure-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root,{recursive:true});
const robots=await fetch(origin+'/robots.txt',{redirect:'manual',signal:AbortSignal.timeout(15000)});
const robotsBody=await robots.text();
assert.equal(robots.status,200);assert.equal(robotsBody.trim(),'','Unexpected robots policy: review before continuing');
const preflight={url:origin+'/robots.txt',status:robots.status,body:robotsBody,at:new Date().toISOString()};
await writeFile(join(root,'robots.json'),JSON.stringify(preflight,null,2));
const browser=await chromium.launch(),context=await browser.newContext({javaScriptEnabled:false});
await context.route('**/*',r=>r.abort());const page=await context.newPage();
const queue=[origin+'/'],seen=new Set<string>(),pages:any[]=[],excluded:any[]=[],errors:any[]=[];
const checkpoint=()=>writeFile(join(root,'reference.json'),JSON.stringify({root,origin,preflight,scope:'Linked same-origin root/.html documents without query strings; scripts/forms/files/external pages are not traversed. Browser parses saved HTML offline with scripting/network disabled. This reference material is never supplied to Jev.',pages,excluded,errors,pending:queue.filter(u=>!seen.has(u)),completed:false},null,2));
try{
 for(let index=0;index<queue.length;index++){
  const url=queue[index];if(seen.has(url))continue;seen.add(url);await delay(2000);
  try{
   const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,200,'Non-200 or redirect: reference closure cannot be claimed');
   assert.match(response.headers.get('content-type')??'',/text\/html/i);
   const html=await response.text(),filename=`page-${pages.length+1}`;
   await writeFile(join(root,filename+'.html'),html);
   await page.setContent(html,{waitUntil:'domcontentloaded'});
   const parsed=await page.evaluate(()=>({title:document.title,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')!),base:document.querySelector('base[href]')?.getAttribute('href')}));
   assert.equal(parsed.base,undefined,'Base URL needs explicit review');
   await writeFile(join(root,filename+'.txt'),parsed.text);
   const links:string[]=[];
   for(const href of parsed.links){
    let target:URL;try{target=new URL(href,url);}catch{excluded.push({from:url,href,reason:'invalid'});continue;}
    target.hash='';const reason=target.origin!==origin?'external':target.search?'query':target.pathname!=='/'&&!/\.html$/i.test(target.pathname)?'non-html-path':undefined;
    if(reason){excluded.push({from:url,url:target.href,reason});continue;}
    links.push(target.href);if(!seen.has(target.href)&&!queue.includes(target.href))queue.push(target.href);
   }
   const lines=parsed.text.split('\n');
   const matches=lines.flatMap((text,line)=>/password|forgot|recover|restor|encrypt/i.test(text)?[{line:line+1,text}]:[]);
   pages.push({url,title:parsed.title,html:filename+'.html',text:filename+'.txt',htmlSha256:createHash('sha256').update(html).digest('hex'),textSha256:createHash('sha256').update(parsed.text).digest('hex'),links:[...new Set(links)],matches});
   console.log(JSON.stringify({url,documents:pages.length,queued:queue.length,matches:matches.length}));
  }catch(error){errors.push({url,error:error instanceof Error?error.message:String(error)});}
  await checkpoint();
 }
}finally{await browser.close();}
assert.equal(errors.length,0,'Reference inspection incomplete');assert.ok(queue.every(u=>seen.has(u)));
await checkpoint();
const result={root,origin,preflight,scope:'Finite closure of linked same-origin root/.html documents without query strings. No inference about unlinked, file, dynamic, translated, external/forum or historical content. Not proof that a password cannot be recovered.',completed:true,pages,excluded,errors,pending:[]};
await writeFile(join(root,'reference.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({root,documents:pages.length,completed:true,urls:pages.map(p=>p.url)}));
