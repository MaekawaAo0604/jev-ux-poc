// Regression for the kahaku run (reports/2026-09-23T19-44-05.620Z-public).
// The page states the answer as a parent list item plus its nested children:
//   「入館料が無料になる対象の方」 / 「高校生（高等専門学校生含む）以下」
// Only the child qualified as direct content; the parent was `related` and was
// dropped, so sufficiency judged an orphaned category label and reported
// absent. Completion is decided by pendingGoalChecks (Jev cannot say done), so
// that verdict made the goal unreachable and the run scrolled until it errored.
// quote-scope already receives the whole block, so giving sufficiency the same
// local text exposes nothing new — it only lets a quote be read where it sits.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessGoal, pendingGoalChecks} from '../jev/goal-status.js';
import type {State} from '../jev/types.js';

const PARENT = '入館料が無料になる対象の方';
const CHILD = '高校生（高等専門学校生含む）以下';
const CHECK = '大人と高校生で行く場合の入館料';

const state: State = {
  goal: `${CHECK}を知りたい。`,
  currentDate: '2026-09-24',
  history: [],
  screen: {title: '常設展の電子チケット', text: [PARENT, CHILD], elements: [], canScrollDown: false, canScrollUp: false},
};

function answers(questions: any, pick: (id: string) => string) {
  return {
    answers: Object.fromEntries(Object.entries(questions).map(([id, q]: [string, any]) => [
      id,
      {type: 'choice', choice: pick(id), probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === pick(id) ? 1 : 0]))},
    ])),
    warnings: [],
  };
}

async function withProvider(run: () => Promise<void>, respond: (input: any) => Promise<any>) {
  const previous = (globalThis as any).AI_SDK_DEFAULT_PROVIDER, key = process.env.AI_GATEWAY_API_KEY;
  (globalThis as any).AI_SDK_DEFAULT_PROVIDER = {
    evaluationModel: () => ({specificationVersion: 'v4', provider: 'TEST', modelId: 'TEST', supportedQuestionTypes: ['choice'], doEvaluate: respond}),
  };
  process.env.AI_GATEWAY_API_KEY = 'LOCAL_TEST_ONLY';
  try {await run();} finally {
    (globalThis as any).AI_SDK_DEFAULT_PROVIDER = previous;
    if (key === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = key;
  }
}

// The content stage keeps its per-quote isolation: whatever it decides, the
// stub below always classifies the bare parent as `related`, exactly as the
// live run did. The fix is that sufficiency can still read it in place.
const classify = (quote: string) => (quote === PARENT ? 'related' : 'direct');
const routine = (id: string) =>
  id === 'coverage' ? 'complete'
  : id === 'check_0' ? 'present'
  : id.startsWith('screen_') ? 'relevant'
  : id.startsWith('intent_') ? 'cost'
  : id.startsWith('scope_quote_') ? 'match'
  : 'present';

test('a nested list item reaches sufficiency as the local context of its child, so the goal can complete', async () => {
  let sufficiencyInput: any;

  await withProvider(async () => {
    const assessment = await assessGoal(state, [CHECK]);
    assert.equal(assessment.grounding!.checks[0].assessment?.choice, 'present');
    assert.deepEqual(pendingGoalChecks(assessment), []);
  }, async ({state: input, questions}: any) => {
    if (questions.evidence_0) return answers(questions, () => classify(input.quote));
    if (questions.grounded_0) {
      sufficiencyInput = structuredClone(input);
      // Stands in for the real judgement: the parent states 無料, the child
      // states who. Only together do they answer 高校生の入館料.
      const readable = JSON.stringify(input.checks[0]).includes(PARENT);
      return answers(questions, () => (readable ? 'present' : 'absent'));
    }
    return answers(questions, routine);
  });

  // Only the child qualified as direct evidence — that part is unchanged.
  assert.deepEqual(sufficiencyInput.checks[0].evidence.map((e: any) => e.text), [CHILD]);
  // ...and it now arrives with the visible text it sat in.
  assert.deepEqual(sufficiencyInput.checks[0].evidence[0].localContext, [PARENT, CHILD]);
});

test('local context carries only the quote own block, never text from another block', async () => {
  // Two observations become two blocks; the older one must not leak into the
  // newer quote local context, or sufficiency could answer from anywhere.
  const twoBlocks: State = {
    ...state,
    history: [{screen: '別画面', action: '進む', result: '画面: 常設展', observedText: ['特別展は別料金です'], observedWarnings: []}],
  };
  let sufficiencyInput: any;
  await withProvider(async () => {
    await assessGoal(twoBlocks, [CHECK]);
  }, async ({state: input, questions}: any) => {
    if (questions.evidence_0) return answers(questions, () => classify(input.quote));
    if (questions.grounded_0) {sufficiencyInput = structuredClone(input); return answers(questions, () => 'present');}
    return answers(questions, routine);
  });
  const byText = new Map(sufficiencyInput.checks[0].evidence.map((e: any) => [e.text, e.localContext]));
  assert.deepEqual(byText.get(CHILD), [PARENT, CHILD], 'the screen quote keeps its own block');
  assert.deepEqual(byText.get('特別展は別料金です'), ['特別展は別料金です'], 'the earlier observation stays separate');
});

test('the content stage still receives a bare quote with no block context', async () => {
  const contentInputs: any[] = [];
  await withProvider(async () => {
    await assessGoal(state, [CHECK]);
  }, async ({state: input, questions}: any) => {
    if (questions.evidence_0) {contentInputs.push(structuredClone(input)); return answers(questions, () => classify(input.quote));}
    if (questions.grounded_0) return answers(questions, () => 'present');
    return answers(questions, routine);
  });
  for (const input of contentInputs) assert.deepEqual(Object.keys(input).sort(), ['quote', 'task']);
});
