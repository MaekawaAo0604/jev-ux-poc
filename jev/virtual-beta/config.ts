import type {BetaConfig} from './contracts.js';
export function validateConfig(c:BetaConfig):BetaConfig {
 if(c.initialFixation!==undefined&&(!c.initialFixation||!Number.isFinite(c.initialFixation.x)||!Number.isFinite(c.initialFixation.y)||c.initialFixation.x<0||c.initialFixation.x>=1280||c.initialFixation.y<0||c.initialFixation.y>=900))throw new Error('INVALID_INITIAL_FIXATION');
 if(c.schemaVersion!==1||!/^[-a-z0-9]{1,64}$/.test(c.id))throw new Error('INVALID_CONFIG');
 for(const [key,limit] of Object.entries({maxUIActions:30,maxDecisions:60,maxAPICalls:60,maxRunMs:300000})) {const n=c[key as keyof BetaConfig];if(typeof n!=='number'||!Number.isSafeInteger(n)||n<1||n>limit)throw new Error('INVALID_CONFIG_'+key);}
 if(!Number.isSafeInteger(c.maxLooks)||c.maxLooks<0||c.maxLooks>30)throw new Error('INVALID_CONFIG_maxLooks');
 if(!['goal','user'].includes(c.behavior)||!['argmax','sample'].includes(c.selection.mode)||!Number.isSafeInteger(c.selection.seed)||c.selection.seed<0||c.selection.seed>0xffffffff)throw new Error('INVALID_SELECTION_CONFIG');
 if(typeof c.state.enabled!=='boolean'||!Number.isSafeInteger(c.state.memoryCapacity)||c.state.memoryCapacity<0||c.state.memoryCapacity>8)throw new Error('INVALID_STATE_CONFIG');
 if(c.deliberation!==undefined&&(!c.deliberation||typeof c.deliberation.enabled!=='boolean'||!Number.isSafeInteger(c.deliberation.memoryCapacity)||c.deliberation.memoryCapacity<1||c.deliberation.memoryCapacity>8||c.deliberation.enabled&&!c.state.enabled||c.deliberation.candidateEffects!==undefined&&typeof c.deliberation.candidateEffects!=='boolean'))throw new Error('INVALID_DELIBERATION_CONFIG');
 if(c.experience!==undefined&&(!c.experience||typeof c.experience.enabled!=='boolean'||!Number.isSafeInteger(c.experience.capacity)||c.experience.capacity<1||c.experience.capacity>8||c.experience.evidenceMode!==undefined&&c.experience.evidenceMode!=='basis'||c.experience.enabled&&(!c.state.enabled||c.state.memoryCapacity<2||!c.deliberation?.enabled)))throw new Error('INVALID_EXPERIENCE_CONFIG');
 if(!['full','crop','foveated'].includes(c.vision.mode)||!Number.isSafeInteger(c.vision.clearWidth)||c.vision.clearWidth<1||c.vision.clearWidth>4096||!Number.isSafeInteger(c.vision.clearHeight)||c.vision.clearHeight<1||c.vision.clearHeight>4096||!Number.isSafeInteger(c.vision.blurRadius)||c.vision.blurRadius<0||c.vision.blurRadius>64||(c.vision.mode==='foveated'&&c.vision.blurRadius===0))throw new Error('INVALID_VISION_CONFIG');
 if(c.modeledActionMs!==null&&(!Number.isFinite(c.modeledActionMs)||c.modeledActionMs<0||c.modeledActionMs>60000))throw new Error('INVALID_MODELED_TIME');
 return structuredClone(c);
}
export function comparisonConfigs(seed=20261027,vision:'crop'|'foveated'='foveated'):BetaConfig[]{
 const base:BetaConfig={schemaVersion:1,id:'current',vision:{mode:'full',clearWidth:960,clearHeight:620,blurRadius:12},state:{enabled:false,memoryCapacity:3},selection:{mode:'argmax',seed},behavior:'goal',maxUIActions:6,maxLooks:4,maxDecisions:10,maxAPICalls:6,maxRunMs:90000,modeledActionMs:null};
 const configs:BetaConfig[]=[base,{...structuredClone(base),id:'vision',vision:{...base.vision,mode:vision}},{...structuredClone(base),id:'state',state:{...base.state,enabled:true},selection:{mode:'sample',seed},behavior:'user'},{...structuredClone(base),id:'combined',vision:{...base.vision,mode:vision},state:{...base.state,enabled:true},selection:{mode:'sample',seed},behavior:'user'}];return configs.map(validateConfig);
}
