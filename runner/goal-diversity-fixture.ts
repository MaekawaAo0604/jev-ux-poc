// Owned, deterministic benchmark. Expected labels below are evaluator-only.
export const diversityCases=[
 {id:'single',family:'単一情報',goal:'ドロップインの1日料金を知りたい。',operation:false},
 {id:'split',family:'複数画面の集約',goal:'ドロップインの1日料金を知りたい。サポートの受付時間も知りたい。',operation:false},
 {id:'matching',family:'条件に合う選択',goal:'土日に1日1,500円以内で利用できるプランを探し、その詳細ページを開きたい。申し込みはしない。',operation:false},
 {id:'operation',family:'操作達成',goal:'メール通知を停止したい',operation:true},
 {id:'conditional',family:'単一情報・条件付き',goal:'土日に工場を見学できるか知りたい。',operation:false},
 {id:'blocked',family:'操作達成・不可表示',goal:'メール通知を停止したい',operation:true},
] as const;
const lines:Record<string,string[]>={
 '/single/':['ドロップイン：1日 1,500円（税込）'],
 '/split/':['料金とサポートについては、各案内をご覧ください'],
 '/split/rates':['ドロップイン：1日 1,500円（税込）'],
 '/split/hours':['サポート受付：平日 10時〜17時'],
 '/matching/':['Aプラン：1日800円、平日限定','Bプラン：1日1,200円、土日も利用可能','Cプラン：1日1,800円、土日も利用可能'],
 '/matching/p1':['Aプランの詳細','1日800円（税込）・平日限定'],
 '/matching/p2':['Bプランの詳細','1日1,200円（税込）・土日も利用可能'],
 '/matching/p3':['Cプランの詳細','1日1,800円（税込）・土日も利用可能'],
 '/conditional/':['工場見学のご案内','土曜・日曜・祝祭日の見学は個別にご相談ください','このページでは予約可能日を確定できません'],
 '/operation/good/':['メール通知は受信中です'],
 '/blocked/good/':['メール通知は受信中です','現在のプランでは通知を停止できません'],
};
export function diversityHTML(path:string):string|undefined{
 const text=lines[path];if(!text)return;
 const base=path.split('/')[1];
 const links=base==='split'?'<a href="/split/rates">料金の案内</a><a href="/split/hours">サポートの案内</a>':base==='matching'?'<a href="/matching/p1">Aプランの詳細</a><a href="/matching/p2">Bプランの詳細</a><a href="/matching/p3">Cプランの詳細</a>':'';
 const operation=base==='operation'?'<button type="button" onclick="document.querySelector(\'[role=status]\').textContent=\'メール通知を停止しました\';g.clearRect(0,0,1120,380);g.fillText(\'現在の設定：停止\',24,65);this.disabled=true">メール通知を停止する</button>':'';
 return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>サービスの案内</title><style>body{margin:32px;color:#182f45;background:#f4f6fa;font:24px sans-serif}h1{font-size:32px;margin:0 0 22px}nav{height:80px}a,button{display:inline-block;font:24px sans-serif;padding:12px;margin-right:20px}canvas{position:absolute;left:32px;top:180px;background:white;border:1px solid #ccd}section{position:absolute;top:610px}p{font-size:28px}</style><h1>サービスの案内</h1><nav>${links}</nav><canvas width="1120" height="380"></canvas><section>${operation}<p role="status"></p></section><script>const g=document.querySelector('canvas').getContext('2d');g.fillStyle='#182f45';g.font='30px sans-serif';${JSON.stringify(text)}.forEach((line,i)=>g.fillText(line,24,65+i*85));</script></html>`;
}
type Trial={reason?:string;steps?:{url:string;state?:{screen?:{viewport?:{top:number;bottom:number}}}}[];objectiveSuccess?:boolean};
export function evaluateDiversityTrial(id:string,result:Trial){
 const steps=result.steps??[];
 const covered=(path:string)=>steps.some(s=>new URL(s.url).pathname===path&&(s.state?.screen?.viewport?.top??Infinity)<=180&&(s.state?.screen?.viewport?.bottom??-Infinity)>=560);
 const required=id==='single'?['/single/']:id==='split'?['/split/rates','/split/hours']:id==='matching'?['/matching/p2']:id==='conditional'?['/conditional/']:[`/${id}/good/`];
 const displayCoverage=required.every(covered),operation=id==='operation'||id==='blocked';
 const finalPath=steps.length?new URL(steps.at(-1)!.url).pathname:'';
 return {displayCoverage,objectiveSuccess:operation?result.objectiveSuccess===true:id==='matching'?displayCoverage&&finalPath==='/matching/p2':null,expectedSubstantiveStatus:id==='conditional'?'conditional':id==='blocked'?'not_achieved':'confirmed',basis:operation?'既存通知停止oracle（モデル非入力）':id==='conditional'?'相談案内の表示範囲。具体的な土日の可否は未確定':'固定画面の必要領域と実際に観測した経路（回答文の正確性は未測定）'};
}
