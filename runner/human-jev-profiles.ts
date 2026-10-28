import type {BetaConfig} from '../jev/virtual-beta/contracts.js';
import {validateConfig} from '../jev/virtual-beta/config.js';

export type HumanJevMode='baseline'|'deliberation'|'experience';

/** Same screen, goal policy and decision limit; only the declared deliberation stage adds requests. */
export function humanJevProfile(mode:HumanJevMode='baseline'):{config:BetaConfig;maximumRequests:number;explorationMaximum:number;reviewMaximum:number;perRunMaximum:12}{
 if(mode!=='baseline'&&mode!=='deliberation'&&mode!=='experience')throw new Error('UNKNOWN_HUMAN_JEV_MODE');
 const config:BetaConfig={schemaVersion:1,id:'human-screen-baseline',vision:{mode:'crop',clearWidth:4096,clearHeight:4096,blurRadius:12},state:{enabled:true,memoryCapacity:3},selection:{mode:'argmax',seed:20261028},behavior:'goal',maxUIActions:15,maxLooks:3,maxDecisions:12,maxAPICalls:12,maxRunMs:180000,modeledActionMs:null};
 if(mode!=='baseline'){
  config.id='human-screen-deliberation';
  config.deliberation={enabled:true,memoryCapacity:3,candidateEffects:true};
  config.maxAPICalls=24;
 }
 if(mode==='experience'){config.id='human-screen-experience';config.experience={enabled:true,capacity:8};}
 return {config:validateConfig(config),maximumRequests:mode!=='baseline'?24:13,explorationMaximum:mode!=='baseline'?24:12,reviewMaximum:mode!=='baseline'?0:1,perRunMaximum:12};
}
