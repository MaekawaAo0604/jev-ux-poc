import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseHoldoutFixture} from '../app/holdout-fixture.js';
import {parseSemanticFixture} from '../app/semantic-fixture.js';
import {comparisonUIFromSearch} from '../app/virtual-beta-ui.js';
import {transferFixtures,transferQuery,transferDefinition} from '../app/transfer-fixture.js';
import {runHumanJev} from '../runner/human-jev-experiment.js';
import {runBeta} from '../runner/virtual-beta-core.js';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {parseCharter} from '../jev/persona.js';

test('new transfer selectors cannot be interpreted by legacy fixture parsers',()=>{
 for(const f of transferFixtures())for(const other of ['&holdout=s1a','&semanticFixture=q7','&betaUI=r']){const q=transferQuery(f)+other;assert.equal(parseHoldoutFixture(q),undefined);assert.equal(parseSemanticFixture(q),undefined);assert.equal(comparisonUIFromSearch(q),undefined);}
 assert.ok(parseHoldoutFixture('?holdout=s1a'));assert.ok(parseSemanticFixture('?semanticFixture=q7'));assert.ok(comparisonUIFromSearch('?betaUI=r'));
});
test('invalid or overlapping transfer fixtures are rejected before output, browser or budget effects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'transfer-conflict-')),out=join(dir,'not-created');
 await assert.rejects(()=>runHumanJev({out,mock:true,mode:'experience-goal-search-grounded',transferFixture:{version:1,task:'help',variant:'alpha'},holdoutFixture:{task:'direct',variant:'alpha'}} as any),/CONFLICTING_FIXTURES/);
 await assert.rejects(access(out),{code:'ENOENT'});
 const f=transferFixtures()[0],d=transferDefinition(f),charter=parseCharter({schemaVersion:1,id:'neutral',targetWebsite:'local:good',goal:d.goal,initialState:{description:'local',currentDate:'2026-09-19'},scope:['local'],prohibitedActions:{actionTypes:[],controlTexts:[],downloads:true},maxActions:15,oracle:'notifications'});
 await assert.rejects(()=>runBeta({} as any,{runId:'conflict',dir:join(dir,'core-not-created'),baseURL:'http://local',charter,config:humanJevProfile('experience-goal-search-grounded').config,evaluate:async()=>{throw Error('UNREACHABLE');},transferFixture:f,holdoutFixture:{task:'direct',variant:'alpha'}} as any),/CONFLICTING_FIXTURES/);
 await assert.rejects(access(join(dir,'core-not-created')),{code:'ENOENT'});
});
