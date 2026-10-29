/** Offline only: preserve all raw artifacts and derive a descriptive shareable comparison. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeProviderComparison} from '../../runner/provider-comparison-analysis.js';
import {readTransferLedger} from '../../runner/transfer-evaluation.js';
import {verifyTransferFrames} from '../../runner/transfer-analysis.js';
import {sourceIdentity} from '../../runner/virtual-beta-source.js';
const [file,expectedSha,output]=process.argv.slice(2);
assert.ok(file&&output);assert.match(expectedSha??'',/^[a-f0-9]{64}$/);
const path=resolve(file),root=dirname(path),out=resolve(output),sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
function within(file:string){const p=resolve(file),r=relative(root,p);assert.ok(!isAbsolute(r)&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!/(^|[\\/])\.env(?:\.|$)/i.test(file));return p;}
assert.throws(()=>within(out),'Output must stay outside raw batch');
try{await lstat(out);throw Error('OUTPUT_ALREADY_EXISTS');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const bytes=await readFile(path);assert.equal(sha(bytes),expectedSha);const m=JSON.parse(bytes.toString('utf8'));
assert.equal(m.schemaVersion,1);assert.equal(m.mock,false);assert.notEqual(m.status,'RUNNING');
const ids=new Set<string>();let charged=0,OK=0,ERROR=0,RESERVED=0;
for(const record of m.records){
 const ledger=await readTransferLedger(within(record.ledger));assert.equal(ledger.used,record.requests);charged+=ledger.used;OK+=ledger.ok;ERROR+=ledger.errors;RESERVED+=ledger.reserved;
 const raw=JSON.parse(await readFile(within(record.ledger),'utf8'));for(const a of raw.attempts){assert.ok(!ids.has(a.id));ids.add(a.id);}
 if(record.result){assert.deepEqual(JSON.parse(await readFile(within(record.resultPath),'utf8')),record.result);assert.deepEqual(await verifyTransferFrames(record.result,within(join(record.dir,'exploration'))),record.frameChecks);}
}
assert.equal(charged,m.totalRequests);assert.ok(charged<=m.limits.maxRequests);
const comparison=analyzeProviderComparison(m.records),analysis=await sourceIdentity();
const publicProviders=Object.fromEntries(Object.entries(comparison.providers).map(([provider,report])=>[provider,{...report,runs:report.runs.map(({dir,resultPath,ledger,...run})=>run)}]));
const result={...comparison,status:m.status,producer:{revision:m.revision,sourceHash:m.sourceHash,protocol:m.protocol,charterSha256:m.charterSha256},analysis:{revision:analysis.revision,sourceHash:analysis.sourceHash,manifestSha256:expectedSha,APIRequests:0},method:m.method,limits:m.limits,initialState:m.initialState,requests:{charged,OK,ERROR,RESERVED},kind:'ACTUAL_JEV_OPENAI_DECISIONS_COMPARISON',providers:publicProviders,independentAudit:{status:'PENDING'}};
await mkdir(out);await writeFile(join(out,'results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const columns=['provider','id','task','condition','replicate','valid','objective','perceivedDone','termination','requests','uiActions','judgments','apiMs','earlyUnchangedRevisits','selectionCorrections'];
const rows=Object.entries(comparison.providers).flatMap(([provider,report])=>report.runs.map(r=>[provider,r.id,r.fixture.task,r.fixture.condition,r.replicate,r.validity.valid,r.objectiveAssessment?.value,r.perceivedDone,r.termination,r.metrics.requests,r.metrics.uiActions,r.metrics.judgments,r.timing.apiMs??null,r.metrics.earlyUnchangedRevisits,r.metrics.selectionCorrections]));
await writeFile(join(out,'results.csv'),[columns,...rows].map(row=>row.map(v=>v===null||v===undefined?'':String(v)).join(',')).join('\n')+'\n',{flag:'wx'});
console.log(JSON.stringify({out,status:result.status,requests:result.requests,completeness:result.completeness,integrity:result.integrity}));
