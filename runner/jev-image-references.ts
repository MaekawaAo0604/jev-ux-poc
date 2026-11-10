import {createHash,randomUUID} from 'node:crypto';
import type {ChoiceQuestion,ImageReferenceBindings} from '../jev/client.js';
import type {ModelRequest} from './virtual-beta-core.js';

type Path=(string|number)[];
type RecordValue=Record<string,unknown>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash=/^[0-9a-f]{64}$/;
function fail():never{throw new Error('INVALID_JEV_IMAGE_REFERENCES');}
function object(value:unknown):asserts value is RecordValue{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
}
function fields(value:unknown,allowed:string[]):asserts value is RecordValue{
 object(value);const keys=Reflect.ownKeys(value);
 if(keys.length!==allowed.length||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))fail();
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();}
}
function array(value:unknown):asserts value is unknown[]{
 if(!Array.isArray(value))fail();
 const keys=Reflect.ownKeys(value);if(keys.length!==value.length+1||keys.some(key=>key!=='length'&&(typeof key!=='string'||!/^\d+$/.test(key)||Number(key)>=value.length||String(Number(key))!==key)))fail();
 for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail();}
}
/** Snapshot only JSON data; getters, prototypes, cycles and hidden fields are not transport data. */
function copy(value:unknown,ancestors=new Set<object>()):unknown{
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return value;}
 if(!value||typeof value!=='object'||ancestors.has(value))fail();
 ancestors.add(value);
 try{
  if(Array.isArray(value)){array(value);return value.map(item=>copy(item,ancestors));}
  object(value);const entries=Reflect.ownKeys(value).map(key=>{
   const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
   if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();
   return [key,copy(descriptor.value,ancestors)] as const;
  });return Object.fromEntries(entries);
 }finally{ancestors.delete(value);}
}
function strings(value:unknown):string[]{
 if(typeof value==='string')return [value];
 if(Array.isArray(value))return value.flatMap(strings);
 if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,child])=>[key,...strings(child)]);
 return [];
}
/** Only declared observation/image collections, including blind-review frames, denote images. Other matching text remains literal user evidence. */
function canonicalPaths(input:RecordValue,logicalIds:Set<string>):Map<string,Path[]>{
 const result=new Map(Array.from(logicalIds,id=>[id,[] as Path[]]));
 const add=(parent:unknown,path:Path)=>{
  object(parent);if(!Object.hasOwn(parent,'image')||typeof parent.image!=='string'||!logicalIds.has(parent.image))fail();
  result.get(parent.image)!.push([...path,'image']);
 };
 if(Object.hasOwn(input,'observation'))add(input.observation,['observation']);
 for(const key of ['memoryObservations','reasonObservations','correspondenceObservations','frames']){
  if(!Object.hasOwn(input,key))continue;array(input[key]);
  input[key].forEach((item,index)=>add(item,[key,index]));
 }
 const admittedPaths=new Set(Array.from(result.values()).flat().map(path=>JSON.stringify(path)));
 const inspect=(value:unknown,path:Path):void=>{
  if(Array.isArray(value)){value.forEach((item,index)=>inspect(item,[...path,index]));return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   const leaf=[...path,key];
   if(key==='image'&&typeof child==='string'&&logicalIds.has(child)&&!admittedPaths.has(JSON.stringify(leaf)))fail();
   inspect(child,leaf);
  }
 };
 inspect(input,[]);
 if(Array.from(result.values()).some(paths=>paths.length===0))fail();
 return result;
}
function assetHashes(assets:Record<string,{sha256:string}>):Map<string,string>{
 object(assets);const result=new Map<string,string>();
 for(const key of Reflect.ownKeys(assets)){
  if(typeof key!=='string'||!key)fail();
  const descriptor=Object.getOwnPropertyDescriptor(assets,key)!;
  if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail();
  const value=descriptor.value;object(value);
  const sha=Object.getOwnPropertyDescriptor(value,'sha256');
  if(!sha||!Object.hasOwn(sha,'value')||typeof sha.value!=='string'||!hash.test(sha.value))fail();
  result.set(key,sha.value);
 }
 return result;
}

/** Verify against the original logical input, never against a rewritten transport copy. */
export function verifyJevImageBindings(input:Record<string,unknown>,questions:Record<string,ChoiceQuestion>,assets:Record<string,{sha256:string}>,bindings:ImageReferenceBindings):void{
 const source=copy(input),questionCopy=copy(questions);object(source);object(questionCopy);
 fields(bindings,['schemaVersion','kind','assets']);
 if(bindings.schemaVersion!==1||bindings.kind!=='opaque-image-references')fail();array(bindings.assets);
 const hashes=assetHashes(assets),paths=canonicalPaths(source,new Set(hashes.keys())),texts=[...strings(source),...strings(questionCopy)],seenIds=new Set<string>(),seenReferences=new Set<string>();
 if(bindings.assets.length!==hashes.size)fail();
 for(const raw of bindings.assets){
  fields(raw,['logicalId','reference','imageSha256','paths']);
  if(typeof raw.logicalId!=='string'||!hashes.has(raw.logicalId)||seenIds.has(raw.logicalId)||raw.imageSha256!==hashes.get(raw.logicalId)||typeof raw.reference!=='string'||!uuid.test(raw.reference)||seenReferences.has(raw.reference.toLowerCase())||texts.some(text=>text.includes(raw.reference)))fail();
  seenIds.add(raw.logicalId);seenReferences.add(raw.reference.toLowerCase());array(raw.paths);
  for(const path of raw.paths){array(path);if(path.some(segment=>typeof segment!=='string'&&(typeof segment!=='number'||!Number.isSafeInteger(segment)||segment<0)))fail();}
  if(JSON.stringify(raw.paths)!==JSON.stringify(paths.get(raw.logicalId)))fail();
 }
}

/** Replace only declared image leaves and rekey identical bytes under collision-free request UUIDs. */
export function prepareJevImageRequest(request:ModelRequest,referenceFactory:()=>string=randomUUID):{request:ModelRequest;imageBindings:ImageReferenceBindings}{
 fields(request,['input','questions','images','timeoutMs']);
 if(typeof referenceFactory!=='function'||!Number.isSafeInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>300000)fail();
 const input=copy(request.input),questions=copy(request.questions),images=copy(request.images);object(input);object(questions);object(images);
 const hashes:Record<string,{sha256:string}>=Object.fromEntries(Object.entries(images).map(([id,image])=>{
  if(!id)fail();fields(image,['mediaType','data']);
  if(image.mediaType!=='image/png'||typeof image.data!=='string')fail();
  const bytes=Buffer.from(image.data,'base64');if(bytes.toString('base64')!==image.data)fail();
  return [id,{sha256:createHash('sha256').update(bytes).digest('hex')}];
 }));
 const paths=canonicalPaths(input,new Set(Object.keys(hashes)));
 const imageBindings:ImageReferenceBindings={schemaVersion:1,kind:'opaque-image-references',assets:Object.keys(images).map(logicalId=>({logicalId,reference:referenceFactory(),imageSha256:hashes[logicalId].sha256,paths:paths.get(logicalId)!.map(path=>[...path])}))};
 verifyJevImageBindings(input,questions as Record<string,ChoiceQuestion>,hashes,imageBindings);
 for(const asset of imageBindings.assets)for(const path of asset.paths){
  let parent:any=input;for(const key of path.slice(0,-1))parent=parent[key];parent[path.at(-1)!]=asset.reference;
 }
 const rewrittenImages=Object.fromEntries(imageBindings.assets.map(asset=>[asset.reference,images[asset.logicalId]])) as ModelRequest['images'];
 return {request:{input,questions:questions as Record<string,ChoiceQuestion>,timeoutMs:request.timeoutMs,images:rewrittenImages},imageBindings};
}
