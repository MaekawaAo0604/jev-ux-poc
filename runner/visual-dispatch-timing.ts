/** Client timeout supplied to an extractor; not evidence of HTTP receipt or provider start time. */
export type VisualDispatchTiming={
 schemaVersion:1;
 maxRunMs:number;
 elapsedRunMs:number;
 remainingRunMs:number;
 requestCapMs:30000;
 timeoutMs:number;
 limit:'request-cap'|'run-remaining';
};
const requestCapMs=30000 as const;
const fields=['schemaVersion','maxRunMs','elapsedRunMs','remainingRunMs','requestCapMs','timeoutMs','limit'] as const;
function fail():never{throw Error('INVALID_VISUAL_DISPATCH_TIMING');}
function validateMaximum(value:unknown):asserts value is number{
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0)fail();
}

/** Floor the available run budget before capping; less than one whole millisecond cannot dispatch. */
export function planVisualDispatch(maxRunMs:number,elapsedRunMs:number):VisualDispatchTiming|null{
 validateMaximum(maxRunMs);
 if(typeof elapsedRunMs!=='number'||!Number.isFinite(elapsedRunMs)||elapsedRunMs<0)fail();
 const remainingRunMs=Math.floor(maxRunMs-elapsedRunMs);
 if(remainingRunMs<=0)return null;
 return {schemaVersion:1,maxRunMs,elapsedRunMs,remainingRunMs,requestCapMs,timeoutMs:Math.min(requestCapMs,remainingRunMs),limit:remainingRunMs>requestCapMs?'request-cap':'run-remaining'};
}

/** Closed scalar record, bound to the run cap and independently recomputed without coercion. */
export function validateVisualDispatch(value:unknown,expectedMaxRunMs:number):VisualDispatchTiming{
 validateMaximum(expectedMaxRunMs);
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))fail();
 const input=value as Record<string,unknown>;
 if(input.maxRunMs!==expectedMaxRunMs)fail();
 const expected=planVisualDispatch(expectedMaxRunMs,input.elapsedRunMs as number);
 if(!expected||fields.some(field=>input[field]!==expected[field]))fail();
 return expected;
}
