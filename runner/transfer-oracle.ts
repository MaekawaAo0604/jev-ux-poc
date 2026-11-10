import type {Page} from 'playwright';
import {transferDefinition,type TransferFixture} from '../app/transfer-fixture.js';
/** Audit-only observable state. Display/access never establishes comprehension. */
export async function checkTransferObjective(page:Page,fixture:TransferFixture):Promise<boolean>{
 const d=transferDefinition(fixture),complete=page.locator('[data-transfer-complete="true"]');
 const count=await complete.count();if(count>1)throw Error('AMBIGUOUS_TRANSFER_ORACLE');
 if(count!==1||!await complete.isVisible())return false;
 const statuses=page.getByRole('status').filter({hasText:d.objectiveText});
 if(await statuses.count()>1)throw Error('AMBIGUOUS_TRANSFER_STATUS');
 if(await statuses.count()!==1||!await statuses.isVisible()||(await statuses.innerText()).trim()!==d.objectiveText)return false;
 if(d.task==='help'){
  const viewport=page.viewportSize();if(!viewport)throw Error('TRANSFER_VIEWPORT_MISSING');
  for(const [key,text] of [['place',d.place],['belongings',d.belongings]]){
   const field=page.locator('[data-transfer-field="'+key+'"]');
   if(await field.count()>1)throw Error('AMBIGUOUS_TRANSFER_FIELD');
   if(await field.count()!==1||!await field.isVisible()||!(await field.innerText()).includes(text))return false;
   const b=await field.boundingBox();if(!b||b.x<0||b.y<0||b.x+b.width>viewport.width||b.y+b.height>viewport.height)return false;
  }
 }
 return true;
}
