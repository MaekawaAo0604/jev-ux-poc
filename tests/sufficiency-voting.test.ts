import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceSession} from '../jev/evidence-session.js';

const CRITERIA = {present: 'yes', absent: 'no', uncertain: 'unsure'};
const questions = {grounded_0: {type: 'choice' as const, instructions: 'ask', criteria: CRITERIA}};
const state = {goal: 'g', checks: {0: {text: 'c'}}};

// Each scripted entry is one draw's choice, consumed in order.
function scriptedProvider(script: string[]) {
  const calls: any[] = [];
  const previous = (globalThis as any).AI_SDK_DEFAULT_PROVIDER, key = process.env.AI_GATEWAY_API_KEY;
  (globalThis as any).AI_SDK_DEFAULT_PROVIDER = {evaluationModel: () => ({
    specificationVersion: 'v4', provider: 'TEST', modelId: 'TEST', supportedQuestionTypes: ['choice'],
    async doEvaluate(input: any) {
      calls.push(input);
      const choice = script[calls.length - 1] ?? script[script.length - 1];
      const probabilities = Object.fromEntries(Object.keys(CRITERIA).map(k => [k, k === choice ? 0.8 : 0.1]));
      return {answers: {grounded_0: {type: 'choice', choice, probabilities}}, warnings: []};
    },
  })};
  process.env.AI_GATEWAY_API_KEY = 'LOCAL_TEST_ONLY';
  return {calls, restore() {
    (globalThis as any).AI_SDK_DEFAULT_PROVIDER = previous;
    if (key === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = key;
  }};
}

test('a unanimous start stops at the majority instead of spending every draw', async () => {
  const p = scriptedProvider(['present', 'present', 'present', 'present', 'present']);
  try {
    const result = await createEvidenceSession().vote('scope-sufficiency', state, questions, 5);
    assert.equal(p.calls.length, 3, 'three votes decide a five-draw majority');
    assert.equal(result.answers.grounded_0.choice, 'present');
    assert.equal(result.draws.length, 3);
  } finally {p.restore();}
});

test('early stopping is symmetric: a blocking choice stops just as soon', async () => {
  const p = scriptedProvider(['absent', 'absent', 'absent', 'present', 'present']);
  try {
    const result = await createEvidenceSession().vote('scope-sufficiency', state, questions, 5);
    assert.equal(p.calls.length, 3);
    assert.equal(result.answers.grounded_0.choice, 'absent');
  } finally {p.restore();}
});

test('a three-two split spends five draws and resolves to the majority', async () => {
  const p = scriptedProvider(['absent', 'present', 'absent', 'present', 'present']);
  try {
    const result = await createEvidenceSession().vote('scope-sufficiency', state, questions, 5);
    assert.equal(p.calls.length, 5);
    assert.equal(result.answers.grounded_0.choice, 'present');
    assert.deepEqual(result.draws.map(d => d.choice), ['absent', 'present', 'absent', 'present', 'present']);
    // Mean of three 0.8 and two 0.1 draws.
    assert.equal(result.answers.grounded_0.probabilities.present, 0.52);
  } finally {p.restore();}
});

test('a split with no majority resolves to the plurality without naming a choice', async () => {
  const p = scriptedProvider(['absent', 'present', 'uncertain', 'absent', 'present']);
  try {
    const result = await createEvidenceSession().vote('scope-sufficiency', state, questions, 5);
    assert.equal(p.calls.length, 5);
    // absent and present tie at two with equal mean probability, so the tie
    // falls to the first draw's choice. No step in the rule names a choice.
    assert.equal(result.answers.grounded_0.choice, 'absent');
  } finally {p.restore();}
});

test('the aggregate is cached, so a second consultation issues no request', async () => {
  const p = scriptedProvider(['present', 'absent', 'present', 'present']);
  try {
    const session = createEvidenceSession();
    const first = await session.vote('scope-sufficiency', state, questions, 5);
    const spent = p.calls.length;
    const second = await session.vote('scope-sufficiency', state, questions, 5);
    assert.equal(p.calls.length, spent, 'the cached aggregate is reused');
    assert.equal(second.answers.grounded_0.choice, first.answers.grounded_0.choice);
    const accounting = session.accounting();
    assert.equal(accounting.logicalCalls, spent, 'every draw is counted');
    assert.equal(accounting.questions, spent);
    assert.equal(accounting.reusedCalls, 1);
    assert.equal(accounting.reusedQuestions, 1);
    // groundGoal pushes response.request into progress.requests; a vote that
    // returned none would drop this stage from the recorded traces entirely.
    assert.equal(first.request!.attempts, spent, 'the trace sums the draws');
  } finally {p.restore();}
});

test('a vote needs exactly one question and a usable draw count', async () => {
  const p = scriptedProvider(['present']);
  try {
    const two = {...questions, grounded_1: questions.grounded_0};
    await assert.rejects(createEvidenceSession().vote('scope-sufficiency', state, two, 5), /exactly one question/);
    await assert.rejects(createEvidenceSession().vote('scope-sufficiency', state, questions, 0), /draw count/);
    assert.equal(p.calls.length, 0, 'a rejected vote reaches no provider');
  } finally {p.restore();}
});
