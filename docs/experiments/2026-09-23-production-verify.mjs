// Local-only final verification, with persistent output and exact exit codes.
import {spawn} from 'node:child_process';
import {readdir,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('reports',`production-verification-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const files=[...(await Promise.all(['jev','pages','runner'].map(async dir=>(await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const out={startedAt:new Date().toISOString(),sourceHashes:await hashes(),commands:[]};
const tests=(await readdir('tests')).filter(f=>f.endsWith('.test.ts')).map(f=>join('tests',f));
for(const [id,args] of [['tests',['--import','tsx','--test','--test-reporter=spec',...tests]],['types',['node_modules/typescript/bin/tsc','--noEmit']],['build',['node_modules/vite/bin/vite.js','build']]]){
 const started=performance.now();let output='';
 const code=await new Promise(resolve=>{const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',()=>resolve(-1));child.on('exit',resolve);});
 await writeFile(join(root,`${id}.txt`),output);
 out.commands.push({id,args,exitCode:code,elapsedMs:performance.now()-started,output:`${id}.txt`,...(id==='tests'?{summary:Object.fromEntries(['tests','pass','fail','skipped'].map(k=>[k,Number(new RegExp(`ℹ ${k} (\\d+)`).exec(output)?.[1]??NaN)]))}:{})});
 console.log(JSON.stringify(out.commands.at(-1)));
 if(code!==0)break;
}
out.codeUnchanged=JSON.stringify(await hashes())===JSON.stringify(out.sourceHashes);out.pass=out.commands.length===3&&out.commands.every(c=>c.exitCode===0)&&out.codeUnchanged;out.finishedAt=new Date().toISOString();
await writeFile(join(root,'validation.json'),JSON.stringify(out,null,2));console.log(JSON.stringify({report:join(root,'validation.json'),pass:out.pass}));
