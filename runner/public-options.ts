import {validateGoalChecks} from '../jev/goal-status.js';
export type PublicOptions={url:string;goal:string;maxActions:number;intervalMs:number;goalChecks?:string[];vision?:true;visionOCR?:true;imageOnly?:true;imageMemory?:true;imageMemoryProof?:true};
export function parsePublicOptions(args:string[]):PublicOptions{
 const [input,goal,...flags]=args;
 const url=new URL(input);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('URL must be HTTP(S) without credentials');
 if(!goal?.trim())throw new Error('Goal is required');
 let maxActions=0,intervalMs=2000,reviewed=false,vision=false,visionOCR=false,imageOnly=false,imageMemory=false,imageMemoryProof=false;const checks:string[]=[];
 for(let i=0;i<flags.length;i++){
  const flag=flags[i];
  if(flag==='--reviewed'){reviewed=true;continue;}
  if(flag==='--vision'){vision=true;continue;}
  if(flag==='--vision-ocr'){visionOCR=true;continue;}
  if(flag==='--image-only'){imageOnly=true;continue;}
  if(flag==='--image-memory'){imageMemory=true;continue;}
  if(flag==='--image-memory-proof'){imageMemoryProof=true;continue;}
  if(flag==='--goal-check'){checks.push(flags[++i]);continue;}
  if(flag!=='--max-actions'&&flag!=='--interval-ms')throw new Error(`Unknown option: ${flag}`);
  const n=Number(flags[++i]);
  if(!Number.isSafeInteger(n)||n<(flag==='--interval-ms'?1000:0)||n>2147483647)throw new Error(`Invalid ${flag}`);
  if(flag==='--max-actions')maxActions=n;else intervalMs=n;
 }
 if(!reviewed)throw new Error('Check site terms, robots.txt and the scope before adding --reviewed. Candidate discovery is not permission to run.');
 if(vision&&checks.length)throw new Error('--vision does not yet support the DOM-grounded --goal-check pipeline');
 if(visionOCR&&!vision)throw new Error('--vision-ocr requires --vision');
 if(imageOnly&&!vision)throw new Error('--image-only requires --vision');
 if(imageOnly&&visionOCR)throw new Error('--image-only cannot combine with --vision-ocr');
 if(imageMemory&&!imageOnly)throw new Error('--image-memory requires --image-only');
 if(imageMemoryProof&&!imageMemory)throw new Error('--image-memory-proof requires --image-memory');
 return {url:url.href,goal:goal.trim(),maxActions,intervalMs,...(checks.length?{goalChecks:validateGoalChecks(goal,checks)}:{}),...(vision?{vision:true as const}:{}),...(visionOCR?{visionOCR:true as const}:{}),...(imageOnly?{imageOnly:true as const}:{}),...(imageMemory?{imageMemory:true as const}:{}),...(imageMemoryProof?{imageMemoryProof:true as const}:{})};
}
