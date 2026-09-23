import type {Decider} from './types.js';
// A deterministic plumbing check. This is deliberately NOT experimental evidence.
export const fakeDecide:Decider=async(state,candidates)=>{
  if(state.screen.text.some(t=>t.includes('メール通知を停止しました'))||state.history.some(h=>h.result.includes('invoice-2026-08.pdf'))){
    return {action:{type:'done'},choice:'done',probabilities:Object.fromEntries(Object.keys(candidates).map(k=>[k,k==='done'?1:0])),model:'FAKE-scripted'};
  }
  const priorities=state.goal.includes('請求書')?['2026-08 の請求書をPDFで保存','請求書','各種書類','請求関連','関連情報','契約情報','利用情報']:['メール通知を停止する','通知設定','お知らせの管理','その他'];
  const element=priorities.map(text=>state.screen.elements.find(e=>e.text.split('\n')[0]===text)).find(Boolean);
  const choice=element?.id || (state.screen.canScrollDown?'scroll_down':'stuck');
  return {action:candidates[choice].action,choice,probabilities:Object.fromEntries(Object.keys(candidates).map(k=>[k,k===choice?1:0])),model:'FAKE-scripted'};
};
