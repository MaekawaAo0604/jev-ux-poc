import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ImageOnlyInput} from '../jev/image-only-input.js';

const questions={nextAction:{type:'choice' as const,instructions:'DOM_SENTINEL',criteria:{scroll_up:'DOM_SENTINEL',back:'DOM_SENTINEL',stuck:'DOM_SENTINEL'}}};
const frame=(step:number,top:number,pageId='private:DOM_SENTINEL')=>({step,pageId,viewport:{top,bottom:top+1000,height:1000}});

test('image-only decisions retain numeric scroll coverage across staggered viewports without sending DOM text',()=>{
 const input=new ImageOnlyInput();
 for(const [i,y] of [0,700,1400,2100].entries())input.record({type:'scroll',direction:'down'},frame(i+1,y));
 const request=input.request({goal:'Find both answers',currentDate:'2026-10-19',screen:{text:['DOM_SENTINEL']},targets:{f1:{kind:'scroll',direction:'up',pageId:'private:DOM_SENTINEL',viewport:{top:2100,bottom:3100,height:1000},travelSteps:1},f2:{kind:'scroll',direction:'up',pageId:'another:DOM_SENTINEL',viewport:{top:2100,bottom:3100,height:1000},travelSteps:1}}},questions,frame(5,2625));
 const wire=JSON.parse(JSON.stringify(request));
 assert.deepEqual(wire.context.screen.scrollCoverage,{up:'observed',down:'unobserved'});
 assert.equal(wire.context.targets.f1.scrollCoverage,'observed');
 assert.equal(wire.context.targets.f2.scrollCoverage,'unobserved','another document cannot borrow this document\'s ranges');
 assert.deepEqual(wire.context.history[0].viewport,{top:0,bottom:1000,height:1000});
 assert.ok(!JSON.stringify(wire).includes('DOM_SENTINEL'));
 // This is a positional hint, not a ban on rereading or a fabricated success.
 assert.deepEqual(Object.keys(wire.questions.nextAction.criteria),['scroll_up','back','stuck']);
});

test('a gap, missing history or invalid geometry cannot mark an image scroll destination observed',()=>{
 for(const prior of [undefined,{top:0,bottom:1000,height:1000},{top:300,bottom:1000,height:1}]){
  const input=new ImageOnlyInput();
  input.record({type:'scroll',direction:'down'},{step:1,pageId:'page',...(prior?{viewport:prior}:{})});
  const wire=JSON.parse(JSON.stringify(input.request({goal:'Find answers'},questions,{step:2,pageId:'page',viewport:{top:1400,bottom:2400,height:1000}})));
  assert.equal(wire.context.screen.scrollCoverage?.up,'unobserved');
 }
 const input=new ImageOnlyInput();
 const wire=JSON.parse(JSON.stringify(input.request({goal:'Find answers'},questions,{step:1,pageId:'page',viewport:{top:1400,bottom:2400,height:1}})));
 assert.equal(wire.context.screen.scrollCoverage,undefined);
});
