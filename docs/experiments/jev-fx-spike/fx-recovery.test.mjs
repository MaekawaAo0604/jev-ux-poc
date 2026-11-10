import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fxRecoveryWait} from './fx-recovery.mjs';
test('overloaded 529 follows bounded recovery, not permanent authentication or validation errors',()=>{
 assert.equal(fxRecoveryWait({statusCode:529},1,0),1000);
 assert.equal(fxRecoveryWait({statusCode:529},2,0),2000);
 assert.equal(fxRecoveryWait({statusCode:529},3,0),null);
 for(const statusCode of [400,401,402,403,404])assert.equal(fxRecoveryWait({statusCode},1,0),null);
 assert.equal(fxRecoveryWait(Error('invalid choice'),1,0),null);
 assert.equal(fxRecoveryWait({statusCode:503,responseHeaders:{'retry-after':'7'}},1,0),7000);
});
