const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=value=>Math.round(value).toLocaleString('ja-JP');
const names={baseline:'単純ルール',filtered:'単純ルール＋Jev',jevOnly:'Jev単独（参考）',cash:'取引しない'};
export function renderReport(r){
 const h=r.results.holdout;
 const rows=Object.entries(h).map(([key,s])=>`<tr><th>${names[key]}</th><td>${s.trades}</td><td>${yen(s.netJPY)}円</td><td>${yen(s.maxClosedDrawdownJPY)}円</td><td>${s.winRate===null?'—':(s.winRate*100).toFixed(1)+'%'}</td></tr>`).join('');
 const strategies=['baseline','filtered','jevOnly'],colors=['#61758d','#21716a','#9d6d32'];
 const values=strategies.flatMap(s=>r.results.all[s].curve.map(p=>p.equityJPY-r.config.initialJPY)),min=Math.min(0,...values),max=Math.max(0,...values),range=Math.max(1,max-min);
 const x=i=>70+i/40*810,y=v=>240-(v-min)/range*195;
 const lines=strategies.map((s,i)=>`<polyline points="${r.results.all[s].curve.map((p,j)=>`${x(j)},${y(p.equityJPY-r.config.initialJPY)}`).join(' ')}" fill="none" stroke="${colors[i]}" stroke-width="2.5"/>`).join('');
 const grid=[0,.25,.5,.75,1].map(t=>{const v=min+range*t;return `<line x1="70" y1="${y(v)}" x2="880" y2="${y(v)}" stroke="#e2e5e9"/><text x="62" y="${y(v)+4}" text-anchor="end">${yen(v)}</text>`;}).join('');
 const yearTicks=[2021,2022,2023,2024,2025].map((year,i)=>`<text x="${x(i*8+4)}" y="263" text-anchor="middle">${year}</text>`).join('');
 const yearly=r.yearly.map(a=>`<tr><th>${a.year}</th>${strategies.map(s=>`<td>${yen(a[s].netJPY)}円 / ${a[s].trades}回</td>`).join('')}</tr>`).join('');
 const ledger=r.events.map(e=>{const s=h.filtered.ledger.find(t=>t.date===e.date)??r.results.diagnostic.filtered.ledger.find(t=>t.date===e.date);return `<tr><td><a href="${escape(e.url)}">${e.date}</a></td><td>${e.baseline===1?'買い':e.baseline===-1?'売り':'見送り'}</td><td>${e.jev===1?'引締め':e.jev===-1?'緩和':'不明・中立'}</td><td>${s.direction===1?'買い':s.direction===-1?'売り':'見送り'}</td><td>${yen(s.netJPY)}円</td></tr>`;}).join('');
 return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Jev × FX — 予備検証</title><style>body{margin:0;background:#f7f8fa;color:#17212b;font:15px/1.75 system-ui,sans-serif}main{max-width:1040px;margin:48px auto;padding:0 24px}h1{font-size:28px;line-height:1.4}h2{font-size:20px;margin-top:38px}p{max-width:850px}.eyebrow{font-size:12px;letter-spacing:.13em;color:#53697c}.notice{padding:16px 20px;border-left:4px solid #a77626;background:#fff7e9}.headline{font-size:21px;font-weight:650}.muted,small{color:#526274}table{width:100%;border-collapse:collapse;background:white}th,td{padding:10px 12px;border-bottom:1px solid #e1e5e9;text-align:right}th:first-child,td:first-child{text-align:left}thead{color:#53697c;font-size:13px}.scroll{overflow:auto}svg{width:100%;min-width:580px;background:white}svg text{font:12px system-ui;fill:#53697c}a{color:#216a94}.legend{display:flex;gap:24px;flex-wrap:wrap}.legend span::before{content:'';display:inline-block;width:22px;height:3px;margin:0 7px 4px 0;background:var(--c)}li{margin:6px 0}code{font-size:12px;overflow-wrap:anywhere}footer{margin:40px 0;color:#526274;font-size:12px}@media(max-width:600px){main{margin:24px auto;padding:0 16px}h1{font-size:24px}td,th{padding:8px;font-size:12px}}</style><main>
 <div class="eyebrow">THROWAWAY RESEARCH / NO REAL ORDERS</div><h1>Jevを加えると、FXの売買成績は改善するか</h1>
 <p class="notice">これは過去の参考レートを使った模擬計算です。リアルタイムのデモ口座成績でも、実際に約定できた損益でもありません。実取引・口座接続はゼロ。放置運用の可否は未検証です。</p>
 <p class="headline">2024–2025年：Jevを加えた仮定コスト控除後損益 ${yen(h.filtered.netJPY)}円。単純ルールとの差 ${yen(h.filtered.netJPY-h.baseline.netJPY)}円。</p>
 <p>仮想元本100万円、毎回1,000 USD固定、複利なし。2021–2023年は診断用、2024–2025年は時系列の評価用。結果を見て閾値や売買ルールを調整していません。ただし、モデルが過去の出来事を学習済みの可能性は排除できません。</p>
 <h2>評価期間の比較 — 2024–2025年 / 16声明</h2><div class="scroll"><table><thead><tr><th>ルール</th><th>取引回数</th><th>仮定コスト控除後損益</th><th>決済時点の最大DD</th><th>勝率</th></tr></thead><tbody>${rows}</tbody></table></div>
 <p><small>DDは決済時点の資産減少幅で、保有中の最大含み損は含みません。Jev単独は参考比較で、今回の主仮説ではありません。取引回数が少ない成績から一般化はできません。</small></p>
 <h2>累積損益 — 2021–2025年 / 40声明</h2><div class="legend">${strategies.map((s,i)=>`<span style="--c:${colors[i]}">${names[s]}</span>`).join('')}</div><div class="scroll"><svg viewBox="0 0 920 300" role="img" aria-label="2021年から2025年の模擬累積損益。単位は円。横軸は声明順、年ごとに8件。"><text x="10" y="20">累積損益（円）</text>${grid}${lines}${yearTicks}<text x="475" y="289" text-anchor="middle">声明順（各年8件、時間間隔は等間隔ではない）</text></svg></div><small>出典：FRB公式声明・FRED DEXJPUS。発表日より後の最初の観測値で入り、次の観測値で決済。市場価格の即時反応を取る戦略ではありません。</small>
 <h2>年ごとの結果 — 損益 / 取引数</h2><div class="scroll"><table><thead><tr><th>年</th>${strategies.map(s=>`<th>${names[s]}</th>`).join('')}</tr></thead><tbody>${yearly}</tbody></table></div>
 <h2>不確実性と費用の前提</h2><p>${h.filtered.ledger.every((t,i)=>t.direction===h.baseline.ledger[i].direction)?'評価期間の全イベントで、Jev追加前後の売買方向・見送り判断が同じでした。差額は仮置きしたAPI費用だけで、今回の使い方では追加の選別効果がありません。':`評価期間でのJev追加効果は、声明1件あたり平均 ${yen(r.paired.holdout.meanJPY)}円。対応するイベント単位のブートストラップ95%区間は ${yen(r.paired.holdout.lower95JPY)}〜${yen(r.paired.holdout.upper95JPY)}円。時系列の依存を無視する予備的な計算です。`} いずれも将来利益の保証や厳密な有意性の証明ではありません。</p>
 <ul><li>取引費用は往復2 pips、保有費用は1日0.5 pipsを仮定。実際のスプレッド・スワップではありません。</li><li>Jev利用料は声明ごと1円の仮置き。実請求額ではありません。記録された入力トークン：${r.inference.inputTokens??'取得不可'}。</li><li>評価期間のJev追加ルール損益：${r.costs.map(c=>`往復${c.roundTripPips} pips → ${yen(c.filtered)}円`).join(' / ')}。</li><li>FREDは遅れて公表される参考値で、実際の取引可能なbid/askではありません。リアルタイム運用には別の価格フィードが必要です。</li><li>市場予想・織り込み・約定遅延・瞬間的な損失・通信障害・モデル更新は未検証です。</li></ul>
 <h2>検証できたこと／まだできていないこと</h2><p>実Jevで声明を分類し、固定ルールで過去の売買を模擬計算しました。収益性の再現・実運用への適合・手離れは未確認です。次段階は、実時間で受け取ったデモ価格と、値動きより前に保存した判断の突合です。常駐処理や予約実行はまだありません。</p>
 <details><summary>全40件の判断と損益を見る</summary><div class="scroll"><table><thead><tr><th>声明</th><th>単純ルール</th><th>Jev分類</th><th>追加後の操作</th><th>仮定損益</th></tr></thead><tbody>${ledger}</tbody></table></div></details>
 <p><a href="results.json">詳細結果JSON</a> · <a href="decisions.json">実Jevの判断記録</a> · <a href="frozen-protocol.json">実行前に固定した条件</a> · <a href="dataset.json">入力資料と価格</a></p>
 <footer style="overflow-wrap:anywhere">作成 ${escape(r.finishedAt)} / ${Math.round(r.elapsedMs/1000)}秒 / protocol ${escape(r.protocolHash)}<br><a href="https://fred.stlouisfed.org/series/DEXJPUS">FRED DEXJPUS</a> · <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm">FRB会合カレンダー</a></footer></main></html>`;
}

// Re-render an existing result without downloading data or calling the model.
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
 const {readFile,writeFile}=await import('node:fs/promises'),{resolve,dirname}=await import('node:path');
 const source=resolve(process.argv[2]);const r=JSON.parse(await readFile(source,'utf8'));
 if(r.kind!=='HISTORICAL_REFERENCE_RATE_SIMULATION_NOT_LIVE_PAPER_TRADING')throw new Error('Not an FX probe result');
 await writeFile(resolve(dirname(source),'index.html'),renderReport(r));
 console.log('Re-rendered existing result; zero model calls');
}
