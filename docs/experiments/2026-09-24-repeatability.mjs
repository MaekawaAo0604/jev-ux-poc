// Does completion degrade as a goal is split into more checks, and does the
// voted verdict repeat? Every live result so far is n=1, and the 0.75 pass
// rate behind the spec's predicted rates comes from one item and eight draws.
//
// Both arms ask the same site for the same information over the same route.
// Only the decomposition differs, so checklist length is the variable rather
// than a harder-to-reach fact. Arm B splits arm A's compound price item.
//
// Read-only public browsing through the existing guarded runner. No form
// submission, no purchase, no new access. robots.txt was checked before use.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const RUNS = Number(process.env.REPEAT_RUNS || 5);
const MAX_ACTIONS = Number(process.env.REPEAT_MAX_ACTIONS || 25);
const ONLY = process.env.REPEAT_ARM || '';
const URL = 'https://www.kahaku.go.jp/';
const ARMS = [
  {name: '2-checks', goal: '上野本館の常設展示に大人と高校生で行く場合の入館料と開館時間を知りたい。',
   checks: ['大人と高校生で行く場合の入館料', '開館時間']},
  {name: '3-checks', goal: '上野本館の常設展示の大人の入館料と高校生の入館料、開館時間を知りたい。',
   checks: ['大人の入館料', '高校生の入館料', '開館時間']},
];

const commit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
const results = [];

for (const arm of ARMS.filter(a => !ONLY || a.name === ONLY)) {
  for (let run = 1; run <= RUNS; run++) {
    const started = Date.now();
    let record = {arm: arm.name, run, error: null};
    try {
      const {stdout} = await promisify(execFile)(process.execPath, [
        '--import', import.meta.resolve('tsx'), resolve('runner/public-site.ts'),
        URL, arm.goal, '--reviewed', '--max-actions', String(MAX_ACTIONS), ...arm.checks.flatMap(c => ['--goal-check', c]),
      ], {maxBuffer: 64 * 1024 * 1024, timeout: 1500000});
      const line = JSON.parse(stdout.trim().split('\n').at(-1));
      const dir = resolve(line.report, '../exploration');
      const result = JSON.parse(await readFile(resolve(dir, 'result.json'), 'utf8'));
      const last = result.steps.filter(s => s.decision?.goalAssessment?.grounding).at(-1);
      const account = last?.decision.goalAssessment.accounting;
      record = {
        ...record,
        reason: result.reason,
        completed: result.reason === 'JEV_DONE',
        actionCount: result.actionCount,
        elapsedSec: Number((result.elapsedMs / 1000).toFixed(1)),
        calls: account?.logicalCalls ?? null,
        questions: account?.questions ?? null,
        failures: account?.failures ?? null,
        // Draws are per step; keep the last step that actually voted each item.
        checks: arm.checks.map(text => {
          const voted = result.steps.filter(s => (s.decision?.goalAssessment?.grounding?.checks || [])
            .some(c => c.text === text && (c.assessmentDraws || []).length)).at(-1);
          const proof = voted?.decision.goalAssessment.grounding.checks.find(c => c.text === text);
          const final = last?.decision.goalAssessment.grounding.checks.find(c => c.text === text);
          const evidence = final?.evidence?.length ?? 0;
          const assessment = final?.assessment?.choice ?? null;
          const contradictions = final?.contradictions?.choice ?? null;
          return {
            text, evidence, assessment, contradictions,
            // The same conjunction pendingGoalChecks applies, so a pending item
            // names the gate that held it rather than just failing silently.
            pending: !evidence || assessment !== 'present' || contradictions !== 'present',
            blockedBy: !evidence ? 'evidence' : assessment !== 'present' ? 'sufficiency' : contradictions !== 'present' ? 'contradictions' : null,
            draws: (proof?.assessmentDraws || []).map(d => d.choice),
            firstDraw: proof?.assessmentDraws?.[0]?.choice ?? null,
          };
        }),
        report: line.report,
      };
    } catch (error) {
      record.error = String(error).split('\n')[0];
    }
    record.wallSec = Number(((Date.now() - started) / 1000).toFixed(1));
    results.push(record);
    console.log(`${record.arm} run ${run}: ${record.reason ?? record.error} · ${record.actionCount ?? '-'} actions · ${record.calls ?? '-'} calls`);
    // Space the requests out; the site is a live public server.
    if (!(arm === ARMS.at(-1) && run === RUNS)) await new Promise(r => setTimeout(r, 5000));
  }
}

const summarise = name => {
  const rows = results.filter(r => r.arm === name && !r.error);
  const done = rows.filter(r => r.completed);
  const mean = xs => xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)) : null;
  return {
    arm: name, runs: rows.length, errors: results.filter(r => r.arm === name && r.error).length,
    completed: done.length, completionRate: rows.length ? Number((done.length / rows.length).toFixed(2)) : null,
    reasons: rows.reduce((m, r) => ({...m, [r.reason]: (m[r.reason] ?? 0) + 1}), {}),
    meanActions: mean(rows.map(r => r.actionCount)), meanCalls: mean(rows.map(r => r.calls)),
    // How often the first draw disagreed with the verdict the vote settled on:
    // each one is a run the old single-draw rule would have decided differently.
    firstDrawRescued: rows.flatMap(r => r.checks).filter(c => c.draws.length > 1 && c.firstDraw !== c.assessment).length,
    votedItems: rows.flatMap(r => r.checks).filter(c => c.draws.length).length,
    blockedBy: rows.flatMap(r => r.checks).filter(c => c.blockedBy)
      .reduce((m, c) => ({...m, [`${c.text}:${c.blockedBy}`]: (m[`${c.text}:${c.blockedBy}`] ?? 0) + 1}), {}),
  };
};

const summary = {commit, url: URL, runsPerArm: RUNS, maxActions: MAX_ACTIONS, arms: ARMS.map(a => ({name: a.name, goal: a.goal, checks: a.checks})),
  totals: ARMS.map(a => summarise(a.name)), results};
const root = `reports/repeatability-${new Date().toISOString().replaceAll(':', '-')}`;
await mkdir(root, {recursive: true});
await writeFile(`${root}/summary.json`, JSON.stringify(summary, null, 2) + '\n', {flag: 'wx'});
console.log('\n' + JSON.stringify(summary.totals, null, 2));
console.log(`saved: ${root}/summary.json`);
