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
   label.style.cssText='all:initial;position:fixed;left:0;top:0;background:#ffe96b;color:#111;font:bold 23px/26px monospace;padding:0 4px;pointer-events:none;white-space:nowrap;visibility:hidden';
   shadow.append(label);return label;
  });
  host.popover='manual';document.documentElement.append(host);
  try{
   host.showPopover();
   const placed:{x:number;y:number;width:number;height:number}[]=[],rendered=[];
   for(const [i,t] of targets.entries()){
    const label=labels[i],{width,height}=label.getBoundingClientRect(),xs=[Math.max(0,Math.min(t.x,innerWidth-width))],ys:number[]=[];
    // Leave room for the site's focus outline as well as the target box.
    for(let offset=0;offset<innerHeight;offset+=height+2)ys.push(t.y-height-4-offset,t.y+t.height+4+offset);
    // A full-screen link has no outside margin; use readable viewport rows
    // only after the preferred outside-target positions have been exhausted.
    for(let y=0;y+height<=innerHeight;y+=height+2)ys.push(y);
    for(let x=0;x+width<=innerWidth;x+=width+2)xs.push(x);
    let position:{x:number;y:number;width:number;height:number}|undefined;
    for(const x of xs){for(const y of ys){
     if(y<0||x+width>innerWidth||y+height>innerHeight)continue;
     if(placed.some(p=>x<p.x+p.width+2&&x+width+2>p.x&&y<p.y+p.height+2&&y+height+2>p.y))continue;
     position={x,y,width,height};break;
    }if(position)break;}
    if(!position)throw new Error('VISUAL_LABEL_PLACEMENT_FAILED: no readable placement for offered controls');
    label.style.left=`${position.x}px`;label.style.top=`${position.y}px`;label.style.visibility='visible';placed.push(position);
    const above=position.y+height<=t.y,below=position.y>=t.y+t.height;
    const to={x:t.x+t.width/2,y:above?t.y-4:below?t.y+t.height+4:t.y+t.height/2};
    const from={x:position.x+width/2,y:position.y+height/2<=to.y?position.y+height:position.y};
    // Stop outside the focus outline: painting over it can change Chromium's
    // antialiasing after removal, even with unchanged DOM/focus/geometry.
    for(const box of [{x:from.x,y:Math.min(from.y,to.y),width:1,height:Math.abs(to.y-from.y)},{x:Math.min(from.x,to.x),y:to.y,width:Math.abs(to.x-from.x),height:1}]){
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
