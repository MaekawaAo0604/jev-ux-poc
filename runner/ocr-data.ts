import {resolve} from 'node:path';

export function localOcrFile(path:string){
 const resolved=resolve(path);
 if((/^[a-z][a-z\d+.-]*:/i.test(path)&&! /^[a-z]:[\\/]/i.test(path))||/^[\\/]{2}/.test(path)||/^[\\/]{2}/.test(resolved))throw new Error('Use a local PNG / step file, not a URL or network share');
 return resolved;
}

export type OcrLine={id:string;text:string;confidence:number;bbox:{x0:number;y0:number;x1:number;y1:number}};
export type OcrDocument={source:string;width:number;height:number;engine:string;languages:string[];createdAt:string;initializationMs:number;recognitionMs:number;lines:OcrLine[];reference?:string[]};

export function pngDimensions(bytes:Buffer){
 if(bytes.length<24||bytes.subarray(0,16).toString('hex')!=='89504e470d0a1a0a0000000d49484452')throw new Error('Expected a PNG image');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 if(!width||!height||width>16000||height>16000||width*height>24_000_000)throw new Error('Unsupported image size (maximum 24 megapixels, 16000 px per side)');
 return {width,height};
}

type OcrResult={blocks:{paragraphs:{lines:{text:string;confidence:number;bbox:OcrLine['bbox']}[]}[]}[]|null};
export function ocrLines(data:OcrResult,width:number,height:number):OcrLine[]{
 const result:OcrLine[]=[];
 for(const block of data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines){
  const text=line.text.trim();if(!text)continue;
  const {x0,y0,x1,y1}=line.bbox;
  if(![x0,y0,x1,y1].every(Number.isFinite)||x0<0||y0<0||x1<=x0||y1<=y0||x1>width||y1>height)throw new Error('Invalid OCR bounds');
  if(!Number.isFinite(line.confidence)||line.confidence<0||line.confidence>100)throw new Error('Invalid OCR confidence');
  result.push({id:`ocr-${result.length+1}`,text,confidence:line.confidence,bbox:{x0,y0,x1,y1}});
 }
 return result;
}

export function referenceText(step:unknown):string[]{
 const screen=(step as {state?:{screen?:{title?:unknown;text?:unknown;elements?:unknown}}})?.state?.screen;
 if(!screen||typeof screen.title!=='string'||!Array.isArray(screen.text)||!Array.isArray(screen.elements))throw new Error('Step JSON must contain an observed screen');
 const elements=screen.elements as {text?:unknown}[];
 return [screen.title,...screen.text,...elements.map(e=>e?.text)].filter((s):s is string=>typeof s==='string'&&!!s.trim());
}
