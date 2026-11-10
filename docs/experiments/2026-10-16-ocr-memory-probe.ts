import {createWorker,OEM,PSM} from 'tesseract.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const bytes=await readFile(process.argv[2]);
for(const languages of ['jpn','eng+jpn','jpn+eng']){
 const worker=await createWorker(languages,OEM.LSTM_ONLY,{cachePath:resolve('.cache/ocr')});
 try{for(const psm of [PSM.AUTO,PSM.SINGLE_BLOCK,PSM.SPARSE_TEXT]){
  await worker.setParameters({tessedit_pageseg_mode:psm,user_defined_dpi:'96'});const started=performance.now();
  const {data}=await worker.recognize(bytes);console.log(JSON.stringify({languages,psm,text:data.text,ms:performance.now()-started}));
 }
 if(languages==='eng+jpn'){
  await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});const {data}=await worker.recognize(bytes,{}, {text:true,blocks:true});
  for(const block of data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){
   const b=line.bbox;await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
   const {data:read}=await worker.recognize(bytes,{rectangle:{left:Math.max(0,b.x0-8),top:Math.max(0,b.y0-8),width:b.x1-b.x0+16,height:b.y1-b.y0+16}});
   console.log(JSON.stringify({languages,mode:'line-crop',text:read.text}));
  }
 }
 }finally{await worker.terminate();}
}
