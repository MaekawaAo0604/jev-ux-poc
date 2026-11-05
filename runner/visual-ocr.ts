import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {createWorker,OEM,PSM,type Worker} from 'tesseract.js';
import {pngDimensions,ocrLines,type OcrLine} from './ocr-data.js';
import {windowsText} from './windows-ocr.js';

export type VisualTextLine=Omit<OcrLine,'confidence'>&{confidence?:number;engine?:string};
export type VisualTextReader={recognize:(bytes:Buffer)=>Promise<VisualTextLine[]>;close:()=>Promise<void>;diagnostics?:()=>{engine:string;status:string}[]};
/** OCR proposes text only. The visual decision layer must verify every line. */
export function createVisualTextReader():VisualTextReader{
 let worker:Promise<Worker>|undefined;
 let nativeStatus=process.platform==='win32'?'pending':'unavailable';
 const start=async()=>{
  const cachePath=fileURLToPath(new URL('../.cache/ocr/',import.meta.url));await mkdir(cachePath,{recursive:true});
  const instance=await createWorker('eng+jpn',OEM.LSTM_ONLY,{cachePath});
  await instance.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,user_defined_dpi:'96'});return instance;
 };
 return {
  recognize:async bytes=>{
   const {width,height}=pngDimensions(bytes);worker??=start();const instance=await worker,lines:VisualTextLine[]=[],seen=new Set<string>();
   // Propose both sparse-layout and contiguous-block readings. Neither is truth.
   for(const mode of [PSM.SPARSE_TEXT,PSM.SINGLE_BLOCK]){
    await instance.setParameters({tessedit_pageseg_mode:mode});const {data}=await instance.recognize(bytes,{}, {text:true,blocks:true});
    for(const line of ocrLines(data,width,height)){const key=line.text.normalize('NFKC').replace(/\s/g,'');if(!seen.has(key)){seen.add(key);lines.push({...line,id:`ocr-${lines.length}`});}}
   }
   if(nativeStatus!=='unavailable'){
    const native=await windowsText(bytes);nativeStatus=native.status;
    for(const line of native.lines){const key=line.text.normalize('NFKC').replace(/\s/g,'');if(!seen.has(key)){seen.add(key);lines.push({...line,id:`ocr-${lines.length}`});}}
   }
   return lines;
  },
  diagnostics:()=>[{engine:'windows-media-ocr',status:nativeStatus}],
  close:async()=>{if(worker){try{await (await worker).terminate();}catch{}worker=undefined;}},
 };
}
