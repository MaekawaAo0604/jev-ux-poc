# Jev 仮想βテスト基盤 v1

既存のローカルUI、LocalExplorationPage、Jev 1.14、Persona/Charterの型と禁止操作フィルタ、番号付き画像、通知停止oracleを流用した比較用runnerです。旧runnerは変更していません。人間への一致度は未検証です。

## 実行

このブランチのルートで Node 22以上、npm依存とPlaywright Chromiumを用意してください。現在の隔離worktreeは既存node_modulesへのjunctionを使っています。別環境では npm ci と npx playwright install chromium が必要です。秘密情報はコミットしていません。

- 型・ビルド: npm run build
- コンポーネントと統合: npx tsx --test --test-concurrency=1 tests/virtual-beta*.test.ts
- 既存を含む回帰: npx tsx --test --test-concurrency=1 tests/*.test.ts
- 4条件の疎通: npm run experiment:virtual-beta -- --mock --config experiments/virtual-beta/conditions.json --out reports/beta-mock-new
- 実Jev: npm run experiment:virtual-beta -- --config experiments/virtual-beta/conditions.json --env-file E:/ChatGPT/Ux_test/.env --out reports/beta-live-new --max-total-api 24
- cropで比較: npm run experiment:virtual-beta -- --mock --vision crop --out reports/beta-crop-new
- 保存分布と入力画像の検証: npm run replay:virtual-beta -- reports/beta-mock-new/combined-1
- UI記録: npx playwright show-trace reports/beta-mock-new/combined-1/trace.zip

出力先は新しいディレクトリを指定します。既存実験は上書きしません。--mock は既知のfixtureに対するスクリプトであり、自律探索・性能の証拠には使いません。実Jevコマンドは外部AIゲートウェイにデモ画面と公開入力を送るため、利用環境の通信権限が必要です。

--charter と --persona を別々に指定できます。現版の独立oracleは通知停止のみです。請求書保存や公開サイトの計測は既存runnerを使い、βrunner向けの監査アダプターは追加タスクとします。デフォルトは local:good、初心者A、1280x900、ja-JP、Asia/Tokyo、同一基準日。fresh browser contextで毎回初期化し、外部Google Fonts CSSを空にしてOSフォールバックを固定します。UIソースは変更しません。

## 4条件と境界

current は全画面の番号付き画像＋可視DOM・目標優先・argmax・旧式可視履歴です。vision は画像の注視領域を鮮明にして周辺をbox blurに変え、DOM/題名/意味付き候補/旧式履歴をモデル入力から取り除きます。state は可変状態・容量制限した観察記憶・ユーザーが選びそうな行動の質問・seed付きsamplingを有効にします。combined は両者を有効にします。

これは現行部品を使った制御された比較基準です。既存CLIの全設定と同一ではありません。既存の frontier による再訪除外や独立completion再質問は比較4条件すべてで使いません。既存CLIの成功性能との直接比較には追加実験が必要です。state条件には複数の変更を束ねているため、差を記憶だけ・samplingだけの効果と解釈できません。各機能は設定で別々に変更でき、追加ablation用設定を保存できます。

固定のPersonaは知識・経験・期待・傾向・制約。Charterは目的・初期条件・範囲・禁止操作です。観察は実際に添付したPNGと参照ID。stateは注視、最新の観察、最近の観察と操作結果、宣言済みの期待だけです。監査DOMと全操作履歴はstateへ流しません。制約画像では文字記憶をDOMから作らず、実際に見た変換済み過去画像のみ容量内で添付します。これは認識・理解・忘却を学習した人間モデルではありません。

判断は生分布、正規化、禁止候補フィルタ、最終分布、modelChoice、seed/draw、選択を記録します。理由カテゴリはモデルが提案した操作に対する自己申告であり、samplingで別操作を選んだ場合も混同しません。confidenceや確率は人間の自信・行動頻度ではありません。

見る/読み直す/待つ行動はUI操作を呼びません。lookは注視位置だけを更新し、次の判断で新しい変換画像を作ります。座標はviewport基準、cropのoffsetはtransformへ保存します。候補のクリックは対象と番号バッジの両方が鮮明領域に完全に入る場合に限ります。これは操作可能性の実装規則であり、人間の周辺視野や部分認識を再現したものではありません。

## 上限と結果

各条件の既定上限はUI操作6、注視4、判断10、API6、90秒。全体はAPI24、並列1、repeatは1〜3。APIは既存クライアント経由、retry1回まで（再試行なし）で、残り時間をtimeoutへ渡します。上限到達・主観的done・離脱・stuck・安全停止・API障害・不正分布・操作失敗・観察障害を別の終了理由として保存します。objectiveSuccess と perceivedDone は独立で、停止理由だけで成功扱いにしません。API待ち時間とUI実行時間を分け、modeledUserMsは未校正のため既定nullです。

manifest.json は設定/入力/ソースhash/版/環境/上限、各run/result.json と step-N.json は監査・モデル入力・画像参照・分布・状態・結果です。audit-N.png は監査用全画面、input-N.png は実際のモデル入力、final.png は最終状態、trace.zip はPlaywright記録。comparison.json/csv/htmlで比較します。初期fingerprintの一致を確認してください。リプレイは保存分布とseedの算術・入力hash・画像hashを検証し、API判断やUI操作を再実行しません。

初期確認・実行結果と独立検証は inventory.md / verification.md、採用根拠と制約は research.md、追加タスクは tasks.md を参照してください。
