import {validateGoalChecks} from '../jev/goal-status.js';
export type PublicOptions={url:string;goal:string;maxActions:number;intervalMs:number;goalChecks?:string[]};
export function parsePublicOptions(args:string[]):PublicOptions{
 const [input,goal,...flags]=args;
 const url=new URL(input);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('URL must be HTTP(S) without credentials');
 if(!goal?.trim())throw new Error('Goal is required');
 let maxActions=0,intervalMs=2000,reviewed=false;const checks:string[]=[];
 for(let i=0;i<flags.length;i++){
  const flag=flags[i];
  if(flag==='--reviewed'){reviewed=true;continue;}
  if(flag==='--goal-check'){checks.push(flags[++i]);continue;}
  if(flag!=='--max-actions'&&flag!=='--interval-ms')throw new Error(`Unknown option: ${flag}`);
  const n=Number(flags[++i]);
  if(!Number.isSafeInteger(n)||n<(flag==='--interval-ms'?1000:0)||n>2147483647)throw new Error(`Invalid ${flag}`);
  if(flag==='--max-actions')maxActions=n;else intervalMs=n;
 }
 if(!reviewed)throw new Error('Check site terms, robots.txt and the scope before adding --reviewed. Candidate discovery is not permission to run.');
 return {url:url.href,goal:goal.trim(),maxActions,intervalMs,...(checks.length?{goalChecks:validateGoalChecks(goal,checks)}:{})};
}
