import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rename} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {BudgetPersistenceError,persistBudgetSnapshot} from '../runner/budget-persistence.js';

const win=process.platform==='win32';
const root=resolve(`reports/goal-search-evidence-2026-10-29/persistence-probe-retry-tests-${Date.now()}`);
await mkdir(root,{recursive:true});
const lockScript=join(root,'hold-reader.ps1');
await writeFile(lockScript,`param([string]$Target)\n$held=[System.IO.File]::Open($Target,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite)\ntry {[Console]::Out.WriteLine('LOCKED');[Console]::Out.Flush();[void][Console]::ReadLine()} finally {$held.Dispose();[Console]::Out.WriteLine('RELEASED');[Console]::Out.Flush()}\n`,{flag:'wx'});
const prior={used:1,attempts:[{id:'PROBE_ONLY',status:'RESERVED'}]},next={used:1,attempts:[{id:'PROBE_ONLY',status:'OK',metadata:{attempts:1}}]};
const gate=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const fsError=(code:string)=>Object.assign(Error('PRIVATE_MESSAGE'),{code,path:'PRIVATE_PATH',stack:'PRIVATE_STACK',cause:'PRIVATE_CAUSE'});
async function fixture(name:string){const dir=await mkdtemp(join(root,name+'-')),file=join(dir,'ledger.json'),bytes=JSON.stringify(prior)+'\n';await writeFile(file,bytes);return {dir,file,bytes};}
async function expectFailure(pending:Promise<void>,stage:'write-temp'|'replace-ledger',fsCode:string){let caught:unknown;try{await pending;}catch(e){caught=e;}assert.ok(caught instanceof BudgetPersistenceError);assert.deepEqual(caught.details,{stage,fsCode});return caught;}
function diagnostics(t:any){const messages:string[]=[];t.mock.method(console,'warn',(...args:unknown[])=>{assert.equal(args.length,1);assert.equal(typeof args[0],'string');messages.push(args[0] as string);});return messages;}
function checkDiagnostic(value:string,file:string){assert.equal(typeof value,'string','Expected sanitized retry diagnostic');const event=JSON.parse(value),normalized=win?resolve(file).toLowerCase():resolve(file);assert.deepEqual(Object.keys(event).sort(),['attempt','delayMs','fsCode','kind','ledgerId']);assert.ok(['budget-persistence-retry','budget-persistence-recovered','budget-persistence-exhausted'].includes(event.kind));assert.equal(event.fsCode,'EPERM');assert.equal(event.ledgerId,createHash('sha256').update(normalized).digest('hex'));assert.ok(Number.isSafeInteger(event.attempt)&&event.attempt>=1&&event.attempt<=4);assert.ok([0,25,50,100].includes(event.delayMs));assert.ok(!value.includes('PRIVATE'));assert.ok(!value.includes(file));return event;}
async function hold(file:string){
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',lockScript,file],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stderr.on('data',s=>{stderr+=s.toString();});const ended=once(child,'exit');void ended.catch(()=>{});
 await new Promise<void>((done,fail)=>{const deadline=setTimeout(()=>{child.kill();fail(Error('TEST_LOCK_TIMEOUT'));},10000);child.on('error',e=>{clearTimeout(deadline);fail(e);});child.stdout.on('data',s=>{stdout+=s.toString();if(stdout.includes('LOCKED')){clearTimeout(deadline);done();}});child.on('exit',code=>{if(!stdout.includes('LOCKED')){clearTimeout(deadline);fail(Error(`TEST_LOCK_EXIT_${code}`));}});});
 let released=false;return {release:async()=>{if(!released){released=true;child.stdin.end('release\n');}const [code]=await ended;assert.equal(code,0);assert.equal(stderr,'');assert.match(stdout,/RELEASED/);}};
}

test('native Windows shared reader release lets retry replace the same complete temp without another write',{skip:!win},async t=>{
 const log=diagnostics(t),{dir,file}=await fixture('native-release'),holder=await hold(file);let writes=0,replaces=0,temporary='',serialized='';const paths:string[]=[];
 try{
  await persistBudgetSnapshot(file,next,{write:async(p,c)=>{writes++;temporary=p;serialized=c;await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{replaces++;paths.push(from);try{await rename(from,to);}catch(e){await holder.release();throw e;}}});
 }finally{await holder.release();}
 assert.equal(writes,1);assert.equal(replaces,2);assert.equal(new Set(paths).size,1);assert.equal(paths[0],temporary);assert.deepEqual(JSON.parse(serialized),next);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),next);assert.deepEqual(await readdir(dir),['ledger.json']);assert.deepEqual(log.map(x=>checkDiagnostic(x,file).kind),['budget-persistence-retry','budget-persistence-recovered']);
});
test('native Windows held reader exhausts bounded replace attempts and preserves original and completed temp',{skip:!win},async t=>{
 const log=diagnostics(t),{dir,file,bytes}=await fixture('native-held'),holder=await hold(file);let writes=0,replaces=0,temporary='';
 try{await expectFailure(persistBudgetSnapshot(file,next,{write:async(p,c)=>{writes++;temporary=p;await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{replaces++;await rename(from,to);}}),'replace-ledger','EPERM');}finally{await holder.release();}
 assert.equal(writes,1);assert.ok(replaces>=1&&replaces<=4);assert.equal(await readFile(file,'utf8'),bytes);assert.deepEqual(JSON.parse(await readFile(temporary,'utf8')),next);assert.equal((await readdir(dir)).length,2);const last=checkDiagnostic(log.at(-1)!,file);assert.equal(last.kind,'budget-persistence-exhausted');assert.equal(last.attempt,replaces);assert.equal(last.delayMs,0);
});
test('eligible EPERM makes at most four same-temp attempts with prescribed delays and no new request metadata',{skip:!win},async t=>{
 const log=diagnostics(t),{file}=await fixture('bounded');t.mock.method(performance,'now',()=>0);let serializations=0,writes=0,replaces=0;const serialized:string[]=[],paths:string[]=[];
 const snapshot={toJSON(){serializations++;return next;}};
 await expectFailure(persistBudgetSnapshot(file,snapshot,{write:async(p,c)=>{writes++;paths.push(p);serialized.push(c);},replace:async(from)=>{replaces++;assert.equal(from,paths[0]);throw fsError('EPERM');}}),'replace-ledger','EPERM');
 assert.equal(serializations,1);assert.equal(writes,1);assert.equal(replaces,4);assert.equal(JSON.parse(serialized[0]).attempts[0].metadata.attempts,1);assert.deepEqual(log.map(x=>{const e=checkDiagnostic(x,file);return [e.kind,e.attempt,e.delayMs];}),[['budget-persistence-retry',1,25],['budget-persistence-retry',2,50],['budget-persistence-retry',3,100],['budget-persistence-exhausted',4,0]]);
});
test('elapsed guard starts no new attempt after a slow native replacement reaches 250ms',{skip:!win},async t=>{
 const log=diagnostics(t),{file}=await fixture('elapsed');let elapsed=0,replaces=0;t.mock.method(performance,'now',()=>elapsed);
 await expectFailure(persistBudgetSnapshot(file,next,{write:async()=>{},replace:async()=>{replaces++;elapsed=251;throw fsError('EPERM');}}),'replace-ledger','EPERM');assert.equal(replaces,1);assert.deepEqual(log.map(x=>{const e=checkDiagnostic(x,file);return [e.kind,e.attempt,e.delayMs];}),[['budget-persistence-exhausted',1,0]]);
});
test('elapsed guard does not begin another attempt when its asynchronous delay crosses 250ms',{skip:!win},async t=>{
 const log=diagnostics(t),{file}=await fixture('delay-elapsed');let elapsed=0,replaces=0;t.mock.method(performance,'now',()=>elapsed);
 await expectFailure(persistBudgetSnapshot(file,next,{write:async()=>{},replace:async()=>{replaces++;elapsed=240;setTimeout(()=>{elapsed=251;},1);throw fsError('EPERM');}}),'replace-ledger','EPERM');assert.equal(replaces,1);assert.equal(checkDiagnostic(log.at(-1)!,file).kind,'budget-persistence-exhausted');
});
for(const code of ['EPERM','ENOSPC','EIO'])test(`write-temp ${code} has one write, no replacement and no retry diagnostics`,async t=>{
 const log=diagnostics(t),{file,bytes}=await fixture('write-'+code);let writes=0,replaces=0;
 await expectFailure(persistBudgetSnapshot(file,next,{write:async()=>{writes++;throw fsError(code);},replace:async()=>{replaces++;}}),'write-temp',code);assert.equal(writes,1);assert.equal(replaces,0);assert.deepEqual(log,[]);assert.equal(await readFile(file,'utf8'),bytes);
});
for(const code of ['EACCES','EBUSY','ENOENT','EIO','UNKNOWN'])test(`replace ${code} does not retry or emit EPERM diagnostics`,async t=>{
 const log=diagnostics(t),{file}=await fixture('replace-'+code);let writes=0,replaces=0;
 await expectFailure(persistBudgetSnapshot(file,next,{write:async()=>{writes++;},replace:async()=>{replaces++;throw fsError(code);}}),'replace-ledger',code);assert.equal(writes,1);assert.equal(replaces,1);assert.deepEqual(log,[]);
});
test('same resolved ledger is FIFO, freezes each snapshot on invocation and cannot end with an older delayed snapshot',async()=>{
 const {file}=await fixture('fifo'),entered=gate(),release=gate();const events:string[]=[];let secondWrote=false,toJSON=0;const original={value:2,toJSON(){toJSON++;return {value:this.value};}};
 const first=persistBudgetSnapshot(file,{value:1},{write:async(p,c)=>{events.push('write1');await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{entered.resolve();await release.promise;events.push('replace1');await rename(from,to);}});await entered.promise;
 const second=persistBudgetSnapshot(relative(process.cwd(),file),original,{write:async(p,c)=>{secondWrote=true;events.push('write2');await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{events.push('replace2');await rename(from,to);}});original.value=99;await pause(20);const observedWhileHeld=secondWrote;release.resolve();await Promise.all([first,second]);
 assert.equal(observedWhileHeld,false);assert.equal(toJSON,1);assert.deepEqual(events,['write1','replace1','write2','replace2']);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{value:2});
});
test('Windows case aliases share the FIFO ledger owner',{skip:!win},async()=>{
 const {file}=await fixture('case-alias'),entered=gate(),release=gate();let secondWrote=false;
 const first=persistBudgetSnapshot(file,{value:1},{write:async(p,c)=>{await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{entered.resolve();await release.promise;await rename(from,to);}});await entered.promise;
 const second=persistBudgetSnapshot(file.toUpperCase(),{value:2},{write:async(p,c)=>{secondWrote=true;await writeFile(p,c,{flag:'wx'});},replace:rename});await pause(20);const observedWhileHeld=secondWrote;release.resolve();await Promise.all([first,second]);assert.equal(observedWhileHeld,false);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{value:2});
});
test('another ledger progresses while a first ledger replacement is pending',async()=>{
 const a=await fixture('parallel-a'),b=await fixture('parallel-b'),entered=gate(),release=gate();let bFinished=false;
 const first=persistBudgetSnapshot(a.file,next,{write:async(p,c)=>{await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{entered.resolve();await release.promise;await rename(from,to);}});await entered.promise;
 const second=persistBudgetSnapshot(b.file,next).then(()=>{bFinished=true;});await pause(30);const progressWhileHeld=bFinished;release.resolve();await Promise.all([first,second]);assert.equal(progressWhileHeld,true);assert.deepEqual(JSON.parse(await readFile(b.file,'utf8')),next);
});
test('a queued failure cannot poison later same-ledger saves or create an unhandled rejection',async()=>{
 const {file}=await fixture('cleanup'),entered=gate(),release=gate(),unhandled:unknown[]=[];const onUnhandled=(e:unknown)=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 try{
  const first=persistBudgetSnapshot(file,{v:1},{write:async()=>{entered.resolve();await release.promise;throw fsError('ENOSPC');},replace:async()=>assert.fail('replacement after write failure')});const checked=expectFailure(first,'write-temp','ENOSPC');await entered.promise;
  const second=persistBudgetSnapshot(file,{v:2});release.resolve();await checked;await second;await pause(0);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{v:2});await persistBudgetSnapshot(file,{v:3});await pause(0);assert.deepEqual(unhandled,[]);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{v:3});
 }finally{process.off('unhandledRejection',onUnhandled);release.resolve();}
});
test('retry diagnostics are allowlisted JSON and never inspect error getters or expose a private path',{skip:!win},async t=>{
 const log=diagnostics(t),{file}=await fixture('PRIVATE_LEDGER_PATH');let attempts=0,privateRead=false;const error=fsError('EPERM');Object.defineProperty(error,'payload',{enumerable:true,get(){privateRead=true;throw Error('PRIVATE_GETTER');}});
 await persistBudgetSnapshot(file,next,{write:async()=>{},replace:async()=>{if(++attempts===1)throw error;}});assert.equal(attempts,2);assert.equal(privateRead,false);assert.deepEqual(log.map(x=>checkDiagnostic(x,file).kind),['budget-persistence-retry','budget-persistence-recovered']);
});

for(const queued of [false,true])test(`native relative destination stays at invocation CWD${queued?' while queued':''}`,async()=>{
 const dir=await mkdtemp(join(root,'cwd-')),a=join(dir,'a'),b=join(dir,'b');await mkdir(a);await mkdir(b);
 for(const folder of [a,b])await writeFile(join(folder,'ledger.json'),JSON.stringify({old:true}));
 const moduleURL=pathToFileURL(resolve('runner/budget-persistence.ts')).href,loader=pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href;
 const program=`import {persistBudgetSnapshot} from ${JSON.stringify(moduleURL)};
 import {readFile,writeFile,rename} from 'node:fs/promises';import {resolve,join} from 'node:path';
 const a=${JSON.stringify(a)},b=${JSON.stringify(b)};process.chdir(a);let first,release;
 if(${queued}){let entered;const ready=new Promise(r=>{entered=r}),held=new Promise(r=>{release=r});first=persistBudgetSnapshot('ledger.json',{first:true},{write:async(p,c)=>{await writeFile(p,c,{flag:'wx'});},replace:async(from,to)=>{entered();await held;await rename(resolve(a,from),resolve(a,to));}});await ready;}
 const saved=persistBudgetSnapshot('ledger.json',{saved:1});process.chdir(b);if(release)release();if(first)await first;await saved;
 console.log(JSON.stringify({a:JSON.parse(await readFile(join(a,'ledger.json'),'utf8')),b:JSON.parse(await readFile(join(b,'ledger.json'),'utf8'))}));`;
 const child=spawn(process.execPath,['--import',loader,'--input-type=module','-e',program],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>{out+=s.toString();});child.stderr.on('data',s=>{err+=s.toString();});const [code]=await once(child,'close');assert.equal(code,0,err);
 assert.deepEqual(JSON.parse(out),{a:{saved:1},b:{old:true}});
});
