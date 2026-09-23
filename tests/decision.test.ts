import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidatesFor,type State} from '../jev/types.js';
import {parseDecision,requestFor} from '../jev/decide.js';
const state:State={goal:'請求書を保存',currentDate:'2026-09-19',screen:{title:'マイページ',text:[],elements:[{id:'e1',type:'link',text:'請求書'}],canScrollUp:false,canScrollDown:true},history:[]};
test('candidate scope: visible controls and available navigation only',()=>{
 const c=candidatesFor(state.screen,false);assert.deepEqual(Object.keys(c),['e1','scroll_down','done','stuck']);assert.equal(c.e1.label,'「請求書」をクリック');
});
test('request uses native criteria, includes history and no locator data',()=>{
 const body=requestFor(state,candidatesFor(state.screen,false),'jev-latest');assert.equal(body.questions.nextAction.criteria.e1,'「請求書」をクリック');assert.equal(body.state,state);assert.ok(!JSON.stringify(body).includes('selector'));assert.ok(!('options' in body.questions.nextAction));
});
test('untrusted API choice and probabilities are validated',()=>{
 const c=candidatesFor(state.screen,false);const probabilities={e1:0.7,scroll_down:0.1,done:0.1,stuck:0.1};
 assert.equal(parseDecision({model:'test',answers:{nextAction:{choice:'e1',probabilities}}},c).action.type,'click');
 assert.throws(()=>parseDecision({answers:{nextAction:{choice:'__proto__',probabilities}}},c));
 assert.throws(()=>parseDecision({answers:{nextAction:{choice:'e1',probabilities:{e1:1}}}},c));
 assert.throws(()=>parseDecision({answers:{nextAction:{choice:'e1',probabilities:{...probabilities,e1:NaN}}}},c));
});
