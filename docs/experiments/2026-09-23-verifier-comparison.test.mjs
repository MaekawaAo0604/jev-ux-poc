import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareComparison,validateClassification,validateCitations} from './2026-09-23-verifier-comparison.mjs';

test('comparison retains older observations without inventing facts or changing production input',()=>{
 const region={id:'t1',source:'dom',text:'一般 1,000円',bbox:{x0:0,y0:0,x1:10,y1:10}};
 const states=Array.from({length:170},(_,i)=>({goal:'2人分の観覧料、入館できる最終時刻、当日の再入館可否',currentDate:'2026-09-23',history:[],screen:{text:[i===0?'入館は16時30分まで':'案内'],regions:[{...region,text:i===0?'入館は16時30分まで':'案内'}],elements:[],warnings:[]}}));
 const source={steps:states.map(state=>({state}))};const before=JSON.stringify(source);
 const prepared=prepareComparison(source);
 assert.equal(prepared.variants.current.evidence.length,160);
 assert.equal(prepared.variants.complete.evidence.length,170);
 assert.equal(prepared.variants.complete.evidence[0].text,'入館は16時30分まで');
 assert.ok(!prepared.variants.current.evidence.some(e=>e.text==='入館は16時30分まで'));
 assert.equal(JSON.stringify(source),before);
 assert.equal(prepared.variants.complete.goal,states[0].goal);
 assert.ok(prepared.variants.completeTextOnly,'text-only full record input must be available');
 assert.deepEqual(prepared.variants.completeTextOnly.evidence.map(e=>e.text),prepared.variants.complete.evidence.map(e=>e.text));
 assert.deepEqual(prepared.variants.completeTextOnly.evidence.map(e=>e.id),prepared.variants.complete.evidence.map(e=>e.id));
 assert.ok(prepared.variants.completeTextOnly.evidence.every(e=>!Object.hasOwn(e,'bbox')));
});

test('classification validation rejects missing, extra, and invented choices',()=>{
 const q={completion:{criteria:{supported:'yes',insufficient:'no'}}};
 assert.deepEqual(validateClassification({completion:{choice:'insufficient'}},q),{completion:{choice:'insufficient'}});
 for(const bad of [{},{completion:{choice:'maybe'}},{completion:{choice:'supported'},extra:{choice:'supported'}}])assert.throws(()=>validateClassification(bad,q));
});

test('citations must identify an actual retained quote and cannot manufacture completion',()=>{
 const evidence=[{id:'s1-t1',text:'一般 1,000円'}];const checks=['料金','再入館'];
 const good={checks:[{check:'料金',status:'present',answer:'1,000円',citations:[{id:'s1-t1',quote:'一般 1,000円'}]},{check:'再入館',status:'absent',answer:'記録にない',citations:[]}]};
 assert.deepEqual(validateCitations(good,evidence,checks),good);
 for(const mutate of [r=>r.checks[0].citations[0].id='fake',r=>r.checks[0].citations[0].quote='高校生無料',r=>r.checks[0].citations=[],r=>r.checks.pop()]){const bad=structuredClone(good);mutate(bad);assert.throws(()=>validateCitations(bad,evidence,checks));}
});
