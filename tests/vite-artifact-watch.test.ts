import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer,resolveConfig,type ViteDevServer} from 'vite';

const root=resolve('.'),reportDir=join(root,'reports/visual-conditions-2026-10-30/stale-baseline-review/watch-fix');
const inside=(parent:string,path:string)=>{const part=relative(parent,resolve(path));return part===''||(!part.startsWith('..')&&!/^[A-Za-z]:/.test(part));};
async function until(check:()=>boolean,timeoutMS=5000){const deadline=Date.now()+timeoutMS;while(!check()){assert.ok(Date.now()<deadline,'Expected app control to enter the real watcher');await new Promise(resolve=>setTimeout(resolve,25));}}

test('Vite excludes report artifacts while actual app file watching remains active',{timeout:20000},async()=>{
 const id=randomUUID(),control=join(root,'app','watch-control-'+id+'.txt'),marker=join(reportDir,'watch-marker-'+id+'.txt');
 const inline={root,envFile:false as const,logLevel:'silent' as const};
 const config=await resolveConfig(inline,'serve');
 const ignored=config.server.watch&&config.server.watch.ignored;
 assert.ok(Array.isArray(ignored)&&ignored.includes('**/reports/**'),'Resolved root configuration must exclude the reports subtree');
 let server:ViteDevServer|undefined,controlCreated=false,markerCreated=false;
 const events:{event:string;path:string}[]=[];
 await mkdir(reportDir,{recursive:true});
 try{
  assert.ok(inside(join(root,'app'),control)&&inside(reportDir,marker));
  await writeFile(control,'initial app control\n',{flag:'wx'});controlCreated=true;
  await writeFile(marker,'initial report marker\n',{flag:'wx'});markerCreated=true;
  server=await createServer(inline);
  server.watcher.on('all',(event,path)=>{if(resolve(path)===control||resolve(path)===marker)events.push({event,path:resolve(path)});});
  await until(()=>Object.entries(server!.watcher.getWatched()).some(([dir,names])=>names.some(name=>resolve(dir,name)===control)));
  const reportWatchPaths=()=>Object.entries(server!.watcher.getWatched()).flatMap(([dir,names])=>[resolve(dir),...names.map(name=>resolve(dir,name))]).filter(path=>inside(join(root,'reports'),path));
  assert.deepEqual(reportWatchPaths(),[],'No report directory or descendant should be present in the actual watcher inventory');
  const changed=new Promise<void>((resolveChange,reject)=>{
   const timer=setTimeout(()=>{server!.watcher.off('change',listener);reject(Error('APP_CONTROL_CHANGE_NOT_OBSERVED'));},5000);
   const listener=(path:string)=>{if(resolve(path)===control){clearTimeout(timer);server!.watcher.off('change',listener);resolveChange();}};
   server!.watcher.on('change',listener);
  });
  await writeFile(control,'changed app control\n');await changed;
  await writeFile(marker,'changed report marker\n');
  await new Promise(resolveQuiet=>setTimeout(resolveQuiet,750));
  assert.ok(events.some(event=>event.path===control&&event.event==='change'),'Positive app control must produce a real change event');
  assert.deepEqual(events.filter(event=>event.path===marker),[],'Report marker must produce no add/change/remove event');
  assert.deepEqual(reportWatchPaths(),[],'Report subtree must remain absent after marker mutation');
  const evidence={kind:'VITE_ARTIFACT_WATCH_REGRESSION',ignored,appChangeObserved:true,reportMarkerEvents:0,reportWatchInventoryEntries:0,watchedDirectories:Object.keys(server.watcher.getWatched()).length,externalAPIRequests:0,browserRuns:0,envFile:false};
  await server.close();server=undefined;
  await writeFile(join(reportDir,'watch-'+id+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 }finally{
  await server?.close();
  if(controlCreated){assert.ok(inside(join(root,'app'),control));await unlink(control);}
  if(markerCreated){assert.ok(inside(reportDir,marker));await unlink(marker);}
 }
});
