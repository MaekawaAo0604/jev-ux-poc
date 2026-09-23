import type {ElementHandle,Locator} from 'playwright';
import type {Observation,RegionContext} from '../jev/types.js';
import type {PublicControl,publicControl} from './controls.js';
import type {visibleText} from './visible-text.js';

export type ObservedControl={
 locator:Locator;handle:ElementHandle<Element>;type:'link'|'button';text:string;fontSizePx:number;context?:RegionContext;publicControl?:PublicControl;identityPath?:number[];
};
export type ControlObservation={screen:Omit<Observation,'pageId'|'elements'>;controls:ObservedControl[]};

// Preserve the POM's existing center-point actionability rule. Text evidence
// continues to use visibleText's separate, stricter paint/visibility policy.
export function inspectControl(el:Element){
 const r=el.getBoundingClientRect(),s=getComputedStyle(el);
 const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 for(let node:Element|null=el;node;node=node.parentElement){
  const style=getComputedStyle(node);
  if(style.visibility!=='visible'||style.display==='none'||Number(style.opacity)===0||node.hasAttribute('inert')||node.getAttribute('aria-disabled')==='true')return null;
 }
 if(!(r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&s.visibility==='visible'&&s.display!=='none'&&Number(s.opacity)>0&&!!top&&(el===top||el.contains(top))&&!(el as HTMLButtonElement).disabled))return null;
 return {fontSizePx:parseFloat(s.fontSize)};
}

// One synchronous browser task joins literal visible labels to the exact DOM
// nodes inspected, so enumeration cannot drift between protocol round trips.
// Functions are passed as code by AutoPage, never sourced from the website.
export function collectAutoControls(
 options:{font:boolean;controlSelector:string;nativeControlSelector:string;classifyNative:boolean},
 readText:typeof visibleText,classify:typeof publicControl,inspect:typeof inspectControl,
){
 const {controlLabels,controlContexts,...screen}=readText(options);
 const controls:{index:number;type:'link'|'button';text:string;fontSizePx:number;context?:RegionContext;publicControl?:PublicControl;identityPath?:number[]}[]=[],targets:Element[]=[];
 for(const [index,el] of Array.from(document.querySelectorAll(options.controlSelector)).entries()){
  const metadata=inspect(el);if(!metadata)continue;
  const native=el.matches(options.nativeControlSelector);
  const control=options.classifyNative||!native?classify(el):undefined;
  if(!native&&(control?.kind!=='disclosure'||!control.description))continue;
  const identityPath:number[]=[];
  if(control?.kind==='disclosure')for(let node:Element|null=el;node?.parentElement;node=node.parentElement)identityPath.unshift(Array.from(node.parentElement.children).indexOf(node));
  controls.push({index,type:el.getAttribute('role')==='link'||el.tagName==='A'?'link':'button',text:controlLabels[index]||'',context:controlContexts[index],...metadata,publicControl:control,...(control?.kind==='disclosure'?{identityPath}:{})});
  targets.push(el);
 }
 return {screen,controls,targets};
}
