import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
const api=await import('../runner/public-persona-set.js').catch(()=>({} as any));
const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
async function fixture(t:any){
 const root=await mkdtemp(resolve('experiments/persona/set-loader-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const persona=JSON.parse(await readFile('experiments/persona/persona-a.json','utf8'));persona.id='X';const file=join(root,'one.json'),set=join(root,'set.json');await writeFile(file,JSON.stringify(persona));const data={schemaVersion:1,id:'test-set',personas:[{id:'X',file:'one.json',name:persona.name}]};await writeFile(set,JSON.stringify(data));
 return {root,file,set,selection:relative(process.cwd(),set),data,persona};
}
test('loader preserves eight supplied Personas and hashes original set/persona bytes',async()=>{
 assert.equal(typeof api.loadPublicPersonaSet,'function');const selected='experiments/persona/extreme-passkeys-v1/set.json',loaded=await api.loadPublicPersonaSet(selected);
 assert.equal(loaded.personaSet.selection,selected);assert.equal(loaded.personaSet.sha256,sha(await readFile(selected)));assert.equal(loaded.actors.length,8);assert.deepEqual(loaded.actors,['XK0','XK1','XE0','XE1','XP0','XP1','XD0','XD1']);
 for(const entry of loaded.personaFiles){assert.equal(entry.sha256,sha(await readFile(entry.file)));assert.equal(loaded.personas[entry.actor].id,entry.actor);}
});
test('loader rejects empty, oversized, malformed, duplicate and mismatched sets',async t=>{
 const f=await fixture(t);for(const data of [{...f.data,schemaVersion:2},{...f.data,id:'../set'},{...f.data,personas:[]},{...f.data,personas:Array(17).fill(f.data.personas[0])},{...f.data,personas:[f.data.personas[0],{...f.data.personas[0],id:'x'}]},{...f.data,personas:[{...f.data.personas[0],id:'Z'}]},{...f.data,personas:[{...f.data.personas[0],name:'Wrong'}]}]){await writeFile(f.set,JSON.stringify(data));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));}
 await writeFile(f.set,'{');await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));await writeFile(f.set,JSON.stringify(f.data));await writeFile(f.file,'{}');await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));
});
test('loader rejects absolute, traversal, outside-experiments and symbolic escapes',async t=>{
 const f=await fixture(t);for(const file of [f.file,'../one.json','sub/../one.json','C:\\outside.json','/outside.json','sub\\..\\one.json']){await writeFile(f.set,JSON.stringify({...f.data,personas:[{...f.data.personas[0],file}]}));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));}
 for(const selection of [f.set,'../experiments/persona/set.json','reports/set.json'])await assert.rejects(()=>api.loadPublicPersonaSet(selection));
 await mkdir(join(f.root,'nested'));await writeFile(f.set,JSON.stringify({...f.data,personas:[{...f.data.personas[0],file:'nested/link.json'}]}));
 try{await symlink(f.file,join(f.root,'nested/link.json'),'file');}catch(error){if((error as NodeJS.ErrnoException).code==='EPERM'){t.diagnostic('Symlink creation unavailable; containment cases still verified');return;}throw error;}await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));
});

test('loader rejects an ancestor junction escaping the set directory',async t=>{
 const f=await fixture(t),outside=await mkdtemp(resolve('experiments/persona/set-outside-test-'));t.after(()=>rm(outside,{recursive:true,force:true}));await writeFile(join(outside,'one.json'),JSON.stringify(f.persona));await symlink(outside,join(f.root,'linked'),'junction');await writeFile(f.set,JSON.stringify({...f.data,personas:[{...f.data.personas[0],file:'linked/one.json'}]}));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection));
});

test('loader bounds raw set bytes even when oversized data is unknown metadata',async t=>{
 const f=await fixture(t),limit=256*1024;const raw=JSON.stringify({...f.data,extraMetadata:'x'.repeat(limit)});await writeFile(f.set,raw);await assert.rejects(()=>api.loadPublicPersonaSet(f.selection),/PERSONA_SET_FILE_TOO_LARGE/);
 const bytes=JSON.stringify(f.data);await writeFile(f.set,bytes+' '.repeat(limit-Buffer.byteLength(bytes)));assert.equal((await api.loadPublicPersonaSet(f.selection)).actors.length,1);await writeFile(f.set,bytes+' '.repeat(limit+1-Buffer.byteLength(bytes)));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection),/PERSONA_SET_FILE_TOO_LARGE/);
});
test('loader bounds raw Persona bytes and accepts the one MiB boundary',async t=>{
 const f=await fixture(t),limit=1024*1024;await writeFile(f.file,JSON.stringify({...f.persona,extraMetadata:'x'.repeat(limit)}));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection),/PERSONA_SET_FILE_TOO_LARGE/);
 const bytes=JSON.stringify(f.persona);await writeFile(f.file,bytes+' '.repeat(limit-Buffer.byteLength(bytes)));assert.equal((await api.loadPublicPersonaSet(f.selection)).personas.X.id,'X');await writeFile(f.file,bytes+' '.repeat(limit+1-Buffer.byteLength(bytes)));await assert.rejects(()=>api.loadPublicPersonaSet(f.selection),/PERSONA_SET_FILE_TOO_LARGE/);
});
