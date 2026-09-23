// Goal-independent control discovery shared by labels and action targets.
export const nativeControlSelector='a[href],button,[role="link"],[role="button"],details > summary,[itemtype$="/Question"] > [itemprop="name"]';
export const controlSelector=nativeControlSelector+',:is(header,[role="banner"]) :is(div,span):has(img,svg,i):not(:has(a[href],button,[role],input,textarea,select))';

export type PublicControl={kind:'link';href:string}|{kind:'disclosure';open:boolean;description?:string;panelPath?:number[]}|{kind:'blocked';reason:'UNSUPPORTED_CONTENT'|'SAFETY_BOUNDARY'};

// Runs in the page; never returns hidden panel contents or navigation hints.
export function publicControl(el:Element):PublicControl{
 if(el instanceof HTMLAnchorElement){
  const url=new URL(el.href,location.href);
  if(el.hasAttribute('download')||/\.(pdf|zip|exe|docx?|xlsx?)$/i.test(url.pathname))return {kind:'blocked',reason:'UNSUPPORTED_CONTENT'};
  if(['http:','https:'].includes(url.protocol)&&url.origin===location.origin&&!url.username&&!url.password)return {kind:'link',href:url.href};
  return {kind:'blocked',reason:'SAFETY_BOUNDARY'};
 }
 const blocked:PublicControl={kind:'blocked',reason:'SAFETY_BOUNDARY'};
 if(el.closest('form')||(el instanceof HTMLButtonElement&&(el.form||el.disabled))||el.closest('[inert],[aria-disabled="true"]'))return blocked;
 if(el.tagName==='SUMMARY'&&el.parentElement instanceof HTMLDetailsElement&&el.parentElement.querySelector('summary')===el)return {kind:'disclosure',open:el.parentElement.open};
 let panel:Element|null=null,description:string|undefined;
 if(el.matches('[itemprop="name"]')&&el.parentElement?.getAttribute('itemtype')?.match(/^https?:\/\/schema\.org\/Question$/)){
  panel=Array.from(el.parentElement.children).find(c=>c.getAttribute('itemprop')==='acceptedAnswer'&&/^https?:\/\/schema\.org\/Answer$/.test(c.getAttribute('itemtype')||''))||null;
 }else if((el.tagName==='BUTTON'||el.getAttribute('role')==='button')&&['true','false'].includes(el.getAttribute('aria-expanded')||'')){
  const ids=(el.getAttribute('aria-controls')||'').trim().split(/\s+/).filter(Boolean);
  if(ids.length===1)panel=document.getElementById(ids[0]);
  else if(!ids.length&&['true','menu'].includes(el.getAttribute('aria-haspopup')||'')){
   const sibling=el.nextElementSibling;
   if(sibling&&(sibling.getAttribute('aria-label')||sibling.getAttribute('role')==='menu')&&sibling.querySelector('a[href]'))panel=sibling;
  }
 }else if(el.matches('div,span')&&!el.hasAttribute('role')){
  // A narrow fallback for one compact graphical trigger and one separate
  // navigation panel in a header. Structural hints classify actions only:
  // never expose alt/ARIA labels, selectors, URLs or hidden panel contents.
  const header=el.closest('header,[role="banner"]');
  if(!header)return blocked;
  const helpers={
  transparent(color:string){return color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color)||/\/\s*0(?:\.0+)?%?\s*\)$/.test(color);},
  graphicTrigger(node:Element){
   if(!node.matches('div,span')||node.hasAttribute('role')||node.closest('a,button,form,[role]:not([role="banner"]),[inert],[aria-disabled="true"],[contenteditable]:not([contenteditable="false"])')||node.querySelector('a[href],button,[role],input,textarea,select'))return false;
   const r=node.getBoundingClientRect();
   if(getComputedStyle(node).cursor!=='pointer'||r.width<16||r.height<16||r.width>240||r.height>120||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)return false;
   return Array.from(node.querySelectorAll('img,svg,i')).some(g=>{
    const box=g.getBoundingClientRect();
    if(box.width<8||box.height<8||box.left<r.left||box.right>r.right||box.top<r.top||box.bottom>r.bottom)return false;
    if(g instanceof HTMLImageElement&&(!g.complete||!g.naturalWidth))return false;
    if(g.tagName==='I'){
     // Empty CSS icons have no text to recognize. Require visible ordinary
     // border paint inside their box, not a hidden image or arbitrary wrapper.
     if(g.textContent?.trim()||g.children.length)return false;
     const s=getComputedStyle(g);
     if(s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none'||s.filter!=='none'||s.borderImageSource!=='none'||s.position==='static')return false;
     for(let ancestor:Element|null=g;ancestor;ancestor=ancestor.parentElement){const a=getComputedStyle(ancestor);if(a.clip!=='auto'||a.clipPath!=='none'||a.maskImage!=='none'||a.transform!=='none'||a.translate!=='none'||a.rotate!=='none'||a.scale!=='none'||a.offsetPath!=='none'||!['normal','1'].includes(a.zoom)||ancestor.scrollLeft||ancestor.scrollTop)return false;}
     const borders=[[s.borderTopWidth,s.borderTopStyle,s.borderTopColor],[s.borderBottomWidth,s.borderBottomStyle,s.borderBottomColor],[s.borderLeftWidth,s.borderLeftStyle,s.borderLeftColor],[s.borderRightWidth,s.borderRightStyle,s.borderRightColor]];
     const paintedBorders=borders.filter(([width,style,color])=>parseFloat(width)>0&&style!=='none'&&style!=='hidden'&&!helpers.transparent(color)).length;
     const paintedBars=['::before','::after'].filter(p=>{
      const q=getComputedStyle(g,p),width=parseFloat(q.width),height=parseFloat(q.height);
      if(q.transform!=='none'||q.translate!=='none'||q.rotate!=='none'||q.scale!=='none'||q.clip!=='auto'||q.boxShadow!=='none'||q.borderImageSource!=='none'||!['normal','1'].includes(q.zoom))return false;
      if([q.marginLeft,q.marginRight,q.marginTop,q.marginBottom,q.paddingLeft,q.paddingRight,q.paddingTop,q.paddingBottom,q.borderTopWidth,q.borderBottomWidth,q.borderLeftWidth,q.borderRightWidth].some(v=>v!=='0px'))return false;
      const left=q.left.endsWith('px')?parseFloat(q.left):q.right.endsWith('px')?g.clientWidth-parseFloat(q.right)-width:NaN;
      const top=q.top.endsWith('px')?parseFloat(q.top):q.bottom.endsWith('px')?g.clientHeight-parseFloat(q.bottom)-height:NaN;
      if(!Number.isFinite(left)||!Number.isFinite(top)||left<0||top<0||left+width>g.clientWidth+0.1||top+height>g.clientHeight+0.1)return false;
      return ['""',"''"].includes(q.content)&&q.position==='absolute'&&q.display!=='none'&&q.visibility==='visible'&&Number(q.opacity)===1&&q.clipPath==='none'&&q.maskImage==='none'&&q.filter==='none'&&q.offsetPath==='none'&&width>=8&&width<=box.width+1&&height>0&&height<=6&&!helpers.transparent(q.backgroundColor);
     }).length;
     if(paintedBorders<2&&paintedBars!==2)return false;
    }
    for(let ancestor:Element|null=g;ancestor;ancestor=ancestor.parentElement){const s=getComputedStyle(ancestor);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<1)return false;}
    const hit=document.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2);
    return !!hit&&node.contains(hit);
   });
  }};
  const triggers=Array.from(header.querySelectorAll('div,span')).filter(node=>helpers.graphicTrigger(node));
  const roots=triggers.filter(node=>!triggers.some(other=>other!==node&&other.contains(node)));
  if(roots.length!==1||roots[0]!==el)return blocked;
  const panels=Array.from(header.children).filter(node=>!node.contains(el)&&node.querySelectorAll('a[href]').length>=2);
  if(panels.length!==1)return blocked;
  panel=panels[0];
  // Search widgets are allowed inside a navigation panel, not as actions.
  // This never permits executing the form; disclosure networking is blocked.
  const forms=Array.from(panel.querySelectorAll('form'));
  if(forms.some(form=>form.getAttribute('role')!=='search'||form.method.toLowerCase()!=='get'||Array.from(form.elements).some(field=>!(field instanceof HTMLInputElement)||!['text','search','submit','hidden'].includes(field.type))))return blocked;
  if(panel.querySelector('textarea,select,[contenteditable]:not([contenteditable="false"])')||Array.from(panel.querySelectorAll('input')).some(input=>!input.form||!forms.includes(input.form)))return blocked;
  const r=el.getBoundingClientRect(),side=r.left+r.width/2<innerWidth/3?'左':r.left+r.width/2>innerWidth*2/3?'右':'中央';
  description=`ヘッダー${side}側の画像・図形による開閉操作（文字は未取得）`;
 }
 if(!panel||panel===el||panel.contains(el)||(!description&&panel.querySelector('form,input,textarea,select,[contenteditable="true"]')))return blocked;
 const s=getComputedStyle(panel),r=panel.getBoundingClientRect();
 let open=!panel.hasAttribute('hidden')&&s.display!=='none'&&s.visibility==='visible'&&Number(s.opacity)>0&&r.width>0&&r.height>0;
 if(!description)return {kind:'disclosure',open};
 open=open&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;
 for(let a=panel.parentElement;a;a=a.parentElement){const v=getComputedStyle(a);if(v.display==='none'||v.visibility!=='visible'||Number(v.opacity)===0)open=false;}
 const panelPath:number[]=[];
 for(let a:Element|null=panel;a?.parentElement;a=a.parentElement)panelPath.unshift(Array.from(a.parentElement.children).indexOf(a));
 // Private action metadata only. PublicSitePage never copies this into State.
 return {kind:'disclosure',open,description,panelPath};
}

// Used on a retained element handle: opening may legitimately hide/reshape the
// trigger. Confirm the same panel, not a newly inferred panel after the click.
export function disclosureOpen(panel:Element|null){
 if(!panel?.isConnected)return null;
 const r=panel.getBoundingClientRect();
 if(panel.hasAttribute('hidden')||r.width<=0||r.height<=0||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
 for(let a:Element|null=panel;a;a=a.parentElement){const s=getComputedStyle(a);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return false;}
 return true;
}
