import type {JSHandle} from 'playwright';
import {AccountPage} from './AccountPage.js';
import {controlSelector,nativeControlSelector,publicControl} from './controls.js';
import {visibleText} from './visible-text.js';
import {collectAutoControls,inspectControl,type ControlObservation,type ObservedControl} from './control-observation.js';

/** Runtime POM for this PoC: discovers native and ARIA links/buttons, without route knowledge. */
export class AutoPage extends AccountPage {
  protected classifyNative=false;
  protected controlSelector=controlSelector;
  protected nativeControlSelector=nativeControlSelector;
  protected async observeControls(font:boolean):Promise<ControlObservation>{
    const options=JSON.stringify({font,controlSelector:this.controlSelector,nativeControlSelector:this.nativeControlSelector,classifyNative:this.classifyNative});
    // Serialize trusted functions together; imported function references do not
    // cross Playwright's execution-context boundary on their own.
    const snapshot=await this.page.evaluateHandle(`(${collectAutoControls.toString()})(${options},${visibleText.toString()},${publicControl.toString()},${inspectControl.toString()})`) as JSHandle<ReturnType<typeof collectAutoControls>>;
    let targets:JSHandle<Element[]>|undefined;
    const controls:ObservedControl[]=[];
    try{
      const data=await snapshot.evaluate(({screen,controls})=>({screen,controls}));
      targets=await snapshot.getProperty('targets');
      const properties=await targets.getProperties();
      for(const [index,property] of properties){
        const handle=property.asElement();
        if(!handle){await property.dispose();continue;}
        const metadata=data.controls[Number(index)];
        controls.push({locator:this.page.locator(this.controlSelector).nth(metadata.index),handle,...metadata});
      }
      return {screen:data.screen,controls};
    }catch(error){await Promise.all(controls.map(control=>control.handle.dispose().catch(()=>{})));throw error;}
    finally{await targets?.dispose();await snapshot.dispose();}
  }
}
