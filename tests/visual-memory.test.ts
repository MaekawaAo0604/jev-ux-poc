import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VisualDecisionContext} from '../jev/visual-context.js';
import {createVisualTextReader} from '../runner/visual-ocr.js';
import {chromium} from 'playwright';
import {jevVisualDecide} from '../jev/decide.js';
import {AutoPage} from '../pages/AutoPage.js';
const question={nextAction:{type:'choice' as const,instructions:'Choose next.',criteria:{done:'All conditions observed',stuck:'Insufficient'}}};
const line=(text:string)=>({id:'ocr-1',text,confidence:99,bbox:{x0:5,y0:10,x1:180,y1:40}});

test('literal image verification has no Goal, action history or old memory, and finishes before action selection',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{
  const b=JSON.parse(String(init?.body));
  sent.push(b);
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});
 };
 const memory=new VisualDecisionContext({recognize:async()=>[line('Observed hours')],close:async()=>{}});
 try{
  memory.capture(Buffer.from('current'),{step:1});
  await memory.evaluate({goal:'PRIVATE_GOAL',history:['OLD_HISTORY'],visualMemory:['OLDER_MEMO']},question);
  assert.equal(sent.length,2);assert.equal(sent[0].questions.nextAction,undefined);
  assert.doesNotMatch(JSON.stringify(sent[0].state),/PRIVATE_GOAL|OLD_HISTORY|OLDER_MEMO/);
  assert.ok(sent[1].state.context.visualMemory.some((n:any)=>n.text==='Observed hours'));
  assert.equal(memory.snapshot().visualMemory.length,1);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('DOM-observed text is not reverified or copied into image memory, but changed prices and image-only text still are',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));sent.push(b);return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':q.instructions.includes('1,200')?'rejected':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('月 額 料金 : 2,200 円'),line('月額料金：1,200円'),line('サポート：平日10時〜17時')],close:async()=>{}});
 try{
  const context={goal:'料金と時間',screen:{text:['現在の月額料金：2,200円（税込）'],elements:[]}};
  memory.capture(Buffer.from('current'),{step:1});await memory.evaluate(context,question);
  assert.equal(sent.length,2);
  assert.deepEqual(sent[1].state.context.screen.text,['現在の月額料金：2,200円（税込）']);
  assert.equal(Object.keys(sent[0].questions).filter(id=>id.startsWith('visual_note_')).length,2,'only independently observed DOM text is redundant');
  assert.deepEqual(memory.snapshot().visualMemory.map(n=>n.text),['サポート：平日10時〜17時']);
  assert.equal(memory.snapshot().checks?.find(p=>p.text.includes('2,200'))?.assessment,'dom-observed');
  assert.equal(memory.snapshot().checks?.find(p=>p.text.includes('1,200'))?.assessment,'rejected');
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('a second OCR engine does not add conflicting duplicates over a text line already verified in the same frame',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));sent.push(b);return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('サポート受付'),{...line('サポ-ト受付'),engine:'windows-media-ocr'},{...line('別の画像情報'),engine:'windows-media-ocr',bbox:{x0:200,y0:10,x1:400,y1:40}}],close:async()=>{}});
 try{
  memory.capture(Buffer.from('current'),{step:1});await memory.evaluate({},question);
  assert.deepEqual(memory.snapshot().visualMemory.map(n=>n.text),['サポート受付','別の画像情報']);
  assert.equal(memory.snapshot().checks?.find(p=>p.text==='サポ-ト受付')?.assessment,'covered-by-confirmed-text');
  const instructions=sent.flatMap(b=>Object.values(b.questions).map((q:any)=>q.instructions)).join('\n');
  assert.doesNotMatch(instructions,/サポ-ト受付/);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('native fallback does not reinterpret a text region already grounded by the current DOM',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));sent.push(b);return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('現在の料金とサポート'),{...line('現 在 の 料 金 と サ ポ - ト'),engine:'windows-media-ocr'}],close:async()=>{}});
 try{
  memory.capture(Buffer.from('current'),{step:1});await memory.evaluate({screen:{text:['現在の料金とサポート'],elements:[]}},question);
  assert.equal(memory.snapshot().visualMemory.length,0,'visible DOM is retained in ordinary history, not reinterpreted by fallback OCR');
  assert.equal(sent.length,1,'no image re-verification is needed for this known region');
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('current DOM regions prevent OCR spelling changes while distinct image-only text still gets verified',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));sent.push(b);return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('サポ-ト受付：平日10時17時'),{...line('画像だけの料金：2,200円'),bbox:{x0:200,y0:100,x1:500,y1:140}}],close:async()=>{}});
 try{
  const screen={text:['サポート受付：平日10時〜17時'],elements:[],regions:[{id:'t1',source:'dom',text:'サポート受付：平日10時〜17時',bbox:{x0:0,y0:5,x1:190,y1:45},fragments:[{x0:0,y0:5,x1:190,y1:45}]}]};
  memory.capture(Buffer.from('current'),{step:1});await memory.evaluate({screen},question);
  assert.deepEqual(memory.snapshot().visualMemory.map(n=>n.text),['画像だけの料金：2,200円']);
  assert.doesNotMatch(JSON.stringify(sent[0].questions),/サポ-ト/);
  assert.equal(memory.snapshot().checks?.[0].assessment,'dom-covered');
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('a DOM bounding-box hole or a mixed image/DOM OCR line cannot be excluded as DOM',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('Image inside hole'),{...line('DOM and image together'),bbox:{x0:150,y0:50,x1:350,y1:70}}],close:async()=>{}});
 try{
  memory.capture(Buffer.from('current'),{step:1});
  await memory.evaluate({screen:{text:['First Last'],elements:[],regions:[{id:'t1',source:'dom',text:'First Last',bbox:{x0:0,y0:0,x1:400,y1:300},fragments:[{x0:0,y0:50,x1:180,y1:75},{x0:0,y0:250,x1:200,y1:275}]}]}},question);
  assert.deepEqual(memory.snapshot().visualMemory.map(n=>n.text),['Image inside hole','DOM and image together']);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('private DOM fragments survive compact action input but expire with the current capture',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>[line('Different OCR spelling')],close:async()=>{}});
 try{
  memory.capture(Buffer.from('first'),{step:1},{regions:[{id:'t1',source:'dom',text:'Actual DOM text',bbox:{x0:0,y0:0,x1:200,y1:50},fragments:[{x0:0,y0:0,x1:200,y1:50}]}]});
  await memory.evaluate({screen:{text:['Actual DOM text'],elements:[]}},question);
  assert.equal(memory.snapshot().checks?.[0].assessment,'dom-covered');assert.equal(memory.snapshot().visualMemory.length,0);
  memory.capture(Buffer.from('replacement'),{step:2});await memory.evaluate({screen:{text:[],elements:[]}},question);
  assert.equal(memory.snapshot().visualMemory.length,1,'previous frame geometry cannot hide current image-only content');
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('same-node DOM whitespace cannot hide image-only text underneath the spaces',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 globalThis.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const browser=await chromium.launch();const memory=new VisualDecisionContext({recognize:async()=>[{...line('Image-only'),bbox:{x0:92,y0:3,x1:169,y1:17}}],close:async()=>{}});
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});
  await page.setContent('<style>body{margin:0}p{position:absolute;left:0;top:0;margin:0;z-index:1;white-space:pre;font:20px monospace}canvas{position:absolute;left:90px;top:0}</style><canvas width="180" height="30"></canvas><p>First                   Last</p><script>const g=document.querySelector("canvas").getContext("2d");g.font="16px sans-serif";g.fillText("Image-only",2,16);</script>');
  const screen=await new AutoPage(page).observe(false);assert.deepEqual(screen.text,['First Last']);
  memory.capture(await page.screenshot(),{step:1},screen);
  await memory.evaluate({screen:{text:screen.text,elements:[]}},question);
  assert.deepEqual(memory.snapshot().visualMemory.map(n=>n.text),['Image-only'],'DOM spaces are not an observed text coverage mask');
 }finally{await memory.close();await browser.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});

test('wire input pools repeated frame provenance without dropping any text, boxes or changed-image sources',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let last:any;
 globalThis.fetch=async(_url,init)=>{last=JSON.parse(String(init?.body));return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(last.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async bytes=>Array.from({length:20},(_,i)=>({...line(`${bytes.toString()}-${i}`),id:`ocr-${i}`})),close:async()=>{}});
 try{
  for(const sha256 of ['original','replacement']){memory.capture(Buffer.from(sha256),{step:1,url:'https://fixture.test/',pageId:'p1',sha256,viewport:{top:0,bottom:1000,height:1000}});await memory.evaluate({},question);}
  memory.capture(Buffer.from('third'),{step:2});await memory.evaluate({},question);
  const input=last.state.context;
  assert.equal(Object.keys(input.visualSources??{}).length,3,'each distinct captured source is represented once, even when step IDs repeat');
  const expanded=input.visualMemory.map((note:any)=>({...note,source:{...input.visualSources[note.source.reference],bbox:note.source.bbox}}));
  assert.deepEqual(expanded,memory.snapshot().visualMemory.slice(0,expanded.length));
  assert.equal(expanded.filter((n:any)=>n.source.sha256==='original').length,20);
  assert.equal(expanded.filter((n:any)=>n.source.sha256==='replacement').length,20);
  assert.ok(Buffer.byteLength(JSON.stringify({visualMemory:input.visualMemory,visualSources:input.visualSources}))<Buffer.byteLength(JSON.stringify(expanded))*.8,'repeated provenance is factored, not truncated');
  assert.equal(Object.keys(last.assets).length,1);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
test('only image-confirmed OCR candidates survive into later decisions, never past image bytes or rejected text',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';
 const sent:any[]=[];
 globalThis.fetch=async(_url,init)=>{
  const b=JSON.parse(String(init?.body));sent.push(b);
  return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id.startsWith('visual_note_')?(q.instructions.includes('99,999')?'rejected':'confirmed'):'stuck';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});
 };
 const extractor={recognize:async(bytes:Buffer)=>bytes.toString()==='first'?[line('月額料金：1,200円（税込）'),{...line('月額料金：99,999円'),id:'ocr-2'}]:[],close:async()=>{}};
 const memory=new VisualDecisionContext(extractor);
 try{
  memory.capture(Buffer.from('first'),{step:1,url:'http://fixture.test/',pageId:'p1',sha256:'first-hash'});
  await memory.evaluate({goal:'料金と時間',screen:{text:[]}},question);
  memory.capture(Buffer.from('second'),{step:2,url:'http://fixture.test/time',pageId:'p2',sha256:'second-hash'});
  await memory.evaluate({goal:'料金と時間',screen:{text:[]}},question);
  assert.equal(Object.keys(sent.at(-1).assets).length,1,'past images must leave the inference input');
  assert.equal((Object.values(sent.at(-1).assets)[0] as any).data_base64,Buffer.from('second').toString('base64'));
  const notes=sent.at(-1).state.context.visualMemory;
  assert.deepEqual(notes.map((n:any)=>n.text),['月額料金：1,200円（税込）']);
  const source=sent.at(-1).state.context.visualSources[notes[0].source.reference];
  assert.equal(notes[0].assessment,'confirmed');assert.equal(source.step,1);assert.equal(source.url,'http://fixture.test/');assert.equal(source.sha256,'first-hash');
  assert.doesNotMatch(JSON.stringify(sent.at(-1).state),/99,999/);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
test('all OCR verification batches retain response accounting, including partial work before a later failure',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;const b=JSON.parse(String(init?.body));if(calls===5)return new Response('PRIVATE_ERROR',{status:401});return Response.json({model:'TEST',usage:{input_tokens:calls*100},answers:Object.fromEntries(Object.entries(b.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async()=>Array.from({length:9},(_,i)=>({...line(`Line ${i}`),id:`ocr-${i}`})),close:async()=>{}});
 try{
  memory.capture(Buffer.from('one'),{step:1});await memory.evaluate({},question);
  const records=memory.snapshot().requests;
  assert.equal(records.length,3);assert.deepEqual(records.map((r:any)=>r.usage?.inputTokens),[100,200,300]);
  assert.deepEqual(records.map(r=>r.stage),['verification','verification','decision']);
  assert.ok(records[1].answers?.visual_note_8);
  memory.capture(Buffer.from('two'),{step:2});await assert.rejects(memory.evaluate({},question));
  const later=memory.snapshot().requests;assert.equal(later.length,5);assert.equal(later[4].status,'error');assert.equal(later[4].error?.statusCode,401);
  assert.equal(memory.snapshot().visualMemory.length,17,'confirmed first batch survives a later failure');
  assert.doesNotMatch(JSON.stringify(later),/PRIVATE_ERROR/);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
test('the direct visual-decider API closes only the context it owns on success and error',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY,close=VisualDecisionContext.prototype.close;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';let closes=0;
 VisualDecisionContext.prototype.close=async function(){closes++;await close.call(this);};
 const state:any={goal:'Read',currentDate:'2026-10-16',screen:{title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false},history:[]};
 const candidates:any={stuck:{action:{type:'stuck'},label:'Stop'}};
 try{
  globalThis.fetch=async()=>Response.json({model:'TEST',answers:{nextAction:{choice:'stuck',probabilities:{stuck:1}}}});
  await jevVisualDecide(state,candidates,Buffer.from('invalid-png'));assert.equal(closes,1);
  globalThis.fetch=async()=>new Response('Unavailable',{status:401});
  await assert.rejects(jevVisualDecide(state,candidates,Buffer.from('invalid-png')));assert.equal(closes,2);
 }finally{globalThis.fetch=previous;VisualDecisionContext.prototype.close=close;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
test('OCR proposes the rendered Japanese price without guessed character or numeric repairs',async()=>{
 const browser=await chromium.launch(),reader=createVisualTextReader();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.setContent('<style>body{margin:0;background:#f4f6fa;color:#142e40;font:24px sans-serif}main{padding:24px 48px}h1{font-size:28px}canvas{position:absolute;left:48px;top:100px;background:white}</style><main><h1>ご利用案内</h1></main><canvas width="1250" height="330"></canvas>');
  await page.evaluate(()=>{const g=document.querySelector('canvas')!.getContext('2d')!;g.fillStyle='#142e40';g.font='38px sans-serif';g.fillText('月額料金：1,200円（税込）',36,80);});
  const lines=await reader.recognize(await page.screenshot());
  assert.ok(lines.some(l=>l.text.normalize('NFKC').replace(/\s/g,'')==='月額料金:1,200円(税込)'),JSON.stringify(lines.map(l=>l.text)));
 }finally{await reader.close();await browser.close();}
});

test('OCR proposes complete Japanese reception hours from pixels without replacing a misread range separator', {skip:process.platform!=='win32'},async()=>{
 const browser=await chromium.launch(),reader=createVisualTextReader();
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.setContent('<style>body{margin:0;background:#f4f6fa;color:#142e40;font:24px sans-serif}main{padding:24px 48px}h1{font-size:28px}canvas{position:absolute;left:48px;top:100px;background:white}</style><main><h1>ご利用案内</h1></main><canvas width="1250" height="330"></canvas>');
  await page.evaluate(()=>{const g=document.querySelector('canvas')!.getContext('2d')!;g.fillStyle='#142e40';g.font='38px sans-serif';g.fillText('サポート受付：平日10時〜17時',36,80);});
  const lines=await reader.recognize(await page.screenshot());
  assert.ok(lines.some(l=>l.text.normalize('NFKC').replace(/\s/g,'').replace(/[〜～]/g,'~')==='サポート受付:平日10時~17時'),JSON.stringify(lines.map(l=>l.text)));
 }finally{await reader.close();await browser.close();}
});
test('forty observations preserve the earliest confirmed text while each request contains one image',async()=>{
 const previous=globalThis.fetch,key=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='LOCAL_TEST_ONLY';const counts:number[]=[];let last:any;
 globalThis.fetch=async(_url,init)=>{last=JSON.parse(String(init?.body));counts.push(Object.keys(last.assets).length);return Response.json({model:'TEST',answers:Object.fromEntries(Object.entries(last.questions).map(([id,q]:[string,any])=>{const choice=id==='nextAction'?'stuck':'confirmed';return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});};
 const memory=new VisualDecisionContext({recognize:async bytes=>[line(`Observed ${bytes.toString()}`)],close:async()=>{}});
 try{
  for(let step=1;step<=40;step++){memory.capture(Buffer.from(String(step)),{step,url:`http://fixture.test/${step}`});await memory.evaluate({},question);}
  assert.deepEqual(counts,Array(80).fill(1));assert.equal(last.state.context.visualMemory.length,40);
  assert.equal(last.state.context.visualMemory[0].text,'Observed 1');assert.equal(last.state.context.visualSources[last.state.context.visualMemory[0].source.reference].step,1);
  assert.equal(memory.snapshot().observations.length,1);assert.equal(memory.snapshot().visualMemory.length,40);
  assert.doesNotMatch(JSON.stringify(memory.snapshot()),/data_base64/);
 }finally{await memory.close();globalThis.fetch=previous;if(key===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=key;}
});
