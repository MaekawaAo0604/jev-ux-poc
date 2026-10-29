/** A client timeout plan only; neither HTTP dispatch nor provider receipt is inferred here. */
export type VisualHTTPPlan={
 schemaVersion:1;
 receivedTimeoutMs:number;
 externalRemainingMs:number|null;
 adapterTimeoutMs:number;
 adapterStartedMs:number;
 beforeNativeMs:number;
 reservationElapsedMs:number;
 plannedTimeoutMs:number;
 limit:'extractor-timeout'|'external-deadline';
};
/** httpTimeoutMs must come from the observed native AbortSignal argument, not from this planner. */
export type VisualHTTPDispatch=VisualHTTPPlan&{httpTimeoutMs:number};
const planFields=['schemaVersion','receivedTimeoutMs','externalRemainingMs','adapterTimeoutMs','adapterStartedMs','beforeNativeMs','reservationElapsedMs','plannedTimeoutMs','limit'] as const;
const dispatchFields=[...planFields,'httpTimeoutMs'] as const;
function fail():never{throw Error('INVALID_VISUAL_HTTP_TIMING');}
function receivedTimeout(value:unknown):asserts value is number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>30000)fail();
}
function clock(value:unknown):asserts value is number{
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)fail();
}

/** Keep deadline addition before subtraction to preserve the existing adapter's floating-point order. */
export function planVisualHTTP(receivedTimeoutMs:number,externalRemainingMs:number|null,adapterStartedMs:number,beforeNativeMs:number):VisualHTTPPlan|null{
 receivedTimeout(receivedTimeoutMs);
 if(externalRemainingMs!==null&&(typeof externalRemainingMs!=='number'||!Number.isSafeInteger(externalRemainingMs)))fail();
 clock(adapterStartedMs);clock(beforeNativeMs);if(beforeNativeMs<adapterStartedMs)fail();
 if(externalRemainingMs!==null&&externalRemainingMs<=0)return null;
 const adapterTimeoutMs=Math.min(receivedTimeoutMs,externalRemainingMs??receivedTimeoutMs);
 const plannedTimeoutMs=Math.floor((adapterStartedMs+adapterTimeoutMs)-beforeNativeMs);
 if(plannedTimeoutMs<=0)return null;
 return {schemaVersion:1,receivedTimeoutMs,externalRemainingMs,adapterTimeoutMs,adapterStartedMs,beforeNativeMs,reservationElapsedMs:beforeNativeMs-adapterStartedMs,plannedTimeoutMs,limit:externalRemainingMs!==null&&externalRemainingMs<receivedTimeoutMs?'external-deadline':'extractor-timeout'};
}

/** Strict copied projection; this checks an observer record without producing a dispatch observation. */
export function validateVisualHTTPDispatch(value:unknown,expectedReceivedTimeoutMs:number):VisualHTTPDispatch{
 receivedTimeout(expectedReceivedTimeoutMs);
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==dispatchFields.length||dispatchFields.some(field=>!Object.hasOwn(value,field)))fail();
 const input=value as Record<string,unknown>;
 if(input.receivedTimeoutMs!==expectedReceivedTimeoutMs)fail();
 const expected=planVisualHTTP(expectedReceivedTimeoutMs,input.externalRemainingMs as number|null,input.adapterStartedMs as number,input.beforeNativeMs as number);
 if(!expected||planFields.some(field=>input[field]!==expected[field])||input.httpTimeoutMs!==expected.plannedTimeoutMs)fail();
 return {...expected,httpTimeoutMs:input.httpTimeoutMs as number};
}
