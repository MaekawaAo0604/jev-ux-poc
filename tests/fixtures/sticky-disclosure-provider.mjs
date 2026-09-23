// External inference only is replaced; Chromium, observation and actions stay real.
// Picks the menu trigger for the first two decisions so the second click lands
// on an already-open panel, then finishes. Mirrors a header menu that opens on
// click and closes only on an outside click.
let decisions = 0;
globalThis.AI_SDK_DEFAULT_PROVIDER = {evaluationModel: () => ({
  specificationVersion: 'v4', provider: 'TEST', modelId: 'TEST', supportedQuestionTypes: ['choice'],
  async doEvaluate({questions}) {
    const answers = {};
    for (const [id, q] of Object.entries(questions)) {
      const keys = Object.keys(q.criteria);
      let choice;
      if (id === 'nextAction') {
        const menu = keys.find(k => /Menu/.test(q.criteria[k]));
        choice = decisions++ < 2 && menu ? menu : 'done';
      } else choice = id === 'completion' ? 'supported' : keys[0];
      answers[id] = {type: 'choice', choice, probabilities: Object.fromEntries(keys.map(k => [k, k === choice ? 1 : 0]))};
    }
    return {answers, warnings: []};
  },
})};
