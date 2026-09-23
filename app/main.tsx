import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const bad = location.pathname.startsWith('/bad');
  const [route, setRoute] = useState(location.hash.slice(1) || 'home');
  const [stopped, setStopped] = useState(false);
  React.useEffect(() => { const update = () => setRoute(location.hash.slice(1) || 'home'); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);
  const link = (to: string, label: string, description?: string, small = false) => <a aria-label={label} className={small ? 'tile small' : 'tile'} href={'#' + to}><span>{label}</span>{description && <p>{description}</p>}<b aria-hidden="true">↗</b></a>;
  const titles: Record<string,string> = {home:'マイページ',invoices:'請求書',notifications:'通知設定',contract:'契約情報',billing:'請求関連',usage:'利用情報',settings:'各種設定',other:'その他',preferences:'お知らせの管理',activity:'利用履歴',campaign:'今月のおすすめ',help:'お問い合わせ'};
  async function download(month: string) {
    const content = `BT /F1 20 Tf 60 740 Td (Invoice ${month} - JPY 2980) Tj ET`;
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((o,i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length; pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], {type:'application/pdf'})); const a = document.createElement('a'); a.href=url; a.download=`invoice-${month}.pdf`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <><header><a href="#home" className="brand">暮らし<span>クラウド</span></a><span className="account">田中 花子 さん <i>H</i></span></header><div className="shell"><aside><p className="eyebrow">MY ACCOUNT</p><a href="#home">マイページ</a><p className="aside-note">毎日のサービスを、<br/>ひとつの場所で。</p></aside><main><div className="intro"><p className="eyebrow">YOUR EVERYDAY, SIMPLIFIED</p><h1>{titles[route] || 'マイページ'}</h1><p>{route==='home'?'ご利用状況の確認や、各種お手続きはこちらから。':'アカウントのお手続きを行えます。'}</p></div>
  {route==='home' && <><section className="balance"><div><span>現在のご契約</span><h2>スタンダードプラン</h2><p>日々の暮らしを、もっと快適に。</p></div><div className="price">¥2,980<small> / 月（税込）</small></div></section><h2 className="section-title">お手続き</h2><div className="grid">{bad ? <>{link('usage','利用情報','ご利用に関する情報を確認')}{link('settings','各種設定','アカウントを自分らしく')}{link('other','その他',undefined,true)}</> : <>{link('invoices','請求書','毎月の請求書をPDFで保存')}{link('contract','契約情報','ご契約中のプランを確認')}{link('notifications','通知設定','メール通知の受信を変更')}</>}</div>{bad && <section className="promo"><p>あなたにぴったりの暮らしへ</p><h2>今月のおすすめをチェック</h2>{link('campaign','特典を見る')}</section>}<div className="help">{link('help','お問い合わせ')}</div></>}
  {route==='usage' && <div className="grid">{link('activity','利用履歴')}{link('contract','契約情報')}</div>}
  {route==='settings' && <div className="grid">{link('activity','アカウント情報')}{link('campaign','お知らせ')}</div>}
  {route==='other' && <div className="grid">{link('preferences','お知らせの管理')}{link('help','サポート')}</div>}
  {route==='contract' && <section className="panel"><h2>スタンダードプラン</h2><p>ご契約は有効です。</p>{link('billing',bad?'関連情報':'請求関連',undefined,bad)}</section>}
  {route==='billing' && <div className="grid">{link('invoices',bad?'各種書類':'請求書')}</div>}
  {route==='invoices' && <section className="panel"><p>検証用基準日：2026年9月19日</p>{['2026-09','2026-08','2026-07'].map((m,i)=><div className="invoice" key={m}><div><h2>{m.replace('-','年')}月</h2><p>¥2,980 ・ {i===1?'先月分':'ご利用料金'}</p></div><button onClick={()=>download(m)}>{m} の請求書をPDFで保存</button></div>)}</section>}
  {(route==='notifications'||route==='preferences') && <section className="panel"><h2>メール通知</h2><p>サービスに関するお知らせをメールでお届けします。</p><p>現在の設定：{stopped?'停止':'受信する'}</p>{stopped?<p role="status">メール通知を停止しました</p>:<button onClick={()=>setStopped(true)}>メール通知を停止する</button>}</section>}
  {['activity','campaign','help'].includes(route) && <section className="panel"><h2>{route==='activity'?'今月のご利用状況':route==='campaign'?'季節のキャンペーン':'サポート窓口'}</h2><p>{route==='activity'?'今月は12回サービスをご利用いただいています。':route==='campaign'?'新しい特典は近日公開予定です。':'受付時間：平日 10:00〜18:00'}</p></section>}
  {route!=='home' && <a className="home-link" href="#home">マイページへ戻る</a>}<footer>暮らしクラウド　·　デモアカウント</footer></main></div></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
