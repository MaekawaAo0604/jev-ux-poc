import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {main} from '../runner/virtual-beta.js';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
async function setup(){const dir=await mkdtemp(join(tmpdir(),'controlled-cli-')),plan=join(dir,'plan.json'),out=join(dir,'run');return {dir,plan,out};}
test('existing CLI executes a saved independent plan without requiring four configs',async()=>{
 const {plan,out}=await setup(),config={...comparisonConfigs()[0],maxAPICalls:1};await writeFile(plan,JSON.stringify({schemaVersion:1,id:'cli',configs:[config],seeds:[11],maxTotalAPI:1}));
 const result=await main(['--mock','--comparison-plan',plan,'--out',out]);assert.equal(result!.results.length,1);assert.equal(result!.results[0].config.selection.seed,11);const summary=JSON.parse(await readFile(join(out,'comparison.json'),'utf8'));assert.equal(summary.actualAPIRequests,0);assert.equal(summary.trials.length,1);assert.equal(summary.trials[0].status,'censored');
});
test('plan mode rejects underfunding and conflicting legacy knobs before output or credential access',async()=>{
 const {plan,out}=await setup();await writeFile(plan,JSON.stringify({schemaVersion:1,id:'bad',configs:comparisonConfigs(),seeds:[1],maxTotalAPI:1}));
 await assert.rejects(main(['--comparison-plan',plan,'--env-file','NO_CREDENTIAL_READ','--out',out]),/COMPARISON_ALLOCATION/);await assert.rejects(access(out));
 await assert.rejects(main(['--mock','--comparison-plan',plan,'--seed','2','--out',out]),/CONFLICTING_COMPARISON_OPTIONS/);await assert.rejects(access(out));
});
