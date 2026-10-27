import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import type {BetaAction,BetaCandidates,Point,Rect,VisionConfig,VisionObservation,VisionTarget} from './contracts.js';

// AccountPage's eN IDs and plain numbered IDs contain no semantic DOM attributes.
const anonymousId=/^(?:e[1-9]\d*|0|[1-9]\d*)$/;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const finite=(n:number)=>typeof n==='number'&&Number.isFinite(n);
const positiveInteger=(n:number)=>Number.isSafeInteger(n)&&n>0;
const contains=(outer:Rect,inner:Rect)=>inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.width<=outer.x+outer.width&&inner.y+inner.height<=outer.y+outer.height;

function validateConfig(config:VisionConfig):void {
  if(!config||!['full','crop','foveated'].includes(config.mode)) throw new Error('Invalid vision mode');
  if(!positiveInteger(config.clearWidth)||!positiveInteger(config.clearHeight)) throw new Error('Vision clear dimensions must be positive integer pixels');
  if(!Number.isSafeInteger(config.blurRadius)||config.blurRadius<0||(config.mode==='foveated'&&config.blurRadius===0)) throw new Error('Vision blur radius must be a nonnegative integer, positive for foveated mode');
}
function checkPoint(point:Point,width:number,height:number,description:string):void {
  if(!point||!finite(point.x)||!finite(point.y)||point.x<0||point.y<0||point.x>=width||point.y>=height) throw new Error(`Invalid ${description} point coordinates`);
}
function clearRegion(config:VisionConfig,fixation:Point,width:number,height:number):Rect {
  if(config.mode==='full') return {x:0,y:0,width,height};
  const left=Math.floor(fixation.x)-Math.floor(config.clearWidth/2);
  const top=Math.floor(fixation.y)-Math.floor(config.clearHeight/2);
  const x=Math.max(0,left),y=Math.max(0,top);
  return {x,y,width:Math.min(width,left+config.clearWidth)-x,height:Math.min(height,top+config.clearHeight)-y};
}
function eligibleTargets(targets:VisionTarget[],region:Rect,constrained:boolean):VisionTarget[] {
  const seen=new Set<string>();
  const result:VisionTarget[]=[];
  for(const target of targets) {
    if(!target||typeof target.id!=='string'||!target.id||seen.has(target.id)||(constrained&&!anonymousId.test(target.id))) throw new Error('Invalid or duplicate vision target id');
    seen.add(target.id);
    const rect=(value:Rect,kind:string):Rect=>{
      if(!value||!finite(value.x)||!finite(value.y)||!finite(value.width)||!finite(value.height)||value.width<=0||value.height<=0||!finite(value.x+value.width)||!finite(value.y+value.height)) throw new Error(`Invalid vision ${kind} rectangle`);
      return {x:value.x,y:value.y,width:value.width,height:value.height};
    };
    const control=rect(target,'target');
    const badge=target.badge===undefined?undefined:rect(target.badge,'badge');
    // Explicit projection also removes runtime-only fields such as text/attrs.
    if(contains(region,control)&&(!constrained||!badge||contains(region,badge))) {
      result.push({id:target.id,...control,...(badge?{badge}:{})});
    }
  }
  return result;
}

/** Exact separable box average of encoded RGBA channels, clipped at image edges.
 * This is an experimental image restriction, not a model of retinal acuity.
 * Keep horizontal sums unrounded so the final 2D average has only one rounding.
 */
function boxBlur(source:PNG,radius:number,clear:Rect):PNG {
  const {width,height,data}=source;
  const r=Math.min(radius,Math.max(width,height));
  const horizontal=new Float64Array(width*height*4);
  for(let y=0;y<height;y++) {
    const sums=[0,0,0,0];
    for(let x=0;x<=Math.min(width-1,r);x++) for(let c=0;c<4;c++) sums[c]+=data[(y*width+x)*4+c];
    for(let x=0;x<width;x++) {
      const i=(y*width+x)*4;
      for(let c=0;c<4;c++) horizontal[i+c]=sums[c];
      const remove=x-r,add=x+r+1;
      if(remove>=0) for(let c=0;c<4;c++) sums[c]-=data[(y*width+remove)*4+c];
      if(add<width) for(let c=0;c<4;c++) sums[c]+=data[(y*width+add)*4+c];
    }
  }
  const output=new PNG({width,height});
  for(let x=0;x<width;x++) {
    const sums=[0,0,0,0];
    for(let y=0;y<=Math.min(height-1,r);y++) for(let c=0;c<4;c++) sums[c]+=horizontal[(y*width+x)*4+c];
    const columns=Math.min(width-1,x+r)-Math.max(0,x-r)+1;
    for(let y=0;y<height;y++) {
      const i=(y*width+x)*4;
      const rows=Math.min(height-1,y+r)-Math.max(0,y-r)+1;
      const sharp=x>=clear.x&&x<clear.x+clear.width&&y>=clear.y&&y<clear.y+clear.height;
      for(let c=0;c<4;c++) output.data[i+c]=sharp?data[i+c]:Math.round(sums[c]/(columns*rows));
      const remove=y-r,add=y+r+1;
      if(remove>=0) for(let c=0;c<4;c++) sums[c]-=horizontal[(remove*width+x)*4+c];
      if(add<height) for(let c=0;c<4;c++) sums[c]+=horizontal[(add*width+x)*4+c];
    }
  }
  return output;
}

/** Transform screenshot pixels. All metadata rectangles stay in source/viewport
 * pixels; transform maps the delivered image coordinates back to that space.
 * The caller alone captures screenshots, changes fixation, or executes UI actions.
 */
export function transformVision(bytes:Buffer,config:VisionConfig,fixation:Point,targets:VisionTarget[]):VisionObservation {
  validateConfig(config);
  const source=PNG.sync.read(bytes,{checkCRC:true});
  const {width:sourceWidth,height:sourceHeight}=source;
  checkPoint(fixation,sourceWidth,sourceHeight,'fixation');
  const clearRect=clearRegion(config,fixation,sourceWidth,sourceHeight);
  const visibleTargets=eligibleTargets(targets,clearRect,config.mode!=='full');
  let delivered:Buffer=Buffer.from(bytes);
  let width=sourceWidth,height=sourceHeight;
  let offsetX=0,offsetY=0;
  if(config.mode==='crop') {
    const image=new PNG({width:clearRect.width,height:clearRect.height});
    PNG.bitblt(source,image,clearRect.x,clearRect.y,clearRect.width,clearRect.height,0,0);
    delivered=PNG.sync.write(image);
    width=clearRect.width;height=clearRect.height;
    offsetX=clearRect.x;offsetY=clearRect.y;
  } else if(config.mode==='foveated') {
    delivered=PNG.sync.write(boxBlur(source,config.blurRadius,clearRect));
  }
  return {bytes:delivered,sourceSha256:hash(bytes),imageSha256:hash(delivered),width,height,sourceWidth,sourceHeight,
    fixation:{x:fixation.x,y:fixation.y},clearRect,transform:{offsetX,offsetY,scaleX:1,scaleY:1},mode:config.mode,visibleTargets};
}

export function imageToViewport(point:Point,observation:VisionObservation):Point {
  const {width,height,sourceWidth,sourceHeight,transform}=observation;
  if(!positiveInteger(width)||!positiveInteger(height)||!positiveInteger(sourceWidth)||!positiveInteger(sourceHeight)||!transform||
    !finite(transform.offsetX)||!finite(transform.offsetY)||!finite(transform.scaleX)||!finite(transform.scaleY)||transform.offsetX<0||transform.offsetY<0||transform.scaleX<=0||transform.scaleY<=0||
    transform.offsetX+width*transform.scaleX>sourceWidth||transform.offsetY+height*transform.scaleY>sourceHeight) throw new Error('Invalid vision coordinate transform');
  checkPoint(point,width,height,'image');
  const viewport={x:point.x*transform.scaleX+transform.offsetX,y:point.y*transform.scaleY+transform.offsetY};
  checkPoint(viewport,sourceWidth,sourceHeight,'viewport');
  return viewport;
}

function neutralAction(action:BetaAction,observation:VisionObservation):{action:BetaAction;label:string}|undefined {
  // Rebuild actions instead of spreading caller objects, which can carry attrs.
  switch(action.type) {
    case 'back':case 'done':case 'stuck':case 'reread':case 'wait':case 'abandon':return {action:{type:action.type},label:action.type};
    case 'scroll':return ['up','down'].includes(action.direction)?{action:{type:'scroll',direction:action.direction},label:`scroll ${action.direction}`}:undefined;
    case 'look':
      checkPoint(action.point,observation.sourceWidth,observation.sourceHeight,'look');
      return {action:{type:'look',point:{x:action.point.x,y:action.point.y}},label:`look (${action.point.x}, ${action.point.y})`};
    case 'click':return undefined;
  }
}

/** Whitelist visible controls and anonymize all constrained candidate labels.
 * Blurred periphery never grants a click target; use look to move fixation first.
 */
export function visionCandidates(original:BetaCandidates,observation:VisionObservation):BetaCandidates {
  if(observation.mode==='full') return Object.fromEntries(Object.entries(original).map(([key,value])=>[key,{...value}]));
  const visible=new Set(observation.visibleTargets.map(target=>target.id));
  const result:BetaCandidates={};
  for(const [key,candidate] of Object.entries(original)) {
    if(candidate.action.type==='click') {
      const id=candidate.action.elementId;
      if(key!==id||!anonymousId.test(id)||!visible.has(id)) continue;
      result[key]={action:{type:'click',elementId:id},label:`[${id}]`};
    } else {
      const action=candidate.action;
      const canonicalKey=action.type==='scroll'?key===`scroll_${action.direction}`:
        action.type==='look'?/^look_\d+(?:_\d+)?$/.test(key):key===action.type;
      if(!canonicalKey) continue;
      const clean=neutralAction(action,observation);
      if(clean) result[key]=clean;
    }
  }
  return result;
}



