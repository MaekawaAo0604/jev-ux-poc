import {recoveryDefinition,type RecoveryFixture} from './recovery-fixture.js';
/** Reachability certification only. Never import this module from the model runner or UI. */
export function recoveryReferencePath(fixture:RecoveryFixture):string[]{
 recoveryDefinition(fixture);
 if(fixture.condition==='switch')return ['home','alternative','apply'];
 if(fixture.condition==='changed')return ['home','account','confirm','home','primary','apply'];
 return ['home','account','confirm','home','records','reconcile','home','primary','apply'];
}
