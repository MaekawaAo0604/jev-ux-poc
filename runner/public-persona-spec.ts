import {type ExplorationCharter} from '../jev/persona.js';
export function parsePublicCharter(raw:unknown,startURL:string):ExplorationCharter{
 const r=raw as any;if(!r||r.schemaVersion!==1||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.id)||r.targetWebsite!==startURL||typeof r.goal!=='string'||!r.goal.trim()||r.goal.length>4000||!Number.isSafeInteger(r.maxActions)||r.maxActions<1||r.maxActions>100||Object.hasOwn(r,'oracle'))throw Error('INVALID_PUBLIC_CHARTER');
 const u=new URL(startURL);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('INVALID_PUBLIC_URL');
 if(!r.initialState||typeof r.initialState.description!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.initialState.currentDate)||!Array.isArray(r.scope)||!r.scope.length||r.scope.some((v:unknown)=>typeof v!=='string'||!v))throw Error('INVALID_PUBLIC_CHARTER');
 const p=r.prohibitedActions;if(!p||p.downloads!==true||!Array.isArray(p.actionTypes)||p.actionTypes.some((v:unknown)=>!['click','back','scroll'].includes(v as string))||!Array.isArray(p.controlTexts)||p.controlTexts.some((v:unknown)=>typeof v!=='string'))throw Error('INVALID_PUBLIC_CHARTER');
 return structuredClone({schemaVersion:1,id:r.id,targetWebsite:startURL,goal:r.goal,initialState:r.initialState,scope:r.scope,prohibitedActions:p,maxActions:r.maxActions});
}
