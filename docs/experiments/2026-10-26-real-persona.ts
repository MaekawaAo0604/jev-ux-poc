import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {experimentDecider,parsePersona,publicExploration} from '../../jev/persona.js';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {safeRequestFailure} from '../../jev/client.js';
import type {State} from '../../jev/types.js';
const root=resolve(process.argv[2]??'reports/persona-real-pages-2026-10-26'),captureRoot=resolve(process.argv[3]??'reports/persona-real-pages-capture-verified-2026-10-26'),fake=process.argv.includes('--fake');if(!fake)process.loadEnvFile('.env');
const spec=JSON.parse(await readFile('experiments/persona/real-pages.json','utf8')),hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
await mkdir(root);await mkdir(join(root,'scenes'));await mkdir(join(root,'execution-source'));
const personas:any={};for(const name of ['a','b','c']){const p=parsePersona(JSON.parse(await readFile('experiments/persona/persona-'+name+'.json','utf8')));personas[p.id]=p;}
for(const a of spec.ablations)personas[a.id]={...structuredClone(personas[a.base]),knowledge:[...personas[a.knowledgeFrom].knowledge]};
const captures:any={};for(const scene of spec.scenes){const path=join(root,'scenes',scene.id);await mkdir(path);captures[scene.id]=JSON.parse(await readFile(join(captureRoot,scene.id,'capture.json'),'utf8'));const bytes=await readFile(join(captureRoot,scene.id,'before.png'));if(hash(bytes)!==captures[scene.id].imageSha256)throw new Error('SOURCE_CHANGED');await copyFile(join(captureRoot,scene.id,'before.png'),join(path,'before.png'));await copyFile(join(captureRoot,scene.id,'trace.zip'),join(path,'capture-trace.zip'));await writeFile(join(path,'capture.json'),JSON.stringify(captures[scene.id],null,2));}
let seed=spec.seed;const shuffle=<T>(items:T[])=>{const a=[...items];for(let j=a.length-1;j>0;j--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const k=Math.floor(seed/4294967296*(j+1));[a[j],a[k]]=[a[k],a[j]];}return a;};
const main=spec.scenes.filter((s:any)=>s.id!=='control'),plan:any[]=[];
for(let repeat=1;repeat<=spec.repeats.primary;repeat++)for(const scene of shuffle(main))for(const condition of shuffle(spec.conditions))plan.push({phase:'primary',scene:scene.id,repeat,condition});
for(let repeat=1;repeat<=spec.repeats.confirmation;repeat++)for(const scene of shuffle(main))for(const condition of shuffle([...spec.conditions,...spec.ablations.map((a:any)=>a.id)]))plan.push({phase:spec.conditions.includes(condition)?'confirmation':'ablation',scene:scene.id,repeat,condition});
for(let repeat=1;repeat<=spec.repeats.control;repeat++)for(const condition of shuffle(spec.conditions))plan.push({phase:'control',scene:'control',repeat,condition});
const sources=['docs/experiments/2026-10-26-real-persona.ts','docs/experiments/2026-10-26-real-persona-capture.ts','docs/experiments/real-persona-analysis.ts','docs/experiments/persona-probe-analysis.ts','experiments/persona/real-pages.json','jev/persona.ts','jev/decide.ts','jev/visual-context.ts','jev/types.ts','pages/PublicSitePage.ts','pages/ClientToolPage.ts','pages/AutoPage.ts'];
const sourceHashes:any={};for(const file of sources){const bytes=await readFile(file);sourceHashes[file]=hash(bytes);await writeFile(join(root,'execution-source',file.replaceAll('/','__')),bytes);}
const manifest={schemaVersion:1,kind:spec.kind,startedAt:new Date().toISOString(),fake,spec,specSha256:hash(JSON.stringify(spec)),plan,personas,captureRoot,sourceHashes,concurrency:2,observationMode:'frozen unmodified numbered real-site screenshot and visible DOM; no history',caveat:'Each row is a new stateless Jev decision, not a new human or a live browser session. Live continuation checks are saved separately.'};
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
const results:any[]=[];
async function trial(item:any,index:number){
 const capture=captures[item.scene],scene=spec.scenes.find((s:any)=>s.id===item.scene),dir=item.phase+'-'+item.scene+'-'+item.condition+'-'+item.repeat,path=join(root,dir);await mkdir(path);
 const state:State=structuredClone(capture.state);state.exploration=publicExploration({charter:state.exploration!.charter,...(personas[item.condition]?{persona:personas[item.condition]}:{})});
 const candidates=structuredClone(capture.candidates),neutral=structuredClone(state);delete neutral.exploration!.persona;
 const semantic:any={},groups:any={};for(const [id,c] of Object.entries(candidates) as any){const description=capture.descriptions[id],url=description?.execution?.kind==='navigate'?new URL(description.execution.url):null;semantic[id]=url?'link:'+url.origin+url.pathname+url.search+url.hash:c.action.type==='click'?'control:'+(description?.target?.text||description?.target?.accessibleName||id):c.action.type==='scroll'?'scroll:'+c.action.direction:c.action.type;groups[id]=url&&scene.explanationPath&&url.pathname===scene.explanationPath?'explanation':url&&scene.setupPath&&url.pathname===scene.setupPath?'setup':'other';}
 const visual=new VisualDecisionContext(),calls:any[]=[],bytes=await readFile(join(root,'scenes',item.scene,'before.png'));
 const result:any={...item,planIndex:index,dir,status:'PENDING',fake,startedAt:new Date().toISOString(),inputWithoutPersonaSha256:hash(JSON.stringify({state:neutral,candidates})),imageSha256:hash(bytes),semanticMap:semantic,choiceGroupMap:groups};
 await writeFile(join(path,'input.json'),JSON.stringify({state,candidates},null,2));
 visual.capture(bytes,{step:1,url:capture.url,pageId:state.screen.pageId,viewport:state.screen.viewport},state.screen);
 try{
  const decision=await experimentDecider(async(input,questions)=>{calls.push({input,questions});if(fake){const selected=Object.keys(questions.nextAction.criteria)[0];return {model:'FAKE',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const choice=id==='decisionBasis'?'goal':selected;return [id,{choice,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===choice)]))}];}))};}return visual.evaluate(input,questions,{maxAttempts:3,maxElapsedMs:30000,retryInvalidResponse:true,retryDelaysMs:[1000,2000]});})(state,candidates);
  result.decision=decision;result.model=decision.model;result.semanticChoice=semantic[decision.choice];result.choiceGroup=groups[decision.choice];result.semanticProbabilities={};for(const [id,p] of Object.entries(decision.probabilities))result.semanticProbabilities[semantic[id]]=(result.semanticProbabilities[semantic[id]]??0)+p;
  result.status='RECORDED';
 }catch(error){result.status='ERROR';result.error=safeRequestFailure(error);}
 finally{result.visualContext=visual.snapshot();result.finishedAt=new Date().toISOString();await writeFile(join(path,'requests.json'),JSON.stringify(calls,null,2));await writeFile(join(path,'result.json'),JSON.stringify(result,null,2));await visual.close();}
 results.push(result);console.log('['+results.length+'/'+plan.length+'] '+item.phase+' '+item.scene+' '+item.condition+' #'+item.repeat+': '+result.status+' '+(result.choiceGroup??'')+' '+(result.semanticChoice??''));
}
for(let i=0;i<plan.length;i+=2){await Promise.all(plan.slice(i,i+2).map((item,index)=>trial(item,i+index)));await writeFile(join(root,'results.json'),JSON.stringify(results,null,2));if(results.slice(-2).every(r=>r.status==='ERROR'&&['MISSING_CREDENTIALS'].includes(r.error?.code))){await writeFile(join(root,'interruption.json'),JSON.stringify({reason:'MISSING_CREDENTIALS',completed:results.length,planned:plan.length},null,2));break;}}
console.log('Saved '+root);if(results.some(r=>r.status==='ERROR')||results.length!==plan.length)process.exitCode=1;
