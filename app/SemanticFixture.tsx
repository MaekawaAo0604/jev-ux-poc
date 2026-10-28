import React,{useState} from 'react';
import type {SemanticFixture} from '../jev/virtual-beta/semantic-types.js';
import {semanticDefinition} from './semantic-fixture.js';

const css=`
.semantic-fixture{position:relative;width:1280px;height:900px;overflow:hidden;background:#f5f7f7;color:#263c3b;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.6}
.semantic-fixture *{box-sizing:border-box}
.semantic-fixture header{position:absolute;inset:0 0 auto;height:82px;padding:0 48px;background:#fff;border-bottom:1px solid #dce4e3;display:flex;justify-content:space-between;align-items:center}
.semantic-fixture .semantic-brand{font-size:22px;font-weight:700;letter-spacing:.02em}.semantic-fixture .semantic-account{font-size:13px;color:#647574}
.semantic-fixture .semantic-sidebar{position:absolute;left:48px;top:140px;width:230px}.semantic-fixture .semantic-section{font-size:11px;font-weight:600;letter-spacing:.12em;color:#788987;margin:0 0 24px}
.semantic-fixture .semantic-nav{padding:14px 16px;background:#e8efed;border-radius:8px;font-weight:600}.semantic-fixture .semantic-sidebar p:last-child{font-size:12px;color:#748481;line-height:1.9;margin-top:28px}
.semantic-fixture main{position:static;padding:0;width:auto}.semantic-fixture .semantic-intro{position:absolute;left:350px;top:142px;width:610px}.semantic-fixture h1{font-size:30px;line-height:1.4;letter-spacing:.02em;margin:0 0 14px}.semantic-fixture .semantic-intro p{color:#6a7c78;margin:0}
.semantic-fixture .semantic-card{position:absolute;left:350px;top:280px;width:610px;height:340px;padding:30px 28px;background:#fff;border:1px solid #dce4e3;border-radius:12px}.semantic-fixture h2{font-size:18px;margin:0 0 12px}.semantic-fixture .semantic-card>p{font-size:14px;color:#6a7c78;margin:0 0 22px}.semantic-fixture dl{margin:0;display:grid;grid-template-columns:140px 1fr;row-gap:14px}.semantic-fixture dt{color:#6a7c78}.semantic-fixture dd{margin:0;font-weight:500}
.semantic-fixture button{position:absolute;margin:0;padding:0;border:1px solid #52736b;border-radius:8px;background:#fff;color:#294c42;font-family:inherit;font-size:14px;font-weight:600;line-height:1.5;cursor:pointer}.semantic-fixture button:hover{background:#edf3f0}.semantic-fixture button:focus-visible{outline:3px solid #c48128;outline-offset:5px}
.semantic-fixture .semantic-feedback{position:absolute;left:660px;top:640px;width:280px;margin:0;color:#315c47;font-size:14px}
.semantic-fixture .semantic-cue{position:absolute;padding:16px;background:#fff;border:1px solid #dce4e3;border-radius:10px}.semantic-fixture .semantic-cue h2{font-size:13px;line-height:20px;margin:0 0 8px;font-weight:600}.semantic-fixture .semantic-cue p{font-size:13px;line-height:22px;margin:0;color:#526862;height:66px}
.semantic-fixture .semantic-footer{position:absolute;left:350px;top:820px;width:610px;border-top:1px solid #dce4e3;padding-top:18px;color:#84918f;font-size:11px}
`;
/** The assignment is used only for the cue and click handler; controls stay neutral. */
export function SemanticFixtureView({fixture}:{fixture:SemanticFixture}){
 const definition=semanticDefinition(fixture),[stopped,setStopped]=useState(false),[compact,setCompact]=useState(false);
 const apply=(setting:'A'|'B')=>{if(setting===fixture.mapping)setStopped(true);else setCompact(value=>!value);};
 const bounds=(rect:{x:number;y:number;width:number;height:number})=>({left:rect.x,top:rect.y,width:rect.width,height:rect.height});
 return <div className="semantic-fixture"><style>{css}</style>
  <header><span className="semantic-brand">暮らしクラウド</span><span className="semantic-account">田中 花子 さん</span></header>
  <div className="semantic-sidebar"><p className="semantic-section">MY ACCOUNT</p><div className="semantic-nav">アカウント設定</div><p>暮らしに合わせて、<br/>サービスの設定を変更できます。</p></div>
  <main><div className="semantic-intro"><h1>アカウント設定</h1><p>通知や画面表示の設定を管理します。</p></div>
   <section className="semantic-card"><h2>サービスの設定</h2><p>設定を選んで適用してください。</p><dl><dt>メール通知</dt><dd className="semantic-mail-state">{stopped?'停止':'受信する'}</dd><dt>画面表示</dt><dd className="semantic-display-state">{compact?'コンパクト':'標準'}</dd></dl></section>
   <button type="button" data-semantic-roi="semantic-a" style={bounds(definition.rects.a)} onClick={()=>apply('A')}>設定Aを適用</button>
   <button type="button" data-semantic-roi="semantic-b" style={bounds(definition.rects.b)} onClick={()=>apply('B')}>設定Bを適用</button>
   {stopped&&<p className="semantic-feedback" role="status">メール通知を停止しました</p>}
   <section className="semantic-cue" data-semantic-roi="semantic-cue" style={bounds(definition.rects.cue)}><h2>設定内容のご案内</h2><p>{definition.cueText}</p></section>
   <div className="semantic-footer">暮らしクラウド · アカウントサービス</div>
  </main>
 </div>;
}
