import type {PersonaTaskFixture} from './persona-task-types.js';
export type {PersonaTaskFixture} from './persona-task-types.js';

const assignments:Record<string,PersonaTaskFixture>={
 k4:{version:1,task:'sessions'},
 v8:{version:1,task:'preferences'},
 p2:{version:1,task:'privacy'}
};
function token(f:PersonaTaskFixture):string {
 if(!f||Object.keys(f).sort().join(',')!=='task,version'||f.version!==1)throw Error('INVALID_PERSONA_TASK_FIXTURE');
 const value=Object.keys(assignments).find(k=>assignments[k].task===f.task);
 if(!value)throw Error('INVALID_PERSONA_TASK_FIXTURE');
 return value;
}
export function personaTaskQuery(f:PersonaTaskFixture):string{return '?personaTask='+token(f);}
export function parsePersonaTaskFixture(search:string):PersonaTaskFixture|undefined {
 const p=new URLSearchParams(search),values=p.getAll('personaTask');
 if(values.length!==1||['semanticFixture','holdout','transfer','recovery','betaUI'].some(k=>p.has(k))||!Object.hasOwn(assignments,values[0]))return undefined;
 return {...assignments[values[0]]};
}
export function personaTaskDefinition(f:PersonaTaskFixture):{goal:string;title:string;objectiveText:string} {
 token(f);
 if(f.task==='sessions')return {
  title:'ログインとセキュリティ',
  goal:'以前使った共用PCから自分のアカウントを使えない状態にしてください。この端末では引き続き使い、パスワードは変えないでください。',
  objectiveText:'別端末のセッションを失効しました。この端末のログインとパスワードはそのままです。'
 };
 if(f.task==='preferences')return {
  title:'表示の設定',
  goal:'一覧の表示をコンパクトに変更し、設定が保存されたことを確認してください。',
  objectiveText:'コンパクト表示を保存しました。'
 };
 return {
  title:'予約のお知らせ',
  goal:'予約のリマインダー通知を有効にし、有効になったことを確認してください。',
  objectiveText:'予約のリマインダー通知が有効になりました。'
 };
}
