# crop初手STUCK：操作可能性の契約を補って再比較

2026-11-10 JST。**同じcrop画像で、修正なしは3/3が初手STUCK。現在の操作候補とクリック可否の規則を注視判断へ渡した修正は3/3で注視を選び直し、停止操作と完了確認まで進んだ。** 切り取り位置の説明だけでは3/3STUCKが残った。4条件×3反復＝12試行・実Jev60要求。人間再現や別画面への安定性は未検証。

## 確認した原因と、推測の範囲

[旧3crop＋3foveatedの独立診断](crop-context-diagnostics.json)では、crop初期画像に「通知設定」の見出しと説明が見えていた。しかし操作部品本体は199/295px幅（67.46%）だけで、番号バッジは完全に切り取り外だった。e5はクリック候補から外れており、次段の通常判断にあるのはe3/e4/e6/done/stuckだけ。

このPoCでは、操作本体が鮮明領域内にあり、提供されるバッジも領域内にあることがクリック候補の条件。部分的なラベルが読めても、それだけで操作できる契約ではない。注視判断には以前からcandidateIdsはあったが、この可否の規則や次段の正確な非look操作型・中立criteriaが明示されていなかった。

旧crop3件はgate continue(.64/.69/.67)の後、通常判断でstuck(.66/.73/.64)だった。**見えるラベルを操作可能と受け取ったのではないか**という解釈は仮説であり、モデル内部の理由を観測したものではない。今回の対照で確認したのは、操作可能性の契約を追加した条件が改善し、切り取り幾何の説明だけでは改善しなかったこと。

配送・変換の不具合は確認されなかった。各cropの全2,380,800チャネルが監査画像の該当領域およびfoveatedの鮮明部分と一致。crop gate/action計6応答について画像hash・binding・memory・入力fingerprintも一致した。STUCKをAPI障害や画像欠落として説明しない。

## 最小修正

`attention.observationContext: actions-v1`を追加した。既にofferedである非look候補だけから、匿名ID・action型・中立ラベルを作り、以下の一般規則を注視判断に渡す。

- 現在選べるクリックは、提示されたIDだけ。
- 部分的な文字が見えるだけではクリック可能とは限らない。
- 本体が鮮明領域内にあり、バッジが提供される場合はそのバッジも領域内にある必要がある。
- 候補にない部品の名前・位置・数や、見ていない領域の内容は推測しない。

e5の名前・座標、未提示IDの一覧、監査DOM、目標部品の矩形、正解の注視先、oracleを渡していない。画像、クリック候補化、通常判断のgoal・criteria、lookの4地点、選択器、予算、UI実行を変えていない。STUCKを強制的にlookへ変換する処理や再訪禁止もない。新情報はgateだけで、通常操作入力へは混ぜない。

推奨する今回の設定例:

```json
"attention": {
  "enabled": true,
  "policy": "exclusive-hierarchical-v2",
  "sampling": "domain-separated-v1",
  "taskFrame": "attention-v1",
  "observationContext": "actions-v1"
}
```

切り分け用に`geometry-v1`（既に公開されたviewport・clearRect・transform等の意味を明示）と`geometry-actions-v1`（両方）も用意した。幾何の説明には、crop端は画面端とは限らず、lookはviewport座標で指定することを含める。いずれも新しい画素や正解地点を追加しない。optionなしは従来入力のまま。

## 固定比較と結果

[studyと3plan](../../experiments/virtual-beta/crop-context-v1/study.json)を実行前に固定。基準は7f35def。修正なしは前回のcrop＋階層判断＋注視task profile。全条件で同じ通知設定UI、初心者A・専用PC、goal方策、argmax、記憶3、image-state、分離sampler設定、初期1280×900・fixation(640,450)を使った。変更はobservationContextだけ。

UI6/look4/判断8/API12/150秒、各batch48要求・600秒、全体最大144要求・45分、並列1/retry0。実際は60要求で完走。各試行で新しいcontext/state/samplerを作り、初期の画像・候補・base gate入力・質問が全12件で一致した。seed9001/9002/9003は対応割当用で、外部モデルseedは制御していない。

[試行別結果](crop-context-results.json)、[判断別時系列](crop-context-timeline.json)、[phase](crop-context-phase.json)。

- 修正なし：3/3初手continue→STUCK。各2要求・UI0・look0、客観的達成0。
- 幾何の説明だけ：3/3初手continue→STUCK。各2要求・UI0・look0、客観的達成0。
- **操作候補・可否の契約だけ：3/3初手inspect→look、目的達成と完了確認。各8要求・UI2・look2。**
- 両方：3/3で同じ注視・UI操作列と達成。各8要求・UI2・look2。今回、幾何説明の追加利益は確認できなかった。

改善条件6件は全て `look_3 → 通知設定 → look_0 → メール通知を停止 → done`。初回look後にe5が新しく候補になり、通知画面では別の領域へlookした後にe1/e2/e3が候補化し、その後にe3を実クリックした。全12回の注視はUI操作0で、次のfixationと新しい候補が実行に一致した。注視先はモデルの条件付きgaze分布から選ばれ、コードに正解順序は登録していない。

12件はすべて記録・監査を完了、上限打切り0・無効0・未実行0・基盤障害0。STUCK6件は目的失敗、SUBJECTIVE_DONE6件は客観的達成もtrue。実行枠のcompletedを全件目的成功とは数えない。モデル上のユーザー時間と人間の操作時間はnullで、API待ち時間と混ぜない。

## 実配送画像

[画像対応と選択JSON](crop-context-frames.json)。[修正なしの初期画像](crop-context-frames/before-control.png)と[操作契約ありの初期画像](crop-context-frames/before-actions.png)は同一bytes。新しい画像を追加した介入ではない。

[初回look後](crop-context-frames/after-first-look.png)、[通知画面で次のlookを選ぶ前](crop-context-frames/before-second-look.png)、[次のlook後・停止候補が現れた画像](crop-context-frames/after-second-look.png)。画像の意味理解や人間の視覚を完全再現したという証明ではなく、配送→候補→分布→選択→実操作の観測である。

## 実装・独立検証・保全

実装Aはjev/virtual-beta/attention-observation-context.tsと専用テスト、実装Bはcore/factor replayへの接続と専用テスト。親はconfig/contracts、固定比較・集計・freeze・保全・統合を担当。新しい独立検証担当が別コンテキストでテストと実原本を再計算した。共通runner・UI・依存関係を作り直していない。

親の初期対象回帰134件通過、表現精度修正後の影響範囲17件通過、build通過。独立42件通過・0skip、旧42原本（222要求）も新コードでreplayし、旧foveatedの達成とAPI上限の区別を保った。[独立事前検証](crop-context-preflight.json)、[実原本監査](crop-context-independent-actual.json)、[初回集計再計算](crop-context-independent-analysis.json)、[強化後の集計再計算](crop-context-independent-analysis-v2.json)。最終crop・改ざん・Pages回帰33件（0fail・0skip）とbuildも通過。[親の検証記録](crop-context-parent-verification.json)。全体suiteの合格は主張しない。

事前レビューではbadgeが省略可能な型に対し、初期の説明が無条件にbadgeを要求していた点を修正。実装の規則に合わせ「提供される場合」に限定した。未使用の初期freezeは残し、実行版freeze-v2を別保存した。集計テストのnullable型エラー、独立テストの「達成＝終了理由OBJECTIVE_SUCCESS」という期待違い等も実データに合わせて修正・再検証し、失敗記録を保存した。テストの無効化や失敗から成功への付け替えはしていない。

実行sourceHash **c9a64e1f0ebe75539e346dac6b0b83cf4441c2258085a9baa2ef299a299bdd4c**、197ファイル、実行時revision7f35def＋今回の変更。[実行バイト列とfreeze](crop-context-source-c9a64e1f.zip)、[driver・解析器・診断器の実バイト列](crop-context-producers.zip)。Gitの改行正規化と区別する。実行中actor変更0。過去13,239ファイルをハッシュだけで照合し、人間記録の内容は送信していない。

原本・PNG・traceはreports/crop-stuck-2026-11-10/live-r1、最終集計はanalysis-r2（r1も保持）。失敗した対照も保持する。

統合前の独立レビューで集計器の要求ID重複と台帳の試行・条件・source照合不足を検出し、拒否規則と改ざん回帰テストを追加した。attention比較はobservationContextだけを除外し、他の注意設定を保持する。元データは変更せず再集計し、12試行60要求と結果は一致した。Pagesはmaster pushによる自動公開を外し、既存fixブランチと手動起動を維持した。

[ローカル比較ビューア](http://127.0.0.1:4183/)では12試行の操作・画像・分布・注視契約を確認できる。Chromiumで修正ありの詳細と3画像の表示を確認。

## 実行方法

プロジェクトrootで実行。単batchは4条件、最大48要求。既存台帳・outを上書きしない。別反復はseed9002.json／seed9003.jsonを別台帳で使う。

```powershell
$budgetFile = 'reports/my-crop-context-budget.json'
if (Test-Path -LiteralPath $budgetFile) { throw '既存台帳を上書きしないでください' }
@{schemaVersion=1;status='APPROVED';phase='my-crop-context';newMaximum=48;perRunMaximum=12;used=0;attempts=@()} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $budgetFile -Encoding utf8
npm run experiment:virtual-beta -- --comparison-plan experiments/virtual-beta/crop-context-v1/seed9001.json --phase-budget $budgetFile --persona experiments/persona/clear-notifications-v1/a.json --env-file E:/ChatGPT/Ux_test/.env --out reports/my-crop-context-run
node --import tsx --test --test-concurrency=1 tests/crop-observation-context.test.ts tests/crop-context-runtime.test.ts tests/crop-context-config.test.ts tests/crop-context-protocol.test.ts tests/crop-context-analysis.test.ts tests/crop-context-independent.test.ts tests/crop-context-analysis-independent.test.ts
npm run build
node --import tsx scripts/analyze-crop-context.ts --phase reports/crop-stuck-2026-11-10/live-r1/phase.json --out reports/my-crop-context-analysis
```

解析は保持された原本が必要でAPIゼロ。新規独立テストのsource-freeze検査はCROP_CONTEXT_PREFLIGHT_FREEZEを明示した場合のみ実施し、通常cloneでは理由付きskip。runtime検査は動く。モックと実Jevの結果を混同せず、保存入力の直接再送も行っていない。

## 次の範囲

今回の根拠は1画面・1目的・1Persona・各3反復。改善を操作候補リスト単体と規則文単体へ分けた効果、別配置・別サービス・Persona間の差、人間との一致は未検証。次はactions-v1を固定して別課題へ移し、観察可能性と操作可能性のズレを検証する。可視ラベルとクリック可否の対応はこのPoCのツール契約であり、人間の部分的なボタンへのクリック能力を校正したものではない。
