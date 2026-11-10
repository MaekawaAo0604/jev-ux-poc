import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseCharter} from '../jev/persona.js';
import {auditHumanEvents,validateHumanControl} from '../runner/persona-human-validation.js';
const charter=parseCharter(JSON.parse(await readFile('experiments/persona/charter.json','utf8')));
const expected={charter,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo'};
test('human audit distinguishes prohibited download attempts and unobserved Back restrictions',()=>{
 const audit=auditHumanEvents([{action:'click',target:'2026-08 の請求書をPDFで保存'}],charter);
 assert.equal(audit.detectedAttemptViolations,1);
 assert.equal(audit.coverageComplete,true);
 const unknown=auditHumanEvents([],{...charter,prohibitedActions:{...charter.prohibitedActions,actionTypes:['back']}});
 assert.equal(unknown.coverageComplete,false);assert.equal(unknown.hardConstraintViolations,null);
});
test('human results require real actor attestation and matching task/environment',()=>{
 const sample={recorderReady:true,recordingErrors:[],actor:'human',selfAttested:true,goal:charter.goal,...expected,events:[],objectiveSuccess:true};
 assert.equal(validateHumanControl(sample,expected).status,'RECORDED_SELF_ATTESTED');
 assert.equal(validateHumanControl({...sample,actor:'automation'},expected).status,'UNVERIFIED_ACTOR');
 assert.equal(validateHumanControl({...sample,charter:{...charter,targetWebsite:'local:good'}},expected).status,'CONDITION_MISMATCH');
 assert.equal(validateHumanControl({...sample,viewport:{width:390,height:844}},expected).status,'CONDITION_MISMATCH');
 assert.equal(validateHumanControl({...sample,charter:undefined},expected).status,'CONDITION_MISMATCH');
});
