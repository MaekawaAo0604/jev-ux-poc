# Sufficiency Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide an item's sufficiency from a symmetric majority of up to five draws instead of one cached draw, and remove the two completion clauses that never discriminate, so completion stops degrading as a goal is split into more checks.

**Architecture:** `EvidenceSession` gains `vote()`, which reads the existing cache key, issues uncached draws through the existing `evaluate()` until one choice reaches a majority, stores the aggregate under that key, and returns the individual draws. `groundGoal` uses it for `scope-sufficiency` only. `pendingGoalChecks` drops its coarse and scope clauses. The report renders the split.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), `node:test` via `tsx`, Playwright for report rendering tests.

**Spec:** `docs/superpowers/specs/2026-09-24-sufficiency-voting-design.md`

## Global Constraints

- Do not lower the bar for completion. Drawing and stopping must be symmetric; no rule may name a choice.
- Aggregated probabilities are a record of the draws, not a calibrated posterior. No threshold arithmetic on them.
- `validateChoice` requires probabilities over exactly the criteria keys, each in `[0,1]`, summing to `1 ± 0.02`. The mean of draws satisfies this.
- Accounting counts every draw as a logical call and a question. A cache hit counts one reused call and one reused question.
- Contradictions, content classification and quote scope keep single draws. Only `scope-sufficiency` votes.
- The legacy path without `--goal-check` is unchanged, as are the visible-text policy, site safety policy, action limit and `objectiveSuccess:null`.
- No new model, provider or dependency. Native choice questions only.
- Never read, print or commit `.env` or credentials.
- Source files in `jev/`, `runner/` and `pages/` use the repository's dense single-line style. Match the surrounding file; do not reformat neighbouring code.

---

### Task 1: `vote()` on EvidenceSession

**Files:**
- Modify: `jev/evidence-session.ts` (add `voteAnswer` helper near `copy`, add `vote` method after `evaluate`)
- Test: `tests/sufficiency-voting.test.ts` (create)

**Interfaces:**
- Consumes: `evidenceKey`, `copy`, `this.data`, `this.add`, `this.evaluate`, `validateChoice` (already imported in the file). Add `RequestFailure` to the existing `./client.js` type import if it is not there.
- Produces: `EvidenceSession.vote(stage: string, state: unknown, questions: Record<string, ChoiceQuestion>, draws: number): Promise<ChoiceAnswers & {draws: Answer[]}>` where `Answer = ChoiceAnswers['answers'][string]`.

- [ ] **Step 1: Write the failing test**

Create `tests/sufficiency-voting.test.ts`:

```typescript
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
    // absent and present tie at two; the higher mean probability decides, and
    // both sit at 0.8+0.1+0.1+... so the tie falls to the first draw's choice.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/sufficiency-voting.test.ts`
Expected: FAIL — `session.vote is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `jev/evidence-session.ts`, add after the `copy` constant (line 14):

```typescript
type Answer=ChoiceAnswers['answers'][string];
// Most votes wins. A three-choice question can split with no majority, so the
// plurality decides, then the higher mean probability, then the first draw.
// No step names a choice, so an aggregate cannot be nudged toward completion.
function voteAnswer(draws:Answer[],criteria:Record<string,unknown>):Answer{
 const keys=Object.keys(criteria),votes=new Map<string,number>();
 for(const d of draws)votes.set(d.choice,(votes.get(d.choice)??0)+1);
 const probabilities=Object.fromEntries(keys.map(k=>[k,Number((draws.reduce((sum,d)=>sum+(d.probabilities[k]??0),0)/draws.length).toFixed(4))]));
 const choice=[...votes.keys()].sort((a,b)=>(votes.get(b)!-votes.get(a)!)||((probabilities[b]??0)-(probabilities[a]??0))||(draws.findIndex(d=>d.choice===a)-draws.findIndex(d=>d.choice===b)))[0];
 return {choice,probabilities};
}
```

Add `vote` immediately after the `evaluate` method:

```typescript
 // A single draw is cached and then reused for the rest of a run, so one
 // unlucky answer decides an item permanently. Draw until a majority, keep
 // every draw for the report, and cache the aggregate rather than a draw.
 async vote(stage:string,state:unknown,questions:Record<string,ChoiceQuestion>,draws:number):Promise<ChoiceAnswers&{draws:Answer[]}>{
  const ids=Object.keys(questions);
  if(ids.length!==1)throw new Error('A vote needs exactly one question');
  if(!Number.isSafeInteger(draws)||draws<1||draws>9)throw new Error('Invalid draw count');
  const id=ids[0],criteria=questions[id].criteria;
  const key=evidenceKey({namespace:this.data.namespace,state,questions});
  const hit=this.data.entries.find(e=>e.stage===stage&&e.key===key);
  if(hit){
   try{validateChoice(hit.answers[id],criteria);}
   catch{this.data.entries=this.data.entries.filter(e=>e!==hit);return this.vote(stage,state,questions,draws);}
   this.add(stage,{reusedCalls:1,reusedQuestions:1});
   this.data.requests.push({key,stage,questions:1,attempts:0,failures:[],status:'reused'});
   return copy({model:hit.model,answers:hit.answers,draws:[hit.answers[id]]});
  }
  const collected:Answer[]=[],majority=Math.floor(draws/2)+1,failures:RequestFailure[]=[];
  let model='',attempts=0,elapsedMs=0;
  for(let i=0;i<draws;i++){
   const response=await this.evaluate(stage,state,questions,undefined,false);
   collected.push(response.answers[id]);model=response.model;
   // One vote is one logical judgment made of several transported requests.
   // Sum them so the stage keeps a truthful trace instead of the last draw's.
   attempts+=response.request?.attempts??1;
   if(response.request?.failures.length)failures.push(...response.request.failures);
   elapsedMs+=response.request?.elapsedMs??0;
   const votes=new Map<string,number>();
   for(const d of collected)votes.set(d.choice,(votes.get(d.choice)??0)+1);
   if([...votes.values()].some(n=>n>=majority))break;
  }
  const answers={[id]:voteAnswer(collected,criteria)};
  this.data.entries.push({key,stage,model,answers});
  await this.options.checkpoint?.(this.snapshot());
  return copy({model,answers,request:{attempts,failures,elapsedMs},draws:collected});
 }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/sufficiency-voting.test.ts`
Expected: PASS, 6 tests.

If the plurality test fails on tie ordering, read the actual aggregate before changing the rule: the test encodes the rule from the spec, and the rule must not be changed to make a choice win.

- [ ] **Step 5: Commit**

```bash
git add jev/evidence-session.ts tests/sufficiency-voting.test.ts
git commit -m "Add a symmetric majority vote to EvidenceSession"
```

---

### Task 2: Completion contract without the non-discriminating clauses

**Files:**
- Modify: `jev/goal-status.ts:8-15` (`pendingGoalChecks`)
- Test: `tests/goal-status.test.ts` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `pendingGoalChecks` keeps its signature `(assessment: GoalAssessment) => string[]`; only the post-grounding predicate changes.

- [ ] **Step 1: Write the failing test**

Append to `tests/goal-status.test.ts`:

```typescript
const answer=(choice:string,keys:string[])=>({choice,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))});
const CHECK=['present','absent','uncertain'];
const assessmentWith=(coarse:string,proof:Partial<any>)=>({
 coverage:answer('complete',['complete','incomplete','uncertain']),
 checks:[{text:'料金',...answer(coarse,CHECK)}],
 model:'TEST',
 grounding:{requests:[],checks:[{text:'料金',evidence:[{id:'s1-t1',step:1,text:'630円',warnings:[],omitted:false}],relatedEvidence:[],uncertainEvidence:[],assessment:answer('present',CHECK),contradictions:answer('present',CHECK),scope:answer('match',['match','mismatch','uncertain']),...proof}]},
} as any);

test('a grounded verdict is not reopened by the coarse answer it was selected from',()=>{
 // groundGoal only runs on coarse-present items, and in 990 recorded
 // judgements a coarse answer never blocked an item grounding had accepted.
 assert.deepEqual(pendingGoalChecks(assessmentWith('absent',{})),[]);
});

test('scope no longer blocks separately, because accepted evidence already implies it',()=>{
 assert.deepEqual(pendingGoalChecks(assessmentWith('present',{scope:answer('uncertain',['match','mismatch','uncertain'])})),[]);
});

test('missing evidence, insufficiency and contradictions each still block',()=>{
 assert.deepEqual(pendingGoalChecks(assessmentWith('present',{evidence:[]})),['料金']);
 assert.deepEqual(pendingGoalChecks(assessmentWith('present',{assessment:answer('absent',CHECK)})),['料金']);
 assert.deepEqual(pendingGoalChecks(assessmentWith('present',{contradictions:answer('absent',CHECK)})),['料金']);
});
```

Add `pendingGoalChecks` to that file's existing import from `../jev/goal-status.js` if it is not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/goal-status.test.ts`
Expected: FAIL on the first two tests — `['料金']` returned instead of `[]`.

- [ ] **Step 3: Write minimal implementation**

Replace the post-grounding filter in `jev/goal-status.ts`:

```typescript
 return assessment.checks.filter((_,i)=>{
  const proof=assessment.grounding?.checks[i];
  // The coarse answer selected this item for grounding, so re-testing it only
  // adds a way to lose a verdict the quotes already support; scope is implied
  // because only match-scoped quotes enter evidence. Newly observed
  // information that should reopen an item is the contradiction veto's job.
  return !proof?.evidence.length||proof.assessment?.choice!=='present'||proof.contradictions?.choice!=='present';
 }).map(c=>c.text);
```

Leave the `preliminary` branch above it unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/goal-status.test.ts tests/goal-evidence.test.ts tests/contradiction-batches.test.ts`
Expected: PASS. If an existing assertion now fails, read it before editing: an assertion about contradictions or missing evidence must keep blocking, and only an assertion that pinned the removed clauses may change.

- [ ] **Step 5: Commit**

```bash
git add jev/goal-status.ts tests/goal-status.test.ts
git commit -m "Drop the completion clauses that never discriminated"
```

---

### Task 3: Sufficiency votes and records its draws

**Files:**
- Modify: `jev/goal-evidence.ts` (export `SUFFICIENCY_DRAWS`, extend `GroundedCheck`, change the `scope-sufficiency` call)
- Test: `tests/sufficiency-voting.test.ts` (append)

**Interfaces:**
- Consumes: `EvidenceSession.vote` from Task 1.
- Produces: `SUFFICIENCY_DRAWS: 5` exported from `jev/goal-evidence.ts`; `GroundedCheck.assessmentDraws?: Answer[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/sufficiency-voting.test.ts`:

```typescript
import {assessGoal} from '../jev/goal-status.js';
import {SUFFICIENCY_DRAWS} from '../jev/goal-evidence.js';
import type {State} from '../jev/types.js';

const pipelineState: State = {
  goal: '料金を知りたい。', currentDate: '2026-09-24', history: [],
  screen: {title: '料金', text: ['大人 630円'], elements: [], canScrollDown: false, canScrollUp: false},
};

// Answers every stage routinely, and scripts only the sufficiency draws.
function pipelineProvider(sufficiency: string[]) {
  const stages: string[] = [];
  const previous = (globalThis as any).AI_SDK_DEFAULT_PROVIDER, key = process.env.AI_GATEWAY_API_KEY;
  (globalThis as any).AI_SDK_DEFAULT_PROVIDER = {evaluationModel: () => ({
    specificationVersion: 'v4', provider: 'TEST', modelId: 'TEST', supportedQuestionTypes: ['choice'],
    async doEvaluate(input: any) {
      const answers: any = {};
      for (const [id, q] of Object.entries<any>(input.questions)) {
        let choice: string;
        if (id.startsWith('grounded_')) {stages.push(id); choice = sufficiency[stages.length - 1] ?? sufficiency[sufficiency.length - 1];}
        else choice = id === 'coverage' ? 'complete' : id === 'check_0' ? 'present'
          : id.startsWith('screen_') ? 'relevant' : id.startsWith('intent_') ? 'cost'
          : id.startsWith('evidence_') ? 'direct' : id.startsWith('scope_quote_') ? 'match' : 'present';
        answers[id] = {type: 'choice', choice, probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === choice ? 1 : 0]))};
      }
      return {answers, warnings: []};
    },
  })};
  process.env.AI_GATEWAY_API_KEY = 'LOCAL_TEST_ONLY';
  return {stages, restore() {
    (globalThis as any).AI_SDK_DEFAULT_PROVIDER = previous;
    if (key === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = key;
  }};
}

test('sufficiency is decided by a vote and every draw is recorded', async () => {
  assert.equal(SUFFICIENCY_DRAWS, 5);
  const p = pipelineProvider(['absent', 'present', 'absent', 'present', 'present']);
  try {
    const assessment = await assessGoal(pipelineState, ['料金']);
    const proof = assessment.grounding!.checks[0];
    assert.equal(proof.assessment!.choice, 'present', 'the majority decides, not the first draw');
    assert.deepEqual(proof.assessmentDraws!.map(d => d.choice), ['absent', 'present', 'absent', 'present', 'present']);
    assert.equal(p.stages.length, 5);
  } finally {p.restore();}
});

test('a unanimous sufficiency still records the draws it actually took', async () => {
  const p = pipelineProvider(['present', 'present', 'present', 'present', 'present']);
  try {
    const assessment = await assessGoal(pipelineState, ['料金']);
    assert.deepEqual(assessment.grounding!.checks[0].assessmentDraws!.map(d => d.choice), ['present', 'present', 'present']);
  } finally {p.restore();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/sufficiency-voting.test.ts`
Expected: FAIL — `SUFFICIENCY_DRAWS` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `jev/goal-evidence.ts`:

Add the constant next to `contentTask`:

```typescript
// One draw is cached and reused for the rest of a run, so a marginal item was
// decided by a single sample. Five draws with symmetric early stopping cost
// three calls when the answer is clear-cut.
export const SUFFICIENCY_DRAWS=5;
```

Add `assessmentDraws?:Answer[];` to `GroundedCheck`, immediately after `assessment?:Answer;`.

Replace the sufficiency call inside the `for(const {i} of active)` loop:

```typescript
  const response=await session.vote('scope-sufficiency',{goal:state.goal,currentDate:state.currentDate,checks:{[i]:acceptedChecks[i]}},{[`grounded_${i}`]:questions[`grounded_${i}`]},SUFFICIENCY_DRAWS);
  progress.model=response.model;if(response.request)progress.requests.push(response.request);
  check.assessment=response.answers[`grounded_${i}`];
  check.assessmentDraws=response.draws;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/sufficiency-voting.test.ts tests/goal-evidence.test.ts tests/evidence-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jev/goal-evidence.ts tests/sufficiency-voting.test.ts
git commit -m "Decide sufficiency by vote and keep every draw"
```

---

### Task 4: The report shows a split verdict as a split

**Files:**
- Modify: `runner/report.ts` (inside `goalProgress`, the per-check `<li>`)
- Test: `tests/report.test.ts` (append)

**Interfaces:**
- Consumes: `GroundedCheck.assessmentDraws` from Task 3.
- Produces: no exported symbol; rendered text only.

- [ ] **Step 1: Write the failing test**

Append to `tests/report.test.ts`:

```typescript
test('a split sufficiency verdict is shown as a split, not just its majority',async()=>{
 const s=step(1,'料金','https://example.test/','JEV_DONE','done') as any;
 const a=(choice:string)=>({choice,probabilities:{present:choice==='present'?1:0,absent:choice==='absent'?1:0,uncertain:0}});
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}],grounding:{requests:[],checks:[
  {text:'料金',evidence:[{id:'s1-t1',step:1,text:'630円',warnings:[],omitted:false}],relatedEvidence:[],uncertainEvidence:[],
   assessment:a('present'),contradictions:a('present'),assessmentDraws:[a('absent'),a('present'),a('absent'),a('present'),a('present')]},
 ]}};
 const html=await renderFixture({reason:'JEV_DONE',steps:[s]});
 assert.match(html,/十分性の判定：5回中3回 present/);
});

test('a single-draw sufficiency verdict adds no split line',async()=>{
 const s=step(1,'料金','https://example.test/','JEV_DONE','done') as any;
 const a=(choice:string)=>({choice,probabilities:{present:1,absent:0,uncertain:0}});
 s.decision.goalAssessment={coverage:{choice:'complete'},checks:[{text:'料金',choice:'present'}],grounding:{requests:[],checks:[
  {text:'料金',evidence:[{id:'s1-t1',step:1,text:'630円',warnings:[],omitted:false}],relatedEvidence:[],uncertainEvidence:[],
   assessment:a('present'),contradictions:a('present'),assessmentDraws:[a('present')]},
 ]}};
 const html=await renderFixture({reason:'JEV_DONE',steps:[s]});
 assert.doesNotMatch(html,/十分性の判定：/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/report.test.ts`
Expected: FAIL — the split line is not rendered.

- [ ] **Step 3: Write minimal implementation**

In `runner/report.ts`, inside `goalProgress`, immediately before the `return` that builds the per-check `<li>`, add:

```typescript
  const draws=proof.assessmentDraws;
  const drawNote=Array.isArray(draws)&&draws.length>1?`<p class="hint">十分性の判定：${escape(draws.length)}回中${escape(draws.filter((d:any)=>d.choice===proof.assessment?.choice).length)}回 ${escape(proof.assessment?.choice)}。同じ入力でも判定は揺れます。多数決の結果であり、確信度ではありません。</p>`:'';
```

Then insert `${drawNote}` into that `<li>` template, directly after the existing `<p class="hint">…</p>` that reports the coarse judgement.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tests/report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add runner/report.ts tests/report.test.ts
git commit -m "Show a split sufficiency verdict in the report"
```

---

### Task 5: Whole-suite verification and a live re-run

**Files:**
- Modify: `docs/superpowers/plans/2026-09-24-sufficiency-voting.md` (tick the boxes), `docs/experiments/2026-09-24-evidence-pipeline-analysis.md` (append the result)

**Interfaces:**
- Consumes: everything above.
- Produces: a recorded live run.

- [ ] **Step 1: Typecheck and run the whole suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, 0 failures, the existing single OCR skip. If an assertion about call counts through the sufficiency stage fails, update it to the voted count; do not weaken an assertion about completion semantics.

- [ ] **Step 2: Re-run the exploration that failed**

Run:

```bash
npm run explore -- "https://www.kahaku.go.jp/" "上野本館の常設展示に大人と高校生で行く場合の入館料と開館時間を知りたい。" --reviewed --goal-check "大人と高校生で行く場合の入館料" --goal-check "開館時間"
```

Record from `result.json`: `reason`, `actionCount`, the per-check `assessmentDraws` splits, and `evidenceSession.accounting.logicalCalls`. The measured expectation is a majority `present` for 「大人と高校生で行く場合の入館料」 with a visible split, and roughly four to twelve more calls than the 51 of `reports/2026-09-23T22-19-24.081Z-public`. A different outcome is a finding to report, not a reason to change the rule.

- [ ] **Step 3: Append the result to the analysis document**

Add a section to `docs/experiments/2026-09-24-evidence-pipeline-analysis.md` giving the before/after call counts, the draw split, and whether the verdict changed. State plainly that one run is not a repeatability measurement.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-24-sufficiency-voting.md docs/experiments/2026-09-24-evidence-pipeline-analysis.md
git commit -m "Record the voted run and tick the plan"
```
