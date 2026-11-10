import React,{useEffect,useState} from 'react';
import {personaTaskDefinition} from './persona-task-fixture.js';
import type {PersonaTaskFixture,PersonaTaskSnapshot} from './persona-task-types.js';
import './persona-task-style.css';
import {MethodChoiceFixture} from './MethodChoiceFixture.js';

type Route=PersonaTaskSnapshot['route'];
const routes:Route[]=['start','help','details','review','complete'];
function Link({to,id,children}:{to:Route;id:string;children:React.ReactNode}) {
 return <a href={'#'+to} data-persona-task-action={id}>{children}</a>;
}
function initial(f:PersonaTaskFixture):PersonaTaskSnapshot {
 return {schemaVersion:1,task:f.task,route:'start',events:[],otherSessionActive:true,currentSessionActive:true,passwordChanged:false,draftCompact:false,savedCompact:false,notifications:false,scope:'none',complete:false};
}
function fulfilled(s:PersonaTaskSnapshot):boolean {
 return s.task==='sessions'?!s.otherSessionActive&&s.currentSessionActive&&!s.passwordChanged:s.task==='preferences'?s.savedCompact:s.notifications&&(s.scope==='basic'||s.scope==='extended');
}
/** Fictional data and local React state only. Remounting starts a new task. */
export function PersonaTaskFixtureView({fixture}:{fixture:PersonaTaskFixture}) {
 return fixture.task==='methods'?<MethodChoiceFixture key={fixture.task}/>:<LegacyPersonaTaskFixtureView key={fixture.task} fixture={fixture}/>;
}
function LegacyPersonaTaskFixtureView({fixture}:{fixture:PersonaTaskFixture}) {
 const definition=personaTaskDefinition(fixture);
 const [state,setState]=useState(()=>initial(fixture));
 const [review,setReview]=useState<'session'|'password'>('session');
 const [pendingScope,setPendingScope]=useState<'basic'|'extended'>('basic');
 useEffect(()=>{
  history.replaceState(null,'',location.pathname+location.search);
  const update=()=>{const value=location.hash.slice(1);const route=routes.includes(value as Route)?value as Route:'start';setState(s=>({...s,route}));window.scrollTo(0,0);};
  window.addEventListener('hashchange',update);
  return ()=>window.removeEventListener('hashchange',update);
 },[]);
 const snapshot={...state,complete:fulfilled(state)};
 const route=state.route;
 const record=(e:React.MouseEvent<HTMLDivElement>)=>{
  const control=(e.target as Element).closest<HTMLElement>('[data-persona-task-action]');
  if(control&&e.currentTarget.contains(control)){const id=control.dataset.personaTaskAction!;setState(s=>({...s,events:[...s.events,id]}));}
 };
 const apply=(patch:Partial<PersonaTaskSnapshot>)=>{setState(s=>({...s,...patch}));location.hash='complete';};
 const scopeText=state.scope==='basic'?'基本アクセス（予約時刻のみ）':state.scope==='extended'?'拡張アクセス（氏名・メールアドレス・予約履歴）':'許可なし';
 const help=<section className="persona-task-panel"><p className="persona-task-eyebrow">ご利用ガイド</p><h2>{fixture.task==='sessions'?'セッションとパスワードについて':fixture.task==='preferences'?'プレビューと保存について':'通知と情報へのアクセスについて'}</h2>
 {fixture.task==='sessions'?<><p>セッションは、端末ごとにログインが続いている状態のことです。失効すると、その端末では再ログインが必要になります。</p><p>別端末のセッションだけを失効させても、この端末のログインやパスワードは変わりません。パスワードの変更は、別のお手続きです。</p></>:fixture.task==='preferences'?<><p>表示の選択とプレビューは、お試しの状態です。「表示を保存」を押すまで、保存済みの設定は変わりません。</p><p>保存後は、この画面の「保存済みの表示」で確認できます。設定はいつでも変更できます。</p></>:<><p>基本アクセスでは予約時刻のみを使って、通知を表示します。拡張アクセスでは、氏名・メールアドレス・予約履歴も使って、宛名や関連予約を通知に添えます。</p><p>どちらでもリマインダー通知を利用できます。アクセス範囲は後から変更でき、通知を停止すると許可も取り消します。</p></>}
 <p className="persona-task-note">この画面は架空のサービスです。実際のアカウントや外部サービスには接続しません。</p></section>;
 const sessionSummary=<div className="persona-task-summary"><p>この端末：<strong>{state.currentSessionActive?'ログイン中':'ログアウト済み'}</strong></p><p>別端末（共用PC）：<strong>{state.otherSessionActive?'セッション有効':'失効済み'}</strong></p><p>パスワード：<strong>{state.passwordChanged?'この操作で変更済み':'変更していません'}</strong></p></div>;
 const layoutSummary=<p className="persona-task-saved">保存済みの表示：<strong>{state.savedCompact?'コンパクト':'標準'}</strong></p>;
 return <div className="persona-task-root" data-persona-task-root="" data-persona-task-state={JSON.stringify(snapshot)} onClickCapture={record}>
 <header className="persona-task-header"><span className="persona-task-brand">まちの予約帖</span><span>サンプルアカウント</span></header>
 <main className="persona-task-content"><div className="persona-task-heading"><div><p className="persona-task-eyebrow">マイアカウント</p><h1>{definition.title}</h1></div><Link to="help" id="help">使い方・用語の説明</Link></div>
 {route==='help'?help:fixture.task==='sessions'?<>
 {sessionSummary}
 {route==='review'?<section className="persona-task-panel"><h2>{review==='session'?'別端末のセッションを失効':'パスワードの変更'}</h2>
 {review==='session'?<><p>共用PC · ブラウザーからのログイン</p><p>この操作を確定すると、共用PCでは再ログインが必要になります。この端末のログインとパスワードは変更されません。</p><button type="button" data-persona-task-action="revoke-other-session" disabled={!state.otherSessionActive} onClick={()=>apply({otherSessionActive:false})}>{state.otherSessionActive?'この別端末のセッションを失効する':'このセッションは失効済みです'}</button></>:<><p>新しい架空のパスワードに置き換えます。別端末のセッション失効とは別の操作です。</p><p className="persona-task-note">実際のパスワードは入力しません。このサンプル内の変更状態だけを更新します。</p><button type="button" data-persona-task-action="change-password" onClick={()=>apply({passwordChanged:true})}>架空のパスワードに変更する</button></>}
 <div className="persona-task-links"><Link to="start" id="cancel-review">変更せず戻る</Link></div></section>:<div className="persona-task-grid"><section className="persona-task-panel"><h2>ログイン中の端末</h2><p>この端末 · 現在使用中</p><p>共用PC · 別端末のブラウザー</p><a href="#review" data-persona-task-action="review-other-session" onClick={()=>setReview('session')}>別端末のセッションを確認・失効</a></section><section className="persona-task-panel"><h2>パスワード</h2><p>ログインに使用するパスワードを変更します。</p><a href="#review" data-persona-task-action="review-password" onClick={()=>setReview('password')}>パスワードの変更を確認</a></section></div>}
 </>:fixture.task==='preferences'?<>
 {layoutSummary}
 <section className="persona-task-panel"><h2>{route==='details'?'表示のプレビュー':'一覧のレイアウト'}</h2>
 {route!=='details'&&<><p>表示方法を選び、必要に応じてプレビューで確かめてください。</p><div className="persona-task-options"><button type="button" className="persona-task-choice" aria-pressed={!state.draftCompact} data-persona-task-action="layout-standard" onClick={()=>setState(s=>({...s,draftCompact:false}))}>標準<span>項目の間にゆとりを持たせる</span></button><button type="button" className="persona-task-choice" aria-pressed={state.draftCompact} data-persona-task-action="layout-compact" onClick={()=>setState(s=>({...s,draftCompact:true}))}>コンパクト<span>項目の間隔を狭くして一覧表示</span></button></div></>}
 <p>編集中の表示：<strong>{state.draftCompact?'コンパクト':'標準'}</strong> · {state.draftCompact===state.savedCompact?'保存済みの設定と同じです':'未保存です'}</p>
 {route==='details'?<><p className="persona-task-note">プレビューだけでは、設定はまだ保存されません。</p><div className={'persona-task-preview '+(state.draftCompact?'persona-task-compact':'')} aria-label="予約一覧の表示例"><div>11月12日 10:00　まち歩き</div><div>11月18日 14:00　陶芸体験</div><div>11月25日 09:30　朝の喫茶会</div></div></>:<div className="persona-task-links"><Link to="details" id="preview-layout">プレビューを見る</Link></div>}
 <button type="button" data-persona-task-action="save-layout" onClick={()=>apply({savedCompact:state.draftCompact})}>表示を保存</button>
 </section></>:<>
 <div className="persona-task-summary"><p>予約リマインダー：<strong>{state.notifications?'有効':'無効'}</strong></p><p>許可済みの情報：<strong>{scopeText}</strong></p></div>
 {route==='details'?<section className="persona-task-panel"><h2>利用する情報を選ぶ</h2><p>どちらの範囲でも、予約前のリマインダー通知を利用できます。</p><div className="persona-task-options"><button type="button" className="persona-task-choice" aria-pressed={pendingScope==='basic'} data-persona-task-action="scope-basic" onClick={()=>setPendingScope('basic')}>基本アクセス<span>予約時刻のみ。氏名・メールアドレス・予約履歴は使いません。</span></button><button type="button" className="persona-task-choice" aria-pressed={pendingScope==='extended'} data-persona-task-action="scope-extended" onClick={()=>setPendingScope('extended')}>拡張アクセス<span>予約時刻に加え、氏名・メールアドレス・予約履歴を使います。</span></button></div><p>拡張アクセスを選ぶと、通知の宛名や関連予約の案内に追加の情報を使えます。追加の情報の許可は任意です。</p><button type="button" data-persona-task-action="enable-reminders" onClick={()=>apply({notifications:true,scope:pendingScope})}>選んだ範囲で通知を有効にする</button></section>:<section className="persona-task-panel"><h2>予約前にお知らせ</h2><p>予定の時刻が近づいたら、リマインダーを表示します。</p><h3>拡張アクセスでまとめて設定</h3><p>予約時刻に加え、<strong>氏名・メールアドレス・予約履歴</strong>の利用を許可します。通知に宛名や関連予約を添えられます。</p><p>追加の情報は任意です。基本アクセスでは予約時刻のみを使用します。</p><button type="button" data-persona-task-action="quick-enable-extended" onClick={()=>{setPendingScope('extended');apply({notifications:true,scope:'extended'});}}>拡張アクセスで通知を有効にする</button></section>}
 <div className="persona-task-links"><Link to="details" id="permission-details">情報の利用範囲を詳しく確認・変更</Link>{state.notifications&&<button type="button" className="persona-task-secondary" data-persona-task-action="disable-reminders" onClick={()=>setState(s=>({...s,notifications:false,scope:'none'}))}>通知を停止し、許可を取り消す</button>}</div>
 <p className="persona-task-note">すべて架空のサンプル情報です。実データの取得や外部への送信は行いません。設定は後から変更・取り消しできます。</p>
 </>}
 {snapshot.complete&&<p className="persona-task-status" role="status" data-persona-task-complete="true">{definition.objectiveText}</p>}
 {route!=='start'&&<div className="persona-task-return"><Link to="start" id="start">← 設定のトップへ</Link></div>}
 </main><footer className="persona-task-footer">まちの予約帖 · 架空のサービス</footer></div>;
}
