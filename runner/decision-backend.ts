import {evaluateBetaRequest as evaluateJevRequest} from './virtual-beta-evaluator.js';
import {evaluateOpenAIDecisionsRequest} from './openai-decisions-evaluator.js';
import type {DecisionProvider} from './provider-comparison-analysis.js';
export type DecisionBackend=DecisionProvider;
export const decisionBackendInfo={
 jev:{model:'jev-1.14.0',endpoint:'https://ai-gateway.vercel.sh/typesafe/v1/systemone',credential:'AI_GATEWAY_API_KEY'},
 'openai-decisions':{model:'gpt-6-luna',endpoint:'https://api.openai.com/v1/decisions',credential:'OPENAI_API_KEY'}
} as const;
export function resolveDecisionBackend(value:unknown='jev'):DecisionBackend{
 if(value!=='jev'&&value!=='openai-decisions')throw Error('UNSUPPORTED_DECISION_BACKEND');return value;
}
/** Provider selection is explicit and local to a trial; no global routing environment. */
export function decisionEvaluator(backend:DecisionBackend):typeof evaluateJevRequest{
 resolveDecisionBackend(backend);
 return backend==='jev'?evaluateJevRequest:evaluateOpenAIDecisionsRequest;
}
