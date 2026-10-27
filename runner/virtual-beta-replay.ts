import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {replaySelection} from '../jev/virtual-beta/selection.js';
import {sha,type BetaResult} from './virtual-beta-core.js';
export async function replayDirectory(directory:string){
 const result:BetaResult=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));let choices=0,images=0;
 for(const step of result.steps){
  if(step.modelInput&&step.questions&&step.assetFiles&&step.inputSha256!==sha(JSON.stringify({input:step.modelInput,questions:step.questions,assets:step.assetFiles})))throw new Error('MODEL_INPUT_HASH_MISMATCH');
  for(const source of Object.values(step.assetFiles??{})){if(source.file!==source.file.split(/[\\/]/).at(-1))throw new Error('UNSAFE_IMAGE_PATH');if(sha(await readFile(join(directory,source.file)))!==source.sha256)throw new Error('IMAGE_HASH_MISMATCH');images++;}
  if(step.selection){const candidates=Object.fromEntries(Object.keys(step.selection.raw).map(k=>[k,{action:{type:'stuck' as const},label:k}]));const selected=replaySelection(step.selection,candidates);if(selected.selected!==step.selection.selected)throw new Error('SELECTION_MISMATCH');choices++;}
 }
 return {runId:result.runId,choices,images,verified:true,scope:'Saved distribution sampling and actual model input assets only; no API or UI actions reexecuted'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.length!==3)throw new Error('Usage: npm run replay:virtual-beta -- RUN_DIRECTORY');console.log(JSON.stringify(await replayDirectory(process.argv[2]),null,2));}
