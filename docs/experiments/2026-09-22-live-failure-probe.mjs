// Replay failed decisions only; no browser actions. Never persist SDK errors.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gateway} from '@ai-sdk/gateway';
import {jevDecide} from '../../jev/decide.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {safeRequestFailure} from '../../jev/client.ts';
process.loadEnvFile('.env');
const root=`reports/live-failure-probe-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(root,{recursive:true});
let traces=[],calls=0;
const classify=error=>{
 const text=[error?.message,error?.responseBody,error?.cause?.message,error?.cause?.responseBody].filter(v=>typeof v==='string').join('\n');
 return Object.entries({contextLimit:/context.{0,40}(?:length|limit)|maximum.{0,30}tokens|token.{0,20}limit/i,
  optionLimit:/too many.{0,40}(?:options|criteria)|(?:options|criteria).{0,40}(?:exceed|maximum)/i,
  schema:/schema|validation|invalid request/i,highestProbability:/highest.probability|argmax/i,
  distribution:/probabilit.{0,80}(?:sum|complete distribution|finite)/i}).filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
};
globalThis.AI_SDK_DEFAULT_PROVIDER={evaluationModel(id){
 const base=gateway.evaluationModel(id);
 return {specificationVersion:base.specificationVersion,provider:base.provider,modelId:base.modelId,supportedQuestionTypes:base.supportedQuestionTypes,
  async doEvaluate(input){
   if(++calls>12)throw new Error('Diagnostic request budget reached');
   const trace={questions:Object.keys(input.questions).length,criteriaCounts:Object.values(input.questions).map(q=>Object.keys(q.criteria??{}).length),inputBytes:Buffer.byteLength(JSON.stringify({state:input.state,questions:input.questions}))};
   traces.push(trace);
   try{
    const result=await base.doEvaluate(input);
    trace.status='returned';trace.answerCount=Object.keys(result.answers??{}).length;
    trace.rounding={probabilityDecimals:result.rounding?.probabilityDecimals,scoreDecimals:result.rounding?.scoreDecimals};
    trace.answers=Object.entries(input.questions).map(([id,q])=>{
     const a=result.answers?.[id],p=a?.probabilities??{},values=Object.values(p).filter(v=>typeof v==='number');
     return {id,choice:Object.hasOwn(q.criteria,a?.choice??'')?a.choice:'UNKNOWN',expectedKeys:Object.keys(q.criteria),returnedKeys:Object.keys(p).filter(k=>Object.hasOwn(q.criteria,k)),probabilities:Object.fromEntries(Object.entries(p).filter(([k,v])=>Object.hasOwn(q.criteria,k)&&typeof v==='number')),sum:values.reduce((a,b)=>a+b,0),selectedIsMaximum:a?values.every(v=>v<=(p[a.choice]??-1)+1e-6):false};
    });return result;
   }catch(error){trace.status='failed';trace.failure=safeRequestFailure(error);trace.recognizedCauses=classify(error);throw error;}
  }};
}};
const outputs=[];
for(const folder of ['2026-09-22T08-25-04.719Z-public','2026-09-22T08-28-49.197Z-public','2026-09-22T08-26-36.412Z-public']){
 const result=JSON.parse(await readFile(`reports/${folder}/exploration/result.json`,'utf8')),last=result.steps.at(-1);
 const session=createEvidenceSession({snapshot:result.evidenceSession});traces=[];
 const output={source:folder,previousError:last.error};
 try{const decision=await jevDecide(last.state,last.candidates,{goalChecks:result.settings.goalChecks,session});output.choice=decision.choice;output.action=decision.action;}
 catch(error){output.error=safeRequestFailure(error);output.recognizedCauses=classify(error);}
 output.traces=traces;outputs.push(output);
 await writeFile(`${root}/diagnostics.json`,JSON.stringify(outputs,null,2));
 console.log(JSON.stringify({source:folder,previousError:output.previousError,choice:output.choice,error:output.error,traces:traces.map(({answers,...trace})=>({...trace,invalidDistributions:answers?.filter(a=>Math.abs(a.sum-1)>0.02).length,nonMaximumChoices:answers?.filter(a=>!a.selectedIsMaximum).length}))}));
}
console.log(JSON.stringify({report:`${root}/diagnostics.json`,calls}));
