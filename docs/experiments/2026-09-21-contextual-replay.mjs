// Real-model replay. Expectations and reference answers are NEVER part of model input.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assessGoal, isGoalComplete} from '../../jev/goal-status.ts';
import {createEvidenceSession} from '../../jev/evidence-session.ts';
import {safeRequestFailure} from '../../jev/client.ts';
import {preflight} from './2026-09-22-preflight.mjs';

const source = 'reports/goal-check-validation-2026-09-20T11-35-17.953Z/validation.json';
const baseline = 'reports/2026-09-21T00-46-14.646Z-public/exploration/result.json';
const prior = JSON.parse(await readFile(source, 'utf8'));
const live = JSON.parse(await readFile(baseline, 'utf8'));
const generic = structuredClone(live.steps[2].state);
generic.goal = '高校生無料制度で利用できる店舗を知りたい。申し込みはしない。';
generic.history = [];
// Controlled fixtures, not observations from a real site. Only the heading differs.
const scopedHours = heading => ({goal:'高校生無料制度の利用時間を知りたい。',
  currentDate:generic.currentDate,history:[],screen:{title:heading,pageId:'p1',
    text:[heading,'平日10時から17時'],elements:[],canScrollDown:false,canScrollUp:false,
    regions:[heading,'平日10時から17時'].map((text,i)=>({id:`t${i+1}`,source:'dom',text,
      context:{landmark:'main',section:'s1',headings:[heading]}}))}});
const cases = [
  ...prior.cases.map(c => ({id:c.id, state:c.state, checks:c.checks, expectedComplete:c.expectedComplete})),
  {id:'recorded-live-full-627-fragments', state:live.steps.at(-1).state,
    checks:live.settings.goalChecks, expectedComplete:true},
  {id:'generic-member-stores-only', state:generic, checks:['利用できる店舗'], expectedComplete:false},
  {id:'fixture-identical-hours-general-member',state:scopedHours('一般会員の利用時間'),
    checks:['高校生無料制度の利用時間'],expectedComplete:false,sourceType:'constructed-context-fixture'},
  {id:'fixture-identical-hours-highschool',state:scopedHours('高校生無料制度の利用時間'),
    checks:['高校生無料制度の利用時間'],expectedComplete:true,sourceType:'constructed-context-fixture'},
];
const hoursRule=scopedHours('高校生無料制度の利用時間');
hoursRule.screen.text[1]='利用できるのはスタッフアワー内のみです。深夜早朝は利用できません。';
hoursRule.screen.regions[1].text=hoursRule.screen.text[1];
cases.push({id:'fixture-general-hours-rule',state:hoursRule,checks:['高校生無料制度の利用時間'],expectedComplete:true,sourceType:'constructed-specificity-fixture'});
const concreteHours=structuredClone(hoursRule);
concreteHours.goal='高校生無料制度で福井店を今日利用できる具体的な開始・終了時刻を知りたい。';
cases.push({id:'fixture-concrete-hours-not-stated',state:concreteHours,checks:['具体的な開始・終了時刻'],expectedComplete:false,sourceType:'constructed-specificity-fixture'});
const repeats = process.argv.includes('--repeat-twice') ? 2 : 1;
const onlyIndex=process.argv.indexOf('--only');
if(onlyIndex>=0){const selected=new Set(process.argv[onlyIndex+1].split(','));for(let i=cases.length-1;i>=0;i--)if(!selected.has(cases[i].id))cases.splice(i,1);assert.equal(cases.length,selected.size,'Unknown replay case');}
const root = resolve('reports', `contextual-replay-${new Date().toISOString().replaceAll(':','-')}`);
await mkdir(root, {recursive:true});
const files = ['package-lock.json', ...(await Promise.all(['jev','pages','runner'].map(async dir =>
  (await readdir(dir)).filter(f=>f.endsWith('.ts')).map(f=>join(dir,f))))).flat()];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file =>
  [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const out = {source, baseline, startedAt:new Date().toISOString(), repeats,
  plannedCases:cases.map(({id,expectedComplete})=>({id,expectedComplete})),
  sourceHashes:await hashes(), results:[]};
const save = () => writeFile(join(root,'validation.json'), JSON.stringify(out,null,2));
await save();
process.loadEnvFile('.env');
out.preflight=await preflight();await save();
if(!out.preflight.ok){out.notRun=cases.map(c=>c.id);await save();console.log(JSON.stringify({report:join(root,'validation.json'),preflight:out.preflight,notRun:out.notRun.length}));process.exit(1);}
for(let repeat=1;repeat<=repeats;repeat++) for(const c of cases) {
  assert.deepEqual(await hashes(), out.sourceHashes, 'Production changed during replay');
  const checkpointPath = join(root, `${c.id}-${repeat}-session.json`);
  let checkpoint, assessment, error, stage;
  const session = createEvidenceSession({checkpoint:async snapshot => {
    checkpoint = snapshot;
    await writeFile(checkpointPath, JSON.stringify(snapshot,null,2));
  }});
  const started = performance.now();
  try { assessment = await assessGoal(c.state, c.checks, session); }
  catch(e) { error = safeRequestFailure(e); stage = e.stage; assessment = e.goalAssessment; }
  const complete = !error && !!assessment && isGoalComplete(assessment);
  let restoredReplay;
  if (c.id==='highschool-complete' && !error && checkpoint) {
    // One explicit immutable-state restore check; not an automatic retry of failures.
    try {
      const persisted = JSON.parse(await readFile(checkpointPath,'utf8'));
      const restored = createEvidenceSession({snapshot:persisted});
      const before = restored.snapshot().accounting.logicalCalls;
      const again = await assessGoal(c.state,c.checks,restored);
      const after = restored.snapshot().accounting.logicalCalls;
      assert.equal(isGoalComplete(again),complete);
      assert.deepEqual(again.grounding?.checks.map(p=>p.evidence),assessment.grounding?.checks.map(p=>p.evidence));
      assert.equal(after,before,'Restoring the same immutable input must not request successful work again');
      restoredReplay = {pass:true,additionalCalls:after-before};
    } catch(e) {
      restoredReplay = {pass:false,error:e.code==='ERR_ASSERTION'?e.message:safeRequestFailure(e)};
    }
  }
  const frames = [...c.state.history.map(h=>h.observedText||[]), c.state.screen.text];
  let verifiedQuotes = 0;
  const forbiddenQuotes=[];
  for(const check of assessment?.grounding?.checks||[]) {
    for(const field of ['evidence','relatedEvidence','uncertainEvidence']) {
      for(const quote of check[field]||[]) {
        assert.ok(frames[quote.step-1]?.includes(quote.text), 'Quoted text must exist at the recorded observation');
        verifiedQuotes++;
        if(field==='evidence'&&['利用上の注意点','登録方法','未成年でも入会できますか？','タトゥーが入っていても入会できますか？','｜個別ページ｜'].includes(quote.text))forbiddenQuotes.push(quote.text);
      }
    }
  }
  out.results.push({id:c.id, repeat, expectedComplete:c.expectedComplete, complete, error, stage,restoredReplay,
    elapsedMs:performance.now()-started, assessment, verifiedQuotes,forbiddenQuotes,
    ...(checkpoint?{checkpointPath}:{}),
    input:{goal:c.state.goal, checks:c.checks, source:c.sourceType ||
      (c.id.startsWith('recorded')||c.id.startsWith('generic')?baseline:source)}});
  await save();
  console.log(JSON.stringify({id:c.id,repeat,expectedComplete:c.expectedComplete,complete,error,stage,verifiedQuotes}));
}
assert.deepEqual(await hashes(), out.sourceHashes);
out.finishedAt = new Date().toISOString();
out.codeUnchanged = true;
out.pass = out.results.every(r=>!r.error && r.complete===r.expectedComplete && !r.forbiddenQuotes.length && r.restoredReplay?.pass!==false);
await save();
console.log(JSON.stringify({report:join(root,'validation.json'),pass:out.pass,
  correct:out.results.filter(r=>!r.error&&r.complete===r.expectedComplete).length,
  errors:out.results.filter(r=>r.error).length,
  falseCompletions:out.results.filter(r=>!r.error&&r.complete&&!r.expectedComplete).length,
  total:out.results.length}));
