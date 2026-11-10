import {pngDimensions,type OcrLine} from './ocr-data.js';
import {PNG} from 'pngjs';
export function visualDetail(bytes:Buffer,boxes:OcrLine['bbox'][]){
 const {width,height}=pngDimensions(bytes);
 if(width<280||height<280||!boxes.length||boxes.some(b=>![b.x0,b.x1,b.y0,b.y1].every(Number.isFinite)||b.x0<0||b.y0<0||b.x1<=b.x0||b.y1<=b.y0||b.x1>width||b.y1>height))throw new Error('Invalid detail bounds');
 let left=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.x0))-24)),right=Math.min(width,Math.ceil(Math.max(...boxes.map(b=>b.x1))+24));
 let top=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.y0))-24)),bottom=Math.min(height,Math.ceil(Math.max(...boxes.map(b=>b.y1))+24));
 const scale=Math.min(3,1568/(right-left),1568/(bottom-top)),minimum=Math.ceil(280/scale);
 if(right-left<minimum){left=Math.max(0,Math.min(left,width-minimum));right=Math.min(width,left+minimum);}
 if(bottom-top<minimum){top=Math.max(0,Math.min(top,height-minimum));bottom=Math.min(height,top+minimum);}
 const source=PNG.sync.read(bytes),image=new PNG({width:Math.min(1568,Math.floor((right-left)*scale)),height:Math.min(1568,Math.floor((bottom-top)*scale))});
 const sx=image.width/(right-left),sy=image.height/(bottom-top);
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const offset=((top+Math.floor(y*(bottom-top)/image.height))*width+left+Math.floor(x*(right-left)/image.width))*4;
  source.data.copy(image.data,(y*image.width+x)*4,offset,offset+4);
 }
 return {bytes:PNG.sync.write(image),rect:{x:left,y:top,width:right-left,height:bottom-top},scaleX:sx,scaleY:sy};
}
