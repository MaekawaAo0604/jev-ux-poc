import {transferDefinition,type TransferFixture} from './transfer-fixture.js';
/** Reachability certification only. This module is never imported by the UI or model runner. */
export function transferReferencePath(fixture:TransferFixture):string[]{
 transferDefinition(fixture);
 if(fixture.task==='catalog')return fixture.variant==='alpha'?['film-river','save-river']:['film-breeze','save-breeze'];
 if(fixture.task==='draft')return ['memo-main','scope-team','save-scope'];
 return ['events','meeting','details'];
}
