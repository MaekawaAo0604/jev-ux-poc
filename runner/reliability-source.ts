export type SourceText={text:string;visible:boolean;bbox?:{x0:number;y0:number;x1:number;y1:number}};
const canonical=(text:string)=>text.normalize('NFKC').replace(/\s/g,'').replace(/[〜～]/g,'~');
export function matchesVisualText(text:string,bbox:NonNullable<SourceText['bbox']>,probes:SourceText[],facts:string[]){
 if([...probes.filter(p=>p.visible).map(p=>p.text),...facts].some(t=>canonical(t)===canonical(text)))return true;
 if(!bbox)return false;
 const row=probes.filter((p):p is SourceText&{bbox:NonNullable<SourceText['bbox']>}=>!!p.visible&&!!p.bbox&&p.bbox.x0<bbox.x1&&p.bbox.x1>bbox.x0&&p.bbox.y0<bbox.y1&&p.bbox.y1>bbox.y0);
 return row.length>1&&Math.max(...row.map(p=>p.bbox.y0))<Math.min(...row.map(p=>p.bbox.y1))&&canonical(row.map(p=>p.text).join(' '))===canonical(text);
}
