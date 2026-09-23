// Test-only instrumentation. Preserve the real observation and all browser effects.
import {PublicSitePage} from '../../pages/PublicSitePage.ts';
const observe=PublicSitePage.prototype.observe;
let count=0;
PublicSitePage.prototype.observe=async function(...args){
 console.log(`OBSERVATION_CALL ${++count}`);
 return observe.apply(this,args);
};
