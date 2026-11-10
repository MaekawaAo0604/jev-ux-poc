import test from 'node:test';
import assert from 'node:assert/strict';
import {validateHumanControl} from '../runner/persona-human-validation.js';
import {parseCharter} from '../jev/persona.js';
import {readFileSync} from 'node:fs';
const charter=parseCharter(JSON.parse(readFileSync('experiments/persona/charter-good.json','utf8')));
const semantic={fixture:{version:1,ui:'reference',mapping:'A'},definitionHash:'d'.repeat(64),sourceHash:'c'.repeat(64),initialProductImageSha256:'a'.repeat(64)};
const expected={charter,viewport:{width:1280,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',semantic};
const recorded=()=>({actor:'human',selfAttested:true,recorderReady:true,recordingErrors:[],charter,goal:charter.goal,viewport:expected.viewport,locale:expected.locale,timezoneId:expected.timezoneId,events:[],semantic:structuredClone(semantic)});
test('semantic human match requires same fixture, mapping, UI, source, definition and unnumbered product image',()=>{
 const good=validateHumanControl(recorded(),expected as any);assert.equal(good.conditionsMatch,true);assert.equal(good.humanExperienceReproductionVerified,false);assert.equal(good.operationCountDirectlyComparable,false);
 for(const key of ['definitionHash','sourceHash','initialProductImageSha256'] as const){const value=recorded();value.semantic[key]='b'.repeat(64);assert.equal(validateHumanControl(value,expected as any).conditionsMatch,false,key);}
 for(const [key,value] of [['ui','wording-only'],['mapping','B'],['version',2]]){const r=recorded();(r.semantic.fixture as any)[key as string]=value;assert.equal(validateHumanControl(r,expected as any).conditionsMatch,false,String(key));}
 const missing:any=recorded();delete missing.semantic;assert.equal(validateHumanControl(missing,expected as any).conditionsMatch,false);
});
test('matching metadata cannot promote automation or missing self-attestation to a human comparison',()=>{
 for(const value of [{...recorded(),actor:'automation'},{...recorded(),selfAttested:false}])assert.equal(validateHumanControl(value,expected as any).status,'UNVERIFIED_ACTOR');
});

test('human comparison rejects different objective policies even with identical product pixels',()=>{
 const wanted={...expected,semantic:{...semantic,objectivePolicy:'mail-and-display-preserved' as const}};assert.equal(validateHumanControl(recorded(),wanted as any).conditionsMatch,false);
 const r={...recorded(),semantic:{...semantic,objectivePolicy:'mail-and-display-preserved' as const}};assert.equal(validateHumanControl(r,wanted as any).conditionsMatch,true);
});
