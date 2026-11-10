import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,sep,win32} from 'node:path';
import {createHash} from 'node:crypto';
import {parsePersona,type Persona} from '../jev/persona.js';
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const inside=(root:string,path:string)=>{const p=relative(root,path);return p!==''&&p!=='..'&&!p.startsWith('..'+sep)&&!isAbsolute(p);};
const safeRelative=(path:unknown):path is string=>typeof path==='string'&&!!path&&!isAbsolute(path)&&!win32.isAbsolute(path)&&!path.split(/[\\/]/).includes('..')&&!path.includes(':')&&!path.includes('\0');
export function validatePublicPersonaActors(actors:readonly string[]){
 if(!Array.isArray(actors)||actors.length<1||actors.length>16||actors.some(id=>typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))||new Set(actors.map(id=>id.toLowerCase())).size!==actors.length)throw Error('INVALID_PERSONA_ACTORS');
}
export function validatePublicPersonaSetSelection(selection:string){
 if(!safeRelative(selection)||!inside(resolve('experiments'),resolve(selection)))throw Error('UNSAFE_PERSONA_SET_PATH');
}
async function containedFile(path:string,root:string,maximumBytes:number){
 const stat=await lstat(path),real=await realpath(path),realRoot=await realpath(root);
 if(!stat.isFile()||stat.isSymbolicLink()||!inside(root,path)||!inside(realRoot,real)||real.toLowerCase()!==resolve(path).toLowerCase())throw Error('UNSAFE_PERSONA_SET_PATH');
 if(stat.size>maximumBytes)throw Error('PERSONA_SET_FILE_TOO_LARGE');
 return readFile(path);
}
/** Load only explicitly selected, contained files; freeze hashes of original JSON bytes. */
export async function loadPublicPersonaSet(selection:string){
 validatePublicPersonaSetSelection(selection);const file=resolve(selection),bytes=await containedFile(file,resolve('experiments'),256*1024),raw=JSON.parse(bytes.toString());
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schemaVersion!==1||typeof raw.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.id)||!Array.isArray(raw.personas))throw Error('INVALID_PERSONA_SET');
 const actors:string[]=raw.personas.map((p:any)=>p?.id);validatePublicPersonaActors(actors);
 const entries:[string,Persona][]=[],personaFiles:{actor:string;file:string;sha256:string}[]=[];
 for(const entry of raw.personas){
  if(!safeRelative(entry.file)||typeof entry.name!=='string'||!entry.name.trim())throw Error('INVALID_PERSONA_SET_ENTRY');
  const personaFile=resolve(dirname(file),entry.file),personaBytes=await containedFile(personaFile,dirname(file),1024*1024),persona=parsePersona(JSON.parse(personaBytes.toString()));
  if(persona.id!==entry.id||persona.name!==entry.name)throw Error('PERSONA_SET_IDENTITY_MISMATCH');
  entries.push([entry.id,persona]);personaFiles.push({actor:entry.id,file:personaFile,sha256:sha(personaBytes)});
 }
 return {actors,personas:Object.fromEntries(entries),personaFiles,personaSet:{selection,file,id:raw.id as string,sha256:sha(bytes)}};
}
