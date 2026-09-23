import {randomUUID} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {goals} from '../tests/goals.js';
import type {ActionTrace, RecordedLocator} from './action-trace.js';

const roles=new Set('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math meter menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem'.split(' '));

function requireValue(condition:unknown,message:string):asserts condition {
 if(!condition)throw new Error(`Cannot generate raw Playwright test: ${message}`);
}
function object(value:unknown):value is Record<string,any> {
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function nonempty(value:unknown):value is string {
 return typeof value==='string'&&value.trim().length>0;
}
function localUrl(value:unknown,initial?:URL):URL {
 requireValue(nonempty(value),'missing URL');
 let url:URL;
 try {url=new URL(value);} catch {throw new Error('Cannot generate raw Playwright test: malformed URL');}
 requireValue(['http:','https:'].includes(url.protocol),'only HTTP(S) URLs are supported');
 requireValue(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'only local application URLs are supported');
 requireValue(!url.username&&!url.password,'URL credentials are unsupported');
 requireValue(!url.pathname.startsWith('//'),'protocol-relative paths are unsupported');
 if(initial)requireValue(url.origin===initial.origin,'cross-origin actions are unsupported');
 return url;
}
function validateLocator(value:unknown):asserts value is RecordedLocator {
 requireValue(object(value),'target has no capture-validated locator');
 requireValue(['testId','role','label','placeholder','text','css'].includes(value.kind),'unknown locator kind');
 requireValue(nonempty(value.value),'locator value must be a nonempty string');
 requireValue(Object.keys(value).every(key=>['kind','value','role'].includes(key)),'malformed locator fields');
 if(value.kind==='role')requireValue(typeof value.role==='string'&&roles.has(value.role),'invalid or missing locator role');
 else requireValue(value.role===undefined,'role is only supported on role locators');
 if(value.kind==='css'){
  requireValue(!/:nth(?:-|\b)|>>|^\s*[\w-]+\s*=/i.test(value.value),'positional or chained CSS locators are unsupported');
  requireValue(!/^(?:\/\/|\.\.)/.test(value.value.trim()),'XPath is not a CSS locator');
 }
}

/** JSON traces are untrusted runtime input; never infer a locator from text or selector hints. */
function validateTrace(value:unknown):asserts value is ActionTrace {
 requireValue(object(value),'no action trace');
 requireValue(value.schemaVersion===1,'unsupported schema version');
 requireValue(value.source==='local','only independently verified local traces can be generated');
 requireValue(value.goalId==='notifications',value.goalId==='invoice'?'invoice download assertions are not supported by this MVP':'unknown or unsupported goal');
 requireValue(value.goalText===goals.notifications.text,'goal text differs from the existing goal');
 requireValue(object(value.success)&&value.success.objectiveSuccess===true&&value.success.perceivedSuccess===true&&['SUCCESS','JEV_DONE'].includes(value.success.reason),'trace must have independently verified and perceived success');
 requireValue(typeof value.fake==='boolean','fake must be boolean');
 requireValue(nonempty(value.completedAt)&&Number.isFinite(Date.parse(value.completedAt)),'invalid completion timestamp');
 requireValue(object(value.viewport)&&Number.isInteger(value.viewport.width)&&value.viewport.width>0&&Number.isInteger(value.viewport.height)&&value.viewport.height>0,'invalid viewport');
 requireValue(value.recordingErrors===undefined||(Array.isArray(value.recordingErrors)&&value.recordingErrors.length===0),'trace contains recording errors');
 const initial=localUrl(value.initialUrl);
 requireValue(Array.isArray(value.actions)&&value.actions.length>0,'trace has no actions');
 let previousStep=0;
 let expectedBefore=initial;
 for(const action of value.actions){
  requireValue(object(action),'malformed action');
  requireValue(Number.isInteger(action.step)&&action.step>previousStep,'action steps must be positive and strictly increasing');
  previousStep=action.step;
  requireValue(['click','fill','select','press','scroll','back'].includes(action.action),'unknown action');
  requireValue(action.execution===undefined,'guard execution metadata cannot be replayed faithfully');
  const before=localUrl(action.urlBefore,initial);
  requireValue(before.href===expectedBefore.href,'recorded action URLs are discontinuous');
  requireValue(nonempty(action.urlAfter),'every replayed action requires a captured urlAfter');
  expectedBefore=localUrl(action.urlAfter,initial);
  requireValue(action.durationMs===undefined||(typeof action.durationMs==='number'&&Number.isFinite(action.durationMs)&&action.durationMs>=0),'invalid duration');
  requireValue(action.value===undefined||typeof action.value==='string','action value must be a string');
  if(action.target!==undefined){
   requireValue(object(action.target),'malformed target');
   for(const key of ['anonymousId','text','role','accessibleName','label','testId','placeholder','tagName','selector']){
    requireValue(action.target[key]===undefined||typeof action.target[key]==='string',`target ${key} must be a string`);
   }
  }
  if(['click','fill','select','press'].includes(action.action)){
   requireValue(object(action.target),'target action has no target');
   validateLocator(action.target.locator);
  }
  if(['fill','select','press'].includes(action.action))requireValue(typeof action.value==='string','action is missing its recorded value');
  if(action.action==='press')requireValue(nonempty(action.value),'press requires a nonempty key');
  if(action.action==='scroll')requireValue(object(action.scroll)&&typeof action.scroll.x==='number'&&Number.isFinite(action.scroll.x)&&typeof action.scroll.y==='number'&&Number.isFinite(action.scroll.y),'scroll requires finite absolute x and y coordinates');
 }
}

const quote=(value:string)=>JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function locatorSource(locator:RecordedLocator):string {
 const value=quote(locator.value);
 switch(locator.kind){
  case 'testId':return `page.getByTestId(${value})`;
  case 'role':return `page.getByRole(${quote(locator.role!)}, { name: ${value}, exact: true })`;
  case 'label':return `page.getByLabel(${value}, { exact: true })`;
  case 'placeholder':return `page.getByPlaceholder(${value}, { exact: true })`;
  case 'text':return `page.getByText(${value}, { exact: true })`;
  case 'css':return `page.locator(${value})`;
 }
}

export function generatePlaywrightTest(trace:ActionTrace):string {
 validateTrace(trace);
 const initial=new URL(trace.initialUrl);
 const lines=[
  '// Generated from a verified Action Trace. Preserve this raw file; translate into a separate POM file.',
  ...(trace.fake?['// FAKE trace: actions were chosen by the fake client, not real Jev.']:[]),
  'import { test, expect } from "@playwright/test";',
  'import { goals } from "../../tests/goals.js";',
  '',`test.use({ viewport: ${JSON.stringify(trace.viewport)} });`,'',
  `test(${quote(trace.goalText)}, async ({ page, baseURL }) => {`,
  '  if (!baseURL) throw new Error("Raw replay requires a local baseURL");',
  '  const replayOrigin = new URL(baseURL);',
  '  if (!["http:", "https:"].includes(replayOrigin.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(replayOrigin.hostname) || replayOrigin.username || replayOrigin.password) throw new Error("Raw replay requires a local HTTP(S) baseURL without credentials");',
  '  await page.context().route("**/*", route => new URL(route.request().url()).origin === replayOrigin.origin ? route.continue() : route.abort());',
  `  await page.goto(${quote(initial.pathname+initial.search+initial.hash)});`,
 ];
 for(const action of trace.actions){
  lines.push(`  // Recorded step ${action.step}`);
  if(action.action==='scroll')lines.push(`  await page.evaluate(({ x, y }) => window.scrollTo(x, y), ${JSON.stringify(action.scroll)});`);
  else if(action.action==='back')lines.push('  await page.goBack();');
  else {
   const target=locatorSource(action.target!.locator!);
   const method=action.action==='select'?'selectOption':action.action;
   lines.push(`  await ${target}.${method}(${action.action==='click'?'':quote(action.value!)});`);
  }
  const after=new URL(action.urlAfter!);
  lines.push(`  await expect(page).toHaveURL(url => url.pathname === ${quote(after.pathname)} && url.search === ${quote(after.search)} && url.hash === ${quote(after.hash)});`);
 }
 lines.push('  await expect.poll(() => goals.notifications.check(page)).toBe(true);','});','');
 return lines.join('\n');
}

export async function saveRawTest(trace:ActionTrace,outputDir=resolve('generated/raw')):Promise<{testPath:string;tracePath:string;generationMs:number}> {
 const start=performance.now();
 const source=generatePlaywrightTest(trace);
 const traceJson=JSON.stringify(trace,null,2)+'\n';
 const dir=resolve(outputDir);
 const basename=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
 const testPath=join(dir,`${basename}.spec.ts`);
 const tracePath=join(dir,`${basename}.trace.json`);
 await mkdir(dir,{recursive:true});
 // Exclusive creation keeps prior raw output immutable, even on a filename collision.
 await writeFile(tracePath,traceJson,{encoding:'utf8',flag:'wx'});
 await writeFile(testPath,source,{encoding:'utf8',flag:'wx'});
 return {testPath,tracePath,generationMs:performance.now()-start};
}
