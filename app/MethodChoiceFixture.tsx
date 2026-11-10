import React,{useEffect,useState} from 'react';
import {personaTaskDefinition} from './persona-task-fixture.js';
import type {PersonaTaskSnapshot} from './persona-task-types.js';
import './persona-task-style.css';

type Method='none'|'local'|'phone'|'code';
type ChosenMethod=Exclude<Method,'none'>;
type MethodState=PersonaTaskSnapshot&{method:Method;savedMethod:Method};
const options:{method:ChosenMethod;label:string;description:string;seconds:number}[]=[
 {method:'local',label:'このPCに保存',description:'このPCのOSの認証情報ストアへの保存許可が必要です。',seconds:5},
 {method:'phone',label:'スマートフォンで承認',description:'自分のスマートフォンを近くに用意し、Bluetoothを使えることが必要です。このPCの認証情報ストアには保存しません。',seconds:10},
 {method:'code',label:'メールの一時コード',description:'このブラウザーで利用できるメールに届く6桁のコードを、毎回手入力します。OSの認証情報ストアへの保存も、スマートフォンも不要です。',seconds:60}
];
const label=(method:ChosenMethod)=>options.find(option=>option.method===method)!.label;
const initial=():MethodState=>({schemaVersion:1,task:'methods',route:'start',events:[],otherSessionActive:true,currentSessionActive:true,passwordChanged:false,draftCompact:false,savedCompact:false,notifications:false,scope:'none',complete:false,method:'none',savedMethod:'none'});
/** The fixture has no Persona input. Every method is available in identical local UI. */
export function MethodChoiceFixture(){
 const definition=personaTaskDefinition({version:1,task:'methods'});
 const [state,setState]=useState<MethodState>(initial);
 useEffect(()=>{
  history.replaceState(null,'',location.pathname+location.search);
  const update=()=>{const hash=location.hash.slice(1),route=hash==='review'||hash==='complete'?hash:'start';setState(s=>({...s,route}));window.scrollTo(0,0);};
  window.addEventListener('hashchange',update);return ()=>window.removeEventListener('hashchange',update);
 },[]);
 const snapshot={...state,complete:state.savedMethod!=='none'};
 const record=(event:React.MouseEvent<HTMLDivElement>)=>{
  const control=(event.target as Element).closest<HTMLElement>('[data-persona-task-action]');
  if(control&&event.currentTarget.contains(control)){const id=control.dataset.personaTaskAction!;setState(s=>({...s,events:[...s.events,id]}));}
 };
 const choose=(method:ChosenMethod)=>{setState(s=>({...s,method,route:'review'}));location.hash='review';};
 const save=()=>{if(state.method==='none')return;setState(s=>({...s,savedMethod:s.method,route:'complete'}));location.hash='complete';};
 return <div className="persona-task-root" data-persona-task-root="" data-persona-task-state={JSON.stringify(snapshot)} onClickCapture={record}>
 <header className="persona-task-header"><span className="persona-task-brand">まちの予約帖</span><span>サンプルアカウント</span></header>
 <main className="persona-task-content persona-method-content">
 <div className="persona-task-heading"><div><p className="persona-task-eyebrow">マイアカウント</p><h1>{definition.title}</h1></div></div>
 <p className="persona-task-saved">保存済みの方法：{state.savedMethod==='none'?<strong>未設定</strong>:<strong data-persona-method-saved={state.savedMethod}>{label(state.savedMethod)}</strong>}</p>
 {state.route==='review'&&state.method!=='none'?<section className="persona-task-panel persona-method-review">
 <h2>選んだ方法を確認</h2><p className="persona-method-review-label">{label(state.method)}</p><p>{options.find(option=>option.method===state.method)!.description}</p><p>次回のログイン：想定<strong>{options.find(option=>option.method===state.method)!.seconds}秒</strong></p>
 <p className="persona-task-note">この選択はまだ保存されていません。「設定を保存」を押すと、保存済みの方法を変更します。</p>
 <div className="persona-task-links"><button type="button" data-persona-task-action="save-method" onClick={save}>設定を保存</button><a href="#start" data-persona-task-action="cancel-method">保存せずに戻る</a></div>
 </section>:state.route==='complete'&&snapshot.complete?<section className="persona-task-panel">
 <h2>保存した設定</h2><p>次回のログインには、上の「保存済みの方法」を使います。</p><a href="#start" data-persona-task-action="change-method">別の方法に変更する</a>
 </section>:<>
 <p>次回から使う方法を選んでください。選んだ後の確認画面で、設定を保存できます。</p>
 <div className="persona-method-options">{options.map(option=><button key={option.method} type="button" className="persona-task-choice persona-method-choice" aria-pressed={state.method===option.method} data-persona-task-action={'method-'+option.method} onClick={()=>choose(option.method)}>
 <strong className="persona-method-label">{option.label}</strong><span className="persona-method-description">{option.description}</span><span className="persona-method-time">次回のログイン<br/><strong>想定 {option.seconds}秒</strong></span>
 </button>)}</div>
 </>}
 {snapshot.complete&&<p className="persona-task-status" role="status" data-persona-task-complete="true">{definition.objectiveText}</p>}
 <p className="persona-task-note">この画面は架空のサンプルです。実際の認証情報の保存・端末承認・メール送信は行いません。表示時間はこのサービスの想定で、計測値ではありません。</p>
 </main><footer className="persona-task-footer">まちの予約帖 · 架空のサービス</footer>
 </div>;
}
