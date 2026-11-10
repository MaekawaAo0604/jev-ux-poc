// Throwaway probe adapter, not a production mode. No model answers are mocked.
// Keep the production explorer/decider/guards; vary only OCR and image grounding.
import {VisualDecisionContext} from '../../jev/visual-context.ts';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';

if(process.env.JEV_DIRECT_IMAGE_MODE==='off'){
 const evaluate=VisualDecisionContext.prototype.evaluate;
 VisualDecisionContext.prototype.evaluate=function(...args){
  // The production reader is lazy: replacing it here prevents either OCR engine
  // from starting. Empty proposals mean no verification requests or text notes.
  this.reader={recognize:async()=>[],close:async()=>{},diagnostics:()=>[{engine:'probe-ocr',status:'disabled'}]};
  return evaluate.apply(this,args);
 };
}

if(process.env.JEV_DIRECT_IMAGE_LABELS==='1'){
 const observe=PublicSitePage.prototype.observe,installed=new WeakSet();
 PublicSitePage.prototype.observe=async function(...args){
  const screen=await observe.apply(this,args),pom=this,page=this.page;
  if(!['127.0.0.1','localhost'].includes(new URL(page.url()).hostname))throw new Error('LOCAL_PROBE_ONLY');
  for(const element of screen.elements){
   if(element.unavailableReason==='UNOBSERVABLE_LABEL'&&this.observedPublicControls.get(element.id)?.kind==='link'){
    element.available=true;delete element.unavailableReason;
    element.description=`現在画像の候補番号 [${element.id}] のリンク。文字内容は画像を見て判断する`;
   }
  }
  if(!installed.has(page)){
   installed.add(page);const screenshot=page.screenshot.bind(page);
   page.screenshot=async options=>{
    const boxes=[];
    for(const [id,handle] of pom.targetHandles){
     try{const box=await handle.boundingBox();if(box)boxes.push({id,...box});}catch{}
    }
    await page.evaluate(boxes=>{
     for(const b of boxes){
      const badge=document.createElement('span');badge.dataset.directImageProbe='';badge.setAttribute('aria-hidden','true');
      badge.textContent=`[${b.id}]`;
      Object.assign(badge.style,{position:'fixed',left:`${Math.max(0,b.x)}px`,top:`${Math.max(0,b.y-30)}px`,background:'#ffe96b',color:'#111',font:'bold 23px monospace',padding:'1px 4px',zIndex:'2147483647',pointerEvents:'none'});
      document.body.append(badge);
     }
    },boxes);
    try{return await screenshot(options);}
    finally{await page.evaluate(()=>document.querySelectorAll('[data-direct-image-probe]').forEach(el=>el.remove()));}
   };
  }
  return screen;
 };
}
