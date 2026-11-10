import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {run} from '../runner/engine.js';
import {experimentDecider,parseCharter,parsePersona,publicExploration} from '../jev/persona.js';
import type {ChoiceEvaluator} from '../jev/client.js';

test('persona engine connects existing frontier recovery; persona survives secondary selection',async()=>{
 const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8'))),persona=parsePersona(JSON.parse(await readFile('experiments/persona/persona-a.json','utf8')));
 const browser=await chromium.launch({headless:true});const root=await mkdtemp(join(tmpdir(),'jev-persona-memory-'));
 const html=`<!doctype html><meta charset="utf-8"><script>let stopped=false;function render(){const r=location.hash.slice(1)||'home';document.body.innerHTML=r==='home'?'<h1>Menu</h1><a href="#wrong">Wrong</a><a href="#answer">Answer</a>':r==='wrong'?'<h1>Dead end</h1><a href="#home">Menu</a>':'<h1>Answer</h1>'+(stopped?'<p role="status">メール通知を停止しました</p>':'<button onclick="stopped=true;render()">Stop</button>');}addEventListener('hashchange',render);addEventListener('DOMContentLoaded',render);</script><body></body>`;
 try{
  for(const enabled of [false,true]){
   const context=await browser.newContext(),page=await context.newPage();await context.route('http://local.test/**',r=>r.fulfill({contentType:'text/html',body:html}));
   let secondary=0;
   const evaluate:ChoiceEvaluator=async(input:any,questions)=>{
    assert.equal(input.exploration.persona.id,'A');assert.ok(!('oracle' in input.exploration.charter));
    const criteria=questions.nextAction.criteria;
    let choice:string;
    if(input.targets){secondary++;choice=Object.keys(input.targets).find(k=>input.targets[k].label==='「Answer」をクリック')!;assert.ok(choice);}
    else if(input.screen.title==='Menu')choice=Object.keys(criteria).find(k=>criteria[k].includes('Wrong'))??Object.keys(criteria).find(k=>criteria[k].includes('Answer'))!;
    else if(input.screen.title==='Dead end')choice=enabled?'stuck':Object.keys(criteria).find(k=>criteria[k].includes('Menu'))??'back';
    else choice=input.screen.text.some((s:string)=>s.includes('停止しました'))?'done':Object.keys(criteria).find(k=>criteria[k].includes('Stop'))!;
    return {model:'TEST',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const selected=id==='decisionBasis'?'goal':choice;return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===selected?1:0]))}];}))};
   };
   const result=await run(page,experimentDecider(evaluate),{variant:'good',goal:'notifications',font:false,maxActions:12,dir:join(root,String(enabled)),baseURL:'http://local.test',repeat:1,fake:true,pom:'auto',success:'both',pageIdentity:'hash-route',explorationMemory:enabled,exploration:publicExploration({charter,persona})});
   if(enabled){assert.equal(result.reason,'SUCCESS');assert.equal(result.objectiveSuccess,true);assert.ok(secondary>0);assert.ok(result.steps.some(s=>s.decision.frontier?.mode==='continue'));assert.ok(result.steps.every(s=>s.explorationMemory));assert.ok(!JSON.stringify(result.steps.map(s=>s.state)).includes('http://local.test'));}
   else{assert.equal(result.reason,'LOOP');assert.equal(result.objectiveSuccess,false);assert.equal(secondary,0);}
   await context.close();
  }
 }finally{await browser.close();}
});

test('memory-enabled runner permits a shared hop for three distinct untried targets',async()=>{
 const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));
 const browser=await chromium.launch({headless:true}),root=await mkdtemp(join(tmpdir(),'jev-shared-hop-'));
 const html=`<!doctype html><meta charset="utf-8"><script>let stopped=false;function render(){const r=location.hash.slice(1)||'home';document.body.innerHTML=r==='home'?'<h1>Home</h1><a href="#hub">Hub</a>':r==='hub'?'<h1>Hub</h1><a href="#room1">Room1</a><a href="#room2">Room2</a><a href="#room3">Room3</a><a href="#stop">Stop</a>':r==='stop'?'<h1>Stop</h1>'+(stopped?'<p role="status">メール通知を停止しました</p>':'<button onclick="stopped=true;render()">Confirm</button>'):'<h1>'+r+'</h1><a href="#home">Home</a>';}addEventListener('hashchange',render);addEventListener('DOMContentLoaded',render);</script><body></body>`;
 try{
  const page=await browser.newPage();await page.route('http://local.test/**',r=>r.fulfill({contentType:'text/html',body:html}));let visited=0;
  const result=await run(page,async(state,candidates,options)=>{
   const label=state.screen.title==='Home'?'Hub':state.screen.title==='Hub'?(visited<3?'Room'+(++visited):'Stop'):state.screen.title==='Stop'?'Confirm':'Home';
   const choice=state.screen.text.some(t=>t.includes('停止しました'))?'done':Object.keys(candidates).find(id=>candidates[id].label===`「${label}」をクリック`)!;assert.ok(choice,`${state.screen.title}: ${label}`);
   const targetLabel=state.screen.title==='Home'?(visited<3?'Room'+(visited+1):'Stop'):label;
   const target=Object.entries(options?.frontier?.targets??{}).find(([,t])=>t.label===`「${targetLabel}」をクリック`&&t.nextChoice===choice);
   return {choice,action:candidates[choice].action,probabilities:{[choice]:1},model:'TEST',...(target?{frontier:{targetId:target[0],label:target[1].label,focus:'test distinct targets',mode:'select' as const,probabilities:{[target[0]]:1}}}:{})};
  },{variant:'good',goal:'notifications',font:false,maxActions:20,dir:root,baseURL:'http://local.test',repeat:1,fake:true,pom:'auto',success:'both',pageIdentity:'hash-route',explorationMemory:true,exploration:publicExploration({charter})});
  assert.equal(result.reason,'SUCCESS');assert.equal(result.objectiveSuccess,true);
  const shared=result.steps.filter(s=>s.state.screen.title==='Home'&&s.url.endsWith('#home'));
  assert.equal(shared.length,3);assert.equal(new Set(shared.map(s=>s.decision.frontier?.targetId)).size,3);
  assert.ok(shared.some(s=>s.loopCheck.occurrence===3));assert.ok(shared.every(s=>s.loopCheck.blocked===false));
 }finally{await browser.close();}
});
