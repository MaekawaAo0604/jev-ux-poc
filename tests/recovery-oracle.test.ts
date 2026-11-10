import test from 'node:test';import assert from 'node:assert/strict';import {chromium}from'playwright';import{recoveryDefinition}from'../app/recovery-fixture.js';
const api=await import('../runner/recovery-oracle.js').catch(()=>({} as any));
test('recovery oracle requires committed observable value and exact visible confirmation, with fail-closed audit data',async()=>{
 assert.equal(typeof api.checkRecoveryObjective,'function');assert.equal(typeof api.readRecoverySnapshot,'function');
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:900}}),fixture={version:1,task:'library',condition:'changed'} as const,d=recoveryDefinition(fixture);
 const snapshot={schemaVersion:1,route:'primary',eligible:true,verificationAttempts:1,recordChecks:0,savedValue:d.desiredValue,complete:true};
 const render=async(s:any,status=d.objectiveText,value=d.desiredValue,extra='')=>page.setContent(`<main data-recovery-root data-recovery-state='${JSON.stringify(s)}'><p data-recovery-field="saved-value">${value}</p><p role="status" data-recovery-complete="true">${status}</p>${extra}</main>`);
 await render(snapshot);assert.equal(await api.checkRecoveryObjective(page,fixture),true);assert.deepEqual(await api.readRecoverySnapshot(page,fixture),snapshot);
 for(const state of [{...snapshot,complete:false},{...snapshot,savedValue:d.originalValue},{...snapshot,eligible:false}]){await render(state);assert.equal(await api.checkRecoveryObjective(page,fixture),false);}
 await render(snapshot,'別の手続きが完了しました');assert.equal(await api.checkRecoveryObjective(page,fixture),false);
 await render(snapshot,d.objectiveText,d.originalValue);assert.equal(await api.checkRecoveryObjective(page,fixture),false);
 await render(snapshot,d.objectiveText,d.desiredValue,'<p role="status" data-recovery-complete="true">duplicate</p>');await assert.rejects(()=>api.checkRecoveryObjective(page,fixture),/AMBIGUOUS/);
 for(const state of [{...snapshot,eligible:'true'},{...snapshot,verificationAttempts:-1},{...snapshot,route:'private-answer'},{...snapshot,savedValue:'unexpected'}]){await render(state);await assert.rejects(()=>api.readRecoverySnapshot(page,fixture),/INVALID/);}
 await page.setContent('<main/>');await assert.rejects(()=>api.readRecoverySnapshot(page,fixture),/MISSING/);
 }finally{await browser.close();}
});
