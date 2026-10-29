import type {Page}from'playwright';
import{recoveryDefinition,type RecoveryFixture}from'../app/recovery-fixture.js';
import type{RecoveryAuditSnapshot}from'./recovery-contracts.js';
/** Private fixture audit; never passed to userState, modelInput, questions or labels. */
export async function readRecoverySnapshot(page:Page,fixture:RecoveryFixture):Promise<RecoveryAuditSnapshot>{
 const d=recoveryDefinition(fixture),root=page.locator('[data-recovery-root]'),count=await root.count();if(count>1)throw Error('AMBIGUOUS_RECOVERY_ROOT');if(count!==1)throw Error('MISSING_RECOVERY_ROOT');
 const text=await root.getAttribute('data-recovery-state');let value:any;try{value=JSON.parse(text??'');}catch{throw Error('INVALID_RECOVERY_STATE');}
 if(!value||value.schemaVersion!==1||!['primary','home','account','records','alternative'].includes(value.route)||typeof value.eligible!=='boolean'||typeof value.complete!=='boolean'||!Number.isInteger(value.verificationAttempts)||value.verificationAttempts<0||!Number.isInteger(value.recordChecks)||value.recordChecks<0||![d.originalValue,d.desiredValue].includes(value.savedValue))throw Error('INVALID_RECOVERY_STATE');
 return {schemaVersion:1,route:value.route,eligible:value.eligible,verificationAttempts:value.verificationAttempts,recordChecks:value.recordChecks,savedValue:value.savedValue,complete:value.complete};
}
export async function checkRecoveryObjective(page:Page,fixture:RecoveryFixture):Promise<boolean>{
 const d=recoveryDefinition(fixture),s=await readRecoverySnapshot(page,fixture),complete=page.locator('[data-recovery-complete="true"]');
 const n=await complete.count();if(n>1)throw Error('AMBIGUOUS_RECOVERY_COMPLETE');if(!s.complete||s.savedValue!==d.desiredValue||fixture.condition!=='switch'&&!s.eligible||n!==1||!await complete.isVisible())return false;
 const statuses=page.getByRole('status').filter({hasText:d.objectiveText}),field=page.locator('[data-recovery-field="saved-value"]');if(await statuses.count()>1||await field.count()>1)throw Error('AMBIGUOUS_RECOVERY_CONFIRMATION');
 return await statuses.count()===1&&await statuses.isVisible()&&(await statuses.innerText()).trim()===d.objectiveText&&await field.count()===1&&await field.isVisible()&&(await field.innerText()).trim()===d.desiredValue;
}
