import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {validateConfig} from '../jev/virtual-beta/config.js';

export type HumanJevMode='baseline'|'deliberation'|'experience'|'experience-basis'|'experience-defer'|'experience-reason'|'experience-reason-excursion'|'experience-reason-grounded'|'experience-reason-conditional'|'experience-reason-correspondence'|'experience-goal-search'|'experience-goal-search-v2'|'experience-goal-search-grounded'|'experience-action-relations';

/** Same screen, goal policy and decision limit; only the declared deliberation stage adds requests. */
export function humanJevProfile(mode:HumanJevMode='baseline'):{config:BetaConfig;maximumRequests:number;explorationMaximum:number;reviewMaximum:number;perRunMaximum:12}{
 if(mode==='experience-action-relations'){const previous=humanJevProfile('experience-goal-search-grounded');return {...previous,config:validateConfig({...previous.config,id:'human-screen-action-relations',actionRelations:{enabled:true}})};}
 if(mode==='experience-goal-search-grounded'){const previous=humanJevProfile('experience-goal-search-v2');return {...previous,config:validateConfig({...previous.config,id:'human-screen-goal-search-grounded',goalSearch:{...previous.config.goalSearch!,evidenceMode:'source-grounded'}})};}
 if(mode==='experience-goal-search-v2'){const previous=humanJevProfile('experience-goal-search');return {...previous,config:validateConfig({...previous.config,id:'human-screen-goal-search-v2',goalSearch:{...previous.config.goalSearch!,interpretation:'role-state-v2'}})};}
 if(mode==='experience-goal-search'){const previous=humanJevProfile('experience-reason-correspondence');return {...previous,config:validateConfig({...previous.config,id:'human-screen-goal-search',goalSearch:{enabled:true,capacity:8}})};}
 if(mode==='experience-reason-correspondence'){const previous=humanJevProfile('experience-reason-conditional');return {...previous,config:validateConfig({...previous.config,id:'human-screen-experience-correspondence',correspondence:{enabled:true,capacity:8,maxCurrentCandidates:8,maxPastCandidates:12,maxUniqueImages:4}})};}
 if(mode==='experience-reason-conditional'){const previous=humanJevProfile('experience-reason-grounded');return {...previous,config:validateConfig({...previous.config,id:'human-screen-experience-conditional',deferral:{...previous.config.deferral!,selectionScope:'ui-conditional'}})};}
 if(mode!=='baseline'&&mode!=='deliberation'&&mode!=='experience'&&mode!=='experience-basis'&&mode!=='experience-defer'&&mode!=='experience-reason'&&mode!=='experience-reason-excursion'&&mode!=='experience-reason-grounded')throw new Error('UNKNOWN_HUMAN_JEV_MODE');
 const config:BetaConfig={schemaVersion:1,id:'human-screen-baseline',vision:{mode:'crop',clearWidth:4096,clearHeight:4096,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'goal',maxUIActions:15,maxLooks:3,maxDecisions:12,maxAPICalls:12,maxRunMs:180000,modeledActionMs:null};
 if(mode!=='baseline'){
  config.id='human-screen-deliberation';
  config.deliberation={enabled:true,memoryCapacity:3,candidateEffects:true};
  config.maxAPICalls=24;
 }
 if(mode==='experience'||mode==='experience-basis'||mode==='experience-defer'||mode==='experience-reason'||mode==='experience-reason-excursion'||mode==='experience-reason-grounded'){config.id=mode==='experience'?'human-screen-experience':'human-screen-experience-basis';config.experience={enabled:true,capacity:8,...(mode!=='experience'?{evidenceMode:'basis' as const}:{})};}
 if(mode==='experience-defer'||mode==='experience-reason'||mode==='experience-reason-excursion'||mode==='experience-reason-grounded'){config.id='human-screen-experience-defer';config.deferral={enabled:true,capacity:8,weight:0.01,minAlternativeProbability:0.01};}
 if(mode==='experience-reason'||mode==='experience-reason-excursion'||mode==='experience-reason-grounded'){config.id=mode==='experience-reason'?'human-screen-experience-reason':mode==='experience-reason-excursion'?'human-screen-experience-reason-excursion':'human-screen-experience-reason-grounded';config.deferralReason={enabled:true,capacity:8,maxReasonImages:1,...(mode!=='experience-reason'?{basisAdmission:'excursion-evidence' as const}:{}),...(mode==='experience-reason-grounded'?{reviewMode:'grounded-choice' as const}:{})};}
 return {config:validateConfig(config),maximumRequests:mode!=='baseline'?24:13,explorationMaximum:mode!=='baseline'?24:12,reviewMaximum:mode!=='baseline'?0:1,perRunMaximum:12};
}
