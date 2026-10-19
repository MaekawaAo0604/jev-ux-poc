// Same saved pixels and reconstructed executed history; no site requests.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ImageOnlyInput} from '../../jev/image-only-input.js';
import {evaluateChoices} from '../../jev/client.js';
process.loadEnvFile('.env');
const source='reports/2026-10-19T07-25-20.426Z-public/exploration',step=JSON.parse(await readFile(`${source}/step-10.json`,'utf8')),png=await readFile(`${source}/step-10.png`);
const input=new ImageOnlyInput();
for(let n=1;n<10;n++){
 const s=JSON.parse(await readFile(`${source}/step-${n}.json`,'utf8'));
 if(s.result==='OK')input.record(s.decision.action,{step:n,pageId:s.state.screen.pageId,viewport:s.state.screen.viewport});
}
const wire=input.request({goal:step.state.goal,currentDate:step.state.currentDate},{nextAction:{type:'choice',instructions:'',criteria:Object.fromEntries(Object.keys(step.candidates).map(k=>[k,k]))}},{step:10,pageId:step.state.screen.pageId,viewport:step.state.screen.viewport},step.visualContext.imageJudgments);
const before=structuredClone(wire);
delete (before.context.screen as any).scrollCoverage;
for(const h of before.context.history)delete h.viewport;
for(const q of Object.values(before.questions))q.instructions=q.instructions.split(' history.viewportは')[0];
const dir=`reports/scroll-progress-pair-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(dir,{recursive:true});
const responses=[];
for(let repeat=1;repeat<=3;repeat++)for(const variant of ['before','after'] as const){
 const request=variant==='before'?before:wire;
 const response=await evaluateChoices({context:request.context,screenshot:'current',observations:[{...request.frame,current:true}]},request.questions,{maxAttempts:2,maxElapsedMs:30000},{images:{current:{mediaType:'image/png',data:png.toString('base64')}}});
 responses.push({repeat,variant,response});console.log(JSON.stringify({repeat,variant,choice:response.answers.nextAction.choice}));
 await writeFile(`${dir}/probe.json`,JSON.stringify({dir,purpose:'Paired saved-image diagnostic with reconstructed context, not an exact original request replay. No success rate is inferred.',source,sourceSha256:createHash('sha256').update(png).digest('hex'),requests:{before,after:wire},responses},null,2));
}
