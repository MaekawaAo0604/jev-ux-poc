import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
/** Same audit snapshot for model and human trials. No credentials or reports. */
export async function sourceIdentity(){
 const sourceHashes:Record<string,string>={};
 async function sources(path:string){for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,entry.name);if(entry.isDirectory())await sources(file);else if(/\.(tsx?|css|html)$/.test(entry.name))sourceHashes[file.replaceAll('\\','/')]=sha(await readFile(file));}}
 for(const p of ['app','pages','jev','runner'])await sources(p);for(const p of ['package.json','package-lock.json','tests/goals.ts','index.html'])sourceHashes[p]=sha(await readFile(p));
 return {revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHashes,sourceHash:sha(JSON.stringify(sourceHashes))};
}
