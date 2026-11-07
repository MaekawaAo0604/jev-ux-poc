import type {Page} from 'playwright';
import {personaTaskDefinition} from '../app/persona-task-fixture.js';
import type {PersonaTaskFixture,PersonaTaskSnapshot} from '../app/persona-task-types.js';

/** Private fixture audit. Never include this state in model input or candidate labels. */
export async function readPersonaTaskSnapshot(page:Page,fixture:PersonaTaskFixture):Promise<PersonaTaskSnapshot> {
 personaTaskDefinition(fixture);
 const root=page.locator('[data-persona-task-root]'),count=await root.count();
 if(count>1)throw Error('AMBIGUOUS_PERSONA_TASK_ROOT');
 if(count!==1)throw Error('MISSING_PERSONA_TASK_ROOT');
 let s:PersonaTaskSnapshot;
 try{s=JSON.parse(await root.getAttribute('data-persona-task-state')??'');}catch{throw Error('INVALID_PERSONA_TASK_STATE');}
 if(!s||s.schemaVersion!==1||s.task!==fixture.task||!['start','help','details','review','complete'].includes(s.route)||!Array.isArray(s.events)||!s.events.every(e=>typeof e==='string'&&e.length>0)||!['none','basic','extended'].includes(s.scope)||['otherSessionActive','currentSessionActive','passwordChanged','draftCompact','savedCompact','notifications','complete'].some(k=>typeof s[k as keyof PersonaTaskSnapshot]!=='boolean'))throw Error('INVALID_PERSONA_TASK_STATE');
 if(s.task==='methods'&&(!['none','local','phone','code'].includes(s.method??'')||!['none','local','phone','code'].includes(s.savedMethod??'')||s.notifications||s.scope!=='none'))throw Error('INVALID_PERSONA_TASK_STATE');
 const complete=s.task==='methods'?s.savedMethod!=='none':s.task==='sessions'?!s.otherSessionActive&&s.currentSessionActive&&!s.passwordChanged:s.task==='preferences'?s.savedCompact:s.notifications&&(s.scope==='basic'||s.scope==='extended');
 if(s.complete!==complete||s.notifications&&s.scope==='none'||!s.notifications&&s.scope!=='none')throw Error('INVALID_PERSONA_TASK_STATE');
 return {schemaVersion:1,task:s.task,route:s.route,events:[...s.events],otherSessionActive:s.otherSessionActive,currentSessionActive:s.currentSessionActive,passwordChanged:s.passwordChanged,draftCompact:s.draftCompact,savedCompact:s.savedCompact,notifications:s.notifications,scope:s.scope,complete:s.complete,...(s.task==='methods'?{method:s.method,savedMethod:s.savedMethod}:{})};
}
export async function checkPersonaTaskObjective(page:Page,fixture:PersonaTaskFixture):Promise<boolean> {
 const d=personaTaskDefinition(fixture),s=await readPersonaTaskSnapshot(page,fixture);
 const root=page.locator('[data-persona-task-root]'),complete=root.locator('[data-persona-task-complete="true"]'),n=await complete.count();
 if(n>1)throw Error('AMBIGUOUS_PERSONA_TASK_COMPLETE');
 if(!s.complete||n!==1||!await root.isVisible()||!await complete.isVisible())return false;
 if(await complete.getAttribute('role')!=='status'||(await complete.innerText()).trim()!==d.objectiveText)return false;
 if(s.task==='methods'){const saved=root.locator('[data-persona-method-saved]'),labels:Record<string,string>={local:'このPCに保存',phone:'スマートフォンで承認',code:'メールの一時コード'};if(await saved.count()!==1||!await saved.isVisible()||await saved.getAttribute('data-persona-method-saved')!==s.savedMethod||(await saved.innerText()).trim()!==labels[s.savedMethod!])return false;}
 return true;
}
