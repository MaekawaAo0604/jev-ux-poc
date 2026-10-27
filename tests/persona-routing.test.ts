import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
import {AutoPage} from '../pages/AutoPage.js';

test('local hash-route identities distinguish screens and retain the home identity',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),baseURL=server.resolvedUrls!.local[0].replace(/\/$/,'');
  await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(baseURL).origin?r.continue():r.abort());
  await page.goto(baseURL+'/bad/');
  const legacy=new AutoPage(page),routes=new AutoPage(page,false,true);
  const home=await routes.observe(false),legacyHome=await legacy.observe(false);
  await page.getByRole('link',{name:'各種設定',exact:true}).click();
  const settings=await routes.observe(false),legacySettings=await legacy.observe(false);
  assert.notEqual(home.pageId,settings.pageId);
  assert.equal(legacyHome.pageId,legacySettings.pageId);
  await page.getByRole('link',{name:'マイページ',exact:true}).click();
  assert.equal((await routes.observe(false)).pageId,home.pageId);
 }finally{await browser.close();await server.close();}
});
