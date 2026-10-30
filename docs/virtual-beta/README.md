# Jev 仮想βテスト基盤

## 未解決条件の継続記憶：最新の実測

[実装・結果・実行方法](condition-continuity.md)、[個別JSON](condition-continuity-results.json)、[独立証拠監査](condition-continuity-review-live.json)。条件の更新と過去根拠を追う部品を追加し、実モデル5/8枠・104要求を実行した。従来方式は2件達成、新方式は1件達成・2件タイムアウト、3枠未実行。連続基盤障害で比較は未完了。関連239件・型・build・独立394チェックを通過したが、専用記憶から古い条件が容量破棄される限界を確認しており、保持・行動・人間再現の改善は未認定。停止した旧2版も保存し、累計130/288要求。以下は以前の検証。

## Jev / OpenAI Decisions 比較の最新実測

[provider-comparison.md](provider-comparison.md)、[24試行JSON](provider-comparison-results.json)、[独立検証](provider-comparison-independent-review.md)。同じUI・目的・actorで判断APIのみを切り替え、並列2・各12試行を完走。Jev8/12、OpenAI4/12達成、408 OK・障害0。OpenAIは前提変更に到達しても元画面へ戻らない4未達があり、照合条件は両モデル全4未達。既定Jevを維持し、OpenAIは明示backendで利用できます。モデル全般の優劣・人間再現は結論しません。以下は前の検証です。

## 探索切替・再訪の最新実測

[recovery-transfer.md](recovery-transfer.md)、[全12試行](recovery-transfer-results.json)、[独立検証](recovery-transfer-independent-review.md)。別2課題の3条件×2反復、184要求すべてOK。switch4/4、changed4/4、unchanged0/4で、後者は全件12判断の上限終了。変更後の再訪・保存は確認できましたが、照合未実行による4未達が残り、探索全体の安定化は未達です。基盤障害0、人間一致は未検証。以下は以前の評価です。

既存のローカルUI、LocalExplorationPage、Jev 1.14、Persona/Charterの型と禁止操作フィルタ、番号付き画像、通知停止oracleを流用した比較用runnerです。旧runnerは変更していません。人間への一致度は未検証です。

## 最新の検証

方式を固定した別3課題・6画面の実測は [transfer-evaluation.md](transfer-evaluation.md)、[個別結果](transfer-results.json)、[独立検証](transfer-independent-review.md)。新しい3課題・6画面を方式を変えずに探索し、予定21枠をすべて試行しました。新課題は有効16件が達成・API障害2件、既知課題は3件が達成。累計147要求、未実行0です。catalogの各版は有効2反復、他は3反復で、同条件の経路差も1条件に残りました。人間再現や行き詰まり回復の一般化は未検証です。 保存確認の補助集計は、原本を保った再解析版で報告しています。

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

## 阻害理由の根拠を分離（2026-10-29）

[deferral-admission.md](deferral-admission.md) に、旧非進展根拠と同じ経路の阻害画像を別に保持するopt-in、12実モデル試行204要求、独立検証と次の改善を記録した。受理漏れは修正できたが、根拠なしの変更判断や遅れた解除が残り、探索の安定化は継続中。

## 予算保存の障害診断（2026-10-29）

[budget-diagnostics.md](budget-diagnostics.md) に、台帳保存の段階と安全な OS コード、送信前後の要求数、制御テストと残る間欠障害を記録する。
探索の方策とモデル入力は維持する。

## 判断と根拠を一組にする（2026-10-29）

[deferral-grounding.md](deferral-grounding.md) に実装、12 実モデル試行 188 要求、独立検証と再実行コマンドを保存した。
新方式は再訪の正例 4 件で最初のレビューから根拠付き解除につながったが、全体達成は旧 5/6、新 4/6 で性能向上は未確認。
通知設定の探索失敗とモデルの意味精度は継続して検証する。

## 再訪補正と終了の区分（2026-10-29）

[deferral-scope.md](deferral-scope.md) に opt-in の `selectionScope=ui-conditional`、独立検証・修正、実モデル 12 試行 224 要求と再現コマンドを保存した。
過去 3 件では再訪補正が戻る操作を弱めて stuck を押し上げており、同一分布の再計算と通常 gateway stub の実操作で修正を確認した。
実比較は旧 4/6、新 4/6。必要再訪 8 件は全 7 UI で達成、通知設定 4 件は全て上限終了で未達。探索の切り替えは継続課題。
[結果 JSON](deferral-scope-results.json)、[独立検証](deferral-scope-independent-review.md) を参照する。

## 過去の観察との候補対応（2026-10-29）

[observation-correspondence.md](observation-correspondence.md) に、実際に提示した過去画像の検索と、モデルによる候補対応の仮説を既存2段階判断へ接続するopt-inを記録した。過去の画像hashを書き換えず、再訪禁止や新しい確率補正も加えない。実モデルの結果・独立監査を同文書に追記する。

実モデル12試行・224要求では旧4/6、新4/6。候補へ過去結果が接続された後にも再選択が続いた。対応付けを実装しただけで探索の切り替えが成立したとは言えない。次は、目的に関して何を探し何が得られなかったかの意味記憶を別部品として検証する。結果の詳細は [observation-correspondence.md](observation-correspondence.md)。

## Goalに関する探索結果（2026-10-29）

[goal-search.md](goal-search.md) に、既存の画像由来Goal項目評価を再利用するopt-in部品と実行方法を記録する。実際に見た範囲の発見と、実行済み経路の結果を分けて保持し、候補の説明へ接続する。追加API段階・画像・自動再訪禁止はない。独立検証・実モデル比較の結果は同文書へ追記する。

実モデル比較はHTTP402により38要求で中断した。有効比較ペア0で効果は未判定。途中のno-target記憶は候補に届いたが再選択が残り、Goal断片のcontext分類にも意味上の懸念が見つかった。全12比較・必要再訪の新部品での測定は未完了で、外部サービス復旧後に新規出力で行う。原本と中断後の台帳集計はgoal-search.mdに記録する。

## Goal断片の分類監査（2026-10-29）

[goal-fragment-audit.md](goal-fragment-audit.md) に、元のfragment回答・受理後の全Goal評価・記憶へのコピーを分ける読み取り専用監査を記録する。要求の役割は監査専用rubricへ分離し、モデルへ渡さない。context分類だけで要求が削除されたとは扱わず、実API復旧後の対照評価につなげる。


## チーム予算変更後の実モデル再比較（2026-10-29）

[goal-search-resumed.md](goal-search-resumed.md) に固定版6cb8/source1b8の12試行・202正常要求を記録した。旧5/6、新6/6、必要再訪は両方式4/4で全7UI、基盤障害0。過去の中断記録は保持する。同条件2反復の記述比較で、モデルの自発的な切り替えや新部品の安定した優位、人間一致を実証していない。要求の役割と現在の観察状態の分離、既存補正の効果を切り分ける対照は未解決の次タスクとして残す。独立検証は基盤PASS、12replay/trace・6pair・原本不変を確認した。navigation/target分類14提案とaction/context分類38提案の意味上の対立は未解決。関連91/91・build成功。詳細は同文書と独立所見に保存した。

## Goal の役割と否定の出典（2026-10-29）

[goal-search-semantics.md](goal-search-semantics.md) に、要求の役割と現在の画像状態、入口と直接実行操作を分離した修正と実モデル 12 試行を記録した。
今回の rubric 上の分類対立は減ったが、旧 6/6、新 5/6 で、探索の切り替えは未解決だった。
独立 raw 監査は追加で、過去 observed を持たない否定 6 件を発見した。

[goal-search-evidence.md](goal-search-evidence.md) に、その出典を明示する opt-in と、初期 goto の予算修正を記録する。
保存境界の P2 は独立の 2 ケースで再現し、修正後に同じ assertion を含む 31/31 と型検査が通過した。
新旧プロファイル、固定版、通常 runner の比較コマンド、実測と未検証範囲は各文書から追跡できる。

台帳置換の実 EPERM と、HTTP を再送しない有限回 rename、同じ台帳の保存順序、相対パスの修正は [budget-replace-retry.md](budget-replace-retry.md) に記録する。

候補役割の部品追加と旧方式との24試行比較は [action-relations.md](action-relations.md)。両方式8/12達成で、追加だけによる改善は確認していない。[JSON](action-relations-results.json)、[CSV](action-relations-results.csv)、[独立検証](action-relations-independent-review.md) に実行結果と残る意味対応の問題を保存した。


画像から具体的な条件を抽出する任意部品、現在候補の根拠制限、三方式の比較は [visual-conditions.md](visual-conditions.md) を参照。
実モデルでの三度の入力上限停止を分析し、短い画像参照名が説明文に衝突する送信不具合を特定した。
旧スコアの原本を保持し、修正済み送信と抽出部品の実行確認を分けて記録する。


修正済み固定版の18枠比較は [visual-conditions.md](visual-conditions.md) と[全結果](visual-conditions-results.json)に保存した。旧方式と現在根拠方式は各4/6達成、Responses追加方式は3/6達成・3タイムアウト。[独立検証](visual-conditions-independent-review.md)は会計・リプレイ・実配信を確認した一方、引用の結合記号不整合と、入力保持後の解釈変化を残した。一般的な改善や人間一致は未検証。


後続版d488a9aでは、蓄積した保存資料のVite監視による起動遅延を修正し、[独立回帰16件](visual-conditions-runtime-review.json)を通過した。[新規3方式の疎通確認](visual-conditions-watch-smoke-results.json)も全3件が目的達成（28要求）。これは1課題のみで、元18枠の未達条件や人間再現の解決は未確認。版・分母・実行コマンドは [visual-conditions.md](visual-conditions.md) に分けて保存した。


## 未解決条件の保持方式と計測の残課題

[実装・実行方法・結果](condition-retention.md)、[個別JSON](condition-retention-results.json)、[独立原本監査](condition-retention-review-live.json)。過去根拠を優先保持する任意設定を追加し、関連339件と独立検証を実施した。実モデルは予定4枠中2枠・48要求で連続タイムアウト停止、残2枠未実行。保持は実ログで確認したが、探索性能の優位性は未認定。最終HTTP timeoutの記録漏れも独立再現し、基盤全体は未完了。以前の130と合わせ178/288要求。上記の以前の結果・版は保持する。


最終HTTP待機上限の計測修正は [final-http-timeout.md](final-http-timeout.md)。関連462・独立273テストと短い実API疎通を別スコープで確認した。以前の比較未完了・当時の欠測は保持し、今回の記録を探索性能や人間再現の実証としない。


## 過去の未解決条件と現在候補の接続

[実装・実行・残課題](visual-prior-links.md)と[結果JSON](visual-prior-links-results.json)を追加した。任意の過去条件リンクを両判断段階へ渡し、独立検証のP2を修正した。Jev4試行124要求は照合0・最終達成0、別のOpenAI機能確認2試行72要求は照合1・最終達成0。実装の整合性は確認したが、探索の安定した改善は未確認。


## 今取り組む条件・意図・確認結果

[実装・実行と残課題](working-inquiry.md)、[各試行JSON](working-inquiry-results.json)。既存評価へ3問を加える任意部品を実装した。Jev4試行138要求は新1/2、対照0/2。図書館では照合から保存まで達成したが、講座予約は未達で安定改善は未確認。独立検証のP1記録hash不具合を修正・再検証した。追加OpenAI機能確認は2試行72要求・達成0/2。成功にも誤引用と進展/意図/check不整合が残り、意味理解や人間再現は未実証。
