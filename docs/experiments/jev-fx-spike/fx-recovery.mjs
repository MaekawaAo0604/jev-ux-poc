// Back off and consume the newest input; never replay an old trading decision.
export function fxRecoveryWait(error,consecutiveFailures,now=Date.now()){
 if(consecutiveFailures>=3||!([408,429,500,502,503,504,529].includes(error?.statusCode)||['TimeoutError','AbortError'].includes(error?.name)))return null;
 const retry=error?.responseHeaders?.['retry-after'];
 const delay=typeof retry==='string'?(Number.isFinite(Number(retry))?Number(retry)*1000:Date.parse(retry)-now):NaN;
 return Number.isFinite(delay)?Math.max(0,delay):1000*2**(consecutiveFailures-1);
}
