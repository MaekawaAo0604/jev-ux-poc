import {test} from 'node:test';
import assert from 'node:assert/strict';
import {factorCandidates,factorModelInput,factorUsesDOM,factorVisibleText,validateFactorControls} from '../jev/virtual-beta/factors.js';
import type {BetaCandidates,BetaConfig,BetaInput,UserObservation,UserState,VisionObservation} from '../jev/virtual-beta/contracts.js';
import type {Observation,State} from '../jev/types.js';

type ControlledConfig=BetaConfig&{factors?:{informationChannel:'image-state'|'dom-state';extraActions:{look:boolean;reread:boolean;wait:boolean;abandon:boolean}}};
const base=():ControlledConfig=>({schemaVersion:1,id:'factors',vision:{mode:'full',clearWidth:960,clearHeight:620,blurRadius:12},state:{enabled:true,memoryCapacity:0},selection:{mode:'argmax',seed:7},behavior:'user',maxUIActions:6,maxLooks:4,maxDecisions:10,maxAPICalls:6,maxRunMs:90000,modeledActionMs:null,factors:{informationChannel:'image-state',extraActions:{look:false,reread:false,wait:false,abandon:false}}});
const vision=():VisionObservation=>({bytes:Buffer.from('unchanged pixels'),sourceSha256:'source',imageSha256:'image',width:1280,height:900,sourceWidth:1280,sourceHeight:900,fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},mode:'full',visibleTargets:[{id:'e1',x:10,y:10,width:30,height:20,badge:{x:10,y:10,width:8,height:8}},{id:'e2',x:100,y:10,width:30,height:20,badge:{x:1279,y:10,width:8,height:8}},{id:'e3',x:1279,y:10,width:30,height:20},{id:'semantic-secret',x:10,y:50,width:30,height:20}]});
const original=():BetaCandidates=>({e1:{action:{type:'click',elementId:'e1'},label:'SEMANTIC_LABEL_SECRET'},e2:{action:{type:'click',elementId:'e2'},label:'outside badge'},e3:{action:{type:'click',elementId:'e3'},label:'outside control'},e4:{action:{type:'click',elementId:'e4'},label:'unseen'},'semantic-secret':{action:{type:'click',elementId:'semantic-secret'},label:'secret'},back:{action:{type:'back'},label:'SEMANTIC_BACK_SECRET'},scroll_down:{action:{type:'scroll',direction:'down'},label:'SEMANTIC_SCROLL_SECRET'},done:{action:{type:'done'},label:'SEMANTIC_DONE_SECRET'},stuck:{action:{type:'stuck'},label:'SEMANTIC_STUCK_SECRET'}});
const observation=():UserObservation=>({id:'o2',imageSha256:'image',visibleText:['CURRENT_DOM_SECRET'],fixation:{x:640,y:450},candidateIds:['e1','back','scroll_down','done','stuck']});
const user=():UserState=>({schemaVersion:1,revision:2,fixation:{x:640,y:450},expectations:['A receipt is available'],memory:[{observationId:'o0',imageSha256:'old0',visibleText:['PAST_DOM_SECRET']},{observationId:'o1',imageSha256:'old1',visibleText:['PAST_DOM_SECRET'],action:{type:'click',elementId:'e1'},outcome:'performed'}],lastObservation:observation()});
const input=():BetaInput=>({persona:{schemaVersion:1,id:'p',name:'Person',itLiteracy:'ordinary',serviceExperience:'new',knowledge:['receipts'],expectations:['A receipt is available'],behavioralTendencies:[],contextAndConstraints:[]},charter:{schemaVersion:1,id:'c',targetWebsite:'local:good',goal:'Find receipt',initialState:{description:'signed in',currentDate:'2026-11-09'},scope:['account'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:6}});
const screen=():Observation=>({title:'DOM_TITLE_SECRET',text:['CURRENT_DOM_SECRET'],elements:[{id:'e1',type:'button',text:'DOM_BUTTON_SECRET',description:'ATTR_SECRET'}],canScrollUp:false,canScrollDown:true,regions:[{id:'r',source:'dom',text:'REGION_SECRET',bbox:{x0:0,y0:0,x1:10,y1:10}}]});
const history:State['history']=[{screen:'HISTORY_SECRET',action:'HISTORY_SECRET',result:'HISTORY_SECRET',observedText:['HISTORY_SECRET']}];

test('factor controls reject unknown switches, disabled state and enabled advanced profiles',()=>{
 assert.doesNotThrow(()=>validateFactorControls(base()));
 const malformed:unknown[]=[null,[],{},true,{...base().factors,unknown:true},{informationChannel:'image',extraActions:base().factors!.extraActions},{informationChannel:'image-state',extraActions:{look:false,reread:false,wait:false}},{informationChannel:'image-state',extraActions:{...base().factors!.extraActions,wait:0}},{informationChannel:'image-state',extraActions:{...base().factors!.extraActions,click:true}}];
 for(const factors of malformed)assert.throws(()=>validateFactorControls({...base(),factors} as ControlledConfig),/FACTOR/);
 assert.throws(()=>validateFactorControls({...base(),state:{enabled:false,memoryCapacity:0}}),/FACTOR/);
 for(const key of ['deliberation','experience','deferral','deferralReason','goalSearch','visualHypotheses','actionRelations','correspondence'])assert.throws(()=>validateFactorControls({...base(),[key]:{enabled:true}} as ControlledConfig),/FACTOR/);
 const dom=base();dom.factors!.informationChannel='dom-state';
 assert.doesNotThrow(()=>validateFactorControls(dom));
 for(const mode of ['crop','foveated'] as const)assert.throws(()=>validateFactorControls({...dom,vision:{...dom.vision,mode}}),/FACTOR/);
 for(const memoryCapacity of [0,3])assert.doesNotThrow(()=>validateFactorControls({...base(),state:{enabled:true,memoryCapacity}}));
 const legacy=base();delete legacy.factors;legacy.state.enabled=false;legacy.deliberation={enabled:true,memoryCapacity:3};
 assert.doesNotThrow(()=>validateFactorControls(legacy));
});

test('information channel controls DOM and text independently of full pixels and memory capacity',()=>{
 const c=base(),text=['visible'];
 assert.equal(factorUsesDOM(c),false);assert.deepEqual(factorVisibleText(c,text),[]);
 c.factors!.informationChannel='dom-state';assert.equal(factorUsesDOM(c),true);assert.deepEqual(factorVisibleText(c,text),['visible']);
 const copied=factorVisibleText(c,text);copied[0]='changed';assert.deepEqual(text,['visible']);
 delete c.factors;assert.equal(factorUsesDOM(c),true);assert.deepEqual(factorVisibleText(c,text),['visible']);
 c.vision.mode='crop';assert.equal(factorUsesDOM(c),false);assert.deepEqual(factorVisibleText(c,text),[]);
});

test('image candidates neutralize full-image labels and require fully visible controls and badges',()=>{
 const c=base(),v=vision(),candidates=original(),before={v:{...structuredClone(v),bytes:Buffer.from(v.bytes)},candidates:structuredClone(candidates)};
 assert.deepEqual(factorCandidates(candidates,v,c),{e1:{action:{type:'click',elementId:'e1'},label:'[e1]'},back:{action:{type:'back'},label:'back'},scroll_down:{action:{type:'scroll',direction:'down'},label:'scroll down'},done:{action:{type:'done'},label:'done'},stuck:{action:{type:'stuck'},label:'stuck'}});
 assert.deepEqual(v,before.v);assert.deepEqual(candidates,before.candidates);
 const tainted=original() as any;tainted.e1.action.attrs='ACTION_ATTR_SECRET';tainted.e1.audit='CANDIDATE_AUDIT_SECRET';
 const serialized=JSON.stringify(factorCandidates(tainted,v,c));assert.doesNotMatch(serialized,/SECRET|semantic-secret/);
});

test('each extra action switch changes only its vocabulary and ignores memory capacity',()=>{
 for(const key of ['look','reread','wait','abandon'] as const){
  const c=base();c.factors!.extraActions[key]=true;
  const a=factorCandidates(original(),vision(),c),memory=structuredClone(c);memory.state.memoryCapacity=3;
  assert.deepEqual(factorCandidates(original(),vision(),memory),a);
  const extra=Object.keys(a).filter(k=>!['e1','back','scroll_down','done','stuck'].includes(k));
  assert.deepEqual(extra,key==='look'?['look_0','look_1','look_2','look_3']:[key]);
  if(key==='look')assert.deepEqual(extra.map(id=>a[id].action),[{type:'look',point:{x:320,y:225}},{type:'look',point:{x:960,y:225}},{type:'look',point:{x:320,y:675}},{type:'look',point:{x:960,y:675}}]);
 }
 const c=base(),tainted=original();tainted.wait={action:{type:'wait'},label:'preexisting wait'};tainted.look_9={action:{type:'look',point:{x:1,y:1}},label:'preexisting look'};
 assert.deepEqual(factorCandidates(tainted,vision(),c),factorCandidates(original(),vision(),c));
 c.factors!.informationChannel='dom-state';c.factors!.extraActions.wait=true;
 const dom=factorCandidates(original(),vision(),c);assert.equal(dom.e1.label,'SEMANTIC_LABEL_SECRET');assert.deepEqual(dom.wait,{action:{type:'wait'},label:'Wait without operating the UI'});
});

test('opt-in image input masks known text fields and arbitrary nested audit fields without mutating inputs',()=>{
 const c=base();c.state.memoryCapacity=3;
 const i=input() as any,u=user() as any,o=observation() as any,v=vision() as any,s=screen() as any;
 i.charter.oracle='ORACLE_SECRET';i.charter.history={deep:'CHARTER_HISTORY_SECRET'};i.charter.initialState.audit='INITIAL_AUDIT_SECRET';i.persona.history={deep:'PERSONA_HISTORY_SECRET'};
 u.history={deep:'STATE_HISTORY_SECRET'};u.memory[0].history={deep:'MEMORY_HISTORY_SECRET'};u.memory[1].action.label='MEMORY_ACTION_LABEL_SECRET';u.lastObservation.label='OLD_OBSERVATION_SECRET';o.history={deep:'CURRENT_HISTORY_SECRET'};v.fixation.audit='FIXATION_SECRET';v.clearRect.label='RECT_SECRET';v.transform.label='TRANSFORM_SECRET';
 const before=JSON.stringify({i,u,o,v,s});const result=factorModelInput(i,v,o,u,c,s,history) as any;
 assert.doesNotMatch(JSON.stringify(result),/SECRET|oracle|history|screen|regions|description.*ATTR/);
 assert.deepEqual(result.userState.memory.map((m:any)=>m.visibleText),[[],[]]);assert.deepEqual(result.userState.lastObservation.visibleText,[]);
 assert.deepEqual(result.userState.lastObservation.candidateIds,o.candidateIds);assert.deepEqual(result.userState.expectations,['A receipt is available']);
 assert.deepEqual(result.observation,{id:'o2',image:'current',width:1280,height:900,viewport:{width:1280,height:900},fixation:{x:640,y:450},clearRect:{x:0,y:0,width:1280,height:900},transform:{offsetX:0,offsetY:0,scaleX:1,scaleY:1},candidateIds:['e1','back','scroll_down','done','stuck']});
 assert.equal(JSON.stringify({i,u,o,v,s}),before);
 result.userState.expectations[0]='changed';result.exploration.charter.scope.push('changed');assert.equal(u.expectations[0],'A receipt is available');assert.deepEqual(i.charter.scope,['account']);
});

test('memory zero preserves current observation and expectations while DOM memory remains bounded',()=>{
 const c=base();c.factors!.informationChannel='dom-state';
 const zero=factorModelInput(input(),vision(),observation(),user(),c,screen(),history) as any;
 assert.deepEqual(zero.userState.memory,[]);assert.deepEqual(zero.userState.lastObservation,observation());assert.deepEqual(zero.userState.expectations,['A receipt is available']);
 assert.deepEqual(zero.observation.screen,{title:'DOM_TITLE_SECRET',text:['CURRENT_DOM_SECRET'],elements:[{id:'e1',type:'button',text:'DOM_BUTTON_SECRET'}],canScrollUp:false,canScrollDown:true});
 c.state.memoryCapacity=1;const one=factorModelInput(input(),vision(),observation(),user(),c,screen(),history) as any;
 assert.deepEqual(one.userState.memory,[{observationId:'o1',imageSha256:'old1',visibleText:['PAST_DOM_SECRET'],action:{type:'click',elementId:'e1'},outcome:'performed'}]);
 assert.deepEqual(one.userState.lastObservation,zero.userState.lastObservation);assert.deepEqual(one.observation,zero.observation);
 assert.doesNotMatch(JSON.stringify(one),/HISTORY_SECRET|ATTR_SECRET|REGION_SECRET/);
});

test('legacy absence retains full-screen history and state projections and bundled extra candidates',()=>{
 const c=base();delete c.factors;c.state.enabled=false;
 const legacy=factorModelInput(input(),vision(),observation(),user(),c,screen(),history) as any;
 assert.deepEqual(legacy.history,history);assert.equal(legacy.userState,undefined);assert.equal(legacy.observation.screen.title,'DOM_TITLE_SECRET');
 assert.deepEqual(Object.keys(factorCandidates(original(),vision(),c)),Object.keys(original()));
 c.state.enabled=true;const stateful=factorModelInput(input(),vision(),observation(),user(),c,screen(),history) as any;
 assert.deepEqual(stateful.userState,user());assert.equal(stateful.history,undefined);
 assert.deepEqual(Object.keys(factorCandidates(original(),vision(),c)).slice(-7),['look_0','look_1','look_2','look_3','reread','wait','abandon']);
 c.state.enabled=false;c.vision.mode='crop';const cropped=vision();cropped.mode='crop';cropped.clearRect={x:0,y:0,width:100,height:100};
 const limited=factorModelInput(input(),cropped,observation(),user(),c,screen(),history) as any;assert.equal(limited.history,undefined);assert.equal(limited.observation.screen,undefined);
 assert.equal(factorCandidates(original(),cropped,c).e1.label,'[e1]');
});
