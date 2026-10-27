import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRates,extractStatement,rateAction,eventWindow,modelState,stanceDirection,simulate,pairedBootstrap} from './core.mjs';

test('paired bootstrap reports identical differences exactly and rejects missing outcomes',()=>{
 assert.deepEqual(pairedBootstrap([3,3,3]),{meanJPY:3,lower95JPY:3,upper95JPY:3,method:'Paired event IID bootstrap; serial dependence not modeled'});
 assert.throws(()=>pairedBootstrap([]));assert.throws(()=>pairedBootstrap([1,NaN]));
});

test('missing fixing observations are skipped, not converted to zero; unordered or invalid rates fail',()=>{
 assert.deepEqual(parseRates('observation_date,DEXJPUS\n2024-01-01,\n2024-01-02,140.25\n2024-01-03,.\n'),[{date:'2024-01-02',rate:140.25}]);
 for(const csv of ['observation_date,DEXJPUS\n2024-01-02,-1','observation_date,DEXJPUS\n2024-01-02,NaN','observation_date,DEXJPUS\n2024-01-02,140\n2024-01-01,141','observation_date,DEXJPUS\n2024-01-02,140\n2024-01-02,141'])assert.throws(()=>parseRates(csv));
});
test('statement extraction rejects other releases and excludes navigation, metadata, and later footer updates',()=>{
 const html='<p>Future prices 999</p><p class="article__time">January 31, 2024</p><h3>Federal Reserve issues FOMC statement</h3><p class="releaseTime">For release at 2:00 p.m. EST</p><div class="col-xs-12 col-sm-8 col-md-8"><p>The Committee decided to maintain the target range for the federal funds rate. Inflation is elevated &amp; uncertain.</p><p>Voting for the monetary policy action were A.</p><p>For media inquiries future 777.</p></div>';
 assert.equal(extractStatement(html),'The Committee decided to maintain the target range for the federal funds rate. Inflation is elevated & uncertain.');
 assert.equal(extractStatement(html.replace('issues FOMC statement','announces a strategy review')),null);
 assert.throws(()=>extractStatement(html.replace('Voting for','Missing end marker')));
});
test('baseline uses only the announced target-rate decision, not future guidance or balance-sheet reductions',()=>{
 assert.equal(rateAction('The Committee decided to raise the target range for the federal funds rate to 5 percent.'),1);
 assert.equal(rateAction('The Committee decided to lower the target range for the federal funds rate by 1/4 percentage point.'),-1);
 assert.equal(rateAction('The Committee decided to maintain the target range for the federal funds rate. It does not expect to reduce the range until inflation falls. Holdings will be reduced.'),0);
 assert.throws(()=>rateAction('Policy unknown'));
});
test('an announcement cannot trade on an earlier fixing; the next two available fixing days determine the trade',()=>{
 const rates=[{date:'2024-01-31',rate:140},{date:'2024-02-01',rate:141},{date:'2024-02-02',rate:143}];
 assert.deepEqual(eventWindow('2024-01-31',rates),{entryDate:'2024-02-01',entry:141,exitDate:'2024-02-02',exit:143,calendarDays:1});
 assert.equal(eventWindow('2024-02-01',rates),null);
});
test('model inputs contain statement text only, never event IDs, dates, prices, labels, or future outcomes',()=>{
 assert.deepEqual(modelState({date:'2024-01-31',text:'Current policy text',entry:123,exit:456,outcome:'profit'},'Earlier statement'),{previousStatement:'Earlier statement',currentStatement:'Current policy text'});
});
test('uncertain or neutral classifications abstain and probabilities are validated',()=>{
 assert.equal(stanceDirection({choice:'hawkish',probabilities:{hawkish:.8,dovish:.1,neutral:.1}}),1);
 assert.equal(stanceDirection({choice:'dovish',probabilities:{hawkish:.1,dovish:.8,neutral:.1}}),-1);
 assert.equal(stanceDirection({choice:'hawkish',probabilities:{hawkish:.5,dovish:.3,neutral:.2}}),0);
 assert.equal(stanceDirection({choice:'neutral',probabilities:{hawkish:0,dovish:0,neutral:1}}),0);
 assert.throws(()=>stanceDirection({choice:'buy',probabilities:{buy:1}}));
});
test('JPY PnL uses fixed USD units and charges transaction, funding, and API costs even on abstention',()=>{
 const events=[
  {date:'2024-01-31',baseline:1,jev:1,window:{entryDate:'2024-02-01',entry:140,exitDate:'2024-02-02',exit:141,calendarDays:1}},
  {date:'2024-03-20',baseline:-1,jev:0,window:{entryDate:'2024-03-21',entry:142,exitDate:'2024-03-22',exit:143,calendarDays:1}},
 ];
 const result=simulate(events,'filtered',{initialJPY:10000,unitsUSD:1000,roundTripPips:2,fundingPipsPerDay:.5,apiJPYPerEvent:1});
 assert.equal(result.grossJPY,1000); assert.equal(result.transactionJPY,20);assert.equal(result.fundingJPY,5);assert.equal(result.apiJPY,2);
 assert.equal(result.netJPY,973);assert.equal(result.trades,1);assert.equal(result.maxClosedDrawdownJPY,1);
 assert.deepEqual(result.curve.map(x=>x.equityJPY),[10000,10974,10973]);
 const baseline=simulate(events,'baseline',{initialJPY:10000,unitsUSD:1000,roundTripPips:2,fundingPipsPerDay:.5,apiJPYPerEvent:1});
 assert.equal(baseline.netJPY,-50);assert.equal(baseline.apiJPY,0);assert.equal(baseline.maxClosedDrawdownJPY,1025);
});
test('negative direction earns money on falling prices; missing Jev decisions and overlapping trades are rejected',()=>{
 const e={date:'2024-01-31',baseline:-1,jev:-1,window:{entryDate:'2024-02-01',entry:140,exitDate:'2024-02-02',exit:139,calendarDays:1}};
 const config={initialJPY:10000,unitsUSD:1000,roundTripPips:0,fundingPipsPerDay:0,apiJPYPerEvent:0};
 assert.equal(simulate([e],'filtered',config).netJPY,1000);
 assert.throws(()=>simulate([{...e,jev:undefined}],'filtered',config));
 assert.throws(()=>simulate([e,{...e,date:'2024-02-01'}],'filtered',config));
});
