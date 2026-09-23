import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExplorationMemory} from '../runner/exploration-memory.js';
import type {Candidate,Observation} from '../jev/types.js';

function observe(memory:ExplorationMemory,title:string,links:Record<string,string>){
 const screen:Observation={title,pageId:title,text:[title],elements:Object.keys(links).map(id=>({id,type:'link',text:id})),canScrollUp:false,canScrollDown:false};
 const candidates:Record<string,Candidate>=Object.fromEntries(Object.keys(links).map(id=>[id,{label:id,action:{type:'click',elementId:id}}]));
 candidates.stuck={label:'Stuck',action:{type:'stuck'}};
 return memory.observe(`https://example.test/${title}`,screen,candidates,links,Object.keys(links));
}
function frontier(memory:ExplorationMemory,offer:ReturnType<typeof observe>){
 assert.equal(typeof memory.frontier,'function','exploration must offer concrete untried targets, not only immediate transit choices');
 return memory.frontier(offer);
}
function chooseLabel(memory:ExplorationMemory,offer:ReturnType<typeof observe>,label:string){
 const plan=frontier(memory,offer);
 const entry=Object.entries(plan.targets).find(([,target])=>target.label===label);
 assert.ok(entry,`untried target ${label} must be reachable`);
 memory.commit(offer,entry[0],'pending');
 return {id:entry[0],choice:entry[1].nextChoice};
}

test('an exhausted branch is not offered as a target while an unseen sibling is',()=>{
 const m=new ExplorationMemory();
 let a=observe(m,'Home',{guide:'guide',other:'other'});m.executed(a,'guide');
 const b=observe(m,'Guide',{home:'home'});m.executed(b,'home');
 a=observe(m,'Home',{guide:'guide',other:'other'});
 assert.deepEqual(Object.values(frontier(m,a).targets).map(t=>t.label),['other']);
});

test('a selected remote frontier is reached through known steps without selecting again at intermediate distractions',()=>{
 const m=new ExplorationMemory();
 let a=observe(m,'Home',{menu:'menu'});m.executed(a,'menu');
 let b=observe(m,'Menu',{lower:'lower',unrelated:'unrelated'});m.executed(b,'lower');
 let c=observe(m,'Lower',{answer:'answer',home:'home'});m.executed(c,'home');
 a=observe(m,'Home',{menu:'menu'});
 const chosen=chooseLabel(m,a,'answer');assert.equal(chosen.choice,'menu');m.executed(a,chosen.choice);
 b=observe(m,'Menu',{lower:'lower',unrelated:'unrelated'});
 let plan=frontier(m,b);assert.equal(plan.continuation?.targetId,chosen.id);assert.equal(plan.targets[chosen.id].nextChoice,'lower');
 m.executed(b,'lower');
 c=observe(m,'Lower',{answer:'answer',home:'home'});
 plan=frontier(m,c);assert.equal(plan.continuation?.targetId,chosen.id);assert.equal(plan.targets[chosen.id].nextChoice,'answer');
 m.executed(c,'answer');
 const arrived=observe(m,'Answer',{});
 assert.equal(frontier(m,arrived).continuation,undefined,'executed frontier is retired, not another route target');
});

test('an unexpected destination cancels a committed route without executing its stale control',()=>{
 const m=new ExplorationMemory();
 let a=observe(m,'Home',{menu:'menu'});m.executed(a,'menu');
 const b=observe(m,'Menu',{answer:'answer',home:'home'});m.executed(b,'home');
 a=observe(m,'Home',{menu:'menu'});const chosen=chooseLabel(m,a,'answer');m.executed(a,chosen.choice);
 const changed=observe(m,'Changed',{safe:'safe'}),plan=frontier(m,changed);
 assert.equal(plan.continuation,undefined);
 assert.deepEqual(Object.values(plan.targets).map(t=>t.label),['safe']);
});

test('remote candidates do not leak routes and their execution resolves fresh anonymous IDs',()=>{
 const m=new ExplorationMemory();
 let a=observe(m,'Home',{menu:'PRIVATE_URL_MENU'});m.executed(a,'menu');
 const b=observe(m,'Menu',{answer:'PRIVATE_URL_ANSWER',home:'PRIVATE_URL_HOME'});m.executed(b,'home');
 a=observe(m,'Home',{e99:'PRIVATE_URL_MENU'});
 const chosen=chooseLabel(m,a,'answer');assert.equal(chosen.choice,'e99');
 assert.doesNotMatch(JSON.stringify(frontier(m,a)),/PRIVATE_URL|https:/);
});

test('observing a frontier without executing does not retire it; duplicate hrefs share it',()=>{
 const m=new ExplorationMemory();
 const a=observe(m,'Home',{first:'same',duplicate:'same'});
 const plan=frontier(m,a);assert.equal(Object.keys(plan.targets).length,1);
 m.commit(a,Object.keys(plan.targets)[0],'pending');
 const again=observe(m,'Home',{first:'same',duplicate:'same'});
 assert.equal(Object.keys(frontier(m,again).targets).length,1);
});

test('changing the selected target starts a fresh route rather than inheriting old traversal exclusions',()=>{
 const m=new ExplorationMemory();
 let a=observe(m,'A',{b:'b',x:'x'});m.executed(a,'b');
 let b=observe(m,'B',{c:'c',y:'y'});m.executed(b,'c');
 let c=observe(m,'C',{a:'a',z:'z'});m.executed(c,'a');
 a=observe(m,'A',{b:'b',x:'x'});
 let chosen=chooseLabel(m,a,'y');m.executed(a,chosen.choice);
 b=observe(m,'B',{c:'c',y:'y'});
 chosen=chooseLabel(m,b,'x');assert.equal(chosen.choice,'c');m.executed(b,chosen.choice);
 c=observe(m,'C',{a:'a',z:'z'});
 assert.equal(frontier(m,c).targets[chosen.id]?.nextChoice,'a');
 m.executed(c,'a');a=observe(m,'A',{b:'b',x:'x'});
 assert.equal(frontier(m,a).targets[chosen.id]?.nextChoice,'x');
});

test('a shared navigation destination on another page is a known route, not a new target',()=>{
 const m=new ExplorationMemory();
 const a=observe(m,'A',{ticket:'same-absolute-href'});m.executed(a,'ticket');
 observe(m,'Ticket',{conditions:'new-conditions'});
 const b=observe(m,'B',{ticket:'same-absolute-href',about:'untried-about'});
 const plan=frontier(m,b),labels=Object.values(plan.targets).map(t=>t.label);
 assert.ok(!labels.includes('ticket'),'a new source page must not reopen the same destination as fresh work');
 assert.ok(labels.includes('conditions'),'the shared edge still reaches untried work');
 assert.equal(Object.values(plan.targets).find(t=>t.label==='conditions')?.nextChoice,'ticket');
 assert.ok(labels.includes('about'));
});
