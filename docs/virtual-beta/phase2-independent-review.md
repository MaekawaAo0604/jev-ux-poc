# Phase 2 independent verification

**最終判定: 限定したローカル比較基盤として、製品固定版 `ad1d64487e3ba3303bcb6f342878aff64bae9dea` を受け入れる。未解決の製品ブロッカーなし。**

最終修正後にbuild・型チェック・全体回帰を独立実行した。全体は **667件、664成功、失敗0、skip3、exit0、574673.6627ms**。今回追加した独立5件を全体実行内に含む。最終版fresh実ブラウザー＋mock12runは全件成功、seed/入力/PNG/hashのリプレイも成功した。検証担当の新規実API要求0。親の実API実行48要求は3batchの版を分けて保存証拠を照合した。

これは比較基盤の工程・境界・保存結果の受入である。最終版の3UI×4条件の実モデル網羅、人間との一致、UIの一般的な優劣、成功率差、認識・理解・記憶の直接測定は未検証。最終版で実モデル確認したのはreference-combined一試行（API4上限による打切り）である。

以下のRound 1は修正前4c72c3fと44要求消費時点の履歴であり、最後の最終判定・証拠一覧が現在の受入結果である。

## 対象と独立性

最終製品固定版は `ad1d64487e3ba3303bcb6f342878aff64bae9dea`。初回独立検証の固定版は `4c72c3f64b96793f20ef8892ad9e941d652d3069`、開始基準は `5f7051d`、初回診断版は `ff372ab34384803931f86f59198ff7ebc445724f`。検証担当は製品コードを変更せず、`tests/virtual-beta-phase2-independent.test.ts` と本書だけを所有する。生成ログは `reports/beta-next-phase/` に保存する。実装担当の報告だけで合格とはせず、ソース・実行結果・保存画像を照合した。新規外部API要求は0。資格情報と `.env` は読まず、通信するテストではキーをローカル文字列に置き換え、global fetchをstubにした。保存payloadの再送も行っていない。

読んだ基準資料: phase2-request.md全文、README.md、phase2-ui.md、phase2-diagnosis.md、independent-review.md、2026-10-27-beta-ui-diagnostics.md。前フェーズF1–F6も今回の受入対象とした。

## Round 1 の発見: F1の遅延予約経路

**P2 / 未修正時は受入不可。** runner/virtual-beta.ts の実adapter wrapperで、coreの期限確認後に `await phaseBudget.reserve(...)` を行い、その後の期限確認なしで `evaluateBetaRequest(request)` がHTTPを開始する。

再現: maxRunMs=3000、PhaseBudget.reserveの実永続化の後で3100ms待機、gatewayはlocal fetch stub、その他は通常CLI。期待は TIME_LIMIT、HTTP0、apiCalls0、UI0。実際は TIME_LIMIT、HTTP1、apiCalls1、UI0。最終停止理由は正しくても、期限後に新HTTPを開始している。request.timeoutMsも予約前に算出された残時間である。

証拠: `reports/beta-next-phase/pre-fix-independent-additions.log` の独立追加4件中、最初の3件成功・最終1件失敗。再現sourceは `slow durable reservation must not start gateway HTTP after absolute run deadline`。失敗fixtureは `%TEMP%/beta-phase2-independent-dEzJnY/slow-admission`。親へ修正を返し、製品コードは検証担当が変更していない。

独立テスト作成初期の2失敗はテスト期待の誤りであった。argmaxのdrawIndexも0から始まる契約、および公開goalの「メール通知を停止する」をDOM漏洩検査から除く必要をコードで確認し訂正した。これらは製品不具合として報告しない。履歴は independent-additions-test-draft.log と independent-additions-goal-expectation.log に分離保存した。

## Round 1（4c72c3f）で実行済み

- 焦点テスト: `node --import tsx --test --test-concurrency=1 tests/virtual-beta-analysis.test.ts tests/virtual-beta-budget.test.ts tests/virtual-beta-phase-cli.test.ts tests/virtual-beta-ui.test.ts` — 22成功、失敗0、skip0。
- `npm run build` — exit0、final-build.log。
- `node node_modules/typescript/bin/tsc --noEmit` — exit0、final-typecheck.log。
- 3UI×4条件のfresh実ブラウザー＋scripted mock — 全12run SUBJECTIVE_DONE、objective=true、perceivedDone=true。current/stateは各3判断・UI2・look0、vision/combinedは各5判断・UI2・look2。API要求0、fake evaluation合計48。final-mock.log、independent-mock-final/。
- 独立追加stubテスト: 3UI×4条件のactual adapterについて、台帳にRESERVEDが保存されてからfetchへ進むこと、ROI/variant metadata非送信、制約条件のDOM/候補文言非漏洩、fresh state、sameUI初期fingerprintを確認。12stub要求で実API0。HTTP503は1attemptのみでERRORとして消費、次CLIの拒否はapiCalls0。台帳永続化失敗はHTTP前に拒否、lock解放。これら3件成功。
- 全体回帰は修正前4c72c3fで進行中。修正後版で再実行する。

検証shellは開始時に `Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION,Env:AI_GATEWAY_API_KEY,Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue` を実行した。optional integration skipは有効化していない。

## Round 1（44要求消費時点）の保存実Jev結果照合

`final-live-artifact-verification.json` に読取り専用照合結果を保存した。

- live-diagnostic は ff372ab、sourceHash `3682d0047b86fd95de78f2b1c5837b45475eb60d87077f4de25aae62fa25ac1d`、23要求、23 choices、36画像参照。現在ソースと異なるのは runner/virtual-beta-analysis.ts と runner/virtual-beta.ts。後続版と混同しない。
- live-ui-response は 4c72c3f、93ソースすべて現在ファイルhashと一致。21要求、21 choices、33画像参照。各UIのcurrentは3要求で主観的・客観的成功、combinedは4要求でAPI_LIMIT。combinedは能力不足や自主的離脱と分類しない。
- 両バッチの全stepで入力hash・PNG hash・seed選択リプレイ、audit画像hash、auditとvisionのsourceHash一致、response model jev-1.14.0、manifestとresultのコード・設定対応を確認。final.png存在も確認。モデルの再実行は行わない。
- api-budget.json は最大48、per-run最大12、used44、44行すべてOK。診断23＋比較21と一致し、残4。前フェーズの23要求とは別枠である。
- 旧初回manifest版はf09047e、旧v2は5b336d4。9218366や今回最終版の実モデル実行へ読み替えない。

reference-combined-1/input-1.png と input-2.png は実画素を独立目視した。判断1でも「通知設定」と説明は読める。判断1では番号e5がぼかされ、カード全体が鮮明領域へ入らないため候補e5が未提示。判断2では番号を含むカード全体が鮮明となり候補e5を提示し、後続でクリックした。従って新たに利用可能になったのは番号とクリック候補の対応・対象全体という操作適格性である。「通知設定」の意味を初めて認識・理解・記憶した証拠ではない。

初回診断combined終端はSTUCKを保持する。最後にlook候補の正のraw確率0.31がLOOK_BUDGET_EXHAUSTEDで除外されており、budgetInfluence.terminalBudgetInfluenced=trueを独立確認した。予算の影響のない自主的終了とは扱わず、予算がなければ別行動だったとの反実仮想も主張しない。

## 12受入領域 — Round 1 の仮判定

1. build/型: 4c72c3fで成功。最終修正版は再実行対象。
2. 全体回帰: 進行中。修正前後を分けて保存する。
3. 今回追加部分: 焦点22成功、追加3成功・F1遅延予約1失敗。
4. 3UI機能/初期化: 直接クリックで同一通知停止oracle、reloadとfresh contextで初期受信へ復帰。mock12runも成功。position-onlyはx/width/height/color等固定でyだけ110px変化、wording-onlyはlabel以外のtile bounds/style固定。viewport1280×900限定の主張。
5. 視覚/漏洩: 既存独立wireテスト＋今回12adapter stub。ROI・UI identity・URL tokenはauditだけ。制約条件ではDOM文字と意味付きクリック候補を渡さず、許可goal・画像の可読文字と区別する。
6. 注視/操作: lookはUIを呼ばず、別counter。mock各constrained runはlook2・UI2。F1遅延予約はAPI開始経路の別問題。
7. 状態/個体分離: fresh context、初期revision1、stateの初期memory1、memory容量とallowlistの既存回帰。各runのseed counter0。sameUIの4arm fingerprint一致。
8. 分布/seed: 前独立nondegenerate testを全体回帰で再実行対象。保存44実選択はリプレイ一致。modelProposalと実選択は別記録。
9. manifest/hash/画像: 21要求の最終UI比較は93ソースhash一致、全44choicesと69画像参照の保存整合性を照合。manifestは署名ではなく、保存算術・対応の検査。
10. API計数/上限: phase48/perrun12/batchcap、複数CLI累積、エラー消費、予約拒否API0、preHTTPpersist、lock解放はローカルstubで確認。期限跨ぎの未送信予約の扱いは修正後も別途確認する。
11. 判定/失敗/打切り: oracleとcaptureを別status、subjective doneとobjective結果を分離。予算打切りとinfra-invalidを分離。API latency/elapsedは人間時間ではなくhumanTaskMs=null。
12. 保存実結果の正確性: 版と要求枠を区別、診断とUI比較・mockを区別、STUCKへのbudget影響・UI_ACTION_LIMIT/API_LIMITを明記。成功率差、人間との一致、一般的優劣、認識・理解・記憶は未検証。

## Round 1 時点の次の確認

親の修正版を固定後、F1遅延予約テスト、build/tsc、全体回帰、必要なmock/replay/hashを再実行する。新規APIは不要。最終結果はこの後に追記し、失敗履歴を消さない。

## Round 2 — 製品修正版 ad1d644

親がF1遅延予約経路を `ad1d64487e3ba3303bcb6f342878aff64bae9dea` で修正して再凍結した。検証担当は製品変更を行っていない。wrapperが予約前にdispatch deadlineを定め、予約後に残時間を再確認し、HTTP adapterへ渡すtimeoutも残時間へ減らす。期限切れは未送信ERROR/attempts0/DEADLINE_BEFORE_REQUESTとして保守的予約を残し、actualAPIRequestsとrun.apiCallsは0となる。

同一の失敗条件を保持した独立再検証は成功した。TIME_LIMIT、HTTP0、apiCalls0、UI0、comparison.totalCalls0、ledger.used1、ERROR/attempts0がすべて一致。`final-deadline-readmission.log`。予算予約を実送信へ読み替えない。

最終修正版で `npm run build` と独立 `tsc --noEmit` はともにexit0。`final-build.log` / `final-typecheck.log` を更新した。新しいfresh browser mock12runも全件主観的・客観的成功、実API0、48fake decisions。`independent-mock-ad1d644/` と `final-mock-ad1d644.log`。先の `independent-mock-final/` は4c72c3fの修正前証拠として保持する。

修正前全体回帰は親の修正受領後に停止し、`pre-fix-regression-partial.log` へ保存した。完走した全体回帰として扱わない。最終修正版の全体回帰を初めから再開中。新しい独立追加4件も同じ全体コマンドに含む。

親は承認残4要求で最終版reference-combinedのみ通常runner再確認を行うと通知した。これは3UI×4条件の最終版実モデル検証ではない。完了した保存成果物を読取り検証して追記する。検証担当自身の新規API要求0は継続する。

## 最終成果物の読取り検証

`final-artifact-verification.json` は最終3live batchと最終mockを読取りだけで検証した結果である。新API要求は0。

- ff372ab 診断: 23要求、23choices、36画像参照。
- 4c72c3f UI比較: 21要求、21choices、33画像参照。
- ad1d644 最終reference-combined再確認: 4要求、4choices、8画像参照。sourceHash `32b1d2f60c3291fba0487fb666bcad042c047dacdc1daa383bd218792dd3c574`。経路 look_3 → e5 → look_3 → back、API_LIMIT、objective=false、perceivedDone=false、UI2、looks2、最終oracle/captureは正常。
- ad1d644 fresh mock12run: 48fixture evaluations、48choices、78画像参照、実API0、全run成功。

全48実choicesと77実画像参照、全48mock choicesと78mock画像参照で保存分布リプレイとhashが一致した。各step-N.jsonとresult.stepsの同一性、audit PNG hash、audit/vision source一致、入力PNGのサイズ、final.pngの1280×900、初期fingerprintの再計算、manifestとresultの設定/コード対応を確認した。最終liveとmockの93ソースは現在checkout bytesとすべて一致する。

履歴版で現在と異なるファイルは、そのcommitのgit内容と照合した。診断版analysis.tsはgitのLF bytesとWindows CRLF checkout bytesの差があり、CRLF再現hashがmanifestへ一致する。改行差を製品内容の差と誤認しない。4c72c3fはF1修正前のrunner/virtual-beta.tsだけが現在と異なり、該当commit bytesへ一致した。署名や改竄耐性を立証する検査ではない。

最終api-budget.jsonは上限48、per-run上限12、used48、48行すべてOK、残0、lock不存在。診断23＋UI比較21＋最終再確認4と一致する。前フェーズ消費23は含まない。検証担当のstub要求とmock evaluationはこの実台帳へ書き込まない。

同じreferenceを繰り返した2runについて、判断1〜3のinputSha256、seed、drawは各完全一致したが、normalized分布は3判断とも異なった。判断3は両方モデル提案back、同じseed/drawでも旧run実選択reread、新run実選択look_3へ分岐した。これをraw result同士で独立確認した。従って別UIの単発経路差をUI変更の因果効果へ帰属できない。modelSeedAvailable=falseというmanifest契約とも整合する。保存分布のseed replayは、実モデルの同一分布再生成を保証するものではない。

最終ad1d644の実Jevで確認したのはreference-combined一試行だけである。最終版の3UI×4条件の実モデル網羅、十分な反復、人間との比較、成功率差、認識・理解・記憶の直接測定は未実施。予算残0と今回の診断範囲を理由として残す。工程の疎通確認と性能実証を区別する。


未送信settleの保存自体が失敗する枝も独立追加した。遅延予約後のsettleをthrowさせ、HTTP0、run.apiCalls0、UI0、API_ERROR/BUDGET_ADMISSION_ERROR、validForComparison=false、comparison.actualAPIRequests0/totalCalls0、台帳RESERVEDの保守的1件保持、終了後のlock再取得を確認。`final-settlement-admission.log` は1件成功、失敗0。追加後の `tsc --noEmit` もexit0。製品コードの変更は不要だった。



## 最終受入判定と証拠

製品HEADはad1d644のまま、app/pages/jev/runner/package/独立oracleの未コミット製品差分は0である。以下はすべて最終修正後の検証結果である。

1. **build/型チェック: PASS。** npm run build、tsc --noEmitともexit0。追加5件目のtest後も独立tscを更新。final-build.log / final-typecheck.log。
2. **既存全体回帰: PASS。** node --import tsx --test --test-concurrency=1 tests/*.test.ts、667件中664成功、失敗0、skip3、574673.6627ms、exit0。final-regression.log。任意の実API/OCR連携3件は既定skipのまま、勝手に有効化しなかった。
3. **今回の追加・修正テスト: PASS。** 既存のphase2焦点22件と独立追加5件を全体実行に含む。新しいdeadline再現はRED→GREEN、未送信settleエラーもfail closed。全体ログ609/614/615/618/621行が独立追加5件。
4. **3UIの機能・初期化・差分: PASS。** 通常操作で同一通知停止oracle、reload/fresh contextで受信状態を初期化。position-onlyの実測y差110px、他のgeometry/色/文言を固定。wording-onlyのtile bounds/色/機能を固定。1280×900のcontrolled viewportの範囲。最終fresh mock12runも全件成功。
5. **視覚制約・情報漏洩: PASS。** 実adapterへのfull/crop/foveated PNG送達、過去画像参照、制約条件のDOM・候補ラベル非漏洩、variant/ROI/答え位置metadata非送信をテスト。可視画像の文字や明示goalは許可情報と区別。audit DOMは保存証拠にだけ保持。
6. **注視とUI操作の分離: PASS。** look/reread/waitはUI操作を呼ばない。別counterで保存。constrained mock各runはlook2/UI2、fresh current/stateはlook0/UI2。F1期限後の追加UIも拒否。
7. **状態・個体の分離: PASS。** allowlist/deep copy/memory容量、fresh context、初期revision/seed draw counter0、sameUI4条件のfingerprint一致。異なるUI間で画像fingerprint一致は要求しない。
8. **分布実使用・seed replay: PASS。** 非退化分布の実browser integration16seedはclick8/abandon8、modelChoiceが確率0のdoneでも選ばない。保存48live choicesと48mock choicesをreplay。modelProposalとsampled choiceを分ける。APIモデル自体のseed再現は保証しない。
9. **コード・設定・画像・manifest対応: PASS。** 最終live/mockのsourceHash32b1d2f...、93ソース一致。全step/result同一、input hash、audit PNG、入力PNG、画像参照、初期fingerprint、設定とコード版を独立照合。historical commit/CRLF差も明示。final-artifact-verification.json。
10. **API件数・上限管理: PASS。** phase48/perrun12/batchcap、preHTTPpersist、エラー消費、複数CLI累積、拒否API0、lock解放を確認。遅い予約は期限後HTTP0、未送信ERROR/attempts0を実APIから区別。settle記録失敗もAPI0/invalid。最終実台帳は48/48・全48OK・残0。stubは実台帳を消費しない。
11. **客観判定・監査失敗・打切り・時間: PASS。** F1–F6を含む回帰でoracle/capture別status、主観的doneと客観結果の分離、最終許容clickのoracle保持、不正分布証拠、安全なモデル照合、全質量除外時の選択捏造なしを確認。infra-invalidとbudget-censoredは別。API latency/runner elapsedは人間時間ではなく、humanTaskMs=null。
12. **保存実Jev記述の正確さ: PASS（上記の限定範囲）。** 23/21/4の3batch、版、終端、ROI記録の有無、予算影響のあるSTUCK、全最終UI比較combinedのAPI_LIMITを区別。同じreference入力でも分布が変動し、単発UI差を効果と断定しない。理解・記憶の実証や人間との一致は主張しない。

最終コマンドはすべて、shell内で live composite/semantics、任意OCR integration、API key環境変数を削除してから実行した。ローカルadapter試験はfetch全置換で、保存payload送信0、新規実API0。

主な再現コマンド:

```powershell
Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION,Env:AI_GATEWAY_API_KEY,Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue
npm run build
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test --test-concurrency=1 tests/*.test.ts
node --import tsx runner/virtual-beta.ts --mock --config experiments/virtual-beta/phase2-diagnostic.json --ui reference,position-only,wording-only --max-total-api 48 --out reports/beta-next-phase/NEW-INDEPENDENT-MOCK
node --import tsx runner/virtual-beta-replay.ts reports/beta-next-phase/independent-mock-ad1d644/reference-combined-1
```

実APIを増やす必要はない。今回の受入はローカル工程の正しさと保存された観測の正確な記述に対するものとし、将来の行動妥当性実験は別に設計する。
