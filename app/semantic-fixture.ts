import type {SemanticFixture} from '../jev/virtual-beta/semantic-types.js';
import type {Rect} from '../jev/virtual-beta/contracts.js';

/** Private fixture identities and ROI selectors are for audit, never learner input. */
const assignments:Record<string,SemanticFixture>={
 q7:{version:1,ui:'reference',mapping:'A'},m4:{version:1,ui:'reference',mapping:'B'},
 z2:{version:1,ui:'position-only',mapping:'A'},h8:{version:1,ui:'position-only',mapping:'B'},
 n5:{version:1,ui:'wording-only',mapping:'A'},v3:{version:1,ui:'wording-only',mapping:'B'},
};
export const semanticROIs:Record<string,string>={
 'semantic-cue':'[data-semantic-roi="semantic-cue"]',
 'semantic-a':'[data-semantic-roi="semantic-a"]',
 'semantic-b':'[data-semantic-roi="semantic-b"]',
};
function fixtureToken(fixture:SemanticFixture):string{
 const token=Object.keys(assignments).find(key=>{const f=assignments[key];return f.version===fixture.version&&f.ui===fixture.ui&&f.mapping===fixture.mapping;});
 if(!token)throw new Error('Unsupported semantic fixture');return token;
}
export function semanticQuery(fixture:SemanticFixture):string{return '?semanticFixture='+fixtureToken(fixture);}
/** Duplicate assignments or overlapping legacy UI opt-ins fail closed. */
export function parseSemanticFixture(search:string):SemanticFixture|undefined{
 const params=new URLSearchParams(search),tokens=params.getAll('semanticFixture');
 if(tokens.length!==1||params.has('betaUI')||params.has('holdout')||params.has('transfer')||params.has('recovery'))return undefined;
 const fixture=Object.hasOwn(assignments,tokens[0])?assignments[tokens[0]]:undefined;
 return fixture?{...fixture}:undefined;
}
export type SemanticDefinition={cueText:string;rects:{cue:Rect;a:Rect;b:Rect}};
export function semanticDefinition(fixture:SemanticFixture):SemanticDefinition{
 fixtureToken(fixture);const mail=fixture.mapping,display=mail==='A'?'B':'A';
 return {
  cueText:fixture.ui==='wording-only'
   ?`メール通知を止めるには設定${mail}、画面表示を切り替えるには設定${display}を選びます。`
   :`設定${mail}はメール通知の停止、設定${display}は画面表示の切り替えです。`,
  rects:{cue:{x:1000,y:fixture.ui==='position-only'?470:720,width:250,height:130},a:{x:660,y:500,width:130,height:80},b:{x:810,y:500,width:130,height:80}},
 };
}
