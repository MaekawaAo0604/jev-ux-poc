// Saved-source replay only. No website requests or expected answers to Jev.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ImageOnlyInput,completionBoundaryQuestion} from '../../jev/image-only-input.js';
import {evaluateChoices} from '../../jev/client.js';
process.loadEnvFile('.env');
const dir=`reports/completion-boundary-pair-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(dir,{recursive:true});
const source='reports/2026-10-19T07-23-17.048Z-public/exploration',step=JSON.parse(await readFile(`${source}/step-3.json`,'utf8')),png=await readFile(`${source}/step-3.png`);
const input=new ImageOnlyInput();input.record({type:'click',elementId:'e24'},{step:1,pageId:'prior1'});input.record({type:'click',elementId:'e14'},{step:2,pageId:'prior2'});
const memory=structuredClone(step.visualContext.imageJudgments);memory.routes=[];memory.representation='current-state-and-latest-source';
for(const r of memory.requirements){r.recordCount=r.records.length;r.records=[[...r.records].reverse().find(v=>v.assessment===r.status)];}
const wire=input.request({goal:step.state.goal,currentDate:step.state.currentDate},{completionCoverage:{type:'choice',instructions:'',criteria:{complete:'yes',incomplete:'no',uncertain:'unknown'}}},{step:3,pageId:'prior3',viewport:step.state.screen.viewport},memory,true);
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const state={context:wire.context,screenshot:'current',observations:[{...wire.frame,current:true,sha256:hash(png),screenshot:'current'}]};
const responses=[];
for(let repeat=1;repeat<=3;repeat++)for(const variant of ['before','after'] as const){
 const questions={...wire.questions,...(variant==='after'?{completionBoundary:completionBoundaryQuestion}:{})};
 const response=await evaluateChoices(state,questions,{maxAttempts:2,maxElapsedMs:30000},{images:{current:{mediaType:'image/png',data:png.toString('base64')}}});
 responses.push({repeat,variant,response});console.log(JSON.stringify({repeat,variant,coverage:response.answers.completionCoverage.choice,boundary:response.answers.completionBoundary?.choice}));
 await writeFile(`${dir}/probe.json`,JSON.stringify({dir,source,sourceSha256:hash(png),state,questions:{before:wire.questions,after:{...wire.questions,completionBoundary:completionBoundaryQuestion}},responses},null,2));
}
const detailPath='reports/2026-10-19T07-24-15.833Z-public/exploration/step-5.png',detail=await readFile(detailPath);
const positives=[];
for(let repeat=1;repeat<=3;repeat++){
 const response=await evaluateChoices({context:{goal:step.state.goal,currentDate:step.state.currentDate},screenshot:'current',observations:[{id:'v1',current:false,screenshot:'previous',sha256:hash(png)},{id:'v2',current:true,screenshot:'current',sha256:hash(detail)}]},{completionBoundary:completionBoundaryQuestion},{maxAttempts:2,maxElapsedMs:30000},{images:{previous:{mediaType:'image/png',data:png.toString('base64')},current:{mediaType:'image/png',data:detail.toString('base64')}}});
 positives.push({repeat,response});console.log(JSON.stringify({positiveControl:repeat,boundary:response.answers.completionBoundary.choice}));
 await writeFile(`${dir}/positive.json`,JSON.stringify({purpose:'Independent saved-source control with both parts of the visible required list, not a reconstructed exploration.',sources:[`${source}/step-3.png`,detailPath],hashes:[hash(png),hash(detail)],positives},null,2));
}
