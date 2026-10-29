# JevとOpenAI Decisionsの同条件比較

同じ架空ローカル画面・目的・記憶・質問・行動方策を使い、判断APIだけをJev1.14とOpenAI Decisions（gpt-6-luna）で切り替える。今回、候補の役割判定や前提条件の表現は追加していない。両モデルの比較と判断設計の変更を同時に行わない。

## 接続と実行

既存の画像、候補、状態、二段階判断、PhaseBudget、Playwright実操作、oracle、replayを流用する。追加のSDK・依存はない。OpenAIの[公式Decisions仕様](https://developers.openai.com/api/docs/guides/decisions)に従い、同じ入力JSONと画像IDを付けた全画像、同じ質問・選択肢を変換して送る。確率配列は既存のChoiceAnswersへ変換し、既存samplerが実選択に使う。入力表現はAPIごとに異なるため、文字通り同じHTTP本文の比較ではない。

認証はローカルの外部.envに AI_GATEWAY_API_KEY と OPENAI_API_KEY を設定する。既存キーを消さず、値はチャット・結果・Gitへ含めない。比較APIを選ぶオプションは明示的で、従来runnerの既定はJevのまま。

```powershell
# 単独の通常wrapper。承認済み24要求の新規PhaseBudgetを別途用意する
node --import tsx runner/human-jev-experiment.ts --mode experience-goal-search-grounded --backend openai-decisions --phase-budget reports/new-budget.json --env-file E:/ChatGPT/Ux_test/.env --out reports/openai-new

# 今回の原本を保管している環境での新規並列比較
node --import tsx runner/provider-comparison.ts --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot (Resolve-Path reports/provider-comparison-2026-10-29/prior-raw.json).Path --out reports/provider-new

# API0の配線確認。実モデル性能ではない
node --import tsx runner/provider-comparison.ts --mock --limit 1 --prior-snapshot (Resolve-Path reports/provider-comparison-2026-10-29/prior-raw.json).Path --out reports/provider-mock-new

node --import tsx --test --test-concurrency=1 tests/provider-*.test.ts tests/openai-decisions-evaluator.test.ts
npm run build
```

prior snapshotは過去2851原本のパスとhashを保持するローカルファイルであり、生の原本と共にGitへ含めない。履歴のないcloneでは同じ原本保全を確認できたとはしない。既存出力先への上書きは拒否する。

## 固定条件と保存

2課題×3条件×2反復×2providerの24枠。各ペアの2providerを並列実行し、両方が終わってから次へ進む。全体上限576要求・40分、並列2。各試行24要求、12判断、15 UI操作、3注視、180秒。新しい正解手順は渡さず、未達枠を成功試行で置き換えない。保存済み入力のAPIへの直接再送はしない。

actorはexperience-goal-search-grounded、全画面、personaなし、状態記憶3、経験8、argmax seed20261028。各試行は独立したブラウザー・状態・台帳を持つ。初期の製品画像と最初のassessmentのJSON・画像・質問を比較する。最初のactionもassessment結果によって変わるため、後続経路の一致は要求しない。

manifestにproducer/source、protocol/profile/charter、全24予定枠、実行UUID、各結果・台帳・画像照合を保存する。summaryはproviderごとに既存recovery解析を流用し、予定・試行・有効・未実行、成功、主観完了、判断上限、API障害を分離する。HTTP401/402/403/404/429や台帳障害では次ペアを開始しない。同時進行中の相手は上限内で終わり、その要求も数える。HTTP再試行は0。

実際の返却model名と使用token、API時間を記録する。費用はproviderが報告した部分だけを既知として集計し、不明なUSD費用を0としない。API時間は利用者の読解・迷いの時間ではない。確率・confidenceを人間の行動頻度として扱わない。

## 結果

実モデルの実行結果と独立検証は、固定producerの実行後に追記する。モックと実モデル、実装の成立と人間再現、初期入力の一致と画像の理解を区別する。


## 実行前の検証と計測修正

親の関連回帰67件、並列HTTPスタブ統合2件、型チェック・buildを実行した。独立検証では、APIの分布をsamplerへ渡すこと、画像と質問の保持、既定Jevのdispatchと従来初期入力の回帰、認証エラー・台帳保存障害時に次ペアへ進まないことを検証する。モックと通信スタブは実モデルの性能測定ではない。

独立検証でP2として、台帳への予約をAPI到達と誤集計し得ることを再現した。要求予約は消費数として維持し、HTTP試行の明示証拠、応答またはHTTP状態による到達証拠、証拠不足のunknownを分離した。timeoutだけではAPI受領と断定しない。修正前のRED、修正後のGREEN、元のfreeze、変更した2ファイルのhashをローカルの independent-preflight に保存する。

対象を固定した監査テストはreports内に保存し、通常testsには再利用できる4回帰を残す。書式診断は固定版の3ファイルで末尾空行を報告しており、空白診断の成功は主張しない。全体suiteは別担当が途中実行後に中断しており、既存のEPERM・ブラウザー失敗があった。今回の関連検証の成功を全体suite成功へ置き換えない。
