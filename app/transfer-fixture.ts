export type TransferTask='catalog'|'draft'|'help';
export type TransferVariant='alpha'|'beta';
export type TransferFixture={version:1;task:TransferTask;variant:TransferVariant};
export type CatalogItem={id:string;title:string;day:string;subtitles:boolean;time:string};
type Common={version:1;variant:TransferVariant;goal:string;title:string;objectiveText:string};
export type TransferDefinition=(Common&{task:'catalog';items:CatalogItem[]})|(Common&{task:'draft';documentTitle:string;otherDocumentTitle:string;initialScope:'public';desiredScope:'team'})|(Common&{task:'help';event:string;place:string;belongings:string});
const assignments:Record<string,TransferFixture>={t7:{version:1,task:'catalog',variant:'alpha'},x2:{version:1,task:'catalog',variant:'beta'},b8:{version:1,task:'draft',variant:'alpha'},k5:{version:1,task:'draft',variant:'beta'},j4:{version:1,task:'help',variant:'alpha'},n6:{version:1,task:'help',variant:'beta'}};
function token(f:TransferFixture):string{
 if(!f||Object.keys(f).sort().join(',')!=='task,variant,version'||f.version!==1)throw Error('INVALID_TRANSFER_FIXTURE');
 const value=Object.keys(assignments).find(k=>assignments[k].version===f.version&&assignments[k].task===f.task&&assignments[k].variant===f.variant);
 if(!value)throw Error('INVALID_TRANSFER_FIXTURE');return value;
}
export function transferFixtures():TransferFixture[]{return Object.values(assignments).map(f=>({...f}));}
export function transferQuery(f:TransferFixture):string{return '?transfer='+token(f);}
export function parseTransferFixture(search:string):TransferFixture|undefined{
 const p=new URLSearchParams(search),values=p.getAll('transfer');
 if(values.length!==1||['holdout','semanticFixture','betaUI','recovery'].some(k=>p.has(k))||!Object.hasOwn(assignments,values[0]))return undefined;
 return {...assignments[values[0]]};
}
export function transferDefinition(f:TransferFixture):TransferDefinition{
 token(f);const variant=f.variant;
 if(f.task==='catalog'){
  const items:CatalogItem[]=variant==='alpha'?[{id:'harbor',title:'朝の港',day:'土曜日',subtitles:false,time:'10:00'},{id:'river',title:'川辺の記録',day:'土曜日',subtitles:true,time:'14:00'},{id:'night',title:'夜の散歩',day:'日曜日',subtitles:true,time:'18:00'}]:[{id:'forest',title:'森を歩く',day:'金曜日',subtitles:true,time:'15:00'},{id:'boat',title:'小舟の一日',day:'土曜日',subtitles:false,time:'17:00'},{id:'breeze',title:'風の通り道',day:'土曜日',subtitles:true,time:'11:30'}];
  const match=items.find(i=>i.day==='土曜日'&&i.subtitles)!;
  return {version:1,task:'catalog',variant,goal:'土曜日開催で字幕がある上映回をマイリストに追加し、追加されたことを確認してください。',title:variant==='alpha'?'まちの上映会':'週末シネマガイド',objectiveText:'「'+match.title+'」をマイリストに追加しました',items};
 }
 if(f.task==='draft')return {version:1,task:'draft',variant,goal:'企画メモ「水辺の散歩」の公開範囲をチーム内だけに変更し、保存されたことを確認してください。',title:variant==='alpha'?'企画ノート':'ワークスペースのメモ',objectiveText:'「水辺の散歩」の公開範囲をチーム内に保存しました',documentTitle:'水辺の散歩',otherDocumentTitle:'星を見に行く',initialScope:'public',desiredScope:'team'};
 return {version:1,task:'help',variant,goal:'参加予定の「朝の水辺ツアー」について、集合場所と持ち物が載った案内を表示してください。',title:variant==='alpha'?'体験イベント案内':'お出かけサポート',objectiveText:'朝の水辺ツアーの集合案内を表示しています',event:'朝の水辺ツアー',place:variant==='alpha'?'中央公園・東口案内所':'川辺広場・北側受付',belongings:variant==='alpha'?'水筒と帽子':'歩きやすい靴と雨具'};
}
