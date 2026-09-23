// One diagnostic replay of saved public observations; never overwrites a trial.
import {readFile} from 'node:fs/promises';
import {completionRequestFor, parseCompletion} from '../../jev/completion.ts';
import {evaluateChoices, validateChoice} from '../../jev/client.ts';

process.loadEnvFile('.env');
const result = JSON.parse(await readFile('reports/2026-09-20T05-02-42.154Z-public/exploration/result.json', 'utf8'));
const request = completionRequestFor(result.steps.map(step => step.state));
console.log(JSON.stringify({diagnostic:'audit replay only; not an exploration', questionCount:Object.keys(request.questions).length, evidenceCount:request.state.evidence.length}));
let response;
try {
  response = await evaluateChoices(request.state, request.questions);
  console.log(JSON.stringify({stage:'transport', ok:true, model:response.model, answerCount:Object.keys(response.answers).length}));
} catch (error) {
  // The shared client removes upstream request metadata and secrets.
  console.log(JSON.stringify({stage:'transport', ok:false, error:error.message}));
  process.exit(1);
}
try {
  const audit = parseCompletion(response, request);
  console.log(JSON.stringify({stage:'validation', ok:true, assessment:audit.assessment, evidenceCount:audit.evidence.length}));
} catch (error) {
  const invalid = [];
  for (const [id, question] of Object.entries(request.questions)) {
    try { validateChoice(response.answers[id], question.criteria); }
    catch (error) { invalid.push({id, error:error.message, missing:!response.answers[id]}); }
  }
  console.log(JSON.stringify({stage:'validation', ok:false, error:error.message, invalid}));
  process.exitCode = 1;
}
