import type {Page} from 'playwright';
import type {AccountPage} from '../pages/AccountPage.js';
export type BetaPageAdapter=Pick<AccountPage,'observe'|'captureDecisionScreenshot'|'act'>&{readonly canGoBack:boolean};
export type BetaPublicSiteSpec={schemaVersion:1;id:string;startURL:string;allowedDocuments:string[];harPath:string;harSha256:string;capturedAtUTC:string;sourceDescription:string};
export type BetaPublicSiteController={adapter:BetaPageAdapter;prepare():Promise<void>;assertReady():void;isSafetyStopped():boolean;evidence():{spec:BetaPublicSiteSpec;events:{kind:string;url?:string;code?:string}[];networkMode:'frozen-har-no-fallback'}};
