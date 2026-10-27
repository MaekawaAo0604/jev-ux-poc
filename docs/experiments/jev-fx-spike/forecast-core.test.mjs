import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as core from './forecast-core.mjs';
const q=(seq,receivedMs,mid)=>({seq,receivedMs,sourceMs:receivedMs-50,bid:mid-.0025,ask:mid+.0025,bidQty:100,askQty:100});
const answer=(choice)=>({choice,probabilities:Object.fromEntries(['up','down','flat'].map(k=>[k,k===choice?1:0]))});
const prediction=(committedMs=1100)=>({id:1,input:{quote:q(1,1000,150),baselines:{momentum:{h1000:'up'},reversal:{h1000:'down'}}},answers:{h1000:answer('up')},committedMs,committedSeq:1});
test('forecast payload includes only past features and explicit horizons, not account, dates or future labels',()=>{
 assert.equal(typeof core.forecastInput,'function');const quotes=[q(1,0,149),q(2,60000,150)];
 const input=core.forecastInput(quotes);assert.deepEqual(Object.keys(input.payload).sort(),['questions','state']);
 assert.deepEqual(Object.keys(input.payload.state),['market']);assert.equal(input.payload.state.market.topBookImbalance,undefined);
 assert.equal(input.payload.state.market.latestMid,150);assert.deepEqual(Object.keys(input.payload.questions),['h1000','h5000','h30000','h60000']);
 assert.deepEqual(Object.values(input.baselines.momentum),['up','up','up','up']);assert.deepEqual(Object.values(input.baselines.reversal),['down','down','down','down']);
});
test('missing, extra or malformed forecast answers fail rather than silently becoming flat',()=>{
 assert.equal(typeof core.validateForecast,'function');const valid=Object.fromEntries([1000,5000,30000,60000].map(ms=>['h'+ms,answer('up')]));
 assert.deepEqual(core.validateForecast(valid),valid);const bad=structuredClone(valid);delete bad.h1000;assert.throws(()=>core.validateForecast(bad));
 bad.h1000={choice:'keep',probabilities:{up:.5,down:.5,flat:0}};assert.throws(()=>core.validateForecast(bad));
 assert.throws(()=>core.validateForecast({...valid,secret:answer('up')}));
});
test('unchanged midpoint stays flat for baselines even when floating midpoint arithmetic differs',()=>{
 const quotes=[{...q(1,0,150),bid:150,ask:150.002},{...q(2,60000,150),bid:149.999,ask:150.003}];
 const input=core.forecastInput(quotes);assert.deepEqual(Object.values(input.baselines.momentum),['flat','flat','flat','flat']);assert.deepEqual(Object.values(input.baselines.reversal),['flat','flat','flat','flat']);
});
test('malformed responses recover only with bounded fresh-input retries and safe categories',()=>{
 assert.equal(typeof core.forecastRecovery,'function');
 assert.deepEqual(core.forecastRecovery(Error('INVALID_FORECAST'),1),{category:'INVALID_FORECAST',waitMs:1000});
 assert.equal(core.forecastRecovery(Object.assign(Error('secret upstream body'),{name:'AI_TypeValidationError'}),2).waitMs,2000);
 assert.equal(core.forecastRecovery(Error('INVALID_FORECAST'),3).waitMs,null);
 assert.equal(core.forecastRecovery(Object.assign(Error('private'),{statusCode:401}),1).waitMs,null);
 assert.deepEqual(core.forecastRecovery(Error('private secret'),1),{category:'UNCLASSIFIED_ERROR',waitMs:null});
});
test('scoring uses first eligible future quote, excludes late predictions and never carries a stale quote forward',()=>{
 assert.equal(typeof core.scoreForecast,'function');const quotes=[q(1,1000,150),q(2,1999,149),q(3,2005,150.001),q(4,2100,149)];
 const scored=core.scoreForecast(prediction(),1000,quotes);assert.equal(scored.status,'scored');assert.equal(scored.truth,'up');assert.equal(scored.outcomeSeq,3);assert.equal(scored.correct.jev,true);
 assert.equal(core.scoreForecast(prediction(2000),1000,quotes).status,'late');
 assert.equal(core.scoreForecast(prediction(),1000,[q(1,1000,150)]).status,'missing_future_quote');
 assert.equal(core.scoreForecast(prediction(),1000,[q(1,1000,150),q(2,3101,151)]).status,'missing_future_quote');
 assert.equal(core.scoreForecast({...prediction(),committedSeq:3},1000,quotes).status,'outcome_not_after_commit');
 assert.equal(core.scoreForecast(prediction(),1000,[q(1,1000,150),q(2,2000,150)]).truth,'flat');
});
test('accuracy and Brier scoring share matched denominators and expose actual class imbalance',()=>{
 assert.equal(typeof core.summarizeForecast,'function');const a=core.scoreForecast(prediction(),1000,[q(1,1000,150),q(2,2000,150.001)]);
 const b=core.scoreForecast({...prediction(),id:2},1000,[q(1,1000,150),q(2,2000,149.999)]);
 const late=core.scoreForecast(prediction(3000),1000,[]);const s=core.summarizeForecast([a,b,late],1000);
 assert.equal(s.planned,3);assert.equal(s.scored,2);assert.equal(s.exclusions.late,1);assert.deepEqual(s.truthCounts,{up:1,down:1,flat:0});
 assert.equal(s.methods.jev.accuracy,.5);assert.equal(s.methods.jev.meanBrier,1);assert.equal(s.methods.alwaysFlat.accuracy,0);assert.equal(s.methods.alwaysFlat.meanBrier,2);
 assert.equal(s.methods.momentum.accuracy,.5);assert.equal(s.nonOverlapping.scored,1);
});
