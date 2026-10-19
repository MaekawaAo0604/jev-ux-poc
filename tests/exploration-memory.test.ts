import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExplorationMemory} from '../runner/exploration-memory.js';
import type {Candidate,Observation} from '../jev/types.js';

const click=(id:string,label=id):Candidate=>({action:{type:'click',elementId:id},label});
function screen(text:string):Observation{return {title:text,text:[text],elements:[],canScrollDown:false,canScrollUp:false,viewport:{top:0,bottom:1000,height:1000}};}
function visit(memory:ExplorationMemory,text:string,keys:Record<string,string>,extra:Record<string,Candidate>={},observation=screen(text)){
 const candidates={...Object.fromEntries(Object.keys(keys).map(id=>[id,click(id)])),...extra,done:{action:{type:'done'},label:'Done'} as Candidate,stuck:{action:{type:'stuck'},label:'Stuck'} as Candidate};
 return memory.observe('https://example.test/',observation,candidates,keys);
}

test('one executed no-op is excluded across anonymous ID, font and geometry changes',()=>{
 const memory=new ExplorationMemory();
 const a=visit(memory,'Home',{e1:'link:home',e2:'link:answer'});
 memory.executed(a,'e1');
 const changed=screen('Home');changed.regions=[{id:'different',source:'dom',text:'Home',bbox:{x0:2,y0:0,x1:30,y1:20},fontSizePx:21}];
 const b=visit(memory,'Home',{e9:'link:home',e8:'link:answer'}, {e9:click('e9','e1'),e8:click('e8','e2')},changed);
 assert.equal(b.stateId,a.stateId);
 assert.deepEqual(Object.keys(b.candidates),['e8','done','stuck']);
 assert.equal(b.exclusions.e9,'explored');
});

test('observing or deciding without executing cannot retire an action',()=>{
 const memory=new ExplorationMemory();
 visit(memory,'Home',{e1:'link:home'});
 const b=visit(memory,'Home',{e1:'link:home'});
 assert.ok(b.candidates.e1);
 assert.deepEqual(b.exclusions,{});
});

test('changed visible content reopens the operation without treating a visited URL as exhausted',()=>{
 const memory=new ExplorationMemory();
 const a=visit(memory,'Old condition',{e1:'link:home'});memory.executed(a,'e1');
 assert.ok(visit(memory,'New condition',{e1:'link:home'}).candidates.e1);
});

test('duplicate transitions share one candidate but equal labels with different destinations do not',()=>{
 const memory=new ExplorationMemory();
 const a=visit(memory,'Home',{e1:'link:first',e2:'link:first',e3:'link:second'},{e1:click('e1','Details'),e2:click('e2','Details'),e3:click('e3','Details')});
 assert.deepEqual(Object.keys(a.candidates),['e1','e3','done','stuck']);
 assert.equal(a.exclusions.e2,'duplicate');
});

test('direct navigation shares its executed outcome across viewport and display changes on the same page',()=>{
 const memory=new ExplorationMemory();
 const candidates={home:click('home','Home'),answer:click('answer','Answer')},keys={home:'link:home',answer:'link:answer'};
 let offer=memory.observe('https://example.test/page',screen('Top'),{home:candidates.home},keys,['home']);
 memory.executed(offer,'home');
 memory.observe('https://example.test/',screen('Home'),{},{});
 const lower=screen('Lower');lower.viewport={top:700,bottom:1700,height:1000};
 offer=memory.observe('https://example.test/page',lower,candidates,keys,['home','answer']);
 assert.ok(!offer.candidates.home,'the same direct navigation is not fresh at a new scroll position');
 assert.ok(offer.candidates.answer);
 assert.ok(!memory.observe('https://example.test/other',lower,candidates,keys,['home','answer']).candidates.home,'the same absolute destination is already explored on another source document too');
});

test('shared direct navigation still allows transit when its latest destination has untried work',()=>{
 const memory=new ExplorationMemory();
 const keys={menu:'link:menu'};
 let a=memory.observe('https://example.test/page',screen('Top'),{menu:click('menu')},keys,['menu']);memory.executed(a,'menu');
 const b=memory.observe('https://example.test/menu',screen('Menu'),{answer:click('answer')},{answer:'link:answer'},['answer']);
 a=memory.observe('https://example.test/page',screen('Lower'),{menu:click('menu')},keys,['menu']);
 assert.deepEqual(a.transitChoices,['menu']);
 assert.ok(a.candidates.menu);
});

test('a known path can transit to untried siblings but not reopen an exhausted branch',()=>{
 const memory=new ExplorationMemory();
 let a=visit(memory,'Home',{menu:'link:menu'});memory.executed(a,'menu');
 let b=visit(memory,'Menu',{detail:'link:detail',answer:'link:answer'});memory.executed(b,'detail');
 const c=visit(memory,'Detail',{home:'link:home'});memory.executed(c,'home');
 a=visit(memory,'Home',{menu:'link:menu'});
 assert.deepEqual(a.transitChoices,['menu']);memory.executed(a,'menu');
 b=visit(memory,'Menu',{detail:'link:detail',answer:'link:answer'});
 assert.ok(b.candidates.answer);
 assert.ok(!b.candidates.detail,'a cycle through the current menu is not a route to other unexplored work');
});

test('transit may pass untried unrelated controls to reach known onward exploration',()=>{
 const memory=new ExplorationMemory();
 const down={down:{action:{type:'scroll',direction:'down'},label:'Down'} as Candidate};
 let a=visit(memory,'Top',{down:'scroll:down'},down);memory.executed(a,'down');
 let b=visit(memory,'Middle',{unrelated:'link:unrelated',down:'scroll:down'},down);memory.executed(b,'down');
 const c=visit(memory,'Lower',{home:'link:home',answer:'link:answer'});memory.executed(c,'home');
 a=visit(memory,'Top',{down:'scroll:down'},down);memory.executed(a,'down');
 b=visit(memory,'Middle',{unrelated:'link:unrelated',down:'scroll:down'},down);
 assert.ok(b.candidates.unrelated);
 assert.ok(b.candidates.down,'untried header links must not force abandoning a known onward route');
 assert.ok(b.transitChoices.includes('down'));
});

test('arrival through a known transit route offers the untried choices instead of starting another cycle',()=>{
 const memory=new ExplorationMemory();
 let a=visit(memory,'A',{b:'link:b',x:'link:x'});memory.executed(a,'b');
 let b=visit(memory,'B',{a:'link:a',y:'link:y'});memory.executed(b,'a');
 a=visit(memory,'A',{b:'link:b',x:'link:x'});assert.ok(a.candidates.b);memory.executed(a,'b');
 b=visit(memory,'B',{a:'link:a',y:'link:y'});
 assert.ok(!b.candidates.a);assert.equal(b.exclusions.a,'transit-route');assert.ok(b.candidates.y);
});

test('native back entries cannot unwind a committed frontier route and strand its untried answer',()=>{
 const memory=new ExplorationMemory();
 const back={back:{action:{type:'back'},label:'Back'} as Candidate};
 let a=visit(memory,'A',{b:'link:b'});memory.executed(a,'b');
 let b=visit(memory,'B',{a:'link:a',answer:'link:answer',back:'back:A0'},back);memory.executed(b,'a');
 a=visit(memory,'A',{b:'link:b',back:'back:B1'},back);memory.executed(a,'b');
 b=visit(memory,'B',{a:'link:a',answer:'link:answer',back:'back:A2'},back);
 assert.deepEqual(Object.keys(b.candidates),['answer','done','stuck']);
 memory.executed(b,'answer');
 const answer=visit(memory,'Answer',{back:'back:B3'},back);
 assert.ok(answer.candidates.back,'normal traversal resumes after exploring a fresh operation');
});

test('a changed destination invalidates the transit route and retains recovery through Back',()=>{
 const memory=new ExplorationMemory();
 const back={back:{action:{type:'back'},label:'Back'} as Candidate};
 let a=visit(memory,'A',{b:'link:b',x:'link:x'});memory.executed(a,'b');
 const b=visit(memory,'B',{a:'link:a',answer:'link:answer'});memory.executed(b,'a');
 a=visit(memory,'A',{b:'link:b',x:'link:x'});memory.executed(a,'b');
 const unavailable=visit(memory,'Temporarily unavailable',{back:'back:A2'},back);
 assert.ok(unavailable.candidates.back,'an unexpected arrival must not strand remaining exploration');
 memory.executed(unavailable,'back');
 const recovered=visit(memory,'A',{b:'link:b',x:'link:x'});
 assert.ok(recovered.candidates.x);
 assert.ok(!recovered.candidates.b,'the old successful destination cannot revive a route whose latest result is a dead end');
});

test('a changed reobservation cancels transit without inventing an executed action',()=>{
 const memory=new ExplorationMemory();
 let a=visit(memory,'A',{b:'link:b',x:'link:x'});memory.executed(a,'b');
 let b=visit(memory,'B',{a:'link:a',answer:'link:answer'});memory.executed(b,'a');
 a=visit(memory,'A',{b:'link:b',x:'link:x'});memory.executed(a,'b');
 b=visit(memory,'B',{a:'link:a',answer:'link:answer'});assert.ok(!b.candidates.a);
 const changed=visit(memory,'Unavailable',{back:'back:A2'},{back:{action:{type:'back'},label:'Back'}});
 assert.ok(changed.candidates.back);
 assert.ok(visit(memory,'B',{a:'link:a',answer:'link:answer'}).candidates.answer,'observation alone cannot retire the unexecuted answer');
});

test('back is available for traversal but does not create new exploration or a frontier by itself',()=>{
 const memory=new ExplorationMemory();
 const back={back:{action:{type:'back'},label:'Back'} as Candidate};
 let a=visit(memory,'A',{b:'link:b'});memory.executed(a,'b');
 let b=visit(memory,'B',{back:'back:entry1'},back);const before=b.revision;memory.executed(b,'back');
 a=visit(memory,'A',{b:'link:b'});
 assert.equal(a.revision,before);
 assert.ok(!a.candidates.b,'B has no untried non-back operation');
 b=visit(memory,'B',{back:'back:entry2'},back);
 assert.ok(b.candidates.back,'a different approved history entry is still traversable');
});

test('past Back destinations cannot authorize a transit route for a different navigation history',()=>{
 const memory=new ExplorationMemory();
 const links:Record<string,string[]>={'0':['1','0'],'1':['2','1'],'2':['0','1']};
 let location='0',entry=0,nextEntry=0;
 const history:{location:string;entry:number}[]=[];
 function observe(){
  const keys=Object.fromEntries(links[location].map(target=>[`to${target}`,`link:${target}`]));
  const back:Record<string,Candidate>={};
  if(history.length){keys.back=`back:${history.at(-1)!.entry}`;back.back={action:{type:'back'},label:'Back'};}
  return visit(memory,location,keys,back);
 }
 let offer=observe();
 for(const choice of ['to1','to2','back','to2','to0','to1','to1','back','back','back']){
  assert.ok(offer.candidates[choice],`${location}: ${choice} must remain traversable`);
  memory.executed(offer,choice);
  if(choice==='back')({location,entry}=history.pop()!);
  else{const target=choice.slice(2);if(target!==location)history.push({location,entry});location=target;entry=++nextEntry;}
  offer=observe();
 }
 assert.equal(location,'1');
 assert.ok(offer.candidates.back,'Back must still allow reaching the ancestor with untried work');
 assert.ok(!offer.transitChoices.includes('back'),'native history is recovery, not a stable graph route');
});

test('previously scrolled ranges stay traversable toward untried controls and new scroll directions',()=>{
 const memory=new ExplorationMemory();
 const down={down:{action:{type:'scroll',direction:'down'},label:'Down'} as Candidate};
 let a=visit(memory,'Top',{down:'scroll:down'},down);memory.executed(a,'down');
 const b=visit(memory,'Lower',{home:'link:home',answer:'link:answer',down:'scroll:down'},down);memory.executed(b,'home');
 a=visit(memory,'Top',{down:'scroll:down'},down);
 assert.deepEqual(a.transitChoices,['down']);
 assert.ok(a.candidates.down);
});

test('dead-end input retains observed untried alternatives, not executed controls or private identities',()=>{
 const memory=new ExplorationMemory();
 const menu={...screen('Menu'),pageId:'p1'};
 let a=visit(memory,'Menu',{wrong:'secret:/wrong',other:'secret:/other'},{wrong:click('wrong','Branch A'),other:click('other','Branch B')},menu);
 memory.executed(a,'wrong');
 let b=visit(memory,'Dead end',{back:'back:private-entry'},{back:{action:{type:'back'},label:'Back'}},{...screen('Dead end'),pageId:'p2'});
 assert.deepEqual(memory.observedAlternatives(b),[{pageTitle:'Menu',pageId:'p1',controls:[{label:'Branch B',kind:'click'}]}]);
 memory.executed(b,'back');
 a=visit(memory,'Menu',{wrong:'secret:/wrong',other:'secret:/other'},{wrong:click('wrong','Branch A'),other:click('other','Branch B')},menu);
 assert.deepEqual(memory.observedAlternatives(a),[],'current screen already contains its own candidates');
 memory.executed(a,'other');
 b=visit(memory,'Answer',{});
 assert.deepEqual(memory.observedAlternatives(b),[],'actually executing the alternative retires it');
});

test('recovery alternatives are scoped to the actual Back document and preserve visible heading context',()=>{
 const m=new ExplorationMemory(),context={landmark:'main' as const,section:'opaque',headings:['見学施設']};
 let a=m.observe('https://example.test/root',screen('Root'),{menu:click('menu'),unrelated:click('unrelated')},{menu:'menu',unrelated:'unrelated'});m.executed(a,'menu');
 const menu={...screen('Menu'),pageId:'p2',elements:[{id:'answer',type:'link' as const,text:'施設・アクセス',context}]};
 const b=m.observe('https://example.test/menu',menu,{wrong:click('wrong'),answer:click('answer','施設・アクセス')},{wrong:'wrong',answer:'answer'});m.executed(b,'wrong');
 const c=m.observe('https://example.test/wrong',screen('Wrong'),{back:{action:{type:'back'},label:'Back'}},{back:'back:entry'});
 assert.deepEqual(m.observedAlternatives(c,'https://example.test/menu#old'),[{pageTitle:'Menu',pageId:'p2',controls:[{label:'施設・アクセス',kind:'click',context}]}]);
});
