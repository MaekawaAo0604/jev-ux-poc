import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTION_RETRY_LIMIT, actionOutcome} from '../runner/action-recovery.js';

// The observation loop already tolerates three consecutive REOBSERVE rounds.
// A failed action had no such allowance: the kahaku run ended on its first one
// (reports/2026-09-23T19-44-05.620Z-public, step 12) even though the page was
// still readable and the goal still reachable.
test('a single action failure no longer ends the run and three consecutive ones do', () => {
  assert.equal(ACTION_RETRY_LIMIT, 3);
  assert.deepEqual(actionOutcome('ACTION_ERROR', 1), {result: 'ACTION_ERROR', terminal: false});
  assert.deepEqual(actionOutcome('ACTION_ERROR', 2), {result: 'ACTION_ERROR', terminal: false});
  assert.deepEqual(actionOutcome('ACTION_ERROR', 3), {result: 'ACTION_ERROR', terminal: true});
});

test('a control that did nothing is recorded and never ends the run', () => {
  for (const consecutive of [1, 2, 3, 4]) {
    assert.deepEqual(actionOutcome('ACTION_NOOP', consecutive), {result: 'ACTION_NOOP', terminal: false});
  }
});

test('safety, scope and decision failures stay terminal on their first occurrence', () => {
  for (const code of ['SAFETY_BOUNDARY', 'UNSUPPORTED_CONTENT', 'PAGE_ERROR', 'DECISION_ERROR', 'GOAL_CONFIG_ERROR']) {
    assert.deepEqual(actionOutcome(code, 1), {result: code, terminal: true});
  }
});
