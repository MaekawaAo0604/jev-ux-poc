import type {SemanticHumanExpectation} from '../jev/virtual-beta/semantic-types.js';
import {parseCharter,type Charter} from '../jev/persona.js';
export function auditHumanEvents(events:any[],charter:Charter){
 const violations=events.filter(e=>{
  if(e.blockedReason)return true;
  if(e.action==='scroll')return charter.prohibitedActions.actionTypes.includes('scroll');
  if(e.action!=='click')return false;
  const text=String(e.target??'').split('\n')[0].trim();
  return charter.prohibitedActions.actionTypes.includes('click')||charter.prohibitedActions.controlTexts.includes(text)||charter.prohibitedActions.downloads&&/^\d{4}-\d{2} の請求書をPDFで保存$/.test(text);
 });
 const coverageComplete=!charter.prohibitedActions.actionTypes.includes('back');
 return {detectedAttemptViolations:violations.length,hardConstraintViolations:coverageComplete?violations.length:null,coverageComplete,limitations:['ブラウザーChromeの戻る操作はこの記録器では完全には観測できない。禁止されたBackがあるチャーターでは制約監査を完了扱いしない。','スクロールは300msのデバウンスイベントで記録し、Jevの固定距離スクロールと回数を直接比較しない。']};
}
export function validateHumanControl(value:any,expected:{charter:Charter;viewport:{width:number;height:number};locale:string;timezoneId:string;semantic?:SemanticHumanExpectation}){
 if(value.actor!=='human'||value.selfAttested!==true)return {status:'UNVERIFIED_ACTOR',conditionsMatch:false,reasons:['人間本人の申告がない、または自動操作の記録。']};
 const reasons:string[]=[];if(value.recorderReady!==true||!Array.isArray(value.recordingErrors)||value.recordingErrors.length)reasons.push('記録器の起動確認がない、または記録エラーがある。');let charter:Charter|undefined;
 try{charter=parseCharter(value.charter);if(JSON.stringify(charter)!==JSON.stringify(expected.charter))reasons.push('チャーターが一致しない。');}catch{reasons.push('有効なチャーターがない。');}
 if(value.goal!==expected.charter.goal)reasons.push('目的が一致しない。');
 if(value.viewport?.width!==expected.viewport.width||value.viewport?.height!==expected.viewport.height)reasons.push('画面サイズが一致しない。');
 if(value.locale!==expected.locale||value.timezoneId!==expected.timezoneId)reasons.push('ロケールまたはタイムゾーンが一致しない。');
 if(expected.semantic){
  const actual=value.semantic,wanted=expected.semantic;
  if((actual?.objectivePolicy??'mail-only')!==(wanted.objectivePolicy??'mail-only'))reasons.push('意味課題の達成条件が一致しない。');
  if(!actual||['version','ui','mapping'].some(key=>actual.fixture?.[key]!==wanted.fixture[key as keyof typeof wanted.fixture]))reasons.push('意味課題の版、UI、対応関係が一致しない。');
  for(const key of ['definitionHash','sourceHash','initialProductImageSha256'] as const)if(!/^[a-f0-9]{64}$/.test(wanted[key])||actual?.[key]!==wanted[key])reasons.push('意味課題の '+key+' が一致しない。');
 }
 if(!Array.isArray(value.events))reasons.push('イベントの記録がない。');
 const audit=charter?auditHumanEvents(value.events??[],charter):null;
 if(audit?.hardConstraintViolations!==0)reasons.push('制約違反の候補、または監査できない制約がある。');
 const clicks=(value.events??[]).filter((e:any)=>e.action==='click');
 if(clicks.length>expected.charter.maxActions)reasons.push('クリック数だけで最大操作回数を超えている。');
 if((value.events??[]).some((e:any)=>e.viewport&&(e.viewport.width!==expected.viewport.width||e.viewport.height!==expected.viewport.height)))reasons.push('操作中に画面サイズが変わった。');
 return {status:reasons.length?'CONDITION_MISMATCH':'RECORDED_SELF_ATTESTED',conditionsMatch:reasons.length===0,reasons,audit,operationCountDirectlyComparable:false,observationCaveat:expected.semantic?'人間は番号なし全画面、Jevはcropの番号付き画像。課題と初期プロダクト状態を照合しても観察条件と視線は同じではない。マウス位置から注視を推定しない。':'人間は番号なしの実ブラウザー、Jevは番号付き画像＋DOM。プロダクトと初期条件は照合するが、入力表現とスクロール単位は同一ではない。',humanExperienceReproductionVerified:false};
}
