import type {Candidate,Decider,Observation,State} from './types.js';
import {evaluateChoices,validateChoice,type ChoiceEvaluator,type ChoiceQuestion} from './client.js';
import {jevDecide} from './decide.js';

export interface Persona {
 schemaVersion:1; id:string; name:string; itLiteracy:string; serviceExperience:string;
 knowledge:string[]; expectations:string[]; behavioralTendencies:string[]; contextAndConstraints:string[];
}
export interface Charter {
 schemaVersion:1; id:string; targetWebsite:'local:good'|'local:bad'; goal:string;
 initialState:{description:string;currentDate:string}; scope:string[];
 prohibitedActions:{actionTypes:('click'|'scroll'|'back')[];controlTexts:string[];downloads:boolean};
 maxActions:number; oracle:'invoice'|'notifications';
}
export type ExplorationCharter=Omit<Charter,'oracle'|'targetWebsite'>&{targetWebsite:string};
export type ExplorationInput={persona?:Persona;charter:ExplorationCharter};
export type DecisionReason={kind:'model-reported-category';scope?:'current-action'|'frontier-target';targetId?:string;category:string;description:string;probabilities:Record<string,number>}|{kind:'unavailable';description:string};
const record=(v:unknown):Record<string,any>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Expected JSON object');return v;};
const text=(v:unknown,key:string)=>{if(typeof v!=='string'||!v.trim()||v.length>4000)throw new Error(`Invalid ${key}`);return v;};
const strings=(v:unknown,key:string,allowEmpty=false):string[]=>{if(!Array.isArray(v)||(!allowEmpty&&!v.length)||v.length>40)throw new Error(`Invalid ${key}`);return v.map(x=>text(x,key));};
const id=(v:unknown)=>{const s=text(v,'id');if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s)||s==='baseline')throw new Error('Invalid or reserved id');return s;};
export function parsePersona(value:unknown):Persona {
 const p=record(value);if(p.schemaVersion!==1)throw new Error('Unsupported persona schemaVersion');
 return {schemaVersion:1,id:id(p.id),name:text(p.name,'name'),itLiteracy:text(p.itLiteracy,'itLiteracy'),serviceExperience:text(p.serviceExperience,'serviceExperience'),knowledge:strings(p.knowledge,'knowledge'),expectations:strings(p.expectations,'expectations'),behavioralTendencies:strings(p.behavioralTendencies,'behavioralTendencies'),contextAndConstraints:strings(p.contextAndConstraints,'contextAndConstraints',true)};
}
export function parseCharter(value:unknown):Charter {
 const c=record(value),initial=record(c.initialState),bans=record(c.prohibitedActions);
 if(c.schemaVersion!==1)throw new Error('Unsupported charter schemaVersion');
 if(!['local:good','local:bad'].includes(c.targetWebsite))throw new Error('This PoC supports local:good or local:bad; public-site exploration remains separate.');
 if(!['invoice','notifications'].includes(c.oracle))throw new Error('Unsupported independent oracle');
 if(!Number.isSafeInteger(c.maxActions)||c.maxActions<1||c.maxActions>100)throw new Error('maxActions must be 1..100');
 if(!Array.isArray(bans.actionTypes)||bans.actionTypes.some((x:unknown)=>!['click','scroll','back'].includes(x as string))||typeof bans.downloads!=='boolean')throw new Error('Invalid prohibitedActions');
 const currentDate=text(initial.currentDate,'currentDate');if(!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)||!Number.isFinite(Date.parse(currentDate)))throw new Error('Invalid currentDate');
 return {schemaVersion:1,id:id(c.id),targetWebsite:c.targetWebsite,goal:text(c.goal,'goal'),initialState:{description:text(initial.description,'initialState.description'),currentDate},scope:strings(c.scope,'scope'),prohibitedActions:{actionTypes:[...bans.actionTypes],controlTexts:strings(bans.controlTexts,'controlTexts',true),downloads:bans.downloads},maxActions:c.maxActions,oracle:c.oracle};
}
export function publicExploration(input:ExplorationInput):ExplorationInput {
 // The outcome oracle belongs only to the harness, never the model.
 const {oracle,...charter}=input.charter as Charter;
 return {...(input.persona?{persona:input.persona}:{}),charter};
}
export function filterCandidates(candidates:Record<string,Candidate>,screen:Observation,charter:ExplorationCharter){
 return Object.fromEntries(Object.entries(candidates).filter(([,candidate])=>{
  const action=candidate.action;
  if(charter.prohibitedActions.actionTypes.includes(action.type as 'click'|'back'|'scroll'))return false;
  if(action.type!=='click')return true;
  const label=screen.elements.find(e=>e.id===action.elementId)?.text.split('\n')[0].trim();
  // This harness accepts only the bundled local UI. Its three PDF controls
  // use this visible label; never offer them when downloads are prohibited.
  if(charter.prohibitedActions.downloads&&/^\d{4}-\d{2} の請求書をPDFで保存$/.test(label??''))return false;
  return !charter.prohibitedActions.controlTexts.includes(label??'');
 }));
}
const basis:ChoiceQuestion={type:'choice',instructions:'For the nextAction you selected in this same request, report the main basis that best describes that choice. This is a self-reported category, not a verified account of internal reasoning. Do not change the action just to fit a category.',criteria:{goal:'The visible control appears relevant to the Goal.',clarity:'The visible explanation or terminology is understandable.',efficiency:'The action appears to reach the Goal with fewer operations.',confirmation:'The action helps confirm safety, consequences, or the resulting state.',uncertainty:'The next step is unclear or needs exploratory checking.',other:'Another basis, or no category describes the choice.'}};
export function experimentDecider(evaluate:ChoiceEvaluator=evaluateChoices,verifyCompletion=false):Decider {
 return async(state,candidates,options)=>{
  let reported:{choice:string;reason:DecisionReason}|undefined;
  const input:State={...state,...(state.exploration?{exploration:publicExploration(state.exploration)}:{})};
  const wrapped:ChoiceEvaluator=async(context,questions)=>{
   const next=questions.nextAction;
   const q=next?{...questions,nextAction:{...next,instructions:next.instructions+' exploration.persona describes the user. Treat behavioral tendencies as hypotheses, not mandatory operations. Use that user knowledge, expectations and constraints when judging visible choices; do not invent unseen content. With no persona, use the ordinary Goal-directed policy. Keep charter constraints and completion evidence unchanged.'},decisionBasis:basis}:questions;
   const response=await evaluate(input.exploration?{...(context as object),exploration:input.exploration}:context,q);
   if(next){
    const action=validateChoice(response.answers.nextAction,next.criteria);
    try{const answer=validateChoice(response.answers.decisionBasis,basis.criteria);reported={choice:action.choice,reason:{kind:'model-reported-category',category:answer.choice,description:basis.criteria[answer.choice],probabilities:answer.probabilities}};}
    catch{reported={choice:action.choice,reason:{kind:'unavailable',description:'The model did not return a valid reason category.'}};}
   }
   return response;
  };
  const decision=await jevDecide(input,candidates,{verifyCompletion,...options},wrapped);
  return {...decision,decisionReason:reported?.choice===decision.choice?reported.reason:reported?.reason.kind==='model-reported-category'&&reported.choice===decision.frontier?.targetId?{...reported.reason,scope:'frontier-target',targetId:reported.choice}:{kind:'unavailable',description:'The final action was selected by a separate completion or recovery judgment.'}};
 };
}
