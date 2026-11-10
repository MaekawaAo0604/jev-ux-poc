import test from 'node:test';
import assert from 'node:assert/strict';
import {transferDefinition,transferFixtures,transferQuery,parseTransferFixture} from '../app/transfer-fixture.js';

test('six new transfer assignments roundtrip without admitting ambiguous or invalid selectors',()=>{
 const fixtures=transferFixtures();assert.equal(fixtures.length,6);assert.equal(new Set(fixtures.map(transferQuery)).size,6);
 for(const f of fixtures){const q=transferQuery(f);assert.deepEqual(parseTransferFixture(q),f);for(const suffix of ['&transfer=x','&holdout=s1a','&semanticFixture=q7','&betaUI=r'])assert.equal(parseTransferFixture(q+suffix),undefined);}
 for(const q of ['','?transfer=unknown','?transfer=','?transfer=constructor'])assert.equal(parseTransferFixture(q),undefined);
 for(const bad of [{version:2,task:'catalog',variant:'alpha'},{version:1,task:'unknown',variant:'alpha'},{version:1,task:'help',variant:'alpha',referencePath:['answer']}])assert.throws(()=>transferQuery(bad as any));
});
test('goals are variant-invariant, visible facts vary, returned definitions are detached',()=>{
 for(const task of ['catalog','draft','help'] as const){const a=transferDefinition({version:1,task,variant:'alpha'}),b=transferDefinition({version:1,task,variant:'beta'});assert.equal(a.goal,b.goal);assert.ok(a.goal.length>10);assert.notEqual(a.title,b.title);}
 for(const fixture of transferFixtures()){const d=transferDefinition(fixture);if(d.task==='catalog'){assert.equal(d.items.filter(i=>i.day==='土曜日'&&i.subtitles).length,1);const first=d.items[0].title;d.items[0].title='changed';const fresh=transferDefinition(fixture);assert.equal(fresh.task==='catalog'&&fresh.items[0].title,first);}if(d.task==='help'){assert.ok(d.place&&d.belongings&&d.event);}}
 const a=transferDefinition({version:1,task:'help',variant:'alpha'}),b=transferDefinition({version:1,task:'help',variant:'beta'});assert.ok(a.task==='help'&&b.task==='help'&&a.place!==b.place&&a.belongings!==b.belongings);
});
