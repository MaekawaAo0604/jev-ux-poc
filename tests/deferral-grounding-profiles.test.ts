import test from 'node:test';
import assert from 'node:assert/strict';
import {humanJevProfile} from '../runner/human-jev-profiles.js';
import {validateConfig} from '../jev/virtual-beta/config.js';
test('grounded profile changes only declared id and review mode from excursion profile',()=>{
 const previous=humanJevProfile('experience-reason-excursion'),next=humanJevProfile('experience-reason-grounded' as any);
 const a=structuredClone(previous),b=structuredClone(next);delete (a.config as any).id;delete (b.config as any).id;delete (b.config.deferralReason as any).reviewMode;
 assert.deepEqual(b,a);assert.equal((next.config.deferralReason as any).reviewMode,'grounded-choice');assert.equal(next.maximumRequests,24);assert.equal(next.reviewMaximum,0);
});
test('reason config validates review mode while explicit separate preserves existing defaults',()=>{
 const old=humanJevProfile('experience-reason-excursion').config;
 for(const mode of ['separate','grounded-choice'])assert.equal((validateConfig({...structuredClone(old),deferralReason:{...old.deferralReason!,reviewMode:mode} as any}).deferralReason as any).reviewMode,mode);
 for(const mode of ['joint','',null,{},3])assert.throws(()=>validateConfig({...structuredClone(old),deferralReason:{...old.deferralReason!,reviewMode:mode} as any}),/INVALID_DEFERRAL_REASON_CONFIG/);
});
