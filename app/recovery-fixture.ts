export type RecoveryTask='library'|'workshop';
export type RecoveryCondition='switch'|'changed'|'unchanged';
export type RecoveryFixture={version:1;task:RecoveryTask;condition:RecoveryCondition};
export type RecoveryDefinition={goal:string;title:string;itemTitle:string;originalValue:string;desiredValue:string;objectiveText:string};
const assignments:Record<string,RecoveryFixture>={p4:{version:1,task:'library',condition:'switch'},v9:{version:1,task:'library',condition:'changed'},c2:{version:1,task:'library',condition:'unchanged'},h7:{version:1,task:'workshop',condition:'switch'},m3:{version:1,task:'workshop',condition:'changed'},q8:{version:1,task:'workshop',condition:'unchanged'}};
function token(f:RecoveryFixture):string{
 if(!f||Object.keys(f).sort().join(',')!=='condition,task,version'||f.version!==1)throw Error('INVALID_RECOVERY_FIXTURE');
 const key=Object.keys(assignments).find(k=>assignments[k].task===f.task&&assignments[k].condition===f.condition);if(!key)throw Error('INVALID_RECOVERY_FIXTURE');return key;
}
export function recoveryFixtures():RecoveryFixture[]{return Object.values(assignments).map(f=>({...f}));}
export function recoveryQuery(f:RecoveryFixture):string{return '?recovery='+token(f);}
export function parseRecoveryFixture(search:string):RecoveryFixture|undefined{const p=new URLSearchParams(search),v=p.getAll('recovery');if(v.length!==1||['holdout','semanticFixture','betaUI','transfer'].some(k=>p.has(k))||!Object.hasOwn(assignments,v[0]))return undefined;return {...assignments[v[0]]};}
export function recoveryDefinition(f:RecoveryFixture):RecoveryDefinition{
 token(f);
 if(f.task==='library')return {goal:'予約図書「川沿いの暮らし」の受取館を中央図書館から東分館へ変更し、保存されたことを確認してください。',title:'まちの図書館',itemTitle:'川沿いの暮らし',originalValue:'中央図書館',desiredValue:'東分館',objectiveText:'「川沿いの暮らし」の受取館を東分館に保存しました'};
 return {goal:'参加予約「木の小物づくり」の希望回を午前の回から午後の回へ変更し、保存されたことを確認してください。',title:'まちの工房',itemTitle:'木の小物づくり',originalValue:'午前の回',desiredValue:'午後の回',objectiveText:'「木の小物づくり」の希望回を午後の回に保存しました'};
}
