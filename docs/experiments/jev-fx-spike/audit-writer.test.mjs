import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Writable} from 'node:stream';
import * as core from './live-core.mjs';

test('audit writer drains temporary backpressure without stopping producers or losing event order',async()=>{
 assert.equal(typeof core.OrderedAuditWriter,'function');
 const chunks=[],failures=[];
 const stream=new Writable({highWaterMark:1,write(chunk,encoding,done){chunks.push(chunk.toString());setImmediate(done);}});
 const writer=new core.OrderedAuditWriter(stream,{onFailure:reason=>failures.push(reason)});
 for(let id=1;id<=300;id++)assert.equal(writer.append({id}),true);
 await writer.close();
 assert.deepEqual(chunks.map(s=>JSON.parse(s).id),Array.from({length:300},(_,i)=>i+1));
 assert.deepEqual(failures,[]);assert.ok(writer.backpressureEvents>0);
 assert.equal(writer.append({id:301}),false);
});

test('audit buffer exhaustion stops admission, reports failure asynchronously and flushes accepted events',async()=>{
 assert.equal(typeof core.OrderedAuditWriter,'function');
 const chunks=[],failures=[];
 const stream=new Writable({highWaterMark:1,write(chunk,encoding,done){chunks.push(chunk.toString());setImmediate(done);}});
 const writer=new core.OrderedAuditWriter(stream,{maxBufferedBytes:25,onFailure:reason=>failures.push(reason)});
 assert.equal(writer.append({id:1}),true);assert.equal(writer.append({id:2}),true);
 assert.equal(writer.append({id:3}),false);assert.deepEqual(failures,[]);
 await assert.rejects(writer.close(),/LOG_BUFFER_LIMIT/);
 assert.deepEqual(failures,['LOG_BUFFER_LIMIT']);assert.equal(chunks.join(''),'{"id":1}\n{"id":2}\n');
});

test('an actual audit stream error fails closed without leaking upstream error text or hanging close',async()=>{
 assert.equal(typeof core.OrderedAuditWriter,'function');
 const failures=[];
 const stream=new Writable({write(chunk,encoding,done){setImmediate(()=>done(Error('upstream private detail')));}});
 const writer=new core.OrderedAuditWriter(stream,{onFailure:reason=>failures.push(reason)});
 writer.append({id:1});
 await assert.rejects(writer.close(),error=>error.message==='LOG_WRITE_ERROR');
 await new Promise(r=>setImmediate(r));assert.deepEqual(failures,['LOG_WRITE_ERROR']);
});
