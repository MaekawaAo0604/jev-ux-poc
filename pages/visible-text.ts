import type {RegionContext,TextRegion} from '../jev/types.js';

// Executed in the page with a generic control selector, never goal-specific
// selectors, routes, hidden labels or a success oracle.
export function visibleText({font,controlSelector}:{font:boolean;controlSelector:string}){
 const body=document.body;
 if(!body)throw new Error('OBSERVATION_NOT_READY');
 const regions:TextRegion[]=[],warnings:string[]=[];
 const controls=Array.from(document.querySelectorAll(controlSelector));
 const controlText=new Map<Element,Map<Element,string[]>>(),groups=new Map<Element,TextRegion>();
 const regionElements=new Map<TextRegion,Element>(),headingParts=new Map<Element,string[]>();
 const styles=new Map<Element,CSSStyleDeclaration>();
 const complexPaint=new Map<Element,{unknown:boolean;rects:{left:number;top:number;right:number;bottom:number}[]}>();
 const uncertainOverlays:{el:Element;rect:DOMRect}[]=[];
 const range=document.createRange();let examined=0,title='';
 const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
 // Object methods avoid tsx/esbuild's external function-name helper in serialized page code.
 const helpers={
 style(el:Element){let s=styles.get(el);if(!s){s=getComputedStyle(el);styles.set(el,s);}return s;},
 transparent(color:string){return color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color)||/\/\s*0(?:\.0+)?%?\s*\)$/.test(color);},
 rendered(el:Element){
  if(helpers.style(el).visibility!=='visible')return false;
  for(let a:Element|null=el;a;a=a.parentElement){const s=helpers.style(a);if(s.display==='none'||Number(s.opacity)===0||/opacity\(0(?:\.0+)?%?\)/.test(s.filter))return false;}
  return true;
 },
 glyphStrip(el:Element,pseudo:CSSStyleDeclaration,x:number){
  // A generated glyph has no DOM Range. Only support a single literal with
  // reproducible horizontal shaping; unknown CSS must not disclose covered text.
  if(el.scrollLeft||el.scrollTop||!['block','inline-block','flow-root','flex','inline-flex','grid','inline-grid'].includes(helpers.style(el).display))return;
  const content=/^"([^"\\\r\n]+)"$/.exec(pseudo.content)?.[1]||/^'([^'\\\r\n]+)'$/.exec(pseudo.content)?.[1];
  if(!content||Array.from(content).length!==1||/\s/.test(content))return;
  if(pseudo.display!=='block'||pseudo.writingMode!=='horizontal-tb'||pseudo.direction!=='ltr'||!['start','left'].includes(pseudo.textAlign)||!['auto','start','left'].includes(pseudo.textAlignLast)||pseudo.textIndent!=='0px'||!['1','normal'].includes(pseudo.zoom)||pseudo.unicodeBidi!=='normal'||!['normal','nowrap','pre'].includes(pseudo.whiteSpace))return;
  if(!['normal','0px'].includes(pseudo.letterSpacing)||!['normal','0px'].includes(pseudo.wordSpacing)||pseudo.textTransform!=='none'||pseudo.textDecorationLine!=='none'||pseudo.textEmphasisStyle!=='none'||pseudo.webkitTextStrokeWidth!=='0px'||pseudo.getPropertyValue('-webkit-text-security')!=='none')return;
  if(pseudo.fontVariant!=='normal'||pseudo.fontFeatureSettings!=='normal'||pseudo.fontVariationSettings!=='normal'||!['normal','100%'].includes(pseudo.fontStretch)||pseudo.fontSizeAdjust!=='none'||pseudo.fontOpticalSizing!=='auto'||pseudo.textRendering!=='auto')return;
  const canvas=document.createElement('canvas');
  canvas.lang=el.closest('[lang]')?.getAttribute('lang')||document.documentElement.lang;
  const context=canvas.getContext('2d');if(!context)return;
  const font=`${pseudo.fontStyle} ${pseudo.fontWeight} ${pseudo.fontSize} ${pseudo.fontFamily}`;
  if(!document.fonts.check(font,content))return;
  context.font=font;context.direction='ltr';context.textAlign='left';context.fontKerning=pseudo.fontKerning as CanvasFontKerning;
  const metrics=context.measureText(content);
  if(![metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight,metrics.width].every(Number.isFinite))return;
  // Include advance width, ink overhang and a rasterization margin. Avoid
  // guessing a CSS line-box baseline: the glyph occupies this entire X strip.
  return {left:x-Math.max(0,metrics.actualBoundingBoxLeft)-1,top:-Infinity,right:x+Math.max(metrics.width,metrics.actualBoundingBoxRight)+1,bottom:Infinity};
 },
 complex(el:Element,textRects:DOMRect[]){
  let paint=complexPaint.get(el);
  if(!paint){
  const s=helpers.style(el);
  paint={unknown:s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none',rects:[]};
  for(const p of ['::before','::after']){
   const pseudo=getComputedStyle(el,p);
   if(['none','normal'].includes(pseudo.content)||!['absolute','fixed'].includes(pseudo.position)||Number(pseudo.opacity)===0||pseudo.visibility!=='visible'||pseudo.display==='none')continue;
   // These effects paint beyond (or move) the border box independently of glyph
   // metrics. Do not certify them, including otherwise empty decorations.
   if(pseudo.borderImageSource!=='none'||pseudo.getPropertyValue('-webkit-box-reflect')!=='none'||pseudo.offsetPath!=='none'){paint.unknown=true;continue;}
   if(helpers.transparent(pseudo.backgroundColor)&&pseudo.backgroundImage==='none'&&pseudo.boxShadow==='none'&&pseudo.outlineStyle==='none'&&[pseudo.borderTopWidth,pseudo.borderRightWidth,pseudo.borderBottomWidth,pseudo.borderLeftWidth].every(w=>parseFloat(w)===0)&&['""',"''"].includes(pseudo.content))continue;
   // Only prove bounds for a simple absolute decoration in its own positioned
   // containing block. Empty decorations may have a finite 2D translation.
   let supported=pseudo.position==='absolute'&&s.position!=='static'&&el.getClientRects().length===1&&pseudo.boxShadow==='none'&&pseudo.filter==='none'&&pseudo.outlineStyle==='none'&&pseudo.textShadow==='none';
   for(let a:Element|null=el;a;a=a.parentElement){const v=helpers.style(a);if(v.transform!=='none'||v.translate!=='none'||v.rotate!=='none'||v.scale!=='none'||v.perspective!=='none'||v.filter!=='none'||!['1','normal'].includes(v.zoom))supported=false;}
   let dx=0,dy=0;
   if(pseudo.transform!=='none'){
    const matrix=/^matrix\(([^)]+)\)$/.exec(pseudo.transform)?.[1].split(',').map(Number);
    // CSS Transforms 1 §8: a singular transform does not render its content.
    // Recognize only an empty solid decoration with pure scaleX(0)/scaleY(0).
    // It has no paint bounds to estimate, including on an inline containing block.
    const zeroAxis=matrix?.length===6&&matrix.every(Number.isFinite)&&matrix[1]===0&&matrix[2]===0&&matrix[4]===0&&matrix[5]===0&&((matrix[0]===0&&matrix[3]===1)||(matrix[0]===1&&matrix[3]===0));
    if(supported&&zeroAxis&&['""',"''"].includes(pseudo.content)&&pseudo.backgroundImage==='none'&&pseudo.backdropFilter==='none'&&
     [pseudo.borderTopWidth,pseudo.borderRightWidth,pseudo.borderBottomWidth,pseudo.borderLeftWidth].every(w=>parseFloat(w)===0)&&
     !el.scrollLeft&&!el.scrollTop&&pseudo.clipPath==='none'&&pseudo.clip==='auto'&&pseudo.maskImage==='none'&&pseudo.perspective==='none'&&
     ['1','normal'].includes(pseudo.zoom)&&pseudo.translate==='none'&&pseudo.rotate==='none'&&pseudo.scale==='none')continue;
    // Inline boxes do not expose the border origin through clientLeft/clientTop.
    if(!['block','inline-block','flow-root','flex','inline-flex','grid','inline-grid'].includes(s.display))supported=false;
    if(!['""',"''"].includes(pseudo.content)||!matrix||matrix.length!==6||!matrix.every(Number.isFinite)||matrix[0]!==1||matrix[1]!==0||matrix[2]!==0||matrix[3]!==1||el.scrollLeft||el.scrollTop||pseudo.clipPath!=='none'||pseudo.clip!=='auto'||pseudo.maskImage!=='none'||pseudo.perspective!=='none'||!['1','normal'].includes(pseudo.zoom))supported=false;
    else{dx=matrix[4];dy=matrix[5];}
   }
   if(pseudo.translate!=='none'||pseudo.rotate!=='none'||pseudo.scale!=='none')supported=false;
   const values=[pseudo.left,pseudo.top,pseudo.width,pseudo.height,pseudo.marginLeft,pseudo.marginTop,pseudo.paddingLeft,pseudo.paddingRight,pseudo.paddingTop,pseudo.paddingBottom,pseudo.borderLeftWidth,pseudo.borderRightWidth,pseudo.borderTopWidth,pseudo.borderBottomWidth];
   if(values.some(v=>! /^-?\d+(?:\.\d+)?px$/.test(v)))supported=false;
   if(!supported){paint.unknown=true;continue;}
   const [left,top,width,height,ml,mt,pl,pr,pt,pb,bl,br,bt,bb]=values.map(Number.parseFloat);
   const r=el.getBoundingClientRect(),x=r.left+el.clientLeft+left+ml+dx,y=r.top+el.clientTop+top+mt+dy;
   if(!['""',"''"].includes(pseudo.content)){
    const glyph=helpers.glyphStrip(el,pseudo,x+bl+pl);
    if(!glyph){paint.unknown=true;continue;}
    paint.rects.push(glyph);
   }
   paint.rects.push({left:x,top:y,right:x+width+(pseudo.boxSizing==='border-box'?0:pl+pr+bl+br),bottom:y+height+(pseudo.boxSizing==='border-box'?0:pt+pb+bt+bb)});
  }
  complexPaint.set(el,paint);
  }
  return paint.unknown||paint.rects.some(p=>textRects.some(r=>r.left<p.right&&r.right>p.left&&r.top<p.bottom&&r.bottom>p.top));
 },
 box(r:DOMRect){return {x0:r.left,y0:r.top,x1:r.right,y1:r.bottom};},
 union(a:TextRegion['bbox'],b:TextRegion['bbox']){return {x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)};},
 landmark(el:Element):'main'|'navigation'|'header'|'footer'|'other'{
  for(let a:Element|null=el;a;a=a.parentElement){
   const role=a.getAttribute('role'),tag=a.tagName;
   if(tag==='MAIN'||role==='main')return 'main';
   if(tag==='NAV'||role==='navigation')return 'navigation';
   if(tag==='HEADER'||role==='banner')return 'header';
   if(tag==='FOOTER'||role==='contentinfo')return 'footer';
  }
  return 'other';
 },
 sectionRoot(el:Element){
  let landmark:Element|undefined;
  for(let a:Element|null=el;a;a=a.parentElement){
   const role=a.getAttribute('role'),tag=a.tagName;
   if(tag==='SECTION'||tag==='ARTICLE'||role==='region')return a;
   if(!landmark&&(tag==='MAIN'||tag==='NAV'||tag==='HEADER'||tag==='FOOTER'||['main','navigation','banner','contentinfo'].includes(role||'')))landmark=a;
  }
  return landmark||body;
 },
 sectionId(root:Element){
  const positions:number[]=[];
  for(let el:Element|null=root;el?.parentElement;el=el.parentElement){
   let position=0;for(let sibling=el.previousElementSibling;sibling;sibling=sibling.previousElementSibling)position++;
   positions.push(position);
  }
  let hash=2166136261;
  for(const character of positions.reverse().join('/')){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return `s${hash>>>0}`;
 },
 context(el:Element,headings:{el:Element;text:string;level:number;root:Element}[]):RegionContext{
  const root=helpers.sectionRoot(el);
  const lineage:{level:number;text:string}[]=[];
  for(const heading of headings){
   const beforeOrContains=heading.el===el||heading.el.contains(el)||!!(heading.el.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING);
   if(!beforeOrContains||!heading.root.contains(el))continue;
   while(lineage.length&&lineage[lineage.length-1].level>=heading.level)lineage.pop();
   lineage.push({level:heading.level,text:heading.text});
  }
  return {landmark:helpers.landmark(el),section:helpers.sectionId(root),headings:lineage.map(item=>item.text)};
 },
 visible(r:DOMRect,el:Element,ancestors:Element[]){
  if(!r.width||!r.height||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)return false;
  for(const ancestor of ancestors){
   const s=helpers.style(ancestor),b=ancestor.getBoundingClientRect();
   if(/hidden|clip|scroll|auto/.test(s.overflowX)&&(r.left<b.left+ancestor.clientLeft||r.right>b.left+ancestor.clientLeft+ancestor.clientWidth))return false;
   if(/hidden|clip|scroll|auto/.test(s.overflowY)&&(r.top<b.top+ancestor.clientTop||r.bottom>b.top+ancestor.clientTop+ancestor.clientHeight))return false;
  }
  if(uncertainOverlays.some(o=>o.el!==el&&!o.el.contains(el)&&r.left<o.rect.right&&r.right>o.rect.left&&r.top<o.rect.bottom&&r.bottom>o.rect.top)){
   if(!warnings.includes('POSSIBLE_PAINT_OVERLAP'))warnings.push('POSSIBLE_PAINT_OVERLAP');
   return false;
  }
  const top=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
  return !!top&&(top===el||(helpers.style(el).pointerEvents==='none'&&top.contains(el)));
 }};
 // Hit testing ignores pointer-events:none. Conservatively omit intersections with
 // painted non-ancestor layers; this is not a full reconstruction of CSS paint order.
 for(const el of Array.from(document.querySelectorAll('*'))){
  const s=helpers.style(el);if(s.pointerEvents!=='none'||!helpers.rendered(el))continue;
  if(!helpers.transparent(s.backgroundColor)||s.backgroundImage!=='none'||['IMG','CANVAS','VIDEO','SVG'].includes(el.tagName)||[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth].some(w=>parseFloat(w)>0)){
   const rect=el.getBoundingClientRect();if(rect.width&&rect.height&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight)uncertainOverlays.push({el,rect});
  }
 }
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  const el=node.parentElement,value=node.textContent||'';
  if(!el||!value.trim()||el.closest('script,style,noscript,template'))continue;
  const ancestors:Element[]=[];for(let a:Element|null=el;a;a=a.parentElement)ancestors.push(a);
  const textStyle=helpers.style(el);
  if(!helpers.rendered(el)||helpers.transparent(textStyle.color)||helpers.transparent(textStyle.webkitTextFillColor))continue;
  range.selectNodeContents(node);
  const nodeRects=Array.from(range.getClientRects());
  if(!nodeRects.some(r=>r.width&&r.height&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight))continue;
  if(ancestors.some(a=>helpers.complex(a,nodeRects))){if(!warnings.includes('COMPLEX_PAINT_SKIPPED'))warnings.push('COMPLEX_PAINT_SKIPPED');continue;}
  // Bound pathological pages, and expose any loss instead of silently presenting a complete screen.
  if(examined+value.length>60_000){warnings.push('Visible DOM text limit reached; observation is incomplete.');break;}
  examined+=value.length;
  let text='',bounds:TextRegion['bbox']|undefined,partial=false;
  const fragments:TextRegion['bbox'][]=[];
  let fragmentOpen=false;
  for(let i=0;i<value.length;){
   const length=String.fromCodePoint(value.codePointAt(i)!).length;
   range.setStart(node,i);range.setEnd(node,i+length);i+=length;
   const rects=Array.from(range.getClientRects()).filter(r=>r.width&&r.height);
   if(rects.length&&rects.every(r=>helpers.visible(r,el,ancestors))){
    text+=value.slice(i-length,i);
    for(const r of rects){
     const box=helpers.box(r);
     bounds=bounds?helpers.union(bounds,box):box;
     // DOM whitespace is not painted text: images can be visible behind it.
     if(!value.slice(i-length,i).trim()){fragmentOpen=false;continue;}
     const last=fragmentOpen?fragments.at(-1):undefined;
     // Only touch/overlap on the same text line. Never fill image gaps or
     // join distinct text nodes through a group's outer bounding rectangle.
     if(last&&last.y0===box.y0&&last.y1===box.y1&&box.x0<=last.x1&&box.x1>=last.x0)fragments[fragments.length-1]=helpers.union(last,box);
     else fragments.push(box);
     fragmentOpen=true;
    }
   }else{fragmentOpen=false;if(value.slice(i-length,i).trim())partial=true;if(text&&!text.endsWith(' '))text+=' ';}
  }
  text=text.replace(/\s+/g,' ').trim();if(!text||!bounds)continue;
  if(partial&&!warnings.includes('PARTIAL_TEXT'))warnings.push('PARTIAL_TEXT');
  // Join only observed fragments from cells of this native table row. A nested
  // table (including its caption) must not inherit its outer cell's row.
  const cell=el.closest('th,td'),table=el.closest('table');
  const row=cell?.parentElement?.tagName==='TR'&&table&&cell.closest('table')===table?cell.parentElement:undefined;
  const group=row||ancestors.find(a=>!['inline','contents'].includes(helpers.style(a).display))||el;
  const previous=groups.get(group);
  if(previous){previous.text+=' '+text;previous.bbox=helpers.union(previous.bbox,bounds);previous.fragments!.push(...fragments);if(font)previous.fontSizePx=Math.max(previous.fontSizePx!,parseFloat(helpers.style(el).fontSize));}
  else{const region:TextRegion={id:`t${regions.length+1}`,source:'dom',text,bbox:bounds,fragments,...(font?{fontSizePx:parseFloat(helpers.style(el).fontSize)}:{})};groups.set(group,region);regionElements.set(region,group);regions.push(region);}
  const heading=el.closest('h1,h2,h3,h4,h5,h6');
  if(heading){const parts=headingParts.get(heading)||[];parts.push(text);headingParts.set(heading,parts);}
  if(el.closest('h1'))title+=(title?' ':'')+text;
  for(const control of controls)if(control.contains(el)){
   const lines=controlText.get(control)||new Map<Element,string[]>(),texts=lines.get(group)||[];
   texts.push(text);lines.set(group,texts);controlText.set(control,lines);
  }
 }
 const headings=Array.from(headingParts,([el,parts])=>({el,text:parts.join(' ').replace(/\s+/g,' ').trim(),level:Number(el.tagName.slice(1)),root:helpers.sectionRoot(el)}));
 for(const region of regions)region.context=helpers.context(regionElements.get(region)!,headings);
 return {title,regions,text:regions.map(r=>r.text),warnings,controlLabels:controls.map(c=>Array.from(controlText.get(c)?.values()||[]).map(line=>line.join(' ')).join('\n').replace('↗','').trim()),controlContexts:controls.map(c=>helpers.context(c,headings)),canScrollUp:scrollY>0,canScrollDown:scrollY+innerHeight<document.documentElement.scrollHeight-2,viewport:{top:scrollY,bottom:scrollY+innerHeight,height:innerHeight}};
}
