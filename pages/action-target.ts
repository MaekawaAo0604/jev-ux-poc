import type {Locator} from 'playwright';
import type {RecordedAction} from '../runner/action-trace.js';

/** Export-only metadata. Never add this to Observation or Jev State. */
export async function describeTarget(locator:Locator,anonymousId:string):Promise<NonNullable<RecordedAction['target']>>{
 const element=await locator.elementHandle({timeout:5000});
 if(!element)throw new Error('TRACE_TARGET_MISSING');
 try{
  const attributes=await element.evaluate(el=>{
   const label=Array.from((el as HTMLInputElement).labels||[]).map(e=>(e as HTMLElement).innerText).join(' ').trim();
   const id=el.getAttribute('id'),name=el.getAttribute('name');
   return {
    text:(el as HTMLElement).innerText?.trim()||'',tagName:el.tagName.toLowerCase(),
    ...(label?{label}:{}),...(el.getAttribute('data-testid')?{testId:el.getAttribute('data-testid')!}:{}),
    ...(el.getAttribute('placeholder')?{placeholder:el.getAttribute('placeholder')!}:{}),
    ...(id&&id.length<=80?{selector:`#${CSS.escape(id)}`}:
      name&&name.length<=80?{selector:`${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`}:{}),
   };
  });
  const snapshot=await locator.ariaSnapshotJSON({depth:1,timeout:5000});
  const node=Array.isArray(snapshot)?snapshot[0]:undefined;
  const role=typeof node?.role==='string'&&node.role!=='text'?node.role:undefined;
  const accessibleName=typeof node?.name==='string'?node.name:undefined;
  const target:NonNullable<RecordedAction['target']>={anonymousId,...attributes,...(role?{role}:{}),...(accessibleName?{accessibleName}:{})};
  const candidates:{plan:NonNullable<typeof target.locator>;locator:Locator}[]=[];
  const page=locator.page();
  if(target.testId)candidates.push({plan:{kind:'testId',value:target.testId},locator:page.getByTestId(target.testId)});
  if(role&&accessibleName)candidates.push({plan:{kind:'role',role,value:accessibleName},locator:page.getByRole(role as Parameters<typeof page.getByRole>[0],{name:accessibleName,exact:true})});
  if(target.label)candidates.push({plan:{kind:'label',value:target.label},locator:page.getByLabel(target.label,{exact:true})});
  if(target.placeholder)candidates.push({plan:{kind:'placeholder',value:target.placeholder},locator:page.getByPlaceholder(target.placeholder,{exact:true})});
  if(target.text)candidates.push({plan:{kind:'text',value:target.text},locator:page.getByText(target.text,{exact:true})});
  if(target.selector)candidates.push({plan:{kind:'css',value:target.selector},locator:page.locator(target.selector)});
  for(const candidate of candidates){
   // Count AND identity: a unique descendant with similar text is not the target.
   if(await candidate.locator.count()===1&&await candidate.locator.evaluate((el,selected)=>el===selected,element)){
    target.locator=candidate.plan;break;
   }
  }
  return target;
 }finally{await element.dispose();}
}
