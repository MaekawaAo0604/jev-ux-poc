import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
for(const flag of ['--help','--unknown'])test(`diversity CLI ${flag} cannot start paid trials`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jev-goal-cli-'));let stdout='',code=0;
 try{
  try{({stdout}=await promisify(execFile)(process.execPath,['--import',import.meta.resolve('tsx'),resolve('runner/goal-diversity.ts'),flag],{cwd:dir,env:{...process.env,AI_GATEWAY_API_KEY:''},timeout:10000}));}
  catch(error){const e=error as {stdout?:string;code?:number};stdout=e.stdout||'';code=e.code??1;}
  assert.ok(!stdout.includes('START'),'informational or invalid options must not begin trials');
  if(flag==='--help'){assert.equal(code,0);assert.match(stdout,/--repeat/);}else assert.notEqual(code,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
