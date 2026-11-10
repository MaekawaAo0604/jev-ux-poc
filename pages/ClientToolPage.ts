import {controlSelector,nativeControlSelector} from './controls.js';
import {LocalExplorationPage} from './LocalExplorationPage.js';
/** Client-side tool adapter. Caller must enforce network and file boundaries. */
export class ClientToolPage extends LocalExplorationPage {
 protected controlSelector=controlSelector+',label:has(input[type="checkbox"])';
 protected nativeControlSelector=nativeControlSelector+',label:has(input[type="checkbox"])';
 async observe(font:boolean){
  const screen=await super.observe(font);
  for(const el of screen.elements)if(el.type==='link'&&this.observedPublicControls.get(el.id)?.kind!=='link'){el.available=false;el.unavailableReason='EXTERNAL_OR_UNSUPPORTED_LINK';}
  return screen;
 }
}
