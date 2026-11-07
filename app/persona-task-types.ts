export const personaTasks=['sessions','preferences','privacy'] as const;
export type PersonaTask=typeof personaTasks[number];
export type PersonaLegacyTaskFixture={version:1;task:PersonaTask};
export type PersonaTaskFixture={version:1;task:PersonaTask|'methods'};
export type LoginMethod='none'|'local'|'phone'|'code';
/** Harness-only state. Never passed to model context. */
export type PersonaTaskSnapshot={schemaVersion:1;task:PersonaTaskFixture['task'];method?:LoginMethod;savedMethod?:LoginMethod;route:'start'|'help'|'details'|'review'|'complete';events:string[];otherSessionActive:boolean;currentSessionActive:boolean;passwordChanged:boolean;draftCompact:boolean;savedCompact:boolean;notifications:boolean;scope:'none'|'basic'|'extended';complete:boolean};
