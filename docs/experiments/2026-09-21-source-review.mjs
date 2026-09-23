// Produce a read-only review diff against the pre-change snapshot in an unborn repository.
import {readFile, writeFile, access, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve, join} from 'node:path';
const workspace = resolve('.superpowers/sdd/2026-09-21-contextual-evidence');
const baseline = join(workspace,'before');
const allowed = /^(?:jev|pages|runner|tests)\/[\w./-]+$|^README\.md$/;
const mode = process.argv[2];
if(!['task-1','task-2','all'].includes(mode)) throw new Error('Use task-1, task-2, or all');
const first = ['jev/types.ts','pages/visible-text.ts','pages/AccountPage.ts','jev/history.ts',
  'jev/progress.ts','tests/context.test.ts','tests/history.test.ts'];
const exists = async path => {try {await access(path); return true;} catch {return false;}};
async function files(dir) {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory()) result.push(...await files(path));
    else result.push(path.replaceAll('\\','/'));
  }
  return result;
}
const all=[...(await Promise.all(['jev','pages','runner','tests'].map(files))).flat(),'README.md'];
const selected=mode==='task-1'?first:mode==='task-2'?all.filter(f=>!first.includes(f)):all;
const empty=join(workspace,'empty-source');
await writeFile(empty,'');
let output=`Review ${mode}\nBase: scoped pre-change file snapshot (no HEAD exists).\n\n`;
for(const file of selected) {
  if(!allowed.test(file)||file.split('/').includes('..')) throw new Error('Unexpected review path');
  const old=join(baseline,file), current=resolve(file);
  const oldExists=await exists(old), currentExists=await exists(current);
  if(!oldExists&&!currentExists) continue;
  if(oldExists&&currentExists&&(await readFile(old)).equals(await readFile(current))) continue;
  const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--',oldExists?old:empty,currentExists?current:empty],
    {encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  if(![0,1].includes(diff.status)) throw new Error(`Diff failed for ${file}: ${diff.stderr}`);
  output+=`\nFILE: ${file}\n${diff.stdout}\n`;
}
const path=join(workspace,`${mode}-review.diff`);
await writeFile(path,output);
console.log(JSON.stringify({path,characters:output.length}));
