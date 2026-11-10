import test from 'node:test';import assert from 'node:assert/strict';
import {parseHoldoutFixture} from '../app/holdout-fixture.js';
import {parseTransferFixture} from '../app/transfer-fixture.js';
import {parseSemanticFixture} from '../app/semantic-fixture.js';
import {comparisonUIFromSearch} from '../app/virtual-beta-ui.js';
test('recovery selector conflicts fail closed in all four legacy fixture selectors',()=>{
 for(const [query,parse]of [['?holdout=s1a&recovery=opaque',parseHoldoutFixture],['?transfer=t7&recovery=opaque',parseTransferFixture],['?semanticFixture=q7&recovery=opaque',parseSemanticFixture],['?betaUI=r&recovery=opaque',comparisonUIFromSearch]] as const)assert.equal(parse(query),undefined,query);
 assert.ok(parseHoldoutFixture('?holdout=s1a'));assert.ok(parseTransferFixture('?transfer=t7'));assert.ok(parseSemanticFixture('?semanticFixture=q7'));assert.ok(comparisonUIFromSearch('?betaUI=r'));
});
