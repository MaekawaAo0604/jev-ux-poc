import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigationCriteria} from '../jev/navigation-context.js';
import type {Candidate,Observation,State} from '../jev/types.js';

const candidates:Record<string,Candidate>={
 later:{action:{type:'scroll',direction:'down'},label:'下へ'},
 details:{action:{type:'click',elementId:'e1'},label:'詳細を開く'},
 earlier:{action:{type:'scroll',direction:'up'},label:'上へ'},
 finish:{action:{type:'done'},label:'終了'},
 back:{action:{type:'back'},label:'戻る'},
 stuck:{action:{type:'stuck'},label:'行き先不明'},
};
const baseLabels={later:'下へ',details:'詳細を開く',earlier:'上へ',finish:'終了',back:'戻る',stuck:'行き先不明'};
const observed='（移動先の表示範囲は過去に観察済み。読み取れた内容は本文と警告を参照）';
const unobserved='（この方向には、まだ観察していない表示範囲がある）';
const history=(viewport:Observation['viewport'],pageId='p1'):State['history'][number]=>({screen:'案内',action:'表示位置を移動',result:'表示更新',pageId,viewport});
function state(entries:State['history']=[]):State{
 return {goal:'利用案内を確認',currentDate:'2026-09-23',history:entries,screen:{title:'案内',text:['本文'],warnings:['PARTIAL_TEXT'],elements:[],canScrollUp:true,canScrollDown:true,pageId:'p1',viewport:{top:1000,bottom:2000,height:1000}}};
}

test('current viewport alone leaves both newly exposed strips unobserved',()=>{
 assert.deepEqual(navigationCriteria(state(),candidates),{...baseLabels,later:'下へ'+unobserved,earlier:'上へ'+unobserved});
});

test('overlapping same-page ranges cover the full next strip in either direction without mutating history or candidates',()=>{
 const input=state([
  history({top:2200,bottom:2700,height:500}),
  history({top:300,bottom:850,height:550}),
  history({top:1900,bottom:2300,height:400}),
  history({top:800,bottom:1500,height:700}),
 ]),before=structuredClone({input,candidates});
 const criteria=navigationCriteria(input,candidates);
 assert.deepEqual(criteria,{...baseLabels,later:'下へ'+observed,earlier:'上へ'+observed});
 assert.deepEqual(Object.keys(criteria),['later','details','earlier','finish','back','stuck']);
 assert.deepEqual({input,candidates},before);
});

test('adjacent ranges count as continuous positional coverage',()=>{
 const input=state([
  history({top:300,bottom:600,height:300}),history({top:600,bottom:1000,height:400}),
  history({top:2000,bottom:2400,height:400}),history({top:2400,bottom:2700,height:300}),
 ]);
 assert.deepEqual(navigationCriteria(input,candidates),{...baseLabels,later:'下へ'+observed,earlier:'上へ'+observed});
});

test('a positive gap inside the next strip remains unobserved even when its endpoints were visited',()=>{
 const input=state([
  history({top:300,bottom:600,height:300}),history({top:601,bottom:1000,height:399}),
  history({top:2000,bottom:2200,height:200}),history({top:2201,bottom:2700,height:499}),
 ]);
 assert.deepEqual(navigationCriteria(input,candidates),{...baseLabels,later:'下へ'+unobserved,earlier:'上へ'+unobserved});
});

test('matching titles and ranges on another page cannot mark the current page as observed',()=>{
 assert.deepEqual(navigationCriteria(state([history({top:0,bottom:3000,height:3000},'p2')]),candidates),{...baseLabels,later:'下へ'+unobserved,earlier:'上へ'+unobserved});
});

test('upward exposure stops at zero and an empty strip does not add a positional claim',()=>{
 const input=state([history({top:0,bottom:400,height:400})]);
 input.screen.viewport={top:400,bottom:1400,height:1000};
 assert.equal(navigationCriteria(input,candidates).earlier,'上へ'+observed);
 input.screen.viewport={top:0,bottom:1000,height:1000};
 assert.equal(navigationCriteria(input,candidates).earlier,'上へ');
});

test('fractional viewport coordinates remain valid despite floating point addition',()=>{
 const input=state([history({top:0,bottom:0.1,height:0.1})]);
 input.screen.viewport={top:0.1,bottom:0.3,height:0.2};
 assert.deepEqual(navigationCriteria(input,candidates),{...baseLabels,later:'下へ'+unobserved,earlier:'上へ'+observed});
});

test('missing or invalid current page and viewport data preserve the original criteria',()=>{
 for(const change of [
  {pageId:undefined},{pageId:''},{viewport:undefined},
  {viewport:{top:NaN,bottom:2000,height:1000}},
  {viewport:{top:1000,bottom:Infinity,height:1000}},
  {viewport:{top:-1,bottom:999,height:1000}},
  {viewport:{top:1000,bottom:1000,height:0}},
  {viewport:{top:1000,bottom:900,height:-100}},
  {viewport:{top:1000,bottom:2000,height:500}},
 ]){
  const input=state();Object.assign(input.screen,change);
  assert.deepEqual(navigationCriteria(input,candidates),baseLabels,JSON.stringify(change));
 }
});

test('missing or invalid historical ranges cannot supply positional coverage',()=>{
 const input=state([
  history(undefined),history({top:0,bottom:3000,height:1}),
  history({top:NaN,bottom:3000,height:3000}),history({top:0,bottom:Infinity,height:Infinity}),
  history({top:-100,bottom:3000,height:3100}),history({top:3000,bottom:0,height:-3000}),
 ]);
 assert.deepEqual(navigationCriteria(input,candidates),{...baseLabels,later:'下へ'+unobserved,earlier:'上へ'+unobserved});
});

test('only supplied scroll actions receive notes and non-scroll candidates remain verbatim',()=>{
 const subset:Record<string,Candidate>={scroll_down:{action:{type:'click',elementId:'e1'},label:'Scrollという名前のリンク'},finish:candidates.finish,back:candidates.back,stuck:candidates.stuck};
 assert.deepEqual(navigationCriteria(state(),subset),{scroll_down:'Scrollという名前のリンク',finish:'終了',back:'戻る',stuck:'行き先不明'});
 assert.deepEqual(navigationCriteria(state(),{later:candidates.later}),{later:'下へ'+unobserved});
});
