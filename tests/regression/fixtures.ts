import {test as base,expect} from '@playwright/test';
import {GoodPage} from '../../pages/GoodPage.js';

// New fixture: preserves the existing browser.test.ts local-only network policy.
export const test=base.extend<{good:GoodPage}>({
 page:async({page,baseURL},use)=>{
  if(!baseURL)throw new Error('A local baseURL is required');
  const origin=new URL(baseURL).origin;
  if(new URL(origin).hostname!=='127.0.0.1')throw new Error('Regression fixture is local-only');
  await page.context().route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await use(page);
 },
 good:async({page},use)=>{await use(new GoodPage(page));},
});
export {expect};
