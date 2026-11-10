import type {Page, Locator,ElementHandle} from 'playwright';
import {SCROLL_VIEWPORT_FRACTION,type Observation,type Action,type Candidate} from '../jev/types.js';
import {numberedScreenshot,type VisualTarget} from './visual-numbering.js';
import {visibleText} from './visible-text.js';
import {controlSelector,type PublicControl} from './controls.js';
import {inspectControl,type ControlObservation,type ObservedControl} from './control-observation.js';
import {describeTarget} from './action-target.js';
import type {RecordedAction} from '../runner/action-trace.js';

// Explicit PoC POM. No DOM-wide interactive-element discovery or route data is exposed.
export class AccountPage {
  protected labels:string[]=[];
  protected targets=new Map<string,Locator>();
  protected targetHandles=new Map<string,ElementHandle<Element>>();
  protected observedPublicControls=new Map<string,PublicControl>();
  protected observedControlPaths=new Map<string,number[]>();
  private pageIds=new Map<string,string>();
  constructor(public page:Page,protected vision=false,protected hashRoutes=false){
    // A navigation event also fires for hash/pushState changes, which preserve
    // selected nodes. Document replacement invalidates their execution context;
    // release our handles on the next observation (or when the page closes).
    page.on('close',()=>void this.clearTargets());
  }
  private async clearTargets(){
    const handles=[...this.targetHandles.values()];
    this.targets.clear();this.targetHandles.clear();this.observedPublicControls.clear();this.observedControlPaths.clear();
    await Promise.all(handles.map(handle=>handle.dispose().catch(()=>{})));
  }
  protected async targetElement(id:string){
    const handle=this.targetHandles.get(id);
    if(!handle||!await handle.evaluate(el=>el.isConnected))throw new Error('ACTION_ERROR: observed target was replaced or detached');
    return handle;
  }
  control(type:'link'|'button',label:string):Locator{
    if(!this.labels.includes(label))throw new Error(`Unknown POM control: ${label}`);
    return this.page.getByRole(type,{name:label,exact:true});
  }
  protected async controls():Promise<{locator:Locator;type:'link'|'button'}[]>{
    const controls:{locator:Locator;type:'link'|'button'}[]=[];
    for(const label of this.labels)for(const type of ['link','button'] as const){
      const matches=this.control(type,label);
      const count=await matches.count();
      for(let i=0;i<count;i++)controls.push({locator:matches.nth(i),type});
    }
    return controls;
  }
  async observe(font:boolean):Promise<Observation>{
    for(let attempt=0;;attempt++){
      try{
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.locator('body').waitFor({state:'attached'});
        return await this.observeReady(font);
      }catch(error){
        // Only retry observations invalidated by document replacement. Never
        // replay actions or turn an unavailable document into empty evidence.
        const message=error instanceof Error?error.message:'';
        if(attempt>=2||!/OBSERVATION_NOT_READY|Execution context was destroyed|Cannot find context with specified id/.test(message))throw error;
      }
    }
  }
  protected async observeReady(font:boolean):Promise<Observation>{
    await this.clearTargets();const elements:Observation['elements']=[];
    const {screen,controls}=await this.observeControls(font);
    for(const {locator,handle,type,text,fontSizePx,context,publicControl,identityPath} of controls){
      const id=`e${elements.length+1}`;
      elements.push({id,type,text,...(this.vision&&!text.trim()?{description:`現在画像の候補番号 [${id}] の操作。内容は画像を見て判断する`}:{}),...(font?{fontSizePx}:{}),...(context?{context}:{})});
      this.targets.set(id,locator);this.targetHandles.set(id,handle);
      if(publicControl)this.observedPublicControls.set(id,publicControl);
      if(identityPath)this.observedControlPaths.set(id,identityPath);
    }
    const url=new URL(this.page.url());
    // Opt in only for the bundled SPA: a hash is a route, not an anchor.
    if(this.hashRoutes)url.hash=url.hash||'#home';else url.hash='';
    const documentUrl=url.href;
    let pageId=this.pageIds.get(documentUrl);
    if(!pageId){pageId=`p${this.pageIds.size+1}`;this.pageIds.set(documentUrl,pageId);}
    return {...screen,pageId,elements};
  }
  protected async observeControls(font:boolean):Promise<ControlObservation>{
    const {controlLabels,controlContexts,...screen}=await this.page.evaluate(visibleText,{font,controlSelector});
    const controls:ObservedControl[]=[];
    try{
    for(const {locator,type} of await this.controls()){
      const handle=await locator.elementHandle();if(!handle)continue;
      let retained=false;
      try{
        const metadata=await handle.evaluate(inspectControl);if(!metadata)continue;
        const controlIndex=await handle.evaluate((el,selector)=>Array.from(document.querySelectorAll(selector)).indexOf(el),controlSelector);
        controls.push({locator,handle,type,text:controlLabels[controlIndex]||'',context:controlContexts[controlIndex],...metadata});retained=true;
      }finally{if(!retained)await handle.dispose();}
    }
    return {screen,controls};
    }catch(error){await Promise.all(controls.map(control=>control.handle.dispose().catch(()=>{})));throw error;}
  }
  async describeAction(action:Action,step:number):Promise<RecordedAction>{
    if(action.type==='done'||action.type==='stuck')throw new Error('TRACE_NOT_AN_OPERATION');
    const draft:RecordedAction={step,action:action.type,urlBefore:this.page.url()};
    if(action.type==='click'){
      const original=this.targets.get(action.elementId);if(!original)throw new Error('TRACE_TARGET_MISSING');
      const handle=await this.targetElement(action.elementId);
      const index=await this.page.locator(controlSelector).evaluateAll((elements,selected)=>elements.findIndex(el=>el===selected),handle);
      const locator=index<0?original:this.page.locator(controlSelector).nth(index);
      if(!await locator.evaluate((el,selected)=>el===selected,handle))throw new Error('TRACE_TARGET_CHANGED');
      draft.target=await describeTarget(locator,action.elementId);
      if(!await locator.evaluate((el,selected)=>el===selected&&el.isConnected,handle))throw new Error('TRACE_TARGET_CHANGED');
    }else if(action.type==='scroll')draft.value=action.direction;
    return draft;
  }
  async captureDecisionScreenshot(screen:Observation,candidates:Record<string,Candidate>,path?:string){
    const targets:VisualTarget[]=[];
    for(const element of screen.elements){
      const action=candidates[element.id]?.action;
      if(element.available===false||action?.type!=='click'||action.elementId!==element.id)continue;
      const handle=await this.targetElement(element.id),box=await handle.boundingBox();
      if(!box)throw new Error('ACTION_ERROR: observed target was replaced or detached');
      targets.push({id:element.id,...box});
    }
    return numberedScreenshot(this.page,targets,path);
  }
  async act(action:Action){
    if(action.type==='click'){
      const handle=await this.targetElement(action.elementId);
      await handle.click({timeout:5000});
    }else if(action.type==='back')await this.page.goBack({timeout:5000});
    else if(action.type==='scroll')await this.page.evaluate(({direction,fraction})=>window.scrollBy(0,(direction==='down'?1:-1)*innerHeight*fraction),{direction:action.direction,fraction:SCROLL_VIEWPORT_FRACTION});
    await this.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  }
}
export const sharedLabels=['暮らしクラウド','マイページ','マイページへ戻る','契約情報','お問い合わせ','請求書','メール通知を停止する','2026-09 の請求書をPDFで保存','2026-08 の請求書をPDFで保存','2026-07 の請求書をPDFで保存'];
