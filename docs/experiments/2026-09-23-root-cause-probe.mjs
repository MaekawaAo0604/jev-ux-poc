// Bounded saved-input diagnostic. No browser actions or production changes.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {experimental_evaluate as evaluate} from 'ai';
import {jevDecide} from '../../jev/decide.ts';
import {createEvidenceSession, evidenceKey} from '../../jev/evidence-session.ts';
import {safeRequestFailure, validateChoice} from '../../jev/client.ts';

const live = process.argv.includes('--live');
if (live) process.loadEnvFile('.env');
else process.env.AI_GATEWAY_API_KEY = 'LOCAL_CAPTURE_ONLY';
const source = 'reports/2026-09-23T09-32-35.449Z-public/exploration';
const snapshot = JSON.parse(await readFile(`${source}/evidence-session.json`, 'utf8'));
const captured = new Map();
for (const number of [63, 74]) {
  const step = JSON.parse(await readFile(`${source}/step-${number}.json`, 'utf8'));
  const inputs = [];
  const session = createEvidenceSession({snapshot, evaluate: async (state, questions) => {
    assert.ok(questions.nextAction, 'Unexpected uncached goal assessment');
    inputs.push({state, questions});
    const keys = Object.keys(questions.nextAction.criteria);
    const choice = step.decision?.choice ?? keys[0];
    return {model: 'typesafe-ai/jev', answers: {nextAction: {
      choice, probabilities: Object.fromEntries(keys.map(key => [key, Number(key === choice)])),
    }}};
  }});
  await jevDecide(step.state, step.candidates, {goalChecks: snapshot.namespace.goalChecks, session});
  assert.equal(inputs.length, 1);
  const input = inputs[0];
  const key = evidenceKey({namespace: snapshot.namespace, ...input});
  const saved = snapshot.requests.find(request => request.stage === 'action-selection' && request.key === key);
  assert.ok(saved, 'Reconstructed input did not match original request hash');
  assert.equal(saved.inputBytes, Buffer.byteLength(JSON.stringify(input)));
  captured.set(number, {input, step, key, originalStatus: saved.status});
}

const original74 = captured.get(74).input;
const noProgress74 = structuredClone(original74);
delete noProgress74.state.explorationProgress;
// The ordered history, observation pool, current screen and question stay exact.
assert.deepEqual(noProgress74.state.history, original74.state.history);
assert.deepEqual(noProgress74.state.observations, original74.state.observations);
const original63 = captured.get(63).input;
const withContext63 = structuredClone(original63);
const step63 = captured.get(63).step;
const detailControls = step63.state.screen.elements.filter(element => element.text === '詳細を見る');
const detailRegions = step63.state.screen.regions.filter(region => region.text === '詳細を見る');
assert.equal(detailControls.length, 1);
assert.equal(detailRegions.length, 1);
const detailId = detailControls[0].id;
// One unambiguous visible link, with only its already-observed heading context.
// No known FAQ route, answer, URL or post-click information is injected.
withContext63.state.screen.elements.find(element => element.id === detailId).context = detailRegions[0].context;
const cases = [
  {id:'api-original-1', number:74, input:original74},
  {id:'api-without-duplicate-progress-1', number:74, input:noProgress74},
  {id:'api-without-duplicate-progress-2', number:74, input:noProgress74},
  {id:'api-original-2', number:74, input:original74},
  {id:'navigation-original-1', number:63, input:original63},
  {id:'navigation-visible-link-context-1', number:63, input:withContext63},
  {id:'navigation-visible-link-context-2', number:63, input:withContext63},
  {id:'navigation-original-2', number:63, input:original63},
];

// Inspect only message/body strings in memory and emit fixed labels, never raw
// SDK errors (which can include credentials, inputs or response headers).
function classifiedCauses(error) {
  const chunks = [], seen = new Set();
  function visit(value, depth = 0) {
    if (depth > 5 || value == null || seen.has(value)) return;
    if (typeof value === 'string') { chunks.push(value); return; }
    if (typeof value !== 'object') return;
    seen.add(value);
    for (const field of ['message', 'responseBody', 'cause', 'error', 'data']) visit(value[field], depth + 1);
  }
  visit(error);
  const text = chunks.join('\n');
  return Object.entries({
    contextLimit:/context.{0,60}(?:length|limit)|maximum.{0,40}tokens|token.{0,30}limit/i,
    optionLimit:/too many.{0,40}(?:options|criteria)|(?:options|criteria).{0,40}(?:exceed|maximum)/i,
    schema:/schema|validation|invalid request/i,
  }).filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
const metadata = cases.map(({id, number, input}) => ({
  id, step:number, inputBytes:Buffer.byteLength(JSON.stringify(input)),
  inputSha256:evidenceKey(input), originalRequestHash:captured.get(number).key,
  originalStatus:captured.get(number).originalStatus,
  choices:Object.keys(input.questions.nextAction.criteria).length,
}));
if (!live) {
  console.log(JSON.stringify({mode:'offline-capture', matchedOriginalRequests:2, browserActions:0, cases:metadata}));
} else {
  assert.ok(process.env.AI_GATEWAY_API_KEY, 'Gateway credentials unavailable');
  const root = `reports/root-cause-probe-${new Date().toISOString().replaceAll(':', '-')}`;
  await mkdir(root, {recursive:true});
  const rows = [];
  for (const [i, sample] of cases.entries()) {
    const row = {...metadata[i], startedAt:new Date().toISOString()};
    const started = performance.now();
    try {
      const response = await evaluate({model:process.env.JEV_GATEWAY_MODEL || 'typesafe-ai/jev',
        ...sample.input, maxRetries:0, abortSignal:AbortSignal.timeout(30000)});
      const answer = validateChoice(response.answers.nextAction, sample.input.questions.nextAction.criteria);
      row.ok = true;
      row.model = response.response.modelId;
      row.choice = answer.choice;
      row.label = captured.get(sample.number).step.candidates[answer.choice]?.label;
      row.probabilities = answer.probabilities;
      if (answer.confidence !== undefined) row.confidence = answer.confidence;
    } catch (error) {
      row.ok = false;
      row.failure = safeRequestFailure(error);
      row.recognizedCauses = classifiedCauses(error);
    }
    row.elapsedMs = performance.now() - started;
    rows.push(row);
    await writeFile(`${root}/${row.id}.json`, JSON.stringify(row, null, 2) + '\n', {flag:'wx'});
    console.log(JSON.stringify(row));
    if ([401,402,403].includes(row.failure?.statusCode)) break;
    if (i < cases.length - 1) await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const result = {source, kind:'saved-input-one-variable-diagnostics', maxRequests:8,
    retriesPerRequest:0, targetSiteRequests:0, browserActions:0, productionChanged:false,
    caveat:'Two samples per condition diagnose these snapshots, not end-to-end success or general model capability.', rows};
  await writeFile(`${root}/diagnostics.json`, JSON.stringify(result, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify({report:`${root}/diagnostics.json`, requests:rows.length}));
}
