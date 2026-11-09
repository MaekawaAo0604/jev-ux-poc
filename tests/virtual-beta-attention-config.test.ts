import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonConfigs,validateConfig} from '../jev/virtual-beta/config.js';
const config=()=>({...comparisonConfigs()[3],factors:{informationChannel:'image-state' as const,extraActions:{look:true,reread:false,wait:false,abandon:false}},attention:{enabled:true}});
test('attention requires image-state factors and separate look actions',()=>{
 assert.doesNotThrow(()=>validateConfig(config()));
 for(const attention of [null,{enabled:'yes'},{enabled:true,correctPoint:{x:1,y:2}}])assert.throws(()=>validateConfig({...config(),attention} as any),/ATTENTION/);
 assert.throws(()=>validateConfig({...config(),factors:undefined}),/ATTENTION/);
 assert.throws(()=>validateConfig({...config(),factors:{...config().factors,informationChannel:'dom-state'},vision:{...config().vision,mode:'full'}}),/ATTENTION/);
 assert.throws(()=>validateConfig({...config(),factors:{...config().factors,extraActions:{...config().factors.extraActions,look:false}}}),/ATTENTION/);
});
test('absent attention preserves legacy configuration shape',()=>{
 for(const c of comparisonConfigs())assert.deepEqual(validateConfig(c),c);
});
