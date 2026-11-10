import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attentionObservationContext} from '../jev/virtual-beta/attention-observation-context.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';

const wire=():Record<string,unknown>=>({
 goal:'Keep this complete goal and its constraints',
 exploration:{persona:{knowledge:['Only public knowledge']},charter:{goal:'Keep this complete goal and its constraints'}},
 observation:{id:'o1',image:'current',width:640,height:450,viewport:{width:1280,height:900},clearRect:{x:320,y:225,width:640,height:450},transform:{offsetX:320,offsetY:225,scaleX:1,scaleY:1},fixation:{x:640,y:450},candidateIds:['e3','e4','e6','back','scroll_down','done','stuck','reread','wait','abandon','look_0']},
 userState:{memory:[{observationId:'old',action:{type:'look',point:{x:320,y:225}}}]},
 memoryObservations:[{observationId:'old',image:'memory_0',imageSha256:'public-image'}]
});
const offered=():BetaCandidates=>({
 e3:{action:{type:'click',elementId:'e3'},label:'SECRET_CORRECT_REGION'},
 e4:{action:{type:'click',elementId:'e4'},label:'SECRET_TARGET_NAME'},
 e6:{action:{type:'click',elementId:'e6'},label:'SECRET_TARGET_NAME'},
 back:{action:{type:'back'},label:'SECRET_LABEL'},
 scroll_down:{action:{type:'scroll',direction:'down'},label:'SECRET_LABEL'},
 done:{action:{type:'done'},label:'SECRET_LABEL'},stuck:{action:{type:'stuck'},label:'SECRET_LABEL'},
 reread:{action:{type:'reread'},label:'SECRET_LABEL'},wait:{action:{type:'wait'},label:'SECRET_LABEL'},abandon:{action:{type:'abandon'},label:'SECRET_LABEL'},
 look_0:{action:{type:'look',point:{x:960,y:675}},label:'SECRET_GAZE'}
});
const context=(result:Record<string,unknown>):any=>result.attentionObservationContext;

// Catches treating a partial crop as the viewport or moving the existing fixation.
test('crop geometry explicitly maps delivered image pixels to its public viewport rectangle',()=>{
 const input=wire(),result=attentionObservationContext(input,offered(),'crop','geometry-v1'),geometry=context(result).geometry;
 assert.equal(context(result).kind,'geometry-v1');
 assert.deepEqual(geometry.croppedImageCoversRect,{x:320,y:225,width:640,height:450});
 assert.equal(geometry.mode,'crop');
 assert.deepEqual(geometry.coordinateFrames,{image:'image-pixels',clearRect:'viewport-pixels',fixation:'viewport-pixels',look:'viewport-pixels'});
 assert.deepEqual(geometry.transform,{offsetX:320,offsetY:225,scaleX:1,scaleY:1});
 assert.deepEqual(geometry.fixation,{x:640,y:450});
 assert.deepEqual(result.observation,input.observation);
 assert.equal(context(result).actions,undefined);
});

// Catches falsely declaring foveated/full images to have been cropped to the clear region.
for(const mode of ['full','foveated'] as const)test(`${mode} geometry distinguishes full image extent from clear region`,()=>{
 const input=wire();Object.assign(input.observation as object,{width:1280,height:900,transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1}});
 const geometry=context(attentionObservationContext(input,offered(),mode,'geometry-v1')).geometry;
 assert.equal(geometry.mode,mode);
 assert.deepEqual(geometry.croppedImageCoversRect,{x:0,y:0,width:1280,height:900});
 assert.deepEqual(geometry.clearRect,{x:320,y:225,width:640,height:450});
});

// Catches laundering semantic labels, absent controls, look points or malformed actions into gate context.
test('current actions contain only currently offered canonical IDs and neutral sanitized actions',()=>{
 const input=wire(),candidates:any=offered();
 (input.observation as any).candidateIds.push('e8','semantic_target','alias','scroll_up','unknown');
 candidates.e8={action:{type:'click',elementId:'e9',oracle:'SECRET'},label:'SECRET'};
 candidates.semantic_target={action:{type:'click',elementId:'semantic_target'},label:'SECRET'};
 candidates.alias={action:{type:'back'},label:'SECRET'};
 candidates.scroll_up={action:{type:'scroll',direction:'sideways'},label:'SECRET'};
 candidates.unknown={action:{type:'teleport'},label:'SECRET'};
 candidates.e99={action:{type:'click',elementId:'e99'},label:'OMITTED_CONTROL_NAME'};
 candidates.e3.action.audit='SECRET';
 const result=attentionObservationContext(input,candidates,'crop','actions-v1'),actions=context(result).actions;
 assert.deepEqual(actions.currentNonLookCandidates,[
  {id:'e3',action:{type:'click',elementId:'e3'},label:'[e3]'},
  {id:'e4',action:{type:'click',elementId:'e4'},label:'[e4]'},
  {id:'e6',action:{type:'click',elementId:'e6'},label:'[e6]'},
  {id:'back',action:{type:'back'},label:'back'},
  {id:'scroll_down',action:{type:'scroll',direction:'down'},label:'scroll down'},
  {id:'done',action:{type:'done'},label:'done'},
  {id:'stuck',action:{type:'stuck'},label:'stuck'},
  {id:'reread',action:{type:'reread'},label:'reread'},
  {id:'wait',action:{type:'wait'},label:'wait'},
  {id:'abandon',action:{type:'abandon'},label:'abandon'}
 ]);
 assert.doesNotMatch(JSON.stringify(context(result)),/SECRET|OMITTED|e99|e8|semantic_target|e9|960|675/);
 assert.equal(context(result).geometry,undefined);
 // The generic eligibility rule must remain valid for adapters whose badge is optional.
 assert.ok(actions.instructions.includes('Visible partial control text alone does not make a control an offered click target; use only currently offered click IDs. A constrained-view click candidate requires the control body to be fully inside the clear region; if a badge is provided, it must also be fully inside the clear region.'));
});

// Catches passing nested geometry extras or nonnumeric values from public observation to the added context.
test('geometry copies finite public numeric fields through a nested allowlist only',()=>{
 const input=wire(),observation:any=input.observation;
 observation.viewport.secret='HIDDEN';observation.clearRect.correctRegion='HIDDEN';observation.transform.dom='HIDDEN';observation.fixation.oracle='HIDDEN';
 observation.width='HIDDEN';observation.height=Infinity;observation.targets=['HIDDEN'];observation.audit={x:99};
 observation.clearRect.x=NaN;
 const geometry=context(attentionObservationContext(input,offered(),'crop','geometry-v1')).geometry;
 assert.doesNotMatch(JSON.stringify(geometry),/HIDDEN|targets|audit|correctRegion|oracle|dom/);
 assert.equal('width' in geometry,false);assert.equal('height' in geometry,false);
 assert.deepEqual(geometry.clearRect,{y:225,width:640,height:450});
 assert.equal('croppedImageCoversRect' in geometry,false);
 assert.deepEqual(geometry.viewport,{width:1280,height:900});
});

// Catches one treatment suppressing the other or changing an existing task/persona/image contract.
test('combined context is the union of geometry and current actions and preserves the base input',()=>{
 const input=wire(),candidates=offered();
 const result=attentionObservationContext(input,candidates,'crop','geometry-actions-v1');
 assert.equal(context(result).kind,'geometry-actions-v1');
 assert.deepEqual(context(result).geometry,context(attentionObservationContext(input,candidates,'crop','geometry-v1')).geometry);
 assert.deepEqual(context(result).actions,context(attentionObservationContext(input,candidates,'crop','actions-v1')).actions);
 const {attentionObservationContext:added,...base}=result;
 assert.deepEqual(base,input);
});

// Catches shared nested references that could rewrite the ordinary input, memories or offered actions.
test('context and all preserved evidence are detached from caller-owned inputs',()=>{
 const input=wire(),candidates=offered(),before=structuredClone({input,candidates});
 const result:any=attentionObservationContext(input,candidates,'crop','geometry-actions-v1');
 result.observation.fixation.x=1;result.userState.memory[0].action.point.x=2;
 result.exploration.persona.knowledge.push('changed');result.memoryObservations[0].image='changed';
 result.attentionObservationContext.geometry.clearRect.x=3;
 result.attentionObservationContext.actions.currentNonLookCandidates[0].action.elementId='changed';
 assert.deepEqual({input,candidates},before);
});

// Catches rejecting the existing plain-number anonymous badge ID format.
test('current actions accept offered plain numbered anonymous control IDs',()=>{
 const input=wire();(input.observation as any).candidateIds=['0','12'];
 const candidates:BetaCandidates={'0':{action:{type:'click',elementId:'0'},label:'SECRET'},'12':{action:{type:'click',elementId:'12'},label:'SECRET'}};
 const actions=context(attentionObservationContext(input,candidates,'crop','actions-v1')).actions.currentNonLookCandidates;
 assert.deepEqual(actions,[{id:'0',action:{type:'click',elementId:'0'},label:'[0]'},{id:'12',action:{type:'click',elementId:'12'},label:'[12]'}]);
});
