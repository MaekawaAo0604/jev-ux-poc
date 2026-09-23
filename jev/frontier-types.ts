import type {Action,RegionContext} from './types.js';

// All target descriptions are drawn from previously visible controls. Private
// graph identities, URLs and locator information never cross this boundary.
export type FrontierTarget={
 label:string;kind:Action['type'];pageTitle:string;pageId?:string;
 context?:RegionContext;travelSteps:number;nextChoice:string;
};
export type FrontierOffer={
 targets:Record<string,FrontierTarget>;
 continuation?:{targetId:string;focus:string};
};
export type FrontierDecision={
 targetId:string;label:string;focus:string;mode:'select'|'continue';
 probabilities:Record<string,number>;
};
