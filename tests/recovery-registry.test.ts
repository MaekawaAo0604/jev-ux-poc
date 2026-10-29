import test from 'node:test';
import assert from 'node:assert/strict';

test('recovery registry implements six strict opaque opt-in conditions', async()=>{
 const module=await import('../app/recovery-fixture.js').catch(()=>null);
 assert.ok(module,'recovery registry must exist');
 const {recoveryFixtures,recoveryQuery,parseRecoveryFixture,recoveryDefinition}=module;
 const fixtures=recoveryFixtures(); assert.equal(fixtures.length,6);assert.equal(new Set(fixtures.map(recoveryQuery)).size,6);
 for(const f of fixtures){const q=recoveryQuery(f);assert.match(q,/^\?recovery=[a-z0-9]{2}$/);assert.deepEqual(parseRecoveryFixture(q),f);for(const suffix of ['&recovery=xx','&holdout=s1a','&semanticFixture=x','&betaUI=x','&transfer=t7'])assert.equal(parseRecoveryFixture(q+suffix),undefined);assert.ok(recoveryDefinition(f).goal.length>10);}
 for(const q of ['', '?recovery=constructor','?recovery=','?recovery=unknown'])assert.equal(parseRecoveryFixture(q),undefined);
 for(const f of [{version:2,task:'library',condition:'switch'},{version:1,task:'unknown',condition:'switch'},{version:1,task:'library',condition:'unknown'},{version:1,task:'library',condition:'switch',answer:'home'}])assert.throws(()=>recoveryQuery(f as any));
});
test('recovery conditions share goals and changed/unchanged definitions exactly',async()=>{
 const m=await import('../app/recovery-fixture.js').catch(()=>null);assert.ok(m,'recovery definitions must exist');
 for(const task of ['library','workshop'] as const){const a=m.recoveryDefinition({version:1,task,condition:'changed'}),b=m.recoveryDefinition({version:1,task,condition:'unchanged'}),c=m.recoveryDefinition({version:1,task,condition:'switch'});assert.deepEqual(a,b);assert.equal(a.goal,c.goal);assert.notEqual(a.originalValue,a.desiredValue);a.title='mutated';assert.notEqual(m.recoveryDefinition({version:1,task,condition:'changed'}).title,a.title);}
});
