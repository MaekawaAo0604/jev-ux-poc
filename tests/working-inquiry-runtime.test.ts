import test from 'node:test';
import assert from 'node:assert/strict';
import{humanJevProfile}from'../runner/human-jev-profiles.js';
import{validateConfig}from'../jev/virtual-beta/config.js';
import{buildOpenAIVisualHypothesisRequest}from'../runner/openai-visual-hypotheses.js';

test('working inquiry is opt-in and inherits every existing limit without replacing prior links',()=>{
 const previous=humanJevProfile('experience-visual-conditions-prior-links',300000,60000),mode=humanJevProfile('experience-working-inquiry' as any,300000,60000);
 assert.equal((mode.config.visualHypotheses as any).workingInquiry,true);
 const clean=structuredClone(mode);clean.config.id=previous.config.id;delete(clean.config.visualHypotheses as any).workingInquiry;
 assert.deepEqual(clean,previous);assert.equal((previous.config.visualHypotheses as any).workingInquiry,undefined);
});
test('invalid working inquiry dependencies do not silently fall back to ordinary choices',()=>{
 const base=humanJevProfile('experience-visual-conditions-prior-links').config;
 for(const visual of [{workingInquiry:'yes'},{workingInquiry:true,enabled:false},{workingInquiry:true,priorConditionLinks:false},{workingInquiry:true,candidateChecks:false},{workingInquiry:true,continuity:undefined}])
 assert.throws(()=>validateConfig({...base,visualHypotheses:{...base.visualHypotheses!,...visual}}as any));
 assert.throws(()=>validateConfig({...base,deliberation:undefined,visualHypotheses:{...base.visualHypotheses!,workingInquiry:true}}as any));
});
import{mkdir,writeFile,readFile}from'node:fs/promises';import{resolve}from'node:path';import*as comparison from'../runner/condition-continuity-comparison.js';
test('working-inquiry comparison has four fixed slots, identical native input and separate invalid/subjective outcomes',async()=>{
 const opts:any={inquiry:true,mock:true,out:'reports/working-inquiry-2026-10-30/parent/comparison-'+Date.now(),priorSnapshot:'',trialMs:300000,visualRequestMs:60000};
 const schedule=(comparison.continuitySchedule as any)(false,false,false,true);assert.deepEqual(schedule.map((s:any)=>s.actor),['experience-working-inquiry','experience-visual-conditions-prior-links','experience-visual-conditions-prior-links','experience-working-inquiry']);
 await mkdir(resolve(opts.out,'..'),{recursive:true});opts.priorSnapshot=resolve(opts.out+'-prior.json');await writeFile(opts.priorSnapshot,JSON.stringify({count:0,files:[]}));
 for(const wrong of[{priorLinks:true},{checks:true},{retention:true},{trialMs:180000},{visualRequestMs:30000},{inquiry:'yes'}])assert.throws(()=>comparison.validateContinuityOptions({...opts,...wrong}));
 const saved=await comparison.runContinuityComparison(opts);assert.equal(saved.requests,0);const m=JSON.parse(await readFile(opts.out+'/manifest.json','utf8')),s=JSON.parse(await readFile(opts.out+'/summary.json','utf8'));
 assert.equal(m.inquiry,true);assert.equal(m.limits.maxRequests,144);assert.equal(s.kind,'MOCK_WORKING_INQUIRY_INTEGRATION_ONLY');assert.equal(s.valid,4);assert.equal(s.invalid,0);assert.equal(s.pairs.every((p:any)=>p.matched),true);
 for(const r of m.records){if(r.actor==='experience-working-inquiry')assert.ok(r.result.steps[0].workingInquiry.record);else assert.equal(r.result.steps[0].workingInquiry,undefined);assert.equal(r.result.objectiveSuccess,false);}
 for(const indexes of [[0,1],[2,3]]){const bodies=[];for(const i of indexes){const r=m.records[i],v=r.result.steps[0].visualHypotheses,images:any={};for(const [id,a]of Object.entries(v.assetFiles)as any)images[id]={mediaType:'image/png',data:(await readFile(r.dir+'/exploration/'+a.file)).toString('base64')};bodies.push(buildOpenAIVisualHypothesisRequest({...v.request,images,timeoutMs:60000}));}assert.deepEqual(bodies[0],bodies[1]);}
});
