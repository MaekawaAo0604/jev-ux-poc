import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
/** Independent test-side inverse: validate opaque transport first, then restore only declared image leaves. */
export function normalizeJevImageWire<T extends {state:any;assets:Record<string,any>;questions:any}>(body:T):T{
 assert.ok(body&&body.state&&body.assets&&body.questions,'A Jev HTTP body must retain state/assets/questions');
 const assetIds=Object.keys(body.assets);assert.ok(assetIds.length>0,'Images must remain attached');
 const hashes=new Map<string,string>();
 for(const id of assetIds){
  assert.match(id,uuid,'Every HTTP asset key must be a fresh UUID');const asset=body.assets[id];
  assert.equal(asset.type,'image');assert.ok(['png','jpg','jpeg'].includes(asset.format));assert.equal(typeof asset.data_base64,'string');
  const bytes=Buffer.from(asset.data_base64,'base64');assert.ok(bytes.length>0);assert.equal(bytes.toString('base64'),asset.data_base64,'Image data must remain canonical base64');hashes.set(id,sha(bytes));
 }
 const normalized=structuredClone(body),byReference=new Map<string,string>(),byLogical=new Map<string,string>(),byHash=new Map<string,string>(),allowedPaths=new Map<string,string>();
 const bind=(source:any,target:any,path:string,logical:string,expectedHash?:string)=>{
  assert.ok(source&&target&&typeof source.image==='string','Each declared image leaf must remain a string reference');
  const reference=source.image;assert.match(reference,uuid,'Image leaf must contain an opaque UUID');assert.ok(Object.hasOwn(body.assets,reference),'Every image leaf must resolve to an attached asset');
  const imageHash=hashes.get(reference)!;if(expectedHash!==undefined)assert.equal(imageHash,expectedHash,'Delivered bytes must match their admitted image identity');
  if(byReference.has(reference))assert.equal(byReference.get(reference),logical,'One UUID cannot denote two logical assets');
  if(byLogical.has(logical))assert.equal(byLogical.get(logical),reference,'One logical asset must retain the same UUID throughout the request');
  byReference.set(reference,logical);byLogical.set(logical,reference);if(!byHash.has(imageHash))byHash.set(imageHash,logical);allowedPaths.set(path,reference);target.image=logical;
 };
 const state=body.state,copy=normalized.state;
 if(Object.hasOwn(state,'observation'))bind(state.observation,copy.observation,'state.observation.image','current',state.userState?.lastObservation?.imageSha256);
 for(const [collection,prefix]of [['memoryObservations','memory_'],['reasonObservations','reason_'],['correspondenceObservations','correspondence_']]as const){
  if(!Object.hasOwn(state,collection))continue;assert.ok(Array.isArray(state[collection]));
  state[collection].forEach((observation:any,index:number)=>{
   assert.match(observation.imageSha256,/^[a-f0-9]{64}$/);const logical=byHash.get(observation.imageSha256)??prefix+index;
   bind(observation,copy[collection][index],`state.${collection}.${index}.image`,logical,observation.imageSha256);
  });
 }
 if(Object.hasOwn(state,'frames')){
  assert.ok(Array.isArray(state.frames));state.frames.forEach((frame:any,index:number)=>{assert.match(frame.observationId,/^o[1-9]\d*$/);assert.match(frame.imageSha256,/^[a-f0-9]{64}$/);bind(frame,copy.frames[index],`state.frames.${index}.image`,frame.observationId,frame.imageSha256);});
 }
 assert.equal(byReference.size,assetIds.length,'Every attached asset must have an intentional image leaf');
 const occurrences=new Map(assetIds.map(id=>[id,0]));
 function inspectTree(value:any,path:string):void{
  if(typeof value==='string'){
   for(const id of assetIds)if(value.includes(id)){assert.equal(value,id,'UUID must never be embedded in natural text');assert.equal(allowedPaths.get(path),id,'UUID may appear only at an intentional image leaf');occurrences.set(id,occurrences.get(id)!+1);}return;
  }
  if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){for(const id of assetIds)assert.ok(!key.includes(id),'Opaque reference must never appear in state/question keys');inspectTree(child,path?path+'.'+key:key);}
 }
 inspectTree({state:body.state,questions:body.questions},'');for(const id of assetIds)assert.ok(occurrences.get(id)!>0,'No unreferenced image asset is allowed');
 normalized.assets=Object.fromEntries(assetIds.map(id=>[byReference.get(id)!,structuredClone(body.assets[id])])) as T['assets'];
 assert.deepEqual(normalized.questions,body.questions,'Normalizing image references must never change questions');
 return normalized;
}
/** Validate the entire wire before looking up the current image by its actual opaque leaf. */
export function currentJevImage(body:{state:any;assets:Record<string,any>;questions:any}){
 normalizeJevImageWire(body);const reference=body.state.observation?.image;assert.match(reference,uuid);assert.ok(Object.hasOwn(body.assets,reference));return body.assets[reference];
}

function exactKeys(value:unknown,keys:string[],message:string):asserts value is Record<string,any>{
 assert.ok(value!==null&&typeof value==='object'&&!Array.isArray(value),message);assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),message);
}
/** Independent proof of safe bindings against the original logical stage; no production verifier is reused. */
export function assertJevImageBindings(stage:{modelInput:any;questions:any;assetFiles:Record<string,{sha256:string}>},bindings:unknown){
 exactKeys(bindings,['schemaVersion','kind','assets'],'Only declared binding fields may be retained');assert.equal(bindings.schemaVersion,1);assert.equal(bindings.kind,'opaque-image-references');assert.ok(Array.isArray(bindings.assets));
 const ids=Object.keys(stage.assetFiles),paths=new Map(ids.map(id=>[id,[] as (string|number)[][]]));
 const add=(source:any,path:(string|number)[])=>{assert.ok(source&&typeof source.image==='string');assert.ok(paths.has(source.image),'Logical image leaf must resolve to the original stage asset');paths.get(source.image)!.push([...path,'image']);};
 if(Object.hasOwn(stage.modelInput,'observation'))add(stage.modelInput.observation,['observation']);
 for(const name of ['memoryObservations','reasonObservations','correspondenceObservations','frames'])if(Object.hasOwn(stage.modelInput,name)){assert.ok(Array.isArray(stage.modelInput[name]));stage.modelInput[name].forEach((value:any,index:number)=>add(value,[name,index]));}
 assert.equal(bindings.assets.length,ids.length,'Every original asset must retain a binding');const references=new Set<string>();
 const originalStrings:string[]=[];function strings(value:any):void{if(typeof value==='string')originalStrings.push(value);else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){originalStrings.push(key);strings(child);}}strings(stage.modelInput);strings(stage.questions);
 for(const [index,asset]of bindings.assets.entries()){
  exactKeys(asset,['logicalId','reference','imageSha256','paths'],'Only safe image binding metadata may be retained');assert.equal(asset.logicalId,ids[index],'Binding order/identity must preserve all original assets');assert.match(asset.reference,uuid);assert.ok(!references.has(asset.reference.toLowerCase()),'Opaque references must be unique');references.add(asset.reference.toLowerCase());assert.match(asset.imageSha256,/^[a-f0-9]{64}$/);assert.equal(asset.imageSha256,stage.assetFiles[asset.logicalId].sha256,'Binding SHA must equal the actual admitted stage image');assert.ok(paths.get(asset.logicalId)!.length>0);assert.deepEqual(asset.paths,paths.get(asset.logicalId),'Bindings may change only the exact declared logical image leaves');assert.ok(originalStrings.every(value=>!value.includes(asset.reference)),'Generated UUID must not already occur in original evidence/questions/keys');
 }
}
/** Exact HTTP failure schema, with separately verified single-attempt native image transport metadata. */
export function assertJevHTTPFailure(error:unknown,statusCode:number,stage:{modelInput:any;questions:any;assetFiles:Record<string,{sha256:string}>},longContext=true){
 exactKeys(error,['code','statusCode','request'],'No extra provider fields may enter a saved HTTP failure');assert.equal(error.code,'HTTP_ERROR');assert.equal(error.statusCode,statusCode);
 exactKeys(error.request,['attempts','failures','elapsedMs',...(longContext?['longContext']:[]),'imageBindings'],'Request trace must contain only the exact expected safe fields');assert.equal(error.request.attempts,1);assert.deepEqual(error.request.failures,[{code:'HTTP_ERROR',statusCode}]);assert.equal(typeof error.request.elapsedMs,'number');assert.ok(Number.isFinite(error.request.elapsedMs)&&error.request.elapsedMs>=0);if(longContext)assert.equal(error.request.longContext,true);assertJevImageBindings(stage,error.request.imageBindings);
}
