import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
import {pngDimensions,type OcrLine} from './ocr-data.js';

export type WindowsTextLine=Omit<OcrLine,'confidence'>&{engine:'windows-media-ocr'};
export async function windowsText(bytes:Buffer):Promise<{status:'ready'|'unavailable'|'error';lines:WindowsTextLine[]}>{
 if(process.platform!=='win32')return {status:'unavailable',lines:[]};
 const {width,height}=pngDimensions(bytes);
 // An exact nearest-neighbour resampling, not character repair or sharpening.
 // Stay within the native engine's 2600-pixel dimension limit.
 const scale=Math.min(1.5,2600/Math.max(width,height));
 const source=PNG.sync.read(bytes),image=new PNG({width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))});
 const sx=image.width/width,sy=image.height/height;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const offset=(Math.min(height-1,Math.floor(y/sy))*width+Math.min(width-1,Math.floor(x/sx)))*4;
  source.data.copy(image.data,(y*image.width+x)*4,offset,offset+4);
 }
 try{
  const output=await new Promise<string>((resolve,reject)=>{
   const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-ocr.ps1',import.meta.url))],{windowsHide:true,timeout:20000,maxBuffer:2*1024*1024,encoding:'utf8'},(error,stdout)=>error?reject(new Error('WINDOWS_OCR_FAILED')):resolve(stdout));
   child.stdin?.on('error',()=>{});child.stdin?.end(PNG.sync.write(image).toString('base64')+'\n');
  });
  const result=JSON.parse(output);
  if(result.status==='unavailable')return {status:'unavailable',lines:[]};
  if(result.status!=='ready'||!Array.isArray(result.lines))throw new Error('Invalid native OCR');
  const lines=result.lines.map((line:any,i:number):WindowsTextLine=>{
   if(typeof line.text!=='string'||!line.text.trim())throw new Error('Invalid native text');
   const {x0,y0,x1,y1}=line.bbox??{};
   if(![x0,y0,x1,y1].every(Number.isFinite)||x0<0||y0<0||x1<=x0||y1<=y0||x1>image.width||y1>image.height)throw new Error('Invalid native bounds');
   return {id:`windows-${i}`,text:line.text,engine:'windows-media-ocr',bbox:{x0:x0/sx,y0:y0/sy,x1:x1/sx,y1:y1/sy}};
  });
  return {status:'ready',lines};
 }catch{return {status:'error',lines:[]};}
}
