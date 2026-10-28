import type {SemanticTrial} from '../jev/virtual-beta/semantic-types.js';
import type {BetaUIId} from '../jev/virtual-beta/ui-types.js';
import type {BetaEvaluator} from './virtual-beta-core.js';
/** Factorial treatments assigned to fixed fresh-context slots before any outcome. */
export function createSemanticTrials(uiIds:BetaUIId[],repeat:number,orderSeed:number):SemanticTrial[]{
 if(!uiIds.length||new Set(uiIds).size!==uiIds.length||uiIds.some(id=>!['reference','position-only','wording-only'].includes(id))||!Number.isSafeInteger(repeat)||repeat<1||repeat>3||!Number.isSafeInteger(orderSeed)||orderSeed<0||orderSeed>0xffffffff)throw new Error('INVALID_SEMANTIC_PROTOCOL');
 const trials:SemanticTrial[]=[];
 for(const ui of uiIds)for(let replicate=1;replicate<=repeat;replicate++)for(const mapping of ['A','B'] as const)trials.push({id:'pending',pairId:ui+'-r'+replicate,replicate,fixture:{version:1,ui,mapping}});
 let rng=orderSeed>>>0;const next=()=>{rng=(rng+0x6D2B79F5)>>>0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
 for(let i=trials.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[trials[i],trials[j]]=[trials[j],trials[i]];}
 return trials.map((trial,i)=>({...trial,slot:i+1,id:'semantic-'+String(i+1).padStart(2,'0')+'-'+trial.fixture.ui+'-'+trial.fixture.mapping.toLowerCase()+'-r'+trial.replicate}));
}
/** Only fixture wiring; this mock already knows the private mapping and is NOT a learner. */
export function semanticMockEvaluator(mapping:'A'|'B'):BetaEvaluator{
 let n=0;return async({questions})=>{const choice=['look_3',mapping==='A'?'e1':'e2','done'][n++]??'done';if(!(choice in questions.nextAction.criteria))throw new Error('SEMANTIC_MOCK_FIXTURE_MISMATCH');return {model:'MOCK_SCRIPTED_FIXTURE',answers:Object.fromEntries(Object.entries(questions).map(([key,q])=>{const selected=key==='nextAction'?choice:'goal';return [key,{choice:selected,probabilities:Object.fromEntries(Object.keys(q.criteria).map(id=>[id,id===selected?1:0]))}];}))};};
}
