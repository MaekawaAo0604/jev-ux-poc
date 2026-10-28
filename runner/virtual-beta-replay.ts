import {admitAssessment} from '../jev/virtual-beta/deliberation.js';
import type {BetaCandidates} from '../jev/virtual-beta/contracts.js';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replaySelection} from '../jev/virtual-beta/selection.js';
import {sha,type BetaResult} from './virtual-beta-core.js';
export async function replayDirectory(directory:string){
 const result:BetaResult=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));let choices=0,images=0,assessments=0;
 for(const step of result.steps){
  const d=step.deliberation;
  if(d){
   if(d.inputSha256!==sha(JSON.stringify({input:d.modelInput,questions:d.questions,assets:d.assetFiles})))throw new Error('ASSESSMENT_INPUT_HASH_MISMATCH');
   for(const asset of Object.values(d.assetFiles)){if(asset.file!==asset.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,asset.file)))!==asset.sha256)throw new Error('ASSESSMENT_IMAGE_HASH_MISMATCH');images++;}
   if(d.assessment){
    if(!d.response||!step.userState?.lastObservation)throw new Error('ASSESSMENT_RESPONSE_MISSING');
    const input=d.modelInput as any,sources=[...new Map([...(input.memoryObservations??[]).map((m:any)=>({observationId:m.observationId,imageSha256:m.imageSha256})),{observationId:input.observation.id,imageSha256:d.assetFiles.current.sha256}].map((v:any)=>[v.observationId,v])).values()] as {observationId:string;imageSha256:string}[];
    const candidates:BetaCandidates=Object.fromEntries(Object.keys(d.questions).filter(k=>k.startsWith('effect_')).map(k=>{const id=k.slice(7);return [id,{action:{type:'click',elementId:id},label:id}];}));
    const assessment=admitAssessment(d.response,candidates,step.userState.lastObservation,sources);
    if(JSON.stringify(assessment)!==JSON.stringify(d.assessment))throw new Error('ASSESSMENT_RECORD_MISMATCH');assessments++;
   }
  }
  if(step.modelInput&&step.questions&&step.assetFiles&&step.inputSha256!==sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles})))throw new Error('MODEL_INPUT_HASH_MISMATCH');
  for(const source of Object.values(step.assetFiles??{})){if(source.file!==source.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,source.file)))!==source.sha256)throw new Error('IMAGE_HASH_MISMATCH');images++;}
  if(step.selection){const candidates=Object.fromEntries(Object.keys(step.selection.raw).map(k=>[k,{action:{type:'stuck' as const},label:k}]));const selected=replaySelection(step.selection,candidates);if(selected.selected!==step.selection.selected)throw new Error('SELECTION_MISMATCH');choices++;}
 }
 return {runId:result.runId,choices,assessments,images,verified:true,scope:'Saved distribution sampling and actual model input assets only; no API or UI actions reexecuted'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: npm run replay:virtual-beta -- RUN_DIRECTORY');console.log(JSON.stringify(await replayDirectory(process.argv[2]),null,2));}
