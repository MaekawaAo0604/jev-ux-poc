import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,cp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as analyzer from '../scripts/analyze-crop-context.js';
const sha=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const phaseFile='reports/crop-stuck-2026-11-10/live-r1/phase.json';
const load=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const original=existsSync(phaseFile)?await load(phaseFile):null;
const available=original?.status==='COMPLETED'&&original.batches?.length===3&&(await Promise.all(original.batches.map(async(b:any)=>{try{const s=await load(join(b.outDir,'comparison.json'));return s.trials.length===4&&s.trials.every((r:any)=>existsSync(join(b.outDir,r.runId,'result.json')))&&existsSync(b.ledger);}catch{return false;}}))).every(Boolean);
const reason=available?false:'Completed 12-trial crop raw phase and ledgers unavailable; negative analyzer cases require retained actual artifacts.';
const parent='reports/crop-stuck-2026-11-10/independent';await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'analysis-negative-'));
const evidence:any={schemaVersion:1,source:'Independent completed-phase copies; originals are read-only',actualModelCalls:0,phaseFile,phaseSha256:existsSync(phaseFile)?sha(await readFile(phaseFile)):null,cases:[]};
after(async()=>{await writeFile(join(root,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log('Analyzer negative evidence: '+root);});
async function fixture(name:string){const dir=join(root,name);await mkdir(dir);const p=structuredClone(original),b=p.batches[0],copied=join(dir,'batch');await cp(b.outDir,copied,{recursive:true});const summary=await load(join(copied,'comparison.json')),ledger=await load(b.ledger);for(const a of ledger.attempts)a.runKey=join(copied,a.runKey.replaceAll('\\','/').split('/').at(-1));b.outDir=resolve(copied);b.ledger=resolve(dir,'ledger.json');return {dir,p,b,summary,ledger,phase:join(dir,'phase.json'),out:join(dir,'analysis')};}
async function save(f:Awaited<ReturnType<typeof fixture>>){const summary=JSON.stringify(f.summary,null,2)+'\n';await writeFile(join(f.b.outDir,'comparison.json'),summary);f.b.summarySha256=sha(summary);await writeFile(f.b.ledger,JSON.stringify(f.ledger,null,2)+'\n');await writeFile(f.phase,JSON.stringify(f.p,null,2)+'\n');}

test('independent analyzer accepts the untouched copied completed cohort',{skip:reason},async()=>{const f=await fixture('untouched');await save(f);const a=await analyzer.analyzeCrop(f.phase,f.out);assert.equal(a.actual,12);assert.equal(a.requests,60);evidence.cases.push({name:'untouched',accepted:true,trials:a.actual,requests:a.requests});});

for(const name of ['duplicate-request-reservation','wrong-ledger-run-key','wrong-ledger-condition','wrong-ledger-source']as const)test('independent analyzer rejects '+name+' even with updated comparison hash',{skip:reason},async()=>{
 const f=await fixture(name);if(name==='duplicate-request-reservation')f.summary.requests[1].reservationId=f.summary.requests[0].reservationId;
 if(name==='wrong-ledger-run-key')f.ledger.attempts[0].runKey=join(f.b.outDir,'crop-both-seed-9001');
 if(name==='wrong-ledger-condition')f.ledger.attempts[0].condition='crop-both';
 if(name==='wrong-ledger-source')f.ledger.attempts[0].sourceHash='0'.repeat(64);
 await save(f);let error:unknown;try{await analyzer.analyzeCrop(f.phase,f.out);}catch(e){error=e;}
 evidence.cases.push({name,rejected:error instanceof Error?error.message:null});assert.ok(error instanceof Error,'Tampered accounting was accepted');assert.match(error.message,/^(?:RESERVATION_MISMATCH|SOURCE_OR_ACCOUNTING_MISMATCH|LEDGER_[A-Z_]+|REQUEST_[A-Z_]+)$/);
});

test('independent confound normalization drops only id and observation context, retaining all attention controls',async()=>{
 const normalize=(analyzer as any).comparisonConfigWithoutObservationContext;assert.equal(typeof normalize,'function');
 const base:any={id:'control',vision:{mode:'crop'},selection:{mode:'argmax',seed:9001},attention:{enabled:true,policy:'exclusive-hierarchical-v2',sampling:'domain-separated-v1',taskFrame:'attention-v1'}};
 for(const option of ['geometry-v1','actions-v1','geometry-actions-v1'])assert.deepEqual(normalize({...base,id:option,attention:{...base.attention,observationContext:option}}),normalize(base));
 for(const change of [{enabled:false},{policy:'exclusive-flat-v2'},{sampling:undefined},{taskFrame:undefined}])assert.notDeepEqual(normalize({...base,attention:{...base.attention,...change}}),normalize(base));
 assert.notDeepEqual(normalize({...base,vision:{mode:'foveated'}}),normalize(base));assert.notDeepEqual(normalize({...base,selection:{mode:'argmax',seed:9002}}),normalize(base));assert.deepEqual(base.attention,{enabled:true,policy:'exclusive-hierarchical-v2',sampling:'domain-separated-v1',taskFrame:'attention-v1'});evidence.cases.push({name:'attention-controls-retained',passed:true});
});
