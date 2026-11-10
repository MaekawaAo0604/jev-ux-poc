import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareJevImageRequest,verifyJevImageBindings} from '../runner/jev-image-references.js';
import type {ModelRequest} from '../runner/virtual-beta-core.js';
import type {ImageReferenceBindings} from '../jev/client.js';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const references=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
function fixture():ModelRequest{return {
 input:{goal:'Inspect current settings; current is ordinary language.',persona:{knowledge:'memory_0 is also ordinary text'},scope:'delivered-current-view-only',current:'current value',observation:{id:'o2',image:'current',text:'current menu'},memoryObservations:[{observationId:'o1',image:'memory_0'},{observationId:'o2',image:'current'}],reasonObservations:[{observationId:'o1',image:'memory_0'}],correspondenceObservations:[{observationId:'o2',image:'current'}]},
 questions:{nextAction:{type:'choice',instructions:'Use the current image, not current text or memory_0 labels.',criteria:{current:'The current candidate',other:'Other'}}},timeoutMs:1000,
 images:{current:{mediaType:'image/png',data:Buffer.from('CURRENT_BYTES').toString('base64')},memory_0:{mediaType:'image/png',data:Buffer.from('HISTORY_BYTES').toString('base64')}}
};}
const auditAssets=(request=fixture())=>Object.fromEntries(Object.entries(request.images).map(([id,image])=>[id,{sha256:sha(Buffer.from(image.data,'base64'))}]));
function prepared(request=fixture()){let index=0;return prepareJevImageRequest(request,()=>references[index++]);}
function occurrences(value:unknown,ref:string):number{
 if(typeof value==='string')return value.split(ref).length-1;
 if(Array.isArray(value))return value.reduce((n,v)=>n+occurrences(v,ref),0);
 if(value&&typeof value==='object')return Object.entries(value).reduce((n,[k,v])=>n+occurrences(k,ref)+occurrences(v,ref),0);
 return 0;
}

// Fails if natural-language substrings rather than the four permitted image paths are replaced.
test('opaque UUID preparation changes only canonical image leaves while preserving all other text keys and bytes',()=>{
 const original=fixture(),before=structuredClone(original),{request,imageBindings}=prepared(original);
 assert.deepEqual(original,before);assert.notEqual(request,original);assert.notEqual(request.input,original.input);assert.notEqual(request.questions,original.questions);
 assert.deepEqual(request.questions,original.questions);assert.equal(request.timeoutMs,1000);
 const expected=structuredClone(original.input) as any;expected.observation.image=references[0];expected.memoryObservations[0].image=references[1];expected.memoryObservations[1].image=references[0];expected.reasonObservations[0].image=references[1];expected.correspondenceObservations[0].image=references[0];assert.deepEqual(request.input,expected);
 assert.deepEqual(request.images,{[references[0]]:original.images.current,[references[1]]:original.images.memory_0});
 assert.deepEqual(imageBindings,{schemaVersion:1,kind:'opaque-image-references',assets:[{logicalId:'current',reference:references[0],imageSha256:auditAssets().current.sha256,paths:[['observation','image'],['memoryObservations',1,'image'],['correspondenceObservations',0,'image']]},{logicalId:'memory_0',reference:references[1],imageSha256:auditAssets().memory_0.sha256,paths:[['memoryObservations',0,'image'],['reasonObservations',0,'image']]}]});
 verifyJevImageBindings(original.input,original.questions,auditAssets(),imageBindings);
 request.questions.nextAction.instructions='changed';(request.input.observation as any).text='changed';request.images[references[0]].data='changed';assert.deepEqual(original,before);
});

test('substring image expansion occurs only at intended leaves and never in question goal persona or scope text',()=>{
 const original=fixture(),{request,imageBindings}=prepared(original);
 assert.ok(occurrences({input:original.input,questions:original.questions},'current')>3);
 assert.ok(occurrences({input:original.input,questions:original.questions},'memory_0')>2);
 for(const asset of imageBindings.assets){assert.equal(occurrences({input:request.input,questions:request.questions},asset.reference),asset.paths.length);assert.equal(occurrences(request.questions,asset.reference),0);}
 assert.equal(occurrences(request.input.goal,references[0]),0);assert.equal(occurrences(request.input.persona,references[1]),0);
});

test('one logical image reused at several historical and current leaves receives exactly one generated reference',()=>{
 const request=fixture();let calls=0;const result=prepareJevImageRequest(request,()=>references[calls++]);assert.equal(calls,2);
 assert.equal(result.imageBindings.assets[0].paths.length,3);assert.equal(result.imageBindings.assets[1].paths.length,2);
 const equalPixels=fixture();equalPixels.images.memory_0.data=equalPixels.images.current.data;
 const equal=prepared(equalPixels);assert.equal(equal.imageBindings.assets.length,2);assert.equal(equal.imageBindings.assets[0].imageSha256,equal.imageBindings.assets[1].imageSha256);assert.notEqual(equal.imageBindings.assets[0].reference,equal.imageBindings.assets[1].reference);
});

test('default references are fresh UUIDs for each asset and each request',()=>{
 const a=prepareJevImageRequest(fixture()),b=prepareJevImageRequest(fixture()),refs=[...a.imageBindings.assets,...b.imageBindings.assets].map(a=>a.reference);
 assert.equal(new Set(refs).size,4);for(const reference of refs)assert.match(reference,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
});

test('empty images with no canonical observation paths produce an empty validated binding set',()=>{
 const source:ModelRequest={input:{goal:'current is text'},questions:{},images:{},timeoutMs:1},result=prepared(source);
 assert.deepEqual(result.imageBindings,{schemaVersion:1,kind:'opaque-image-references',assets:[]});assert.deepEqual(result.request,source);assert.notEqual(result.request,source);verifyJevImageBindings(source.input,source.questions,{},result.imageBindings);
});

test('every supplied logical asset must be used and every canonical image leaf must name a supplied logical asset',()=>{
 const extra=fixture();extra.images.unused={...extra.images.current};assert.throws(()=>prepared(extra));
 const dangling=fixture();(dangling.input.memoryObservations as any[])[0].image='missing';assert.throws(()=>prepared(dangling));
 const nested=fixture();nested.input.observation={id:'o1'};assert.throws(()=>prepared(nested));
 const noAssets=fixture();noAssets.images={};assert.throws(()=>prepared(noAssets));
 for(const key of ['memoryObservations','reasonObservations','correspondenceObservations'])for(const value of [null,{},[{}],[{image:4}],[{image:'missing'}]]){const r=fixture();r.input[key]=value;assert.throws(()=>prepared(r),key);}
});

test('invalid duplicate or colliding references fail without any retry loop or natural text mutation',()=>{
 for(const ref of ['current','',null,123,'10000000-0000-4000-8000-00000000000G'])assert.throws(()=>prepareJevImageRequest(fixture(),()=>ref as string));
 assert.throws(()=>prepareJevImageRequest(fixture(),()=>references[0]));
 for(const location of ['goal','input-key','question','criteria-key']){
  const r=fixture();if(location==='goal')r.input.goal='prefix '+references[0]+' suffix';if(location==='input-key')r.input[references[0]]='text';if(location==='question')r.questions.nextAction.instructions+=' '+references[0];if(location==='criteria-key')r.questions.nextAction.criteria[references[0]]='candidate';
  const before=structuredClone(r);assert.throws(()=>prepared(r),location);assert.deepEqual(r,before);
 }
});

test('verification expects original logical input and rejects a transport-mutated input',()=>{
 const original=fixture(),{request,imageBindings}=prepared(original);
 verifyJevImageBindings(original.input,original.questions,auditAssets(),imageBindings);
 assert.throws(()=>verifyJevImageBindings(request.input,request.questions,auditAssets(),imageBindings));
});

test('binding metadata is closed and cannot smuggle audit labels arbitrary text or extra fields',()=>{
 const original=fixture(),valid=prepared(original).imageBindings;
 const changes=[(b:any)=>b.label='SECRET',(b:any)=>b.assets[0].dom='SECRET',(b:any)=>b.schemaVersion=2,(b:any)=>b.kind='plain',(b:any)=>b.assets={},(b:any)=>b.assets[0].paths[0].extra='SECRET'];
 for(const mutate of changes){const b=structuredClone(valid);mutate(b);assert.throws(()=>verifyJevImageBindings(original.input,original.questions,auditAssets(),b));}
 assert.ok(!JSON.stringify(valid).includes('ordinary language'));
});

test('path omissions additions duplicates invalid indices and wrong logical associations are rejected',()=>{
 const original=fixture(),valid=prepared(original).imageBindings;
 const changes=[(b:ImageReferenceBindings)=>b.assets[0].paths.pop(),(b:ImageReferenceBindings)=>b.assets[0].paths.push(['goal']),(b:ImageReferenceBindings)=>b.assets[0].paths.push(b.assets[0].paths[0]),(b:ImageReferenceBindings)=>b.assets[0].paths[0]=['memoryObservations',.5,'image'],(b:ImageReferenceBindings)=>b.assets[0].paths[0]=['memoryObservations',-1,'image'],(b:ImageReferenceBindings)=>b.assets[0].paths[0]=['memoryObservations','1','image'],(b:ImageReferenceBindings)=>b.assets[0].paths[0]=['__proto__','image'],(b:ImageReferenceBindings)=>b.assets[0].paths=[],(b:ImageReferenceBindings)=>{b.assets[0].paths[0]=['memoryObservations',0,'image'];}];
 for(const mutate of changes){const b=structuredClone(valid);mutate(b);assert.throws(()=>verifyJevImageBindings(original.input,original.questions,auditAssets(),b));}
});

test('duplicate reference IDs logical IDs missing assets mismatched bytes and malformed hashes are rejected',()=>{
 const original=fixture(),valid=prepared(original).imageBindings;
 const changes=[(b:ImageReferenceBindings)=>b.assets[1].reference=b.assets[0].reference,(b:ImageReferenceBindings)=>b.assets[1].logicalId=b.assets[0].logicalId,(b:ImageReferenceBindings)=>b.assets.pop(),(b:ImageReferenceBindings)=>b.assets[0].logicalId='missing',(b:ImageReferenceBindings)=>b.assets[0].reference='current',(b:ImageReferenceBindings)=>b.assets[0].imageSha256='bad',(b:ImageReferenceBindings)=>b.assets[0].imageSha256=sha(Buffer.from('other'))];
 for(const mutate of changes){const b=structuredClone(valid);mutate(b);assert.throws(()=>verifyJevImageBindings(original.input,original.questions,auditAssets(),b));}
 const assets=auditAssets();assets.extra={sha256:assets.current.sha256};assert.throws(()=>verifyJevImageBindings(original.input,original.questions,assets,valid));
});

test('verification rejects UUID collisions added after preparation anywhere in input questions or keys',()=>{
 const original=fixture(),valid=prepared(original).imageBindings;
 const r=fixture();r.input.goal='unrelated '+references[0];assert.throws(()=>verifyJevImageBindings(r.input,r.questions,auditAssets(),valid));
 const q=fixture();q.questions[references[0]]=q.questions.nextAction;assert.throws(()=>verifyJevImageBindings(q.input,q.questions,auditAssets(),valid));
});

test('logical audit asset extra file metadata is neither read nor copied into bindings',()=>{
 const r=fixture(),valid=prepared(r).imageBindings,assets=auditAssets();for(const asset of Object.values(assets))Object.defineProperty(asset,'file',{get(){throw Error('AUDIT_FILE_READ');}});
 verifyJevImageBindings(r.input,r.questions,assets,valid);assert.deepEqual(Object.keys(valid.assets[0]),['logicalId','reference','imageSha256','paths']);
});

test('unsupported runtime JSON and accessor data reject before changing caller input',()=>{
 const r=fixture();Object.defineProperty(r.input,'secret',{enumerable:true,get(){throw Error('GETTER_MUST_NOT_EXECUTE');}});assert.throws(()=>prepared(r),e=>e instanceof Error&&e.message!=='GETTER_MUST_NOT_EXECUTE');
 const cycle=fixture();cycle.input.self=cycle.input;assert.throws(()=>prepared(cycle));
});

test('blind-review frames use an explicit additional leaf collection without replacing natural-language observation IDs',()=>{
 const source:ModelRequest={input:{goal:'o1 is ordinary text; review o1 and o2.',frames:[{observationId:'o1',image:'o1',candidateIds:['e1']},{observationId:'o2',image:'o2',candidateIds:['e2']},{observationId:'o3',image:'o1',candidateIds:[]}]},questions:{review:{type:'choice',instructions:'Compare o1 with o2.',criteria:{o1:'The o1 observation',none:'Neither'}}},images:{o1:fixture().images.current,o2:fixture().images.memory_0},timeoutMs:1000};
 const before=structuredClone(source),{request,imageBindings}=prepared(source);assert.deepEqual(source,before);
 assert.deepEqual((request.input.frames as any[]).map(f=>f.image),[references[0],references[1],references[0]]);
 assert.deepEqual(imageBindings.assets[0].paths,[['frames',0,'image'],['frames',2,'image']]);assert.equal(request.input.goal,source.input.goal);assert.deepEqual(request.questions,source.questions);
 for(const asset of imageBindings.assets)assert.equal(occurrences({input:request.input,questions:request.questions},asset.reference),asset.paths.length);
 verifyJevImageBindings(source.input,source.questions,auditAssets(source),imageBindings);
 const unknown=fixture();unknown.input.otherImages=[{image:'memory_0'}];delete unknown.input.memoryObservations;delete unknown.input.reasonObservations;assert.throws(()=>prepared(unknown));
});

test('an exact logical asset under an unknown image property rejects while ordinary non-image values remain literal',()=>{
 const ambiguous=fixture();ambiguous.input.unregistered={image:'current'};assert.throws(()=>prepared(ambiguous));
 const nested=fixture();nested.input.extraFrames=[{image:'memory_0'}];assert.throws(()=>prepared(nested));
 const ordinary=fixture();ordinary.input.someValue='current';ordinary.input.unregistered={image:'unrelated-photo-name'};
 const output=prepared(ordinary);assert.equal(output.request.input.someValue,'current');assert.deepEqual(output.request.input.unregistered,{image:'unrelated-photo-name'});
 const forged=fixture(),bindings=prepared(forged).imageBindings;forged.input.unknown={image:'memory_0'};assert.throws(()=>verifyJevImageBindings(forged.input,forged.questions,auditAssets(),bindings));
});
