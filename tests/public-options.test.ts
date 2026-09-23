import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicOptions} from '../runner/public-options.js';

test('public options preserve goal and apply explicit limits',()=>{
 assert.deepEqual(parsePublicOptions(['https://example.com/','料金を知る','--max-actions','8','--interval-ms','2500','--reviewed']),{url:'https://example.com/',goal:'料金を知る',maxActions:8,intervalMs:2500});
});
test('public options default to unlimited actions and serialize an explicit zero limit',()=>{
 for(const flags of [[],['--max-actions','0']]){
  const options=parsePublicOptions(['https://example.com/','Read the answer','--reviewed',...flags]);
  assert.deepEqual(JSON.parse(JSON.stringify(options)),{url:'https://example.com/',goal:'Read the answer',maxActions:0,intervalMs:2000});
 }
});
test('public goal checks must be distinct excerpts of the unchanged user goal',()=>{
 const options=parsePublicOptions(['https://example.com/','料金と時間を知りたい','--reviewed','--goal-check','料金','--goal-check','時間']);
 assert.deepEqual((options as any).goalChecks,['料金','時間']);assert.equal(options.goal,'料金と時間を知りたい');
 for(const checks of [[],[''],['答えは500円'],['料金','料金']]){
  const flags=checks.length?checks.flatMap(c=>['--goal-check',c]):['--goal-check'];
  assert.throws(()=>parsePublicOptions(['https://example.com/','料金と時間を知りたい','--reviewed',...flags]));
 }
});
test('public options reject missing review, unsafe URLs and invalid limits before launch',()=>{
 for(const args of [
  ['https://example.com/','goal'],
  ['file:///tmp/test','goal','--reviewed'],
  ['https://user:pass@example.com/','goal','--reviewed'],
  ['https://example.com/',' ','--reviewed'],
  ['https://example.com/','goal','--reviewed','--max-actions','-1'],
  ['https://example.com/','goal','--reviewed','--max-actions','0.5'],
  ['https://example.com/','goal','--reviewed','--max-actions','NaN'],
  ['https://example.com/','goal','--reviewed','--max-actions','2147483648'],
  ['https://example.com/','goal','--reviewed','--interval-ms','0'],
  ['https://example.com/','goal','--reviewed','--typo','1'],
 ])assert.throws(()=>parsePublicOptions(args));
});
