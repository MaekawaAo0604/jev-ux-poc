import {readdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {report} from './report.js';
const root=resolve(process.argv[2]||'reports');
const results=[];
for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isDirectory()){
  try{results.push(JSON.parse(await readFile(join(root,entry.name,'result.json'),'utf8')));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
if(!results.length)throw new Error('No result.json found in run subdirectories');
await report(root,results);console.log(join(root,'index.html'));
