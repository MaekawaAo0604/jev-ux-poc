import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {AutoPage} from '../../pages/AutoPage.js';
import {candidatesFor,type State} from '../../jev/types.js';
import {experimentDecider,parsePersona,publicExploration} from '../../jev/persona.js';
import {VisualDecisionContext} from '../../jev/visual-context.js';
import {safeRequestFailure} from '../../jev/client.js';

// Matched one-step judgments on synthetic fixtures. No product or navigation policy changes.
const root=resolve(process.argv[2]??'reports/persona-probes-2026-10-26');
const fake=process.argv.includes('--fake');
if(existsSync('.env'))process.loadEnvFile('.env');
if(!fake&&!process.env.AI_GATEWAY_API_KEY)throw new Error('Missing AI_GATEWAY_API_KEY');
const spec=JSON.parse(await readFile('experiments/persona/probes.json','utf8'));
await mkdir(root);await mkdir(join(root,'scenes'));
const hash=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const personas:any={};for(const name of ['a','b','c']){const p=parsePersona(JSON.parse(await readFile(`experiments/persona/persona-${name}.json`,'utf8')));personas[p.id]=p;}
for(const a of spec.ablations)personas[a.id]={...structuredClone(personas[a.base]),...a.fields}; // Keep identity fields fixed within an ablation.
let seed=spec.seed;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const shuffle=<T>(values:T[])=>{for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
const plan=Array.from({length:spec.repeats},(_,i)=>shuffle([...spec.scenes]).flatMap((scene:any)=>shuffle(['baseline','A','B','C',...(scene.id==='control'?[]:spec.ablations.map((a:any)=>a.id))]).map(condition=>({scene:scene.id,repeat:i+1,condition,reversed:i%2===1})))).flat();
const manifest={schemaVersion:1,kind:spec.kind,fake,startedAt:new Date().toISOString(),spec,specSha256:hash(JSON.stringify(spec)),personas,plan,modelRequested:spec.model,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',concurrency:2,observationMode:'numbered-image-and-dom',history:'empty for every judgment',scope:'Isolated one-step decisions on synthetic fixtures, not end-to-end exploration or human UX validation.',targetTagCaveat:'local:bad is the existing charter harness tag; every screen is a dedicated synthetic fixture, not app/main.tsx.',sourceHashes:Object.fromEntries(await Promise.all(['docs/experiments/2026-10-26-persona-probes.ts','jev/persona.ts','jev/decide.ts','jev/visual-context.ts','pages/AutoPage.ts','pages/AccountPage.ts'].map(async p=>[p,hash(await readFile(p))])))};
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2));
const browser=await chromium.launch({headless:true});
await writeFile(join(root,'environment.json'),JSON.stringify({browser:browser.version(),node:process.version},null,2));
const results:any[]=[];let completed=0;
const html=(scene:any,reverse:boolean)=>`<!doctype html><html lang="ja"><meta charset="utf-8"><title>${escape(scene.title)}</title><style>body{font:18px/1.7 system-ui;margin:70px auto;max-width:1040px;color:#20303b;background:#fafafa}h1{font-size:28px}.options{display:flex;gap:24px;margin-top:40px}button{font:inherit;text-align:left;background:white;border:1px solid #788995;border-radius:5px;padding:25px;flex:1;color:inherit}strong{display:block;font-size:20px;margin-bottom:14px}span{display:block}</style><h1>${escape(scene.title)}</h1><p>${escape(scene.description)}</p><main class="options">${(reverse?[...scene.options].reverse():scene.options).map((o:any)=>`<button type="button" data-option="${o.id}"><strong>${escape(o.title)}</strong><span>${escape(o.description)}</span></button>`).join('')}</main><script>document.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{document.body.dataset.selected=b.dataset.option;document.querySelector('main').innerHTML='<p role="status">選択した操作：'+b.querySelector('strong').textContent+'</p>';}));</script></html>`;
async function trial(item:any){
 const scene=spec.scenes.find((s:any)=>s.id===item.scene),dir=`${item.scene}-${item.repeat}-${item.condition}`,path=join(root,dir);await mkdir(path);
 const context=await browser.newContext({viewport:manifest.viewport,locale:manifest.locale,timezoneId:manifest.timezoneId,serviceWorkers:'block'});
 const visual=new VisualDecisionContext();
 const result:any={...item,dir,kind:spec.kind,fake,goal:scene.goal,status:'PENDING'};
 try{
  const page=await context.newPage();await context.route('**/*',r=>r.request().url().startsWith('http://probe.local/bad/')?r.fulfill({contentType:'text/html',body:html(scene,item.reversed)}):r.abort());
  await context.tracing.start({screenshots:true,snapshots:true});await page.goto('http://probe.local/bad/');
  const pom=new AutoPage(page,true,true),screen=await pom.observe(false),candidates=candidatesFor(screen,false);
  const charter={schemaVersion:1 as const,id:'probe-'+scene.id,targetWebsite:'local:bad' as const,goal:scene.goal,initialState:{description:'製品UIとは別の専用検証画面。選択前の状態。',currentDate:'2026-10-26'},scope:['この合成検証画面内で、次の操作を選ぶ'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:1};
  const state:State={goal:scene.goal,currentDate:'2026-10-26',screen,history:[],exploration:publicExploration({charter,...(personas[item.condition]?{persona:personas[item.condition]}:{})})};
  const capture=await pom.captureDecisionScreenshot(screen,candidates,join(path,'before.png'));
  const labelToSemantic=Object.fromEntries(Object.entries(candidates).map(([id,c])=>[id,scene.options.find((o:any)=>c.label.includes(o.title))?.id??c.action.type]));
  const neutral=structuredClone(state);delete neutral.exploration!.persona;
  result.inputWithoutPersonaSha256=hash(JSON.stringify({state:neutral,candidates}));result.imageSha256=hash(capture.bytes);result.labelToSemantic=labelToSemantic;
  await writeFile(join(path,'input.json'),JSON.stringify({state,candidates},null,2));
  visual.capture(capture.bytes,{step:1,url:page.url(),pageId:screen.pageId,viewport:screen.viewport},screen);
  const captured:any[]=[];
  const decision=await experimentDecider(async(input,questions)=>{captured.push({input,questions});if(fake){const choice=Object.keys(questions.nextAction.criteria)[0];return {model:'FAKE',answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>{const selected=id==='decisionBasis'?'goal':choice;return [id,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,Number(k===selected)]))}];}))};}return visual.evaluate(input,questions);})(state,candidates);
  result.decision=decision;result.semanticChoice=labelToSemantic[decision.choice];result.model=decision.model;
  result.semanticProbabilities=Object.fromEntries(Object.entries(decision.probabilities).map(([id,p])=>[labelToSemantic[id],p]));
  await writeFile(join(path,'requests.json'),JSON.stringify(captured,null,2));
  if(['click','scroll','back'].includes(decision.action.type))await pom.act(decision.action);
  result.executed=decision.action.type==='click';result.after=await pom.observe(false);result.visualContext=visual.snapshot();
  await page.screenshot({path:join(path,'after.png')});result.status='RECORDED';
 }catch(e){result.status='ERROR';result.error=safeRequestFailure(e);if(!result.error||result.error.code==='REQUEST_FAILED')result.error={code:'PROBE_ERROR'};}
 finally{try{await context.tracing.stop({path:join(path,'trace.zip')});}catch{}await visual.close();await context.close();}
 await writeFile(join(path,'result.json'),JSON.stringify(result,null,2));results.push(result);completed++;
 console.log(`[${completed}/${plan.length}] ${item.scene} ${item.condition} #${item.repeat}: ${result.status} ${result.semanticChoice??''}`);
}

try{for(let i=0;i<plan.length;i+=2){await Promise.all(plan.slice(i,i+2).map(trial));await writeFile(join(root,'results.json'),JSON.stringify(results,null,2));}}finally{await browser.close();}
console.log('Saved '+root);if(results.some(r=>r.status==='ERROR'))process.exitCode=1;
