# 独立検証 第2回（2026-11-06）

計測基盤の P1/P2 修正を再検証し、今回の範囲に重大な未解決事項は検出していません。関連回帰と独立検証は **78 tests / 76 pass / 0 fail / 2 skip、exit 0**、ビルドも **exit 0** です。新しい実モデル `live-r2` の完走・有効率・行動分布を確認した結果ではありません。

## 対象と固定証拠

- revision: `3fd144ccbdeb6229ca5b2c873cc711581e9ee647`
- sourceHash 前後: `696fd78a43715f17f6b54ecd2bea41ae4589badb2f24a57a6d3ea1dd7643b663`
- `freeze.json` の 186 source files は開始時・終了時とも現物一致。
- 前回 `9f515b8f…dff40f` の報告・findings・summary・metrics は `*-r1.*` に保存。旧 P1 の RED ログと失敗 HAR/DOM/PNG も保持しています。
- 独立担当は製品ソースを編集していません。所有範囲の専用 tests と `independent/` の検証コード・報告だけを変更しました。API 実行、秘密ファイル読取、保存入力再送は 0 回です。

## 修正確認

**OBS-001 / P1: 修正再検証済み。** `GET 200` の許可 HTML に本文が埋め込まれていないと、サイズが -1 または 0 でも観測前に `SITE_SNAPSHOT_SPEC_INVALID` で拒否します。専用回帰は前回 RED から GREEN になりました。サイズ -1/0 × text absent/null/number の 6 ケースすべて `about:blank` を維持し、`HAR_VERIFIED` を出しません（`missing-body-green-r2.log`、`missing-body-reproduction-r2.json`）。

前回実際に空画面を生成した **同じ未変更の HTTP HAR** `signin-doc-stress/5/snapshot.har` も、新版では移動前に拒否しました（`r2-original-repro-check.json`）。HAR の SHA256 は `86822ec103af94bc0e27ff6442a8cdb11fd4d45c8fbb6cb6554a99855d9b5bad` のままです。

既存 site fixture は応答本文の完了待ちと埋込み済み本文の assertion を行うようになり、本文のない HAR を通常の成功 fixture として実行しなくなりました。情報文リンク、先頭リンクの変更、安全境界、HAR欠損・hash・network分類も今回の suite で通過しました。前回の先頭 `a` timeout 自体は元の一時 HAR が消去済みのため、その一件の原因まで断定しません。今回、確認済みの本文欠損パターンが fixture と製品検証の両方で防がれていることを確認しています。

**OBS-002 / P2: 修正再検証済み。** checkpoint 中の ATTEMPTING は pending として保持され、invalid completed trials へ加算されません。actor ごとの pending/invalid と最終 pending 0、provider failure の invalid 1 を新回帰で確認しました。viewer の計画枠数と結果記録数も別表示する回帰を通過しています。

**native 不正応答分類: 再検証済み。** 記録された step/native/assessment の信頼された error code による native schema failure は既存の「3 試行連続不正」で停止し、3 件を残します。HTTP 503 と TIMEOUT はこの model-invalid streak に算入されず、provider output に偽の `INVALID_VISUAL_HYPOTHESES` があっても分類を変えません。モデル応答を書き換える処理はありません。

## 維持された確認

- 実 GitHub HAR は 120 entries、4 文書すべて本文あり。HAR、original HAR、4 PNG、spec、capture manifest の 8 ファイルは前回から SHA256 一致です。
- 実 4 ページを `offline:true` の fresh context で 2 回観測でき、初期画像と候補件数が一致しました。固定サイト画像の初期 SHA256 は前回と同じ `c1ef458b50bf8ff2b60eeaeb9a3e2d343e0bb2145c2a052006c6e71aeba8a29c`。
- 明示した過去モデル 36 + mock 1 の計 37 試行・99 steps を現在の builder で再正規化し、raw bytes、状態・入力・応答・選択分布・model/actual choice・時間を保持しました。prepared 1 と response-received 295 を分け、終端監査を次の配信入力へ読み替えません。
- compact mock cohort の baseline/A/B/C 4 件は同じ group、mock true、objective `UNVERIFIED/null`。元 manifest は不変です。
- 400 **合成**枠（実モデル実行数ではありません）で 390 recorded / 10 pending、360 valid / 20 invalid / 10 recorded unknown、3120 steps を保持。初期の詳細 GET は 1 件だけ。全 400 枠と Persona C 100 枠を表示し、375 px の横 overflow はありません。
- 今回の合成実測: builder 約 9.11 秒、catalog 345,604 bytes、初期表示約 199 ms、2 件目の選択約 105 ms。単発のローカル測定です。
- 稼働中 4175 の計画 57 枠の一覧、公開 mock の objective 不明、desktop/mobile を再確認。新しい main の完了件数とは区別しました。画像は `*-r2.png` に保存。
- GET/HEAD、CSP、Host/Origin、path、XSS、hash、不正出力、分母、schedule 1..100、caps、checkpoint/resume/accounting、安全拒否・nofallback の関連回帰を通過。hardlink 拒否は実行確認済み。symlink の 2 テストだけ Windows EPERM により skip です。

## 原本・旧 phase の分離

旧 raw **9,468 files** は固定メタデータのハッシュと全件一致しました。実 byte 合計は **1,960,682,389 bytes** です（`prior-integrity-r2.json`）。第1回の byte 合計には独立ハーネスの非同期加算による過少集計があり、今回修正しました。第1回も各ファイルの SHA256 判定と件数には影響しません。固定メタデータファイル自身の SHA256 も旧 `live-r1` identity と一致し、比較基準を更新していません。

停止済み旧 `live-r1` は **2 attempts / 41 requests / 14 未実行 / ledger reserved 0**。baseline は 8 判断・22 要求、A は 7 判断・19 要求で、両方 API_ERROR / valid false。2 つの raw result は記録済み SHA256 と一致しました。manifest の `FROZEN_SOURCE_CHANGED` と `preservationAfter:false` はそのまま記録し、成功や新 main の結果として扱っていません（`r2-integrity-and-protocol.json`）。

旧 protocol と新版 protocol は profile、actors、goal、repeats、計画16枠、limits、intervention、objective が同じです。旧 identity に対する config、Persona、charter、site、prior metadata のハッシュも一致しました。変更理由は測定上の修正として protocol に明記されています。停止理由は親の `parent/operator-boundary-stop.json` を参照してください。

## 実行と範囲

```powershell
npm run build
$env:JEV_OBSERVATORY_INDEPENDENT='1'
node --import tsx --test --test-concurrency=1 tests/exploration-viewer-data.test.ts tests/exploration-viewer-server.test.ts tests/exploration-viewer-ui.test.ts tests/beta-public-site.test.ts tests/beta-public-wiring.test.ts tests/public-persona-comparison.test.ts tests/capture-public-passkeys.test.ts tests/public-auth-safety.test.ts tests/exploration-observatory-independent.test.ts
node --import tsx reports/exploration-observatory-2026-11-06/independent/verify-prior-hashes.ts
node --import tsx reports/exploration-observatory-2026-11-06/independent/verify-r2-integrity.ts
node --import tsx reports/exploration-observatory-2026-11-06/independent/verify-r2-original-repro.ts
```

`build-r2.log`: exit 0。`final-verification-r2.log`: 78 tests / 76 pass / 0 fail / 2 skip、exit 0。個別の P1 GREEN、prior integrity、旧 phase/protocol、旧失敗原本の再拒否も exit 0。sourceHash は検証前後で一致しました。

この round ではリポジトリ全体の `npm test` は再実行していません。以前の全体未合格を解消したとの主張はしません。新 main `live-r2` の実モデル post 測定は未検証です。native 出力の schema 契約・token 上限等による旧 2 試行の不正を直したとの主張、人間との一致や Persona 効果の因果判定も行いません。これらは計測 P1/P2 の修正と別の範囲です。
