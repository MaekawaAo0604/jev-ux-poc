import {readFile,stat,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {basename,resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {createWorker,OEM,PSM,type Worker} from 'tesseract.js';
import {pngDimensions,ocrLines,referenceText,localOcrFile,type OcrDocument} from './ocr-data.js';
import {ocrReport} from './ocr-report.js';

const usage='Usage: npm run ocr -- LOCAL.png [--step LOCAL-step.json]\nReads a saved PNG locally. No Jev API or website requests. First run downloads jpn/eng OCR models.';
async function main(){
 const [input,...args]=process.argv.slice(2);
 if(input==='--help'){console.log(usage);return;}
 if(!input)throw new Error(usage);
 let stepPath:string|undefined;
 for(let i=0;i<args.length;i++){
  if(args[i]!=='--step'||stepPath||!args[i+1])throw new Error(`Unknown option or missing value: ${args[i]}`);
  stepPath=localOcrFile(args[++i]);
 }
 const inputPath=localOcrFile(input);
 if(extname(inputPath).toLowerCase()!=='.png')throw new Error('Use a local PNG file');
 if((await stat(inputPath)).size>32*1024*1024)throw new Error('PNG file exceeds 32 MiB');
 const bytes=await readFile(inputPath),{width,height}=pngDimensions(bytes);
 let reference:string[]|undefined;
 if(stepPath){
  if((await stat(stepPath)).size>8*1024*1024)throw new Error('Step JSON exceeds 8 MiB');
  const step=JSON.parse(await readFile(stepPath,'utf8'));
  if(step.screenshot!==basename(inputPath))throw new Error('Step screenshot name does not match input PNG');
  reference=referenceText(step);
 }
 const cache=resolve('.cache/ocr');await mkdir(cache,{recursive:true});
 let worker:Worker|undefined;
 // Hard deadline also covers initialization errors that can leave the SDK worker pending.
 const timer=setTimeout(()=>{console.error('OCR exceeded 120 seconds. Check model download/network or image size.');process.exit(1);},120000);
 const start=performance.now();
 try{
  console.log('OCR: loading Japanese + English models (cached after the first run)...');
  // English-first avoids a reproducible multilingual initialization warning in
  // this Tesseract core; keep the actual order in the exported metadata.
  worker=await createWorker('eng+jpn',OEM.LSTM_ONLY,{cachePath:cache,errorHandler:error=>{console.error('OCR worker failed:',String(error));process.exit(1);}});
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,user_defined_dpi:'96'});
  const initializationMs=performance.now()-start,recognitionStart=performance.now();
  const {data}=await worker.recognize(bytes,{}, {text:true,blocks:true});
  const doc:OcrDocument={source:basename(inputPath),width,height,engine:'Tesseract.js 7.0.0 / sparse text',languages:['eng','jpn'],createdAt:new Date().toISOString(),initializationMs,recognitionMs:performance.now()-recognitionStart,lines:ocrLines(data,width,height),...(reference?{reference}:{})};
  const reports=resolve('reports');await mkdir(reports,{recursive:true});
  const root=await mkdtemp(join(reports,'ocr-'+new Date().toISOString().replaceAll(':','-')+'-'));
  await writeFile(join(root,'screenshot.png'),bytes);
  await writeFile(join(root,'ocr.json'),JSON.stringify({...doc,sha256:createHash('sha256').update(bytes).digest('hex'),rawText:data.text,segmentation:'SPARSE_TEXT',dpi:96},null,2));
  await writeFile(join(root,'index.html'),ocrReport(doc));
  console.log(JSON.stringify({report:join(root,'index.html'),lines:doc.lines.length,initializationMs:Math.round(initializationMs),recognitionMs:Math.round(doc.recognitionMs)}));
 }finally{clearTimeout(timer);await worker?.terminate();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
