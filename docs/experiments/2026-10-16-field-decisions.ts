// Diagnostic replay only: fixed repetitions of saved inputs, no browser actions.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {jevDecide,requestFor} from '../../jev/decide.js';
import {evaluateChoices} from '../../jev/client.js';
import {chooseFrontier} from '../../jev/frontier.js';
process.loadEnvFile('.env');
const root=resolve('reports',`field-decisions-${new Date().toISOString().replaceAll(':','-')}`);await mkdir(root,{recursive:true});
const completeness='Goalに含まれる要求をすべて確認する。対象・範囲・時期・前提条件などの限定を落とさず、それぞれに対応する観測事実が必要。一部の質問への回答や、条件の弱い別の説明から、残りも満たしたと推測しない。必要性の説明だけから、必要となる時期や手続方法を補わない。未確認の条件が残るならdoneではなく、確認のための操作かstuckを選ぶ。';
const alternativesNote='observedAlternativesは別の画面で実際に見た未実行の操作候補であり、達成の証拠でも現在実行できる操作でもない。今の画面で手掛かりがない場合も、戻る・既知の移動を使い、Goalに関係する未探索の候補を別ルートとして検討する。再訪時の利用可能性は再観測して判断する。';
const records=[];
for(const [name,source] of (process.argv.includes('--final-replay')?[['jma','2026-10-16T05-07-26.195Z-public'],['ndl-old','2026-10-16T05-08-04.004Z-public'],['ndl-new','2026-10-16T05-19-51.641Z-public']]:[['jma','2026-10-16T05-07-26.195Z-public'],['ndl','2026-10-16T05-08-04.004Z-public']])){
 if((process.argv.includes('--recovery')||process.argv.includes('--frontier'))&&name!=='jma')continue;
 const dir=resolve('reports',source!,'exploration'),result=JSON.parse(await readFile(join(dir,'result.json'),'utf8')),step=result.steps.at(-1);
 const bytes=await readFile(join(dir,step.screenshot));
 const alternatives=result.steps.slice(0,-1).map((s:any)=>({pageTitle:s.state.screen.title,pageId:s.state.screen.pageId,controls:Object.entries(s.candidates).filter(([id,c]:any)=>c.action.type==='click'&&id!==s.decision.choice).map(([,c]:any)=>({label:c.label,kind:c.action.type}))}));
 if(process.argv.includes('--final-replay')){
  const previous=result.steps.at(-2),nearby=previous?[{pageTitle:previous.state.screen.title,pageId:previous.state.screen.pageId,controls:Object.entries(previous.candidates).filter(([id,c]:any)=>c.action.type==='click'&&id!==previous.decision.choice).map(([id,c]:any)=>({...c.action,kind:c.action.type,label:c.label,context:previous.state.screen.elements.find((e:any)=>e.id===c.action.elementId)?.context}))}]:[];
  for(let repeat=1;repeat<=3;repeat++){
   const decision=await jevDecide({...step.state,observedAlternatives:nearby},step.candidates,{verifyCompletion:true},(input,questions)=>evaluateChoices(input,questions,undefined,{image:{mediaType:'image/png',data:bytes.toString('base64')}}));
   records.push({name,variant:'guarded-production',repeat,sha256:createHash('sha256').update(bytes).digest('hex'),decision});console.log(JSON.stringify({name,repeat,choice:decision.choice,coverage:decision.completionCheck?.assessment,recovery:decision.recovery?.selectedAlternative}));
  }
  await writeFile(join(root,'records.json'),JSON.stringify(records,null,2));continue;
 }
 if(process.argv.includes('--production')){
  for(let repeat=1;repeat<=3;repeat++){
   const decision=await jevDecide({...step.state,observedAlternatives:alternatives},step.candidates,undefined,(input,questions)=>evaluateChoices(input,questions,undefined,{image:{mediaType:'image/png',data:bytes.toString('base64')}}));
   records.push({name,variant:'production',repeat,sha256:createHash('sha256').update(bytes).digest('hex'),decision});console.log(JSON.stringify({name,repeat,choice:decision.choice,recovery:decision.recovery?.selectedAlternative}));
  }
  await writeFile(join(root,'records.json'),JSON.stringify(records,null,2));continue;
 }
 if(process.argv.includes('--frontier')){
  const targets=Object.fromEntries(alternatives.flatMap((a:any)=>a.controls.map((c:any)=>({...c,pageTitle:a.pageTitle,pageId:a.pageId,travelSteps:1,nextChoice:'back'}))).map((target:any,i:number)=>[`f${i+1}`,target]));
  for(let repeat=1;repeat<=3;repeat++){
   const decision=await chooseFrontier(step.state,step.candidates,{targets},[step.state.goal],(input,questions)=>evaluateChoices(input,questions,undefined,{image:{mediaType:'image/png',data:bytes.toString('base64')}}));
   records.push({name,variant:'frontier-recovery',repeat,decision});console.log(JSON.stringify(records.at(-1)));
  }
  await writeFile(join(root,'records.json'),JSON.stringify(records,null,2));continue;
 }
 for(const variant of (process.argv.includes('--recovery')?['back-context']:['baseline','candidate']))for(let repeat=1;repeat<=3;repeat++){
  const decision=await jevDecide(step.state,step.candidates,undefined,async(input,questions)=>{
   const q=structuredClone(questions);
   if(variant!=='baseline')q.nextAction.instructions+=' '+completeness+' '+alternativesNote;
   if(variant==='back-context')q.nextAction.criteria.back+='。現在の画面から先に進めない場合に前の画面へ戻り、observedAlternativesに記録された未実行の別の入口を調べるための操作。現在のページにGoalの手掛かりがないことだけを理由にstuckで終了せず、未探索の別ルートの可能性を検討する。';
   return evaluateChoices(variant!=='baseline'?{...(input as object),observedAlternatives:alternatives}:input,q,undefined,{image:{mediaType:'image/png',data:bytes.toString('base64')}});
  });
  records.push({name,variant,repeat,sha256:createHash('sha256').update(bytes).digest('hex'),decision});
  console.log(JSON.stringify({name,variant,repeat,choice:decision.choice}));
 }
 await writeFile(join(root,'records.json'),JSON.stringify(records,null,2));
}
console.log(root);
