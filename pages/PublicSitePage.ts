import type {Action} from '../jev/types.js';
import {AutoPage} from './AutoPage.js';
import {publicControl,disclosureOpen} from './controls.js';
import type {Request,Page,CDPSession} from 'playwright';

const documentURL=(value:string)=>{const url=new URL(value);url.hash='';return url.href;};
type HistoryEntry={id:number;url:string};
type NavigationHistory={currentIndex:number;entries:HistoryEntry[]};
const sameEntry=(a:HistoryEntry|undefined,b:HistoryEntry|undefined)=>!!a&&!!b&&a.id===b.id&&a.url===b.url;

/** Direct link navigation and narrowly classified, network-blocked disclosures. */
export class PublicSitePage extends AutoPage {
  protected classifyNative=true;
  constructor(page:Page,private resolveNavigation:(url:string)=>Promise<string>=async url=>url,private releaseNavigation:()=>Promise<void>=async()=>{}){super(page);}
  private localOnly=false;
  private prepared?:Promise<void>;
  private pendingNavigation?:{url:string;request?:Request};
  private previousEntries:HistoryEntry[]=[];
  private currentEntry?:HistoryEntry;
  private historyChanged=false;
  private historyClient?:Promise<CDPSession>;
  private blockedForm=false;
  get canGoBack(){return !this.historyChanged&&this.previousEntries.length>0;}
  get explorationNavigationChoices(){
    const current=documentURL(this.page.url());
    // Same-document fragments (including an empty '#') preserve DOM state.
    // Only new-document navigation may share a destination across sources.
    return [...this.observedPublicControls].filter(([,control])=>control.kind==='link'&&!(control.href.includes('#')&&documentURL(control.href)===current)).map(([id])=>id);
  }
  // Cached classification only: this adds no per-control browser calls, and
  // these execution identities must never be copied into the model's State.
  get explorationActionKeys():Record<string,string>{
    const keys:Record<string,string>={scroll_up:'scroll:up',scroll_down:'scroll:down'};
    for(const [id,control] of this.observedPublicControls){
      if(control.kind==='link')keys[id]=JSON.stringify(['link',control.href]);
      else if(control.kind==='disclosure')keys[id]=JSON.stringify(['disclosure',this.observedControlPaths.get(id),control.open]);
    }
    if(this.canGoBack)keys.back=JSON.stringify(['back',this.previousEntries.at(-1)!.id]);
    return keys;
  }
  private async navigationHistory():Promise<NavigationHistory>{
    try{
      const client=await(this.historyClient??=this.page.context().newCDPSession(this.page));
      const history=await client.send('Page.getNavigationHistory');
      if(!history.entries[history.currentIndex])throw new Error();
      return history;
    }catch{throw new Error('SAFETY_BOUNDARY: browser history unavailable');}
  }
  prepare(){
    return this.prepared??=(async()=>{
      await this.page.exposeBinding('__jevFormBlocked',()=>{this.blockedForm=true;});
      await this.page.context().addInitScript(()=>{
        window.addEventListener('securitypolicyviolation',event=>{
          if(event.effectiveDirective==='form-action')void (window as any).__jevFormBlocked();
        });
      });
      const guard=async(route:import('playwright').Route)=>{
        if(!this.localOnly)return route.fallback();
        const request=route.request(),pending=this.pendingNavigation;
        if(pending&&request.isNavigationRequest()&&request.frame()===this.page.mainFrame()&&request.method()==='GET'&&request.url()===pending.url&&(!pending.request||pending.request===request)){
          pending.request=request;return route.fallback();
        }
        return route.abort();
      };
      // Both are needed: page routes have priority, while popups start at context level.
      await this.page.context().route('**/*',guard);
      await this.page.route('**/*',guard);
      await this.page.context().routeWebSocket('**/*',socket=>socket.close());
      this.page.context().on('page',popup=>{if(popup!==this.page)void popup.close().catch(()=>{});});
      this.page.on('dialog',dialog=>void dialog.dismiss().catch(()=>{}));
      this.page.on('download',download=>void download.cancel().catch(()=>{}));
    })();
  }
  async observe(font:boolean){
    await this.prepare();
    this.assertSafe();
    // Establish the first observed source once; later observations must not
    // authorize history entries inserted by unobserved page scripts.
    if(!this.currentEntry){const history=await this.navigationHistory();this.currentEntry=history.entries[history.currentIndex];}
    const screen=await super.observe(font);
    this.assertSafe();
    for(const element of screen.elements){
      const control=this.observedPublicControls.get(element.id)!;
      if(!element.text.trim()){
        if(control.kind==='disclosure'&&control.description){
          element.description=control.description;
          if(!screen.warnings?.includes('NON_TEXT_CONTROL_DESCRIPTION'))(screen.warnings??=[]).push('NON_TEXT_CONTROL_DESCRIPTION');
          continue;
        }
        element.available=false;element.unavailableReason='UNOBSERVABLE_LABEL';
        if(!screen.warnings?.includes('UNLABELED_CONTROLS_EXCLUDED'))(screen.warnings??=[]).push('UNLABELED_CONTROLS_EXCLUDED');
        continue;
      }
      if(control.kind==='blocked'){element.available=false;element.unavailableReason=control.reason;}
    }
    return screen;
  }
  assertSafe(){if(this.blockedForm)throw new Error('SAFETY_BOUNDARY: form submission blocked');}
  async describeAction(action:Action,step:number){
    const draft=await super.describeAction(action,step);
    if(action.type==='click'){
      const control=await (await this.targetElement(action.elementId)).evaluate(publicControl);
      if(control.kind==='link')draft.execution={kind:'navigate',url:control.href};
      else if(control.kind==='disclosure')draft.execution={kind:'local-disclosure'};
    }
    return draft;
  }
  private async settleNavigation(){
    try{
      await this.page.waitForLoadState('domcontentloaded');
      // Allow immediate client redirects to finish, but do not wait indefinitely
      // for analytics/polling. Redirect permission closes before observation.
      await this.page.waitForLoadState('networkidle',{timeout:2000}).catch(()=>{});
      await this.page.waitForLoadState('domcontentloaded');
    }catch(error){this.assertSafe();throw error;}
    this.assertSafe();
  }
  async navigateTo(url:string){
    try{
      this.assertSafe();
      const destination=await this.resolveNavigation(url);
      this.pendingNavigation={url:documentURL(destination)};
      // A committed response identifies a new document, unlike a matching
      // framenavigated URL, which also accepts same-document pushState.
      const response=await this.page.goto(destination,{waitUntil:'commit',timeout:30000});
      if(response)this.localOnly=false;
      await this.settleNavigation();
    }finally{this.pendingNavigation=undefined;await this.releaseNavigation();}
  }
  async act(action:Action){
    await this.prepare();
    this.assertSafe();
    if(action.type==='click'){
      const locator=await this.targetElement(action.elementId);
      const control=await locator.evaluate(publicControl);
      if(control.kind==='blocked')throw new Error(`${control.reason}: external destination or unsupported control`);
      if(control.kind==='link'){
        const before=await this.navigationHistory(),source=before.entries[before.currentIndex];
        if(this.currentEntry&&!sameEntry(source,this.currentEntry))this.historyChanged=true;
        // Follow the observed link without executing its inline click handlers.
        await this.navigateTo(control.href);
        const after=await this.navigationHistory();
        // Same-hash goto can append an entry without changing the URL. A reload
        // replaces the current entry; neither case can be inferred from URL alone.
        if(sameEntry(after.entries[after.currentIndex-1],source))this.previousEntries.push(source);
        else if(after.currentIndex!==before.currentIndex||!after.entries.slice(0,after.currentIndex).every((entry,index)=>sameEntry(entry,before.entries[index])))this.historyChanged=true;
        this.currentEntry=after.entries[after.currentIndex];
      }else{
        const beforeURL=this.page.url();
        const panel=control.panelPath?await this.page.evaluateHandle(path=>{
          let node:Element|undefined=document.documentElement;
          for(const index of path)node=node?.children[index];
          return node??null;
        },control.panelPath):undefined;
        try{
        if(panel&&await panel.evaluate(disclosureOpen)!==control.open)throw new Error('ACTION_ERROR: disclosure changed before click');
        this.localOnly=true;
        await locator.click({timeout:5000});
        // Keep networking blocked after the click (including delayed handlers),
        // until the next explicit navigation. Never manufacture expanded state.
        for(let i=0;i<30;i++){
          if(this.page.url()!==beforeURL)throw new Error('SAFETY_BOUNDARY: disclosure attempted navigation');
          if(panel){
            const open=await panel.evaluate(disclosureOpen);
            if(open===null)throw new Error('ACTION_ERROR: disclosure panel was replaced');
            if(open!==control.open)return;
          }else{
            const after=await locator.evaluate(publicControl);
            if(after.kind==='disclosure'&&after.open!==control.open)return;
          }
          await this.page.waitForTimeout(50);
        }
        throw new Error('ACTION_ERROR: disclosure did not change its panel visibility');
        }finally{await panel?.dispose();}
      }
    }
    else if(action.type==='back'){
      if(this.historyChanged)throw new Error('SAFETY_BOUNDARY: back destination changed');
      const previous=this.previousEntries.at(-1);
      if(!previous)throw new Error('SAFETY_BOUNDARY: no observed back destination');
      try{
        const destination=await this.resolveNavigation(previous.url);
        if(documentURL(destination)!==documentURL(previous.url))throw new Error('SAFETY_BOUNDARY: back destination changed');
        const before=await this.navigationHistory();
        if(!sameEntry(before.entries[before.currentIndex],this.currentEntry)||!sameEntry(before.entries[before.currentIndex-1],previous))throw new Error('SAFETY_BOUNDARY: back destination changed');
        this.pendingNavigation={url:documentURL(previous.url)};
        const response=await this.page.goBack({waitUntil:'commit',timeout:5000});
        if(response)this.localOnly=false;
        await this.settleNavigation();
        const after=await this.navigationHistory();
        if(this.page.url()!==previous.url||!sameEntry(after.entries[after.currentIndex],previous))throw new Error('SAFETY_BOUNDARY: back destination changed');
        this.previousEntries.pop();this.currentEntry=after.entries[after.currentIndex];
      }
      finally{this.pendingNavigation=undefined;await this.releaseNavigation();}
    }else await super.act(action);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
