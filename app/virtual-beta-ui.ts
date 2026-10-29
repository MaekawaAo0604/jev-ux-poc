import type {BetaUIId, BetaUIVariant} from '../jev/virtual-beta/ui-types.js';

/** Controlled local comparisons. These identities and ROI selectors are audit metadata. */
export const comparisonUIs:Record<BetaUIId,BetaUIVariant>={
 reference:{id:'reference',token:'r',entryLabel:'通知設定',entryTranslateYPx:0},
 'position-only':{id:'position-only',token:'p',entryLabel:'通知設定',entryTranslateYPx:110},
 'wording-only':{id:'wording-only',token:'w',entryLabel:'メール受信設定',entryTranslateYPx:0},
};

export const roiSelectors:Record<string,string>={
 'notification-entry':'[data-beta-roi="notification-entry"]',
 'notification-stop':'[data-beta-roi="notification-stop"]',
};

/** Unknown or ambiguous queries retain the original local UI. */
export function comparisonUIFromSearch(search:string):BetaUIVariant|undefined{
 const params=new URLSearchParams(search),tokens=params.getAll('betaUI');
 if(['holdout','semanticFixture','transfer'].some(k=>params.has(k)))return undefined;
 if(tokens.length!==1)return undefined;
 return Object.values(comparisonUIs).find(ui=>ui.token===tokens[0]);
}
