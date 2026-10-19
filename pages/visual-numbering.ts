import type {Page} from 'playwright';

export type VisualTarget={id:string;x:number;y:number;width:number;height:number};
/** Current, offered controls only. A closed shadow tree isolates our badges
 * from site CSS. Never persist labels into DOM observations or action history. */
export async function numberedScreenshot(page:Page,targets:VisualTarget[],path?:string){
 if(!targets.length)return {bytes:await page.screenshot({path}),targets:[]};
 const overlay=await page.evaluateHandle(targets=>{
  const host=document.createElement('div');host.setAttribute('aria-hidden','true');
  host.style.cssText='all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;overflow:visible!important;pointer-events:none!important;z-index:2147483647!important';
  const shadow=host.attachShadow({mode:'closed'});
  const labels=targets.map(t=>{
   const label=document.createElement('span');label.textContent=`[${t.id}]`;
   const height=Math.min(26,Math.max(12,Math.floor(t.height))),font=Math.min(23,height-2);
   label.style.cssText=`all:initial;position:fixed;left:0;top:0;background:#ffe96b;color:#111;font:bold ${font}px/${height}px monospace;padding:0 4px;pointer-events:none;white-space:nowrap;visibility:hidden`;
   shadow.append(label);return label;
  });
  host.popover='manual';document.documentElement.append(host);
  try{
   host.showPopover();
   // Geometry only: no text content is retained or sent to the decision model.
   // Padding inside the correct control is less ambiguous than a remote badge,
   // but must not hide the site's visible words.
   const textBoxes:{x:number;y:number;width:number;height:number}[]=[];
   const styles=new Map<Element,CSSStyleDeclaration>();
   const paint={
    style(el:Element){let s=styles.get(el);if(!s){s=getComputedStyle(el);styles.set(el,s);}return s;},
    transparent(color:string){return color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color)||/\/\s*0(?:\.0+)?%?\s*\)$/.test(color);}
   };
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){
    const node=walker.currentNode;if(!node.textContent?.trim())continue;
    const el=node.parentElement;if(!el)continue;
    const style=paint.style(el);
    if(style.visibility!=='visible'||paint.transparent(style.color)||paint.transparent(style.webkitTextFillColor))continue;
    const ancestors:Element[]=[];let hidden=false;
    for(let a:Element|null=el;a;a=a.parentElement){
     const s=paint.style(a);ancestors.push(a);
     if(s.display==='none'||Number(s.opacity)===0||/opacity\(0(?:\.0+)?%?\)/.test(s.filter))hidden=true;
    }
    if(hidden)continue;
    const range=document.createRange();range.selectNodeContents(node);
    for(const r of Array.from(range.getClientRects())){
     let left=Math.max(0,r.left),top=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
     for(const a of ancestors){
      const s=paint.style(a),b=a.getBoundingClientRect();
      if(/hidden|clip|scroll|auto/.test(s.overflowX)){left=Math.max(left,b.left+a.clientLeft);right=Math.min(right,b.left+a.clientLeft+a.clientWidth);}
      if(/hidden|clip|scroll|auto/.test(s.overflowY)){top=Math.max(top,b.top+a.clientTop);bottom=Math.min(bottom,b.top+a.clientTop+a.clientHeight);}
     }
     if(right>left&&bottom>top)textBoxes.push({x:left,y:top,width:right-left,height:bottom-top});
    }
   }
   const placed:{x:number;y:number;width:number;height:number}[]=[],rendered=[];
   for(const [i,t] of targets.entries()){
    const label=labels[i],{width,height}=label.getBoundingClientRect(),xs=[Math.max(0,Math.min(t.x,innerWidth-width))],ys:number[]=[];
    // Leave room for the site's focus outline as well as the target box.
    for(let offset=0;offset<innerHeight;offset+=height+2)ys.push(t.y-height-4-offset,t.y+t.height+4+offset);
    // A full-screen link has no outside margin; use readable viewport rows
    // only after the preferred outside-target positions have been exhausted.
    for(let y=0;y+height<=innerHeight;y+=height+2)ys.push(y);
    for(let x=0;x+width<=innerWidth;x+=width+2)xs.push(x);
    const placement={
     overlaps(x:number,y:number,p:{x:number;y:number;width:number;height:number},gap=2){return x<p.x+p.width+gap&&x+width+gap>p.x&&y<p.y+p.height+gap&&y+height+gap>p.y;},
     available(x:number,y:number){return x>=0&&y>=0&&x+width<=innerWidth&&y+height<=innerHeight&&!placed.some(p=>this.overlaps(x,y,p))&&!textBoxes.some(p=>this.overlaps(x,y,p))&&!targets.some(p=>{
      // A background/containing control must not ban the entire viewport for
      // a smaller offered foreground control. Still protect its own badge.
      const contains=p.x<=t.x&&p.y<=t.y&&p.x+p.width>=t.x+t.width&&p.y+p.height>=t.y+t.height&&(p.width>t.width||p.height>t.height);
      return p.id!==t.id&&!contains&&this.overlaps(x,y,p,4);
     });}
    };
    let position:{x:number;y:number;width:number;height:number}|undefined;
    // Keep an identifier in its own outlined control's unused corner first.
    for(const x of [t.x+t.width-width-4,t.x+4])for(const y of [t.y+4,t.y+t.height-height-4]){
     if(!position&&x>=t.x&&y>=t.y&&x+width<=t.x+t.width&&y+height<=t.y+t.height&&placement.available(x,y))position={x,y,width,height};
    }
    // Compact text rows cannot accommodate a full-size marker. Keep a short
    // marker on its own baseline before considering any other row.
    if(height<26)for(const x of [t.x+t.width+8,t.x-width-8]){
     const y=t.y+(t.height-height)/2;
     if(!position&&placement.available(x,y))position={x,y,width,height};
    }
    // Otherwise take the nearest readable outside position, not the first
    // point in a column (which could be several navigation rows away).
    if(!position){
     const choices=[...xs.flatMap(x=>ys.map(y=>({x,y}))),{x:t.x-width-4,y:t.y+(t.height-height)/2},{x:t.x+t.width+4,y:t.y+(t.height-height)/2}];
     choices.sort((a,b)=>Math.hypot(a.x+width/2-t.x-t.width/2,a.y+height/2-t.y-t.height/2)-Math.hypot(b.x+width/2-t.x-t.width/2,b.y+height/2-t.y-t.height/2));
     for(const {x,y} of choices)if(placement.available(x,y)){position={x,y,width,height};break;}
    }
    if(!position)throw new Error('VISUAL_LABEL_PLACEMENT_FAILED: no readable placement for offered controls');
    label.style.left=`${position.x}px`;label.style.top=`${position.y}px`;label.style.visibility='visible';placed.push(position);
    const above=position.y+height<=t.y,below=position.y>=t.y+t.height;
    const left=!above&&!below&&position.x+width<=t.x,right=!above&&!below&&position.x>=t.x+t.width;
    const to={x:left?t.x-4:right?t.x+t.width+4:t.x+t.width/2,y:above?t.y-4:below?t.y+t.height+4:t.y+t.height/2};
    const from={x:left?position.x+width:right?position.x:position.x+width/2,y:left||right?position.y+height/2:position.y+height/2<=to.y?position.y+height:position.y};
    const outline=document.createElement('span');
    outline.style.cssText=`all:initial;position:fixed;left:${t.x-4}px;top:${t.y-4}px;width:${t.width+8}px;height:${t.height+8}px;box-sizing:border-box;border:1px solid #806600;pointer-events:none`;
    shadow.prepend(outline);
    // Stop outside the focus outline: painting over it can change Chromium's
    // antialiasing after removal, even with unchanged DOM/focus/geometry.
    const inside=position.x>=t.x&&position.y>=t.y&&position.x+width<=t.x+t.width&&position.y+height<=t.y+t.height;
    for(const box of inside?[]:[{x:from.x,y:Math.min(from.y,to.y),width:1,height:Math.abs(to.y-from.y)},{x:Math.min(from.x,to.x),y:to.y,width:Math.abs(to.x-from.x),height:1}]){
     const line=document.createElement('span');
     line.style.cssText=`all:initial;position:fixed;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;background:#806600;pointer-events:none`;
     shadow.prepend(line);
    }
    const b=label.getBoundingClientRect();rendered.push({...t,badge:{x:b.x,y:b.y,width:b.width,height:b.height},connector:{from,to}});
   }
   return {host,rendered};
  }catch(error){host.remove();throw error;}
 },targets);
 try{return {bytes:await page.screenshot({path}),targets:await overlay.evaluate(({rendered})=>rendered)};}
 finally{try{await overlay.evaluate(({host})=>host.remove());}finally{await overlay.dispose();}}
}
