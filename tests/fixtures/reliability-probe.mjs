// Measurement only. Production observations/actions and real API responses are
// forwarded unchanged. Truth lives here, never in the Jev input.
import {createHash} from 'node:crypto';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
import {matchesVisualText} from '../../runner/reliability-source.ts';
import {PNG} from 'pngjs';
const oracle=JSON.parse(process.env.JEV_RELIABILITY_ORACLE),emit=(event,value)=>console.log('RELIABILITY '+JSON.stringify({event,...value}));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const installed=new WeakSet(),captures=new Map(),captureSteps=new Map(),seen=new Set(),history=[];let step=0;
const capturedPixels=new Map();
const observe=PublicSitePage.prototype.observe,act=PublicSitePage.prototype.act;
PublicSitePage.prototype.observe=async function(...args){
 const screen=await observe.apply(this,args),pom=this,page=this.page;
 if(!installed.has(page)){
  installed.add(page);const screenshot=page.screenshot.bind(page);
  page.screenshot=async options=>{
   const bytes=await screenshot(options),match=String(options?.path??'').match(/step-(\d+)\.png$/);
   if(!match)return bytes;step=Number(match[1]);
   const snapshot=await page.evaluate(()=>{
    const full=r=>r.width>0&&r.height>0&&r.top>=0&&r.left>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;
    const probes=[...document.querySelectorAll('[data-probe]')].flatMap(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el),hidden=s.display==='none'||s.visibility==='hidden'||s.opacity==='0';
     const outside=r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth;
     if(!hidden&&!outside&&!full(r))return []; // Partially clipped text is not a full-text oracle.
     return [{id:el.dataset.probe,kind:el.matches('a,summary')?'control':'text',text:el.textContent.trim(),visible:!hidden&&full(r),fact:el.dataset.fact,bbox:{x0:r.left,y0:r.top,x1:r.right,y1:r.bottom}}];
    });
    const facts=probes.filter(p=>p.visible&&p.fact).map(p=>p.fact);
    for(const canvas of document.querySelectorAll('canvas')){
     const rect=canvas.getBoundingClientRect(),g=canvas.getContext('2d'),lines=JSON.parse(canvas.dataset.lines);
     lines.forEach((line,i)=>{const m=g.measureText(line.text),box={left:rect.left+36-m.actualBoundingBoxLeft,right:rect.left+36+m.actualBoundingBoxRight,top:rect.top+80+i*75-m.actualBoundingBoxAscent,bottom:rect.top+80+i*75+m.actualBoundingBoxDescent,width:m.width,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent};if(full(box))facts.push(line.id);});
    }
    return {probes,facts,viewport:{top:scrollY,bottom:scrollY+innerHeight,height:innerHeight}};
   });
   for(const [candidateId,handle] of pom.targetHandles){
    const id=await handle.evaluate(el=>el.getAttribute('data-probe'));const probe=snapshot.probes.find(p=>p.id===id);if(probe)probe.candidateId=candidateId;
   }
   const record={step,sha256:digest(bytes),...snapshot};captures.set(record.sha256,record);capturedPixels.set(record.sha256,bytes);captureSteps.set(step,record);record.facts.forEach(f=>seen.add(f));emit('capture',record);return bytes;
  };
 }
 return screen;
};
PublicSitePage.prototype.act=async function(action){
 const page=this.page,before=await page.evaluate(()=>({url:location.href,y:scrollY}));let expectedUrl,effectCorrect;
 let probe;
 if(action.type==='click')probe=await this.targetHandles.get(action.elementId)?.evaluate(el=>el.getAttribute('data-probe'));
 const effect=oracle.effects[probe];
 if(effect?.path)expectedUrl=new URL(effect.path,before.url).href;
 if(action.type==='back')expectedUrl=history.at(-1);
 try{
  await act.call(this,action);
  const after=await page.evaluate(()=>({url:location.href,y:scrollY}));
  if(action.type==='back'&&after.url===expectedUrl)history.pop();
  else if(effect?.path&&expectedUrl!==before.url&&after.url===expectedUrl)history.push(before.url);
  if(action.type==='scroll')effectCorrect=action.direction==='down'?after.y>before.y:after.y<before.y;
  if(effect?.details)effectCorrect=await page.locator(effect.details).evaluate(el=>el.open===true);
  emit('effect',{step,action,expectedUrl,actualUrl:after.url,effectCorrect});
 }catch(error){emit('effect',{step,action,expectedUrl,error:'ACTION_FAILED'});throw error;}
};
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)!=='https://ai-gateway.vercel.sh/typesafe/v1/systemone')return original(url,options);
 const body=JSON.parse(options.body),context=body.state.context??body.state;
 const kind=body.questions.completionCoverage?'completion':body.questions.nextAction?(context.screen?'screen':'frontier'):Object.keys(body.questions).some(id=>id.startsWith('visual_note_'))?'memory':'audit';
 const imageHashes=Object.values(body.assets??{}).map(asset=>digest(Buffer.from(asset.data_base64,'base64')));
 let derivedImagesVerified;
 const extras=Object.entries(body.assets??{}).filter(([id])=>id!==body.state.screenshot);
 if(kind!=='audit'&&extras.length){
  derivedImagesVerified=false;
  try{
   const detail=body.state.detail,rect=detail.rect,capture=captureSteps.get(step),original=capturedPixels.get(capture.sha256);
   if(extras.length!==1||extras[0][0]!==body.state.detailScreenshot||detail.sourceSha256!==capture.sha256||![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger))throw new Error('Bad detail source');
   const source=PNG.sync.read(original),image=PNG.sync.read(Buffer.from(extras[0][1].data_base64,'base64'));
   if(rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>source.width||rect.y+rect.height>source.height||image.width<280||image.height<280||image.width>1568||image.height>1568)throw new Error('Bad detail bounds');
   derivedImagesVerified=true;
   for(let y=0;y<image.height&&derivedImagesVerified;y++)for(let x=0;x<image.width&&derivedImagesVerified;x++){
    const a=(y*image.width+x)*4,b=((rect.y+Math.floor(y*rect.height/image.height))*source.width+rect.x+Math.floor(x*rect.width/image.width))*4;
    for(let c=0;c<4;c++)if(image.data[a+c]!==source.data[b+c]){derivedImagesVerified=false;break;}
   }
  }catch{}
 }
 const text=[...(context.screen?.text??[]),...(context.history??[]).flatMap(h=>h.observedText??[])].join('\n');
 // Only typography/spacing equivalence, never repair missing characters or digits.
 const canonical=text=>text.normalize('NFKC').replace(/\s/g,'').replace(/[〜～]/g,'~');
 const notes=(context.visualMemory??[]).map(note=>({...note,source:note.source?.reference?{...context.visualSources?.[note.source.reference],bbox:note.source.bbox}:note.source}));
 const noteSource=note=>{const source=captureSteps.get(note.source?.step);return source&&source.sha256===note.source?.sha256?source:undefined;};
 const memoryChecks=notes.map(note=>{const source=noteSource(note),facts=source?oracle.facts.filter(f=>source.facts.includes(f.id)).map(f=>f.text):[];return {ok:note.assessment==='confirmed'&&!!source&&matchesVisualText(note.text,note.source.bbox,source.probes,facts),code:'VISUAL_NOTE_NOT_IN_SOURCE'};});
 const availableFacts=oracle.facts.filter(f=>text.includes(f.text)||imageHashes.some(hash=>captures.get(hash)?.facts.includes(f.id))||notes.some((note,i)=>memoryChecks[i].ok&&noteSource(note).facts.includes(f.id)&&canonical(note.text)===canonical(f.text))).map(f=>f.id);
 const imageBytes=Object.values(body.assets??{}).reduce((sum,asset)=>sum+Buffer.from(asset.data_base64,'base64').length,0);
 emit('wire',{step,kind,imageHashes,imageBytes,requestBytes:Buffer.byteLength(options.body),memoryChecks,seenFacts:[...seen],availableFacts,oracleLeaked:JSON.stringify(body.state).includes(oracle.marker),...(derivedImagesVerified===undefined?{}:{derivedImagesVerified})});
 if(process.env.JEV_RELIABILITY_FAKE==='1')return Response.json({model:'RELIABILITY_TEST_DOUBLE',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>{const choice=id==='nextAction'?'stuck':id==='readability'?'readable':id==='relevance'?'related':id==='completion'?'insufficient':id==='completionCoverage'?'incomplete':Object.keys(q.criteria)[0];return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))});
 return original(url,options);
};
