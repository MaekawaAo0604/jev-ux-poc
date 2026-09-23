/** A locator selected and checked for unique element identity during capture. */
export interface RecordedLocator {
 kind:'testId'|'role'|'label'|'placeholder'|'text'|'css';
 value:string;
 role?:string;
}

export interface RecordedAction {
 step:number;
 action:'click'|'fill'|'select'|'press'|'scroll'|'back';
 target?:{
  anonymousId?:string;text?:string;role?:string;accessibleName?:string;label?:string;
  testId?:string;placeholder?:string;tagName?:string;selector?:string;locator?:RecordedLocator;
 };
 value?:string;
 urlBefore:string;
 urlAfter?:string;
 scroll?:{x:number;y:number};
 execution?:{kind:'navigate'|'local-disclosure';url?:string};
 durationMs?:number;
}

export interface ActionTrace {
 schemaVersion:1;
 goalId:string;
 goalText:string;
 initialUrl:string;
 viewport:{width:number;height:number};
 source:'local'|'public';
 fake:boolean;
 success:{reason:string;objectiveSuccess:boolean|null;perceivedSuccess:boolean};
 actions:RecordedAction[];
 completedAt:string;
 recordingErrors?:{step:number;message:string}[];
}
