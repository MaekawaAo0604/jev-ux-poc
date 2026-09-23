// Read-only DOM/style diagnosis of an already observed missing heading. Never feeds Jev.
import {mkdir,writeFile} from 'node:fs/promises';
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
process.loadEnvFile=()=>{};delete process.env.AI_GATEWAY_API_KEY;delete process.env.TYPESAFE_API_KEY;
const observe=PublicSitePage.prototype.observe;
PublicSitePage.prototype.observe=async function(...args){
 const screen=await observe.apply(this,args);
 const styles=await this.page.evaluate(()=>{
  const keys=['display','position','left','right','top','bottom','width','height','marginLeft','marginTop','paddingLeft','paddingRight','paddingTop','paddingBottom','borderLeftWidth','borderRightWidth','borderTopWidth','borderBottomWidth','boxSizing','content','backgroundColor','backgroundImage','boxShadow','filter','outlineStyle','textShadow','transform','translate','rotate','scale','perspective','zoom','clipPath','clip','maskImage','borderImageSource','offsetPath','writingMode','direction','textAlign','textAlignLast','textIndent','unicodeBidi','whiteSpace','letterSpacing','wordSpacing','textTransform','textDecorationLine','textEmphasisStyle','webkitTextStrokeWidth','fontVariant','fontFeatureSettings','fontVariationSettings','fontStretch','fontSizeAdjust','fontOpticalSizing','textRendering','fontStyle','fontWeight','fontSize','fontFamily','fontKerning','lineHeight','opacity','visibility'];
  const values=(s)=>({...Object.fromEntries(keys.map(k=>[k,s[k]])),reflection:s.getPropertyValue('-webkit-box-reflect'),textSecurity:s.getPropertyValue('-webkit-text-security')});
  return Array.from(document.querySelectorAll('*')).filter(el=>el.textContent?.includes('高校生')&&!Array.from(el.children).some(c=>c.textContent?.includes('高校生'))).map(el=>{
   const ancestors=[];
   for(let node=el;node&&ancestors.length<6;node=node.parentElement){
    const rect=node.getBoundingClientRect();ancestors.push({tag:node.tagName,class:node.className,rect:rect.toJSON(),scroll:[node.scrollLeft,node.scrollTop],own:values(getComputedStyle(node)),before:values(getComputedStyle(node,'::before')),after:values(getComputedStyle(node,'::after'))});
   }
   return {text:el.textContent,ancestors};
  });
 });
 const root=`reports/heading-paint-probe-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(root,{recursive:true});
 await writeFile(`${root}/diagnostics.json`,JSON.stringify({screen,styles},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({report:`${root}/diagnostics.json`,matches:styles.length,observed:screen.text.filter(t=>t.includes('高校生'))}));
 throw new Error('DIAGNOSTIC_COMPLETE: no actions or inference');
};
