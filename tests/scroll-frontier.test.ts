import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExplorationMemory} from '../runner/exploration-memory.js';
import type {Candidate,Observation} from '../jev/types.js';
const link=(id:string):Candidate=>({action:{type:'click',elementId:id},label:id});
const up:Candidate={action:{type:'scroll',direction:'up'},label:'Up'},down:Candidate={action:{type:'scroll',direction:'down'},label:'Down'},back:Candidate={action:{type:'back'},label:'Back'};
const screen=(pageId:string,top:number):Observation=>({pageId,title:pageId,text:[],elements:[],canScrollUp:top>0,canScrollDown:false,viewport:{top,bottom:top+1000,height:1000}});
const root=(m:ExplorationMemory)=>m.observe('https://example.test/',screen('menu',0),{long:link('long'),other:link('other')},{long:'link:long',other:'link:other'},['long','other']);
function long(m:ExplorationMemory,y:number,bottom=2625){
 const offered={...(y<bottom?{down}:{}),...(y>0?{up}:{}),back};
 return m.observe('https://example.test/long',{...screen('long',y),canScrollDown:y<bottom},offered,{down:'scroll:down',up:'scroll:up',back:'back:menu'});
}

test('covered reverse scrolls do not become remote exploration destinations after reading a long page',()=>{
 const m=new ExplorationMemory();let a=root(m);m.executed(a,'long');
 let b=long(m,0);
 for(const y of [700,1400,2100,2625]){m.executed(b,'down');b=long(m,y);}
 assert.ok(b.candidates.up,'the current image may still warrant rereading');
 const targets=Object.values(m.frontier(b).targets);
 assert.ok(targets.some(t=>t.kind==='scroll'&&t.travelSteps===0&&t.direction==='up'));
 assert.deepEqual(targets.filter(t=>t.kind==='scroll'&&t.travelSteps>0),[],'unpressed reverse operations on already observed ranges are not new remote work');
 m.executed(b,'back');a=root(m);
 assert.ok(a.candidates.other);
 assert.equal(a.candidates.long,undefined,'the completed positional scan cannot force a return merely to retire old reverse-scroll buttons');
});

test('an unseen gap above an anchor landing remains a reachable remote scroll target',()=>{
 const m=new ExplorationMemory();let a=root(m);m.executed(a,'long');
 const b=m.observe('https://example.test/long',screen('long',1400),{up,home:link('home')},{up:'scroll:up',home:'link:home'},['home']);m.executed(b,'home');
 a=root(m);
 assert.ok(a.candidates.long);
 const target=Object.values(m.frontier(a).targets).find(t=>t.kind==='scroll'&&t.direction==='up');
 assert.ok(target);assert.equal(target.travelSteps,1);assert.equal(target.nextChoice,'long');
});

test('observed scroll paths still reach a genuinely untried link',()=>{
 const m=new ExplorationMemory();let a=root(m);m.executed(a,'long');
 a=long(m,0);m.executed(a,'down');
 const b=m.observe('https://example.test/long',screen('long',700),{up,back,answer:link('answer')},{up:'scroll:up',back:'back:menu',answer:'link:answer'},['answer']);m.executed(b,'up');
 a=long(m,0);
 assert.ok(a.candidates.down);
 const target=Object.values(m.frontier(a).targets).find(t=>t.kind==='click'&&t.label==='answer');
 assert.ok(target);assert.equal(target.travelSteps,1);assert.equal(target.nextChoice,'down');
});

for(const purpose of ['untried-control','unobserved-gap','indirect-control'] as const)test(`an unexecuted reverse scroll remains usable transit to ${purpose}`,()=>{
 const m=new ExplorationMemory(),destination=purpose==='unobserved-gap'?3300:700;
 const landing=(y:number)=>m.observe('https://example.test/long#middle',{...screen('long',y),canScrollDown:y<destination},{up,home:link('home'),third:link('third'),...(y<destination?{down}:{})},{up:'scroll:up',down:'scroll:down',home:'link:home',third:'link:third'},['home','third']);
 const top=()=>m.observe('https://example.test/long',{...screen('long',0),canScrollDown:true},{anchor:link('anchor'),...(purpose==='untried-control'?{answer:link('answer')}:{}),...(purpose==='indirect-control'?{menu:link('menu')}:{})},{anchor:'anchor:middle',answer:'link:answer',menu:'link:menu'},['menu']);
 let offer=top();
 if(purpose==='indirect-control'){
  m.executed(offer,'menu');
  offer=m.observe('https://example.test/menu',screen('menu',0),{answer:link('answer'),back},{answer:'link:answer',back:'back:long'},['answer']);m.executed(offer,'back');offer=top();
 }
 m.executed(offer,'anchor');
 if(purpose==='unobserved-gap'){
  offer=landing(1900);m.executed(offer,'down');offer=landing(2600);m.executed(offer,'down');
 }
 offer=landing(destination);m.executed(offer,'home');
 offer=m.observe('https://example.test/',screen('home',0),{middle:link('middle')},{middle:'link:middle'},['middle']);m.executed(offer,'middle');
 offer=landing(destination);m.executed(offer,'third');
 offer=m.observe('https://example.test/third',screen('third',0),{middle:link('middle')},{middle:'link:middle'},['middle']);
 assert.ok(offer.candidates.middle,'covered next pixels are not proof that all onward work is exhausted');
 const target=Object.values(m.frontier(offer).targets).find(t=>t.kind==='scroll'&&t.direction==='up');
 assert.ok(target);assert.equal(target.travelSteps,1);assert.equal(target.nextChoice,'middle');
});

for(const observedEnd of [false,true])test(`covered downward motion requires an observed document end before pruning (end:${observedEnd})`,()=>{
 const m=new ExplorationMemory();
 const top=()=>m.observe('https://example.test/long',{...screen('long',0),canScrollDown:true},{down,home:link('home'),third:link('third')},{down:'scroll:down',home:'link:home',third:'link:third'},['home','third']);
 const menu=()=>m.observe('https://example.test/',screen('menu',0),{long:link('long')},{long:'link:long'},['long']);
 let offer=m.observe('https://example.test/long',{...screen('long',700),canScrollDown:!observedEnd},{up,home:link('home')},{up:'scroll:up',home:'link:home'},['home']);m.executed(offer,'up');
 offer=top();m.executed(offer,'home');offer=menu();m.executed(offer,'long');offer=top();m.executed(offer,'third');
 offer=m.observe('https://example.test/third',screen('third',0),{long:link('long')},{long:'link:long'},['long']);
 assert.equal(!!offer.candidates.long,!observedEnd);
 assert.equal(Object.values(m.frontier(offer).targets).some(t=>t.kind==='scroll'&&t.direction==='down'&&t.travelSteps===1),!observedEnd);
});

test('reverse-scroll transit stays reachable through nested pages without recursive graph search',()=>{
 const m=new ExplorationMemory();
 const menuTop=()=>m.observe('https://example.test/menu',{...screen('menu',0),canScrollDown:true},{answer:link('answer'),anchor:link('anchor')},{answer:'link:answer',anchor:'anchor:menu'});
 const menuMiddle=()=>m.observe('https://example.test/menu#middle',screen('menu',700),{up,long:link('long')},{up:'scroll:up',long:'link:long'},['long']);
 const longTop=()=>m.observe('https://example.test/long',{...screen('long',0),canScrollDown:true},{menu:link('menu'),anchor:link('anchor')},{menu:'link:menu-middle',anchor:'anchor:long'},['menu']);
 const longMiddle=()=>m.observe('https://example.test/long#middle',screen('long',700),{up,home:link('home'),third:link('third')},{up:'scroll:up',home:'link:home',third:'link:third'},['home','third']);
 let offer=menuTop();m.executed(offer,'anchor');offer=menuMiddle();m.executed(offer,'long');offer=longTop();m.executed(offer,'menu');
 offer=menuMiddle();m.executed(offer,'long');offer=longTop();m.executed(offer,'anchor');offer=longMiddle();m.executed(offer,'home');
 offer=m.observe('https://example.test/',screen('home',0),{middle:link('middle')},{middle:'link:long-middle'},['middle']);m.executed(offer,'middle');
 offer=longMiddle();m.executed(offer,'third');offer=m.observe('https://example.test/third',screen('third',0),{middle:link('middle')},{middle:'link:long-middle'},['middle']);
 assert.ok(offer.candidates.middle,'Long Up -> Menu -> Menu Up -> Answer is still unfinished work');
 const target=Object.values(m.frontier(offer).targets).find(t=>t.kind==='scroll'&&t.direction==='up');
 assert.ok(target);assert.equal(target.travelSteps,1);assert.equal(target.nextChoice,'middle');
});

test('a cycle back to current work cannot revive an exhausted remote reverse scroll',()=>{
 const m=new ExplorationMemory();
 let offer=m.observe('https://example.test/long',{...screen('long',0),canScrollDown:true},{anchor:link('anchor')},{anchor:'anchor:middle'});m.executed(offer,'anchor');
 const middle=()=>m.observe('https://example.test/long#middle',screen('long',700),{up,home:link('home'),third:link('third')},{up:'scroll:up',home:'link:home',third:'link:third'},['home','third']);
 offer=middle();m.executed(offer,'home');offer=m.observe('https://example.test/',screen('home',0),{middle:link('middle')},{middle:'link:middle'},['middle']);m.executed(offer,'middle');
 offer=middle();m.executed(offer,'third');offer=m.observe('https://example.test/third',screen('third',0),{middle:link('middle'),other:link('other')},{middle:'link:middle',other:'link:other'},['middle','other']);
 assert.ok(offer.candidates.other);
 assert.equal(offer.candidates.middle,undefined,'current Other is not a reason to go Up and cycle back to the current screen');
 assert.deepEqual(Object.values(m.frontier(offer).targets).map(t=>t.nextChoice),['other']);
});

test('a link already visible at the origin is not a reason to revisit an overlapping older viewport',()=>{
 const m=new ExplorationMemory();
 let offer=m.observe('https://example.test/long',{...screen('long',108),canScrollDown:true},{anchor:link('anchor'),other:link('other')},{anchor:'anchor:middle',other:'link:other'});m.executed(offer,'anchor');
 const middle=()=>m.observe('https://example.test/long#middle',screen('long',700),{up,home:link('home'),top:link('top')},{up:'scroll:up',home:'link:home',top:'link:top'},['home','top']);
 offer=middle();m.executed(offer,'home');offer=m.observe('https://example.test/',screen('home',0),{middle:link('middle')},{middle:'link:middle'},['middle']);m.executed(offer,'middle');
 offer=middle();m.executed(offer,'top');offer=m.observe('https://example.test/long#top',{...screen('long',0),canScrollDown:true},{middle:link('middle'),other:link('other')},{middle:'link:middle',other:'link:other'},['middle']);
 assert.ok(offer.candidates.other);
 assert.equal(offer.candidates.middle,undefined,'Other is visible now, not only at the older y108 viewport');
});
