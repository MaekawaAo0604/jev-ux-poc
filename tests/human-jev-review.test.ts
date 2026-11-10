import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {buildBlindReview,validateBlindReview,type ReviewFrame} from '../runner/human-jev-review.js';
import type {ChoiceAnswers} from '../jev/client.js';
import type {ModelRequest} from '../runner/virtual-beta-core.js';

function frame(id='o11',candidateIds=['e1','e20','done','scroll_down']):ReviewFrame{
 const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=PNG.sync.write(png);
 return {observationId:id,imageSha256:createHash('sha256').update(bytes).digest('hex'),image:{mediaType:'image/png',data:bytes.toString('base64')},candidateIds};
}
function answers(request:ModelRequest,overrides:Record<string,string>={}):ChoiceAnswers{
 return {model:'fake-no-api',answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
  const choice=overrides[id]??'none';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(key=>[key,key===choice?1:0]))}];
 }))};
}

// The fixed categories elicit a categorical review; these slots are not a test of spontaneous free-text discovery.
test('review uses three fixed category slots and only admitted image references and anonymous click IDs',()=>{
 const f=Object.assign(frame(),{DOM:'secret-DOM',humanResults:'secret-human',labels:{e1:'secret-label'},oracle:true});
 const before=structuredClone(f),request=buildBlindReview([f,frame('o19',['e2','look_0','wait'])],'Find the requested item');
 assert.deepEqual(Object.keys(request.images),['o11','o19']);assert.equal(Object.keys(request.questions).length,9);
 assert.deepEqual(request.input,{goal:'Find the requested item',frames:[{observationId:'o11',image:'o11',imageSha256:f.imageSha256,candidateIds:['e1','e20']},{observationId:'o19',image:'o19',imageSha256:f.imageSha256,candidateIds:['e2']}]});
 assert.deepEqual(Object.keys(request.questions.slot_1_issue_type.criteria),['none','readability','organization','wording','response','other','insufficient']);
 assert.deepEqual(Object.keys(request.questions.slot_2_evidence.criteria),['none','o11','o19']);
 assert.deepEqual(Object.keys(request.questions.slot_3_target.criteria),['none','o11_e1','o11_e20','o19_e2']);
 assert.ok(!JSON.stringify(request).includes('secret'));assert.deepEqual(f,before);
 request.images.o11.data='changed';assert.notEqual(f.image.data,'changed');
});

test('frame count is bounded at eight without silently truncating observations',()=>{
 assert.equal(Object.keys(buildBlindReview(Array.from({length:8},(_,i)=>frame('o'+(i+1))),'Goal').images).length,8);
 for(const frames of [[],Array.from({length:9},(_,i)=>frame('o'+(i+1)))])assert.throws(()=>buildBlindReview(frames,'Goal'));
});

test('frame admission rejects hash tampering, non-PNG bytes, invalid IDs and ambiguous candidate IDs',()=>{
 const bad:ReviewFrame[]=[];
 const hash=frame();hash.imageSha256='0'.repeat(64);bad.push(hash);
 const data=frame();data.image.data='%%%';bad.push(data);
 const notPNG=frame();const bytes=Buffer.from('not a PNG');notPNG.image.data=bytes.toString('base64');notPNG.imageSha256=createHash('sha256').update(bytes).digest('hex');bad.push(notPNG);
 for(const id of ['', 'none','o0','__proto__','o1 page label'])bad.push({...frame(),observationId:id});
 for(const candidateIds of [['e1','e1'],['e0'],['visible label'],['o1_e1']])bad.push({...frame(),candidateIds});
 for(const f of bad)assert.throws(()=>buildBlindReview([f],'Goal'));
 assert.throws(()=>buildBlindReview([frame(),frame()],'Goal'));
 assert.throws(()=>buildBlindReview([frame()],''));
});

test('valid issue references retain source observation IDs and resolve anonymous target IDs',()=>{
 const request=buildBlindReview([frame(),frame('o19',['e2'])],'Goal');
 const response=answers(request,{slot_1_issue_type:'organization',slot_1_evidence:'o19',slot_1_target:'o19_e2',slot_2_issue_type:'wording',slot_2_evidence:'o11'});
 const before=structuredClone(response),actual=validateBlindReview(response,request);
 assert.deepEqual(actual,{findings:[{slot:1,type:'organization',observationId:'o19',targetId:'e2'},{slot:2,type:'wording',observationId:'o11',targetId:null},{slot:3,type:'none',observationId:'none',targetId:null}]});
 assert.deepEqual(response,before);assert.ok(!('probabilities' in actual.findings[0]));
});

test('none and insufficient remain explicit valid slot outcomes rather than invented UX findings',()=>{
 const request=buildBlindReview([frame()],'Goal'),response=answers(request,{slot_2_issue_type:'insufficient'});
 assert.deepEqual(validateBlindReview(response,request).findings,[{slot:1,type:'none',observationId:'none',targetId:null},{slot:2,type:'insufficient',observationId:'none',targetId:null},{slot:3,type:'none',observationId:'none',targetId:null}]);
});

test('all nine selected answers require strict strings and complete normalized distributions',()=>{
 const request=buildBlindReview([frame()],'Goal');
 for(const id of Object.keys(request.questions)){
  const missing=answers(request);delete missing.answers[id];assert.throws(()=>validateBlindReview(missing,request));
  const coerced=answers(request);coerced.answers[id].choice=['none'] as never;assert.throws(()=>validateBlindReview(coerced,request));
  for(const probabilities of [{none:1},{none:NaN},{none:-1},{none:0.1}]){
   const invalid=answers(request);invalid.answers[id].probabilities=probabilities;assert.throws(()=>validateBlindReview(invalid,request));
  }
 }
 const extra=answers(request);extra.answers.unrequested={choice:'none',probabilities:{none:1}};assert.throws(()=>validateBlindReview(extra,request));
 assert.throws(()=>validateBlindReview(undefined as never,request));
});

test('inconsistent evidence, cross-frame targets and unknown choices reject the entire review as unmeasured',()=>{
 const request=buildBlindReview([frame(),frame('o19',['e2'])],'Goal');
 for(const override of [
  {slot_1_evidence:'o11'},
  {slot_1_issue_type:'insufficient',slot_1_evidence:'o11'},
  {slot_1_issue_type:'readability'},
  {slot_1_issue_type:'wording',slot_1_evidence:'o11',slot_1_target:'o19_e2'},
  {slot_1_issue_type:'response',slot_1_evidence:'o9'},
  {slot_1_issue_type:'other',slot_1_evidence:'o11',slot_1_target:'o11_e999'},
 ] as Record<string,string>[])assert.throws(()=>validateBlindReview(answers(request,override),request));
});

test('mutated request criteria cannot admit invented categories or targets',()=>{
 const request=buildBlindReview([frame()],'Goal');request.questions.slot_1_issue_type.criteria.invented='Invented';
 assert.throws(()=>validateBlindReview(answers(request,{slot_1_issue_type:'invented',slot_1_evidence:'o11'}),request));
});
