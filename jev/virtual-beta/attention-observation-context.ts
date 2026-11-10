import type {BetaAction,BetaCandidates,VisionConfig} from './contracts.js';

export type AttentionObservationContextOption='geometry-v1'|'actions-v1'|'geometry-actions-v1';
const anonymousId=/^(?:e[1-9]\d*|0|[1-9]\d*)$/;
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

function numericFields(value:unknown,keys:readonly string[]):Record<string,number>{
 if(!record(value))return {};
 return Object.fromEntries(keys.filter(key=>finite(value[key])).map(key=>[key,value[key] as number]));
}

function geometryContext(observation:Record<string,unknown>,mode:VisionConfig['mode']):Record<string,unknown>{
 const dimensions=numericFields(observation,['width','height']);
 const transform=numericFields(observation.transform,['offsetX','offsetY','scaleX','scaleY']);
 const geometry:Record<string,unknown>={
  mode,...dimensions,
  viewport:numericFields(observation.viewport,['width','height']),
  clearRect:numericFields(observation.clearRect,['x','y','width','height']),
  transform,
  fixation:numericFields(observation.fixation,['x','y']),
  coordinateFrames:{image:'image-pixels',clearRect:'viewport-pixels',fixation:'viewport-pixels',look:'viewport-pixels'},
  instructions:[
   'mode describes the delivered image: crop contains only the indicated viewport rectangle; full contains the viewport; foveated contains the viewport with only clearRect clear and the periphery blurred.',
   'croppedImageCoversRect gives the viewport rectangle covered by the delivered image. An image pixel maps to viewport coordinates as x * scaleX + offsetX, y * scaleY + offsetY.',
   'A crop edge is not necessarily a viewport edge or a page edge. Areas outside the delivered crop are unobserved and unknown; their contents and available controls cannot be inferred.',
   'Fixation, clearRect and offered look points use viewport coordinates. Look points do not use crop-local image coordinates; choose only among the existing offered look candidates.'
  ]
 };
 const {width,height}=dimensions,{offsetX,offsetY,scaleX,scaleY}=transform;
 if([width,height,offsetX,offsetY,scaleX,scaleY].every(finite)&&width>0&&height>0&&scaleX>0&&scaleY>0){
  const coveredWidth=width*scaleX,coveredHeight=height*scaleY;
  if(finite(coveredWidth)&&finite(coveredHeight))geometry.croppedImageCoversRect={x:offsetX,y:offsetY,width:coveredWidth,height:coveredHeight};
 }
 return geometry;
}

function sanitizedAction(id:string,value:unknown):BetaAction|undefined{
 if(!record(value)||!record(value.action))return undefined;
 const action=value.action;
 switch(action.type){
  case 'click':return anonymousId.test(id)&&action.elementId===id?{type:'click',elementId:id}:undefined;
  case 'scroll':return (action.direction==='up'||action.direction==='down')&&id===`scroll_${action.direction}`?{type:'scroll',direction:action.direction}:undefined;
  case 'back':case 'done':case 'stuck':case 'reread':case 'wait':case 'abandon':return id===action.type?{type:action.type}:undefined;
  default:return undefined;
 }
}

function actionsContext(observation:Record<string,unknown>,candidates:BetaCandidates):Record<string,unknown>{
 const currentIds=new Set(Array.isArray(observation.candidateIds)?observation.candidateIds.filter((id):id is string=>typeof id==='string'):[]);
 const currentNonLookCandidates=[];
 for(const [id,candidate] of Object.entries(candidates)){
  if(!currentIds.has(id))continue;
  const action=sanitizedAction(id,candidate);
  if(!action)continue;
  const label=action.type==='click'?`[${action.elementId}]`:action.type==='scroll'?`scroll ${action.direction}`:action.type;
  currentNonLookCandidates.push({id,action,label});
 }
 return {
  currentNonLookCandidates,
  instructions:[
   'These are the currently offered non-look actions, described only by anonymous IDs and action types. Only the offered click IDs are currently operable click targets.',
   'Visible partial control text alone does not make a control an offered click target; use only currently offered click IDs. A constrained-view click candidate requires the control body to be fully inside the clear region; if a badge is provided, it must also be fully inside the clear region.',
   'The absence of an offered click ID does not establish that its control or an unobserved area is absent from the page. Do not infer any omitted control name, location or count.',
   'Use the current image, bounded observation memory, persona and goal to judge whether a current non-look action can be chosen or whether another offered look would provide useful evidence. This context does not choose an action or look point.'
  ]
 };
}

/** Add only interpretation of already public observation geometry and offered actions.
 * The caller supplies its existing projected input; this helper preserves and clones it.
 */
export function attentionObservationContext(input:Record<string,unknown>,candidates:BetaCandidates,mode:VisionConfig['mode'],option:AttentionObservationContextOption):Record<string,unknown>{
 const copied=structuredClone(input);
 const observation=record(copied.observation)?copied.observation:{};
 copied.attentionObservationContext={
  kind:option,
  ...(option==='geometry-v1'||option==='geometry-actions-v1'?{geometry:geometryContext(observation,mode)}:{}),
  ...(option==='actions-v1'||option==='geometry-actions-v1'?{actions:actionsContext(observation,candidates)}:{})
 };
 return copied;
}
