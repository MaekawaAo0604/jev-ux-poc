import type {CDPSession} from 'playwright';
import type {Action} from '../jev/types.js';
import {AutoPage} from './AutoPage.js';

/** Local demo adapter only. Graph exploration stays in the existing memory class.
 * Private identities and native history never enter the model's State. */
export class LocalExplorationPage extends AutoPage {
 protected classifyNative=true;
 private client?:CDPSession;
 private keys:Record<string,string>={};
 private previous?:{id:number;url:string};
 private observedCurrent?:{id:number;url:string};
 private backTraversal?:{fromId:number;expectedId:number;actualId:number;frame:'main'|'subframe'};
 get lastBackTraversal(){return this.backTraversal?{...this.backTraversal}:undefined;}
 get canGoBack(){return !!this.previous;}
 get explorationBackUrl(){return this.previous?.url;}
 get explorationActionKeys(){return {...this.keys};}
 get explorationNavigationChoices(){
  const current=new URL(this.page.url());current.hash='';
  return [...this.observedPublicControls].filter(([,c])=>{
   if(c.kind!=='link')return false;const u=new URL(c.href);u.hash='';
   return !(c.href.includes('#')&&u.href===current.href);
  }).map(([id])=>id);
 }
 async act(action:Action){
  if(action.type!=='back')return super.act(action);
  this.backTraversal=undefined;
  const client=this.client,expected=this.previous,observed=this.observedCurrent;
  if(!client||!expected||!observed)throw new Error('ACTION_ERROR: no observed back destination');
  const before=await client.send('Page.getNavigationHistory'),current=before.entries[before.currentIndex],previous=before.entries[before.currentIndex-1];
  if(current?.id!==observed.id||current.url!==observed.url||previous?.id!==expected.id||previous.url!==expected.url)throw new Error('ACTION_ERROR: native history changed after observation');
  // Native Back may navigate only an iframe. Await its actual commit/load,
  // rather than a main-frame load event that will never be emitted.
  const [frame]=await Promise.all([
   this.page.waitForEvent('framenavigated',{timeout:5000}),
   client.send('Page.navigateToHistoryEntry',{entryId:expected.id}),
  ]);
  await frame.waitForLoadState('domcontentloaded',{timeout:5000});
  await this.page.waitForLoadState('domcontentloaded',{timeout:5000});
  const after=await client.send('Page.getNavigationHistory'),actual=after.entries[after.currentIndex];
  if(actual?.id!==expected.id||actual.url!==expected.url||this.page.url()!==expected.url)throw new Error('ACTION_ERROR: native Back landed on a different history entry');
  this.backTraversal={fromId:current.id,expectedId:expected.id,actualId:actual.id,frame:frame===this.page.mainFrame()?'main':'subframe'};
  await this.page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 }
 async observe(font:boolean){
  const screen=await super.observe(font);
  const keys:Record<string,string>={scroll_up:'scroll:up',scroll_down:'scroll:down'};
  for(const [id,handle] of this.targetHandles){
   const control=this.observedPublicControls.get(id);
   if(control?.kind==='link'){keys[id]=JSON.stringify(['link',control.href]);continue;}
   const path=await handle.evaluate(el=>{const path:number[]=[];for(let node:Element|null=el;node?.parentElement;node=node.parentElement)path.unshift(Array.from(node.parentElement.children).indexOf(node));return path;});
   keys[id]=JSON.stringify(['local-control',path]);
  }
  this.client??=await this.page.context().newCDPSession(this.page);
  const history=await this.client.send('Page.getNavigationHistory');
  this.observedCurrent=history.entries[history.currentIndex];
  const previous=history.entries[history.currentIndex-1],current=new URL(this.page.url());
  this.previous=undefined;
  if(previous){const url=new URL(previous.url);if(url.origin===current.origin&&url.pathname===current.pathname)this.previous={id:previous.id,url:previous.url};}
  if(this.previous)keys.back=JSON.stringify(['back',this.previous.id]);
  this.keys=keys;return screen;
 }
}
