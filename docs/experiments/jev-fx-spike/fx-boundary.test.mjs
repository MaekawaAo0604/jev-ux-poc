import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextFxBoundary} from './fx-boundary.mjs';
test('FX stop deadline is independent of receiving another quote at JST 06:00',()=>{
 assert.equal(nextFxBoundary(Date.parse('2026-09-24T20:59:59.900Z')),Date.parse('2026-09-24T21:00:00Z'));
 assert.equal(nextFxBoundary(Date.parse('2026-09-24T21:00:00Z')),Date.parse('2026-09-25T21:00:00Z'));
});
