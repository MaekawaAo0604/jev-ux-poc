# Phase 2 実行検証

今回、実 Jev の通常 runner を 11 試行、計 48 要求で実行した。
注視移動で利用可能になった番号付き対象を次の判断で選ぶ経路と、3 種の UI を同条件で比較する基盤を確認した。
意味の理解、人間の再現性能、UI の一般的な優劣は未検証である。

## A. 実装として確認した範囲

開始基準は feature/virtual-beta-foundation の 5f7051d0504dd9accef5e309208d39a97904fd64。
前フェーズの製品修正版 9218366 を含む文書コミットであり、旧 root の a442b44 と未コミット変更は保全した。
隔離 worktree の feature/virtual-beta-ui-diagnostics で作業した。
UI 比較時の製品固定版は 4c72c3f64b96793f20ef8892ad9e941d652d3069。
独立検証の期限不具合を修正した最終製品版は ad1d64487e3ba3303bcb6f342878aff64bae9dea。
独立検証専用テストは ad1d644 に含めた。後続コミットは文書、測定要約、検証専用テストだけを対象とし、製品ソースは変更しない。

作業前に build と全体回帰を実行し、640 件中 637 成功、失敗 0、skip 3 を確認した。
API 承認待ちの間は依頼の代替手順に従い、保存ログによる診断とローカル実装を並列化した。
承認到着後、統合初版 ff372ab で 4 条件の実モデル診断を行い、その観測に基づく分析注記を追加して 4c72c3f を固定した。
実モデル診断より前に並列作業を開始したことと、最終固定後の UI 比較とは区別する。

親は shared UI 型、runner、監査、予算台帳、比較出力、設定、統合を担当した。
サブ A beta2_diagnosis は分析モジュール、専用テスト、診断文書を担当した。
サブ B beta2_ui は UI 版定義、既存アプリの opt-in 表示、機能と幾何のテスト、UI 文書を担当した。
その後、新しいコンテキストの beta2_verify が実装担当とは別に独立検証した。
同じ worktree でファイル所有範囲を分け、共通ファイルは親だけが統合した。

主な変更ファイルは以下。

- app/main.tsx、app/virtual-beta-ui.ts：既存通知 UI の reference、position-only、wording-only。
- jev/virtual-beta/ui-types.ts：UI 版と監査用 ROI の共通型。
- runner/virtual-beta-core.ts：版記録、監査用対象矩形、ROI、モデルへ渡す公開チャーターの中立化、予算受付失敗の区別。
- runner/virtual-beta.ts：条件と UI の選択、累積予算、時系列 HTML/JSON/CSV、同じ UI 内の初期状態照合。
- runner/virtual-beta-budget.ts：要求前の永続予約と排他ロック。失敗した要求も消費し、予約拒否は実要求へ加算しない。
- runner/virtual-beta-analysis.ts：証拠に基づく分類、注視前後の対応、ROI 幾何、予算による分布変更。
- tests/virtual-beta-{analysis,budget,phase-cli,ui}.test.ts：担当別回帰。独立テストは独立検証文書を参照。
- experiments/virtual-beta/phase2-{diagnostic,ui-response}.json：再利用可能な固定設定。

新しい依存関係や学習モデルは追加していない。
全画面、crop、foveated、状態、argmax/sampling の既存設定と実装を流用した。
視覚制約群は foveated を使い、current/state は full のまま比較した。crop の実モデル比較は未実施であり、視覚の方式や候補規則を成功のために変更していない。

UI の reference は既存通常画面と同じ表示。
position-only は通知入口のタイルだけを 110 px 下げ、wording-only はその表示名だけを「通知設定」から「メール受信設定」にする。
機能、通知の初期状態、成功 oracle、色、対象サイズ、その他の要素の位置は固定した。
同じ viewport 内で表示でき、試行ごとに新しい browser context で初期化する。
監査用の ROI、版名、正解を示す情報は制約側のモデル入力へ渡さない。

## B. 実 Jev で観測した範囲

### 4 条件の診断

コード ff372ab34384803931f86f59198ff7ebc445724f、sourceHash 3682d0047b86fd95de78f2b1c5837b45475eb60d87077f4de25aae62fa25ac1d。
モデルは jev-1.14.0、通常の ai-gateway.vercel.sh 経路、再試行なし。
UI は版指定なしの既存ローカル通知画面、ペルソナは初心者 A、目標は通知停止。
viewport 1280×900、ja-JP、Asia/Tokyo、初期注視 (640,450)、sampler seed 20261027 を共通化した。
上限は各試行 API 12、判断 12、UI 操作 6、注視 4、90 秒、バッチ API 32。

- current：3 判断 / 3 要求 / 注視 0 / UI 操作 2。e5 → e3 → done。SUBJECTIVE_DONE、主観的完了 true、客観的成功 true。
- vision：7 判断 / 7 要求 / 注視 1 / UI 操作 6。look_3 → e5 → back → e5 → back → e5 → back。UI_ACTION_LIMIT、主観的完了 false、客観的成功 false。
- state：3 判断 / 3 要求 / 注視 0 / UI 操作 2。e5 → e3 → done。SUBJECTIVE_DONE、主観的完了 true、客観的成功 true。
- combined：10 判断 / 10 要求 / 注視 4 / UI 操作 3。look_3 → e5 → look_3 → back → reread → e5 → reread → look_3 → look_3 → stuck。STUCK、主観的完了 false、客観的成功 false。

全 4 試行の初期 fingerprint は一致し、最終 capture と oracle は正常に記録された。
今回の observed failure には、設定画面で鮮明なクリック対象がなくなり、別領域へ進まず back や同位置への再注視を選ぶ経路がある。
視覚変換、候補生成、選択、実行の保存値は現在の契約と整合するため、実行器の不具合とは確定しない。

combined の最後は注視上限により look の raw 確率質量 0.31 を除外した後、sample が stuck を選択した。
実終了 STUCK を保持し、terminalBudgetInfluenced=true を併記する。
これは予算制約のない自主的離脱とも、予算がなければ必ず別の操作をした証拠とも解釈しない。
vision の明示的上限終了とも区別する。

### 注視から操作までの代表例

UI 比較時の固定版での reference-combined-1 の step-1.json と step-2.json、および対応する input-1.png、input-2.png が代表例となる。
監査用の raw source hash は同じで、UI 自体は変わらない。

1. 判断 1：注視 (640,450)、鮮明領域 (160,140,960,620)。クリック候補は e3、e4、e6。look_3 を選び、FIXATION_MOVED。注視数だけが 1 増える。
2. 判断 2：注視 (960,675)、鮮明領域 (480,365,800,535)。e5 が新たに候補へ加わる。モデル提案と sample の実選択が e5 となり、クリックを実行する。
3. 判断 3：通知設定画面へ遷移し、入力と記憶 revision が更新される。通知停止の対象はこの注視では全体が鮮明領域に入らず、クリック候補は 0 件になる。

**この例では、判断 1 でも「通知設定」の文字と説明は読める位置にある。**
右端の番号 e5 と対象全体が鮮明になるのは判断 2 である。
したがって、追跡できたのは「注視で番号と対象の対応が利用可能になり、その候補を次に選んだ」経路である。
初めは目的に必要な意味がまったく見えず、注視後に初めて理解したという強い条件は、この UI では実証していない。
全体包含による候補提示規則も経路に影響しており、自然な人間の認識と同一視できない。

記憶には実際に渡した制約内の画像を容量 3 で保持する。
モデルの理由カテゴリは自己申告、ROI は幾何測定であり、理解や記憶定着の直接測定ではない。

### 3 UI の初期反応比較

コードは UI 比較時の固定版 4c72c3f、sourceHash ccfbfc4b4593173d8b2b0123cec458eb479c60e229c8b54872e0387980b0f344。
3 UI × current/combined の各 1 試行、計 6 試行を実行した。
当該バッチ開始時の承認残枠 25 要求のうち最大 24 要求で初期反応を調べるため、共通 API 上限を 4 にした。
他の設定は診断設定と同じである。
この短い観察枠を、完遂率や人間の離脱率の比較へ用いない。

- reference-current：3 要求、注視 0、UI 操作 2。e5 → e3 → done。主観的完了 true、客観的成功 true、SUBJECTIVE_DONE。
- position-only-current：3 要求、注視 0、UI 操作 2。同じ操作列、主観的完了 true、客観的成功 true、SUBJECTIVE_DONE。
- wording-only-current：3 要求、注視 0、UI 操作 2。同じ操作列、主観的完了 true、客観的成功 true、SUBJECTIVE_DONE。
- reference-combined：4 要求、注視 1、UI 操作 2。look_3 → e5 → reread → back。主観的完了 false、客観的成功 false、API_LIMIT。
- position-only-combined：4 要求、注視 2、UI 操作 2。look_3 → e5 → look_3 → back。主観的完了 false、客観的成功 false、API_LIMIT。
- wording-only-combined：4 要求、注視 1、UI 操作 2。look_3 → e5 → reread → back。主観的完了 false、客観的成功 false、API_LIMIT。

全 6 試行の最終監査は有効で、同じ UI 内の初期 fingerprint は current/combined 間で一致した。
UI 間の fingerprint は意図した表示差により異なる。
版名と監査 ROI を含む情報をモデルへ渡さず、公開するチャーターの ID と対象表記も全 UI で中立化した。
この公開入力の中立化がない最初の診断バッチとは、同じ画素の reference であっても入力全体が同一ではない。

3 UI の combined は、いずれも最初に右下を見てから e5 をクリックした。
入口 ROI が全体として鮮明になった最初の判断は全 UI で 2。
注視点そのものが入口 ROI 内に入ったのは position-only の判断 2 だけである。
これはタイルを下へ移した幾何的結果であり、位置変更で理解が改善したことを意味しない。
判断 3 の選択は reference/wording-only が reread、position-only が look_3 だったが、モデル出力のばらつきと UI 変更の効果を分離できる反復数はない。
文言の変更で経路が変わったという証拠も、この 1 試行ずつでは得ていない。

### 修正後の再確認

独立検証で予算予約待ちによる期限越えを修正した後、残枠 4 要求で reference-combined を通常 runner から 1 回実行した。
最終製品版 ad1d644、sourceHash 32b1d2f60c3291fba0487fb666bcad042c047dacdc1daa383bd218792dd3c574。
look_3 → e5 → look_3 → back、4 判断、注視 2、UI 操作 2、API_LIMIT、主観的完了 false、客観的成功 false、最終監査正常。
実モデル経路の疎通であり、遅い予約処理そのものの確認はローカル通信スタブの回帰テストで行った。

先行する reference-combined と、この再確認の判断 1〜3 は inputSha256 と sample の draw が一致した。
それでもモデルの分布が異なり、判断 3 の実選択は reread から look_3 へ分岐した。
UI を変えない再実行でも、配置変更時と同じ種類の経路差が出た観測となる。
コード版は異なるが差分は予算受付後の期限管理であり、保存された公開入力の一致を確認している。
この例からも、UI 変更の単一試行差をその UI の効果とは判定できない。
証拠は phase2-results.json の repeatReferenceEvidence と両原記録に残した。

### API 予算

新規承認は最大 48 要求、各試行最大 12 要求。
親だけが通常 runner を実行し、永続台帳へ要求前に予約した。
4 条件診断 23 要求、UI 比較 21 要求、最終修正版の再確認 4 要求の合計 48、全て API 応答正常、残り 0。
前フェーズの 23 要求は別枠である。
追加問い合わせ、再試行、保存入力の直接再送、サブによる実 API は各 0。
通常 runner から送ったのは架空のローカル UI とペルソナ、目的、制約内の観察記憶であり、秘密情報を成果物へ保存していない。

## 問題の分類

- 計測上の不足：終端の STUCK だけでは予算フィルタの関与が読めなかった。分析と HTML/CSV へ予算除外候補と質量を追加した。終端選択や実操作は変更していない。
- 探索方策の未確認部分：設定画面で対象が候補外となり、back と同位置注視を選んだ。視覚、状態、確率選択の要因を分離する追加実験が必要。
- 実行器：クリックは設定画面へ遷移し、back は戻り、注視は要求位置へ移った。これらの経路で実行器の誤動作は確認していない。成功用の正解位置、再訪排除、終了緩和は追加していない。
- 独立検証で確定した P2/F1：予算予約の永続化が期限を越えても、その後で新しい HTTP を開始できた。maxRunMs=3000、reserve の追加待ち 3100 ms のスタブで通信 1 回を再現。親が予約後の期限再確認、残 timeout の更新、未送信分類を修正。修正後は同じ条件で通信 0、apiCalls=0、TIME_LIMIT となった。
- 予約済み未送信：期限切れを ERROR/attempts=0/DEADLINE_BEFORE_REQUEST と記録する。安全側の予約消費は戻さず、台帳の消費と actualAPIRequests を分ける。今回の実測 48 件には未送信予約はなく、予約消費と実送信は一致する。期限切れ記録自体の保存に失敗した場合は基盤障害として実 API 数 0 を維持する。
- 予算打ち切り：UI 比較 combined の全 3 例と診断 vision。失敗性能や自主的離脱へ読み替えない。

## 最終検証

独立検証の修正 1 ラウンド後、最終製品 ad1d644 で build と tsc --noEmit が成功した。
製品コードの最後の変更後に全体回帰を最初から実行し、667 件中 664 成功、失敗 0、skip 3、約 574.7 秒で完走した。
独立追加 5 件もこの全体コマンドへ含まれる。
skip は明示的 opt-in の実 OCR、実モデル composite、実モデル semantics の各統合テストであり、通常 runner の承認枠外に起動していない。
開始前の 640 件、修正前に途中停止した回帰、最終版の 667 件は別記録として扱う。

最終版の実ブラウザー＋モックは 3 UI × 4 条件、計 12 run で全件主観的完了と客観的成功を確認した。
48 fixture 判断、実 API 0。既知の操作を返すスクリプトの疎通確認であり、自律探索の性能値ではない。
独立検証では実ログの 48 選択と 77 画像参照、モックの 48 選択と 78 画像参照をリプレイし、入力と PNG hash を照合した。
最終版の実ログとモックは全 93 ソース hash が現行 checkout と一致した。
既存の非退化分布の 16 seed テストも通り、分布が実選択へ使われることを確認した。

F1〜F6 の既存回帰と、予算の永続化前後、送信済みエラー、未送信予約、個体状態、情報漏洩、UI 初期化、監査分類を確認した。
独立検証で確定した期限不具合は解消済みで、受入を妨げる既知の未解決実装不具合はない。
認識や人間再現の性能は次節の未検証項目として残す。
詳細な受入 12 領域とコマンドは phase2-independent-review.md、照合結果は final-artifact-verification.json、全体ログは final-regression.log。
新規 API は親が実施した 48 要求だけで、独立検証担当は 0 要求である。

## C. 未検証の範囲

各条件 1 試行のため成功率、有意差、ペルソナによる人間行動の予測性能は推定していない。
API 側のモデル seed は指定できず、sampler seed の一致だけではモデル分布の再現性を保証しない。
current は比較 harness、state は記憶、質問、語彙、sample の束であり、旧 CLI や単一要因の効果と同一ではない。
API 応答待ちと runner 時間は人間の作業時間に含めず、modeledUserMs は null のままである。

意味情報が初期画像から完全に隠れる UI での再実験、最終修正版の current/vision/state を含む全 4 条件の実モデル再実行、全 3 UI × 4 条件の実モデル実行、argmax/sampling だけの実モデル分離実験は未実施。
初回 4 条件は ff372ab、UI 比較は 4c72c3f、最終の combined 1 件は ad1d644 の実行であり、最終版の全 4 条件実行と呼ばない。
最終修正後は残枠 4 要求で限定再確認を行い、同じ 12 要求上限での完遂確認までは実施していない。
人間のテスト参加者データ、視線、理解、離脱理由、校正済み操作時間は未取得。
公開製品への一般化、動的注意、認識状態の学習も今回の確認範囲に含まない。

## 次に行う最小実験

1. 初期の意味と番号が共に隠れ、別の注視では見える課題を 1 件用意する。目的だけを与え、モデル入力画像、出典付き認識、次の行動を測定する。監査情報を利用者状態へ混ぜず、「見た」「理解した」の判定を分ける。
2. 設定画面の再注視失敗を調べる。同じ視覚、状態、質問、候補を固定し、argmax と sampling だけを変えた少数の反復を、新しい明示予算内で行う。全包含による人工的な操作制約の影響も独立条件で測る。
3. 人間比較用のデータ契約を決める。同じ UI と課題について初期状態、デバイス、操作列、終了理由、所要時間を取得し、API latency と分離する。較正用と評価用の課題を分ける。

## 再実行

以下は隔離 worktree のルートで実行する。
出力先は未作成のディレクトリを指定する。

```powershell
Set-Location 'C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test'
npm run build
node node_modules/typescript/bin/tsc --noEmit
Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION,Env:AI_GATEWAY_API_KEY,Env:TYPESAFE_API_KEY -ErrorAction SilentlyContinue
node --import tsx --test --test-concurrency=1 tests/*.test.ts
npm run experiment:virtual-beta -- --mock --config experiments/virtual-beta/phase2-diagnostic.json --ui reference,position-only,wording-only --max-total-api 48 --out reports/beta-phase2-mock-new
npm run replay:virtual-beta -- reports/beta-phase2-mock-new/reference-combined-1
npx playwright show-trace reports/beta-phase2-mock-new/reference-combined-1/trace.zip
```

実モデルで実施したコマンドは以下。
予算台帳を初期化して許可を増やさない。
現在の台帳は残り 0 要求であり、同規模の再実行には新規予算の承認が必要となる。
以下の記録を再現する場合も保存入力の再送はせず、通常 runner で新しいローカル画面を生成する。

```powershell
npm run experiment:virtual-beta -- --config experiments/virtual-beta/phase2-diagnostic.json --phase-budget reports/beta-next-phase/api-budget.json --max-total-api 32 --env-file E:/ChatGPT/Ux_test/.env --out reports/beta-live-diagnostic-new
npm run experiment:virtual-beta -- --config experiments/virtual-beta/phase2-ui-response.json --conditions current,combined --ui reference,position-only,wording-only --phase-budget reports/beta-next-phase/api-budget.json --max-total-api 24 --env-file E:/ChatGPT/Ux_test/.env --out reports/beta-live-ui-response-new
npm run experiment:virtual-beta -- --config experiments/virtual-beta/phase2-ui-response.json --conditions combined --ui reference --phase-budget reports/beta-next-phase/api-budget.json --max-total-api 4 --env-file E:/ChatGPT/Ux_test/.env --out reports/beta-live-final-recheck-new
```

## 成果物

追跡用の小さな実測要約は phase2-results.json に保存した。
各試行の版、UI、設定、初期 fingerprint、判断列、画像 hash、注視、選択、終了、予算分類を含む。
生の画像と trace は既存方針に従って ignored の reports/ に保存し、巨大なバイナリーを Git へ追加していない。

- docs/virtual-beta/phase2-diagnosis.md：原因の証拠と旧版の区別。
- docs/virtual-beta/phase2-ui.md：UI の意味と変更範囲、通常操作の検証。
- docs/virtual-beta/phase2-independent-review.md：独立受入、実行コマンド、未確認項目。
- reports/beta-next-phase/baseline-build.log、baseline-regression.log：並列変更前の build と 640 件。
- reports/beta-next-phase/live-diagnostic：初回 4 条件の原記録。analysis-at-4c72c3f.json と comparison-at-4c72c3f.html は原記録を変更せずに 4c72c3f の分析コードで派生させた結果。
- reports/beta-next-phase/live-ui-response：4c72c3f の UI 比較。comparison.html、comparison.json/csv、各 result.json、step-N.json、input/audit PNG、final.png、trace.zip。
- reports/beta-next-phase/api-budget.json：要求前予約を含む永続台帳。48 消費、0 残。
- reports/beta-next-phase/live-final-recheck：最終 ad1d644 の reference-combined 1 件、4 要求。
- reports/beta-next-phase/pre-fix-regression-partial.log：独立不具合発見のため途中停止した回帰。完走成功とは扱わない。
- reports/beta-next-phase/mock-ui-matrix：統合途中の 12 run モック。最終版の独立再実行とは区別する。
- reports/beta-next-phase/independent-mock-ad1d644：最終製品版の 12 run モック、実 API 0。
- reports/beta-next-phase/final-regression.log、final-build.log、final-typecheck.log：最終製品版の全体回帰と build/型。
- reports/beta-next-phase/final-artifact-verification.json：実ログとモックの画像、入力、選択、93 ソース、予算の独立照合。

旧履歴の manifest と、引き継ぎ文面の版表記には相違がある。
最初の実モデルバッチの記録版は f09047e、v2 は 5b336d4 である。
旧原記録を今回の最終監査契約で正常だったと推測して補わない。
