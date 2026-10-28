# Jev 仮想βテスト基盤

既存のローカルUI、LocalExplorationPage、Jev 1.14、Persona/Charterの型と禁止操作フィルタ、番号付き画像、通知停止oracleを流用した比較用runnerです。旧runnerは変更していません。人間への一致度は未検証です。

## 最新の検証

別課題・画面の24試行は [holdout-stability.md](holdout-stability.md)、匿名値は [holdout-stability-results.json](holdout-stability-results.json)。配送変更・必要再訪・直接操作を2画面×2反復×保留有無で比較し、244要求・基盤障害0。再訪8/8、直接8/8、配送4/8（alpha全4未達・beta全4達成）、両方式10/12だった。保存前の主観的完了4件と、前提変更後も古い保留が残り必要再訪を遅らせた2件を確認。安定完了は未達。native Backのfixture不具合を実行前に修正し、実行後のURL alias集計も原本を保持して修正した。関連182件・型/build・独立監査を実施。

失敗経路の一時保留を [temporary-deferral.md](temporary-deferral.md) に追加した。実モデルの同じローカル課題で、対照は12判断で反復・未達、保留ありは帰還後に別カテゴリへ切り替わり6 UI操作・7判断で客観達成した。計38/48要求、関連145件・型/build・独立検証成功。元の入口を提案したモデル分布を明示方策が補正した1例であり、人間の再現や一般的改善率は未検証。補正時は別クリックとスクロールが同率で既存tie-breakが働いた。個別値は [temporary-deferral-results.json](temporary-deferral-results.json)。

経験状態の追加と実モデル3試行は [experience-recovery.md](experience-recovery.md)、設定・個別結果は [experience-recovery-results.json](experience-recovery-results.json)。出発画像・対象・予想・到達・結果評価を独立容量8で結び、既存の評価/行動へ接続した。最初の2試行と根拠説明だけの追加1試行は計72要求。根拠付きの進展なし/予想不支持が届いても同経路を反復し、切替と目的達成は未達。関連127件と独立検証、型/buildは成功。人間一致とは区別する。

既存二段階判断での経路切替は [deliberation-recovery.md](deliberation-recovery.md)、個別結果は [deliberation-recovery-results.json](deliberation-recovery-results.json)。同bad課題で有効化した。初回は文脈上限エラーで中断、長文脈転送接続の修正後は24要求すべて成功したが、12判断で同じ3画面を4循環し未達。評価が届いても期待と実観察を照合した見立ての更新は未実装。今回31要求、関連44件成功。API利用の都度確認不要という明示指示と自己上限運用は [api-usage-policy.md](api-usage-policy.md)。

人間の手動試行との比較は [human-comparison.md](human-comparison.md)、匿名の結果は [human-comparison-results.json](human-comparison-results.json)。同じ目的の画像のみbaselineを新規13要求で実行した。最初のクリック先は各種設定で一致したが、その後Jevは同じ経路を4反復し12判断で未達。人間は別カテゴリから達成した。UXレビュー1要求はエラーで未測定、初期画像にも4.35%の画素差があるため完全同条件・人間再現の実証とはしない。

最新の判断部改善は [information-verification.md](information-verification.md)、実測8試行は [information-results.json](information-results.json)、独立記録は [information-independent-review.md](information-independent-review.md)。評価状態と各候補への自己評価提示を設定で追加し、実Jevで自律注視2回→案内取得→正解操作→独立した目的達成の1例を確認した。新規31/32要求。安定した改善・人間一致は未確認で、案内未取得の正解も別計上している。以下のsemantic phaseはその前の別版・別予算の結果。

最新の意味・案内取得の実験は [semantic-verification.md](semantic-verification.md)、個別結果は [semantic-results.json](semantic-results.json)、独立記録は [semantic-independent-review.md](semantic-independent-review.md) に保存した。新規47/48要求を使用。案内が隠れた18試行は注視移動0で、自律取得は未達。可視対照2件の選び分けと、人間再現の未検証を区別している。下記Phase 2は前フェーズの別予算・別版の結果。

Phase 2 の結果と再実行方法は [phase2-verification.md](phase2-verification.md)、小さな実測要約は [phase2-results.json](phase2-results.json) に保存しています。
実 Jev は今回 48/48 要求を使用しました。current/state の完了例と、視覚制約条件の上限終了や予算分布変更を区別しています。
人間の再現性能は未検証です。

3 種の UI は --ui reference,position-only,wording-only、条件の絞り込みは --conditions current,combined で指定します。
既定画面は維持し、比較 UI の位置と文言だけを opt-in で変えます。
同じ UI 版の条件間で初期 fingerprint を照合し、異なる UI 同士の画像一致は要求しません。
比較モックは以下で実行できます。スクリプトによる疎通であり、モデル性能の測定ではありません。

```powershell
npm run experiment:virtual-beta -- --mock --config experiments/virtual-beta/phase2-diagnostic.json --ui reference,position-only,wording-only --max-total-api 48 --out reports/beta-phase2-mock-new
```

実 API は承認済み --phase-budget JSON を指定し、要求前の永続予約でバッチをまたぐ累積数を管理します。
今回の台帳 reports/beta-next-phase/api-budget.json は残り 0 要求です。再実験のために消費数をリセットしないでください。
エラーや予約済み未確定要求も消費し、予約拒否は実要求へ加算しません。
API と UI だけでなく注視、判断、実行時間の上限も維持します。
独立検証は [phase2-independent-review.md](phase2-independent-review.md) を参照してください。

## 実行

このブランチのルートで Node 22.12以上、npm依存とPlaywright Chromiumを用意してください。現在の隔離worktreeは既存node_modulesへのjunctionを使っています。別環境では npm ci と npx playwright install chromium が必要です。秘密情報はコミットしていません。

- 型・ビルド: npm run build
- コンポーネントと統合: npx tsx --test --test-concurrency=1 tests/virtual-beta*.test.ts
- 既存を含む回帰: npx tsx --test --test-concurrency=1 tests/*.test.ts
- 4条件の疎通: npm run experiment:virtual-beta -- --mock --config experiments/virtual-beta/conditions.json --out reports/beta-mock-new
- 実Jev: phase2-verification.md の承認済み累積予算付きコマンドを参照。
- cropで比較: npm run experiment:virtual-beta -- --mock --vision crop --out reports/beta-crop-new
- 保存分布と入力画像の検証: npm run replay:virtual-beta -- reports/beta-mock-new/combined-1
- UI記録: npx playwright show-trace reports/beta-mock-new/combined-1/trace.zip

出力先は新しいディレクトリを指定します。既存実験は上書きしません。--mock は既知のfixtureに対するスクリプトであり、自律探索・性能の証拠には使いません。実Jevコマンドは外部AIゲートウェイにデモ画面と公開入力を送るため、利用環境の通信権限が必要です。

--charter と --persona を別々に指定できます。現版の独立oracleは通知停止のみです。請求書保存や公開サイトの計測は既存runnerを使い、βrunner向けの監査アダプターは追加タスクとします。デフォルトは local:good、初心者A、1280x900、ja-JP、Asia/Tokyo、同一基準日。fresh browser contextで毎回初期化し、外部Google Fonts CSSを空にしてOSフォールバックを固定します。通常画面は維持し、比較UIだけを明示設定で選びます。

## 4条件と境界

current は全画面の番号付き画像＋可視DOM・目標優先・argmax・旧式可視履歴です。vision は画像の注視領域を鮮明にして周辺をbox blurに変え、DOM/題名/意味付き候補/旧式履歴をモデル入力から取り除きます。state は可変状態・容量制限した観察記憶・ユーザーが選びそうな行動の質問・seed付きsamplingを有効にします。combined は両者を有効にします。

これは現行部品を使った制御された比較基準です。既存CLIの全設定と同一ではありません。既存の frontier による再訪除外や独立completion再質問は比較4条件すべてで使いません。既存CLIの成功性能との直接比較には追加実験が必要です。state条件には複数の変更を束ねているため、差を記憶だけ・samplingだけの効果と解釈できません。各機能は設定で別々に変更でき、追加ablation用設定を保存できます。

固定のPersonaは知識・経験・期待・傾向・制約。Charterは目的・初期条件・範囲・禁止操作です。観察は実際に添付したPNGと参照ID。stateは注視、最新の観察、最近の観察と操作結果、宣言済みの期待だけです。監査DOMと全操作履歴はstateへ流しません。制約画像では文字記憶をDOMから作らず、実際に見た変換済み過去画像のみ容量内で添付します。これは認識・理解・忘却を学習した人間モデルではありません。

判断は生分布、正規化、禁止候補フィルタ、最終分布、modelChoice、seed/draw、選択を記録します。理由カテゴリはモデルが提案した操作に対する自己申告であり、samplingで別操作を選んだ場合も混同しません。confidenceや確率は人間の自信・行動頻度ではありません。

見る/読み直す/待つ行動はUI操作を呼びません。lookは注視位置だけを更新し、次の判断で新しい変換画像を作ります。座標はviewport基準、cropのoffsetはtransformへ保存します。候補のクリックは対象と番号バッジの両方が鮮明領域に完全に入る場合に限ります。これは操作可能性の実装規則であり、人間の周辺視野や部分認識を再現したものではありません。

## 上限と結果

各条件の既定上限はUI操作6、注視4、判断10、API6、90秒。全体はAPI24、並列1、repeatは1〜3。APIは既存クライアント経由、1回の試行のみ（再試行なし）で、残り時間をtimeoutへ渡します。上限到達・主観的done・離脱・stuck・安全停止・API障害・不正分布・操作失敗・観察障害を別の終了理由として保存します。objectiveSuccess と perceivedDone は独立で、停止理由だけで成功扱いにしません。API待ち時間とUI実行時間を分け、modeledUserMsは未校正のため既定nullです。

manifest.json は設定/入力/ソースhash/版/環境/上限、各run/result.json と step-N.json は監査・モデル入力・画像参照・分布・状態・結果です。audit-N.png は監査用全画面、input-N.png は実際のモデル入力、final.png は最終状態、trace.zip はPlaywright記録。comparison.json/csv/htmlで比較します。同じUI版の条件間で初期fingerprintの一致を確認してください。リプレイは保存分布とseedの算術・入力hash・画像hashを検証し、API判断やUI操作を再実行しません。

初期確認・実行結果と独立検証は inventory.md / verification.md、採用根拠と制約は research.md、追加タスクは tasks.md を参照してください。

最終画像とoracleの取得状況は terminalObservation / objectiveAssessment に記録します。oracle障害では現在の判定はnullとなり、objectiveSuccessの既知値だけを最終判定に使えません。validForComparison=false の行はUX比較から除外します。利用者の終了判断は監査失敗で上書きしません。期限は観察後・API応答後・実操作前で検査し、残り時間をAPIへ伝えます。開始済みの処理や最終監査の後処理時間までゼロ遅延で打ち切るものではありません。

## 案内の意味と自律取得の検証（2026-10-28）

[semantic-verification.md](semantic-verification.md) に実装、20試行と47/48要求の実測、コマンド、制約を保存した。個別の結果は [semantic-results.json](semantic-results.json)、独立検証は [semantic-independent-review.md](semantic-independent-review.md)。初期に案内が隠れる18件は注視移動0、案内が初めから見える対照2件は対応A/Bを選び分けた。自律的な情報取得は今回成立していない。人間記録は基盤のみ実装し、実参加者の測定はユーザー指定で後日に行う。

`--semantic`、`--order-seed`、設定の `initialFixation`、表示維持の独立目的判定 `--preserve-display` を追加した。既存の4条件・Persona/Charter分離・分布保存とreplayを維持する。新規実験はgoal/argmaxで能力を切り分けており、従来combinedや人間再現モードとは混ぜない。

## 保留理由の再評価（2026-10-28）

[deferral-reason.md](deferral-reason.md) に、experience-reasonの設定、旧方式との12試行比較、実行方法、独立検証と残る課題を記録した。既存experience-deferを維持し、原画像と後続根拠に結び付く理由仮説を既存評価要求へ追加する。根拠の意味精度と人間への一致は別途検証が必要。
