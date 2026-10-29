import React,{useEffect,useState} from 'react';
import {recoveryDefinition,type RecoveryFixture} from './recovery-fixture.js';
import type {RecoveryAuditSnapshot} from '../runner/recovery-contracts.js';
import './recovery-style.css';
type Route=RecoveryAuditSnapshot['route'];
function Link({to,children}:{to:Route;children:React.ReactNode}){return <a href={'#'+to} data-recovery-action={to}>{children}</a>;}
function RecoverySession({fixture}:{fixture:RecoveryFixture}){
 const d=recoveryDefinition(fixture),library=fixture.task==='library';
 const [route,setRoute]=useState<Route>('primary'),[eligible,setEligible]=useState(false),[verificationAttempts,setVerificationAttempts]=useState(0),[recordChecks,setRecordChecks]=useState(0),[savedValue,setSavedValue]=useState(d.originalValue),[feedback,setFeedback]=useState('');
 useEffect(()=>{history.replaceState(null,'',location.pathname+location.search);const update=()=>{const hash=location.hash.slice(1);setRoute(['primary','home','account','records','alternative'].includes(hash)?hash as Route:'primary');setFeedback('');window.scrollTo(0,0);};window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
 const complete=savedValue===d.desiredValue;
 const snapshot:RecoveryAuditSnapshot={schemaVersion:1,route,eligible,verificationAttempts,recordChecks,savedValue,complete};
 const field=library?'受取館':'希望回';
 function confirm(){setVerificationAttempts(n=>n+1);if(fixture.condition==='switch'){setFeedback('登録情報を確認しました。会員登録と連絡先は有効です。');}else if(fixture.condition==='changed'||eligible){setEligible(true);setFeedback('確認申請（受付番号：R-001）を確認しました。予約内容の変更を利用できます。');}else{setFeedback('確認申請（受付番号：R-001）を受け付けましたが、予約記録との照合がまだ完了していません。予約記録をご確認ください。');}}
 function reconcile(){if(verificationAttempts===0)return;setRecordChecks(n=>n+1);if(fixture.condition!=='switch'){setEligible(true);setFeedback('予約記録の照合が完了しました。予約内容の変更を利用できます。');}else{setFeedback('予約記録を確認しました。内容は最新です。');}}
 function apply(){if((route==='primary'&&eligible&&fixture.condition!=='switch')||(route==='alternative'&&fixture.condition==='switch'))setSavedValue(d.desiredValue);}
 const heading=route==='primary'?'予約内容の変更':route==='home'?'マイページ':route==='account'?'利用情報の確認':route==='records'?'予約記録': '予約一覧';
 const record=<dl className="recovery-summary"><dt>{library?'予約図書':'参加プログラム'}</dt><dd>{d.itemTitle}</dd><dt>保存済みの{field}</dt><dd data-recovery-field="saved-value">{savedValue}</dd></dl>;
 return <div className={'recovery-root recovery-'+fixture.task} data-recovery-root="" data-recovery-state={JSON.stringify(snapshot)}><header className="recovery-header"><span className="recovery-brand">{d.title}</span><span>{library?'読書のある毎日を':'地域の手しごとを楽しむ'}</span></header><main className="recovery-main"><p className="recovery-kicker">{library?'LIBRARY MEMBER SERVICE':'WORKSHOP MEMBER SERVICE'}</p><h1>{heading}</h1>
 {route==='primary'?<><p className="recovery-lead">「{d.itemTitle}」の{field}を管理します。</p>{record}{fixture.condition==='switch'?<section className="recovery-notice"><h2>この画面は閲覧専用です</h2><p>{field}の変更は、マイページの予約一覧で受け付けています。</p></section>:eligible?<section className="recovery-panel"><h2>{field}の変更</h2><p>変更先：{d.desiredValue}</p><button type="button" data-recovery-action="apply" onClick={apply}>{d.desiredValue}に変更して保存</button></section>:<section className="recovery-notice"><h2>現在、変更を利用できません</h2><p>利用情報の確認が必要です。マイページから利用情報をご確認ください。</p></section>}<Link to="home">マイページへ</Link></>
 :route==='home'?<><p className="recovery-lead">予約のお手続きと、ご利用情報を確認できます。</p><nav className="recovery-cards" aria-label="マイページの手続き"><Link to="primary"><strong>予約内容の変更</strong><span>「{d.itemTitle}」の{field}を管理</span></Link>{fixture.condition==='switch'&&<Link to="alternative"><strong>予約一覧</strong><span>予約中の内容と変更のお手続き</span></Link>}<Link to="account"><strong>利用情報の確認</strong><span>登録情報と利用状況の確認</span></Link><Link to="records"><strong>予約記録</strong><span>予約情報の照合と記録の確認</span></Link></nav></>
 :route==='account'?<><p className="recovery-lead">{fixture.condition==='switch'?'会員登録とご連絡先を確認できます。':'利用情報を確認し、予約変更の確認申請を受け付けます。'}</p><section className="recovery-panel"><h2>登録済みの利用情報</h2><p>会員登録：有効</p><p>連絡先：登録済み</p><button type="button" data-recovery-action="confirm" onClick={confirm}>利用情報を確認する</button></section><Link to="home">マイページへ</Link></>
 :route==='records'?<><p className="recovery-lead">予約記録と、会員のご利用情報を照合できます。</p>{record}<section className="recovery-panel"><h2>記録の照合</h2><p>{fixture.condition==='switch'?'登録済みの会員情報と予約記録を照合できます。':'確認申請の受付番号を使い、会員情報と予約記録を照合します。'}</p>{fixture.condition==='switch'?<p>{verificationAttempts===0?'会員情報の確認後に、登録情報と予約記録を照合できます。':'確認済みの登録情報を使用します。'}</p>:verificationAttempts===0?<p>確認申請がまだありません。利用情報を確認すると作成される受付番号で、予約記録を照合できます。</p>:<p>確認申請の受付番号：R-001</p>}<button type="button" data-recovery-action="reconcile" disabled={verificationAttempts===0} onClick={reconcile}>予約記録を照合する</button></section><Link to="home">マイページへ</Link></>
 :<><p className="recovery-lead">現在の予約を確認し、変更できます。</p>{record}{fixture.condition==='switch'?<section className="recovery-panel"><h2>{field}の変更</h2><p>変更先：{d.desiredValue}</p><button type="button" data-recovery-action="apply" onClick={apply}>{d.desiredValue}に変更して保存</button></section>:<p>予約内容の変更からお手続きください。</p>}<Link to="home">マイページへ</Link></>}
 {feedback&&<p role="status" className="recovery-feedback">{feedback}</p>}{complete&&<p role="status" data-recovery-complete="true" className="recovery-success">{d.objectiveText}</p>}</main><footer className="recovery-footer">{d.title} · 会員向けお手続き</footer></div>;
}
/** Fictional UI: all state is local to this mount; no transport or reachability imports. */
export function RecoveryFixtureView({fixture}:{fixture:RecoveryFixture}){return <RecoverySession key={fixture.task+'/'+fixture.condition} fixture={fixture}/>;}




