# 注視判断の継続偏重を切り分けて修正した結果

2026-11-10 JST。**周辺ブラー（foveated）では、修正後3試行とも通知画面で注視を選び直し、新しく見えた停止ボタンを操作した。cropは3試行とも初手continue→STUCKのままで、未解決。** 同じ画面・Persona・目的で、まず24試行、追加対照18試行、合計42試行・実Jev222要求を実行した。人間の体験を再現したという結論ではない。

## なぜ継続ばかりだったか

[前回原本の独立診断](attention-repair-diagnostics.json)で、次を区別した。

1. **継続の意味が曖昧だった。** 前のcontinueは「現在の視野を維持する」ではなく「次の通常判断へ任せる」。その通常判断にはlookが残っていた。ON6初手すべてがcontinue→通常look_3だった。したがって36continueを36回の注視維持意図とは呼べない。これは確認した設計欠陥だが、モデルの内面の理由を確定したものではない。
2. **見る必要と見る場所が同じ分布だった。** continue1候補とlook4候補を直接argmax比較していた。ただし保存分布のlook合算がcontinueを上回るのは4/36件だけ。これだけで全36件は説明できない。
3. **注視判断なのに最上位の目的はUIの最終目標だった。** 注視だけの役割は質問文に置き、input.goalは通知停止のままだった。これは入力設計の仮説として別対照にした。後述のfoveatedでは、同じ階層方式でtaskFrameだけを変えた条件が0/3から3/3の注視切替になった。cropでは解決せず、単独の普遍的原因とまでは断定しない。
4. **配送漏れ・強制補正は根拠なし。** 旧114応答のimage bindings、260asset照合に不一致なし。36選択はモデル提案と一致し、候補除外0。容量3の記憶に操作と対応画像が渡っていた。通知再訪30件中、監査上で記憶内の過去観察が同じ画面に対応したのは18件、同一画像hashもあったのは8件。画面タイトル自体をモデルへ渡したという意味ではない。モデルが記憶を理解したかは未測定。

## 実装した修正

既存の画像変換・DOM遮断・候補化・runner・UI実行・sampler・予算台帳を流用した。正解の場所、停止ボタンの座標、正解経路、oracle、監査DOM、過去の人間記録はモデルへ渡さない。注視点は従来の一般的な四分点のまま。backや再訪を禁止せず、注視の自動リセットも行わない。

- `exclusive-flat-v2`：従来と同じ5候補だが、continue後は現在視野の非look操作だけを提示する。注視を後回しにする重複を除く。
- `exclusive-hierarchical-v2`：継続／inspectの二択と、inspect時に使うgazeTargetを別質問にする。同じ1要求で回答し、gateと注視先の分布・選択を別々に保存する。inspectならlookのみ実行し、次の判断で新しい画像を取得する。
- `taskFrame: attention-v1`：公開情報のprojectionを変えず、最上位goalを「次の注視を判断する目的」にする。利用者の元の目的はendUserGoalとcharter.goalへ残す。通常操作のgoalは元のまま。画像・候補・ペルソナ・記憶は対照と同じ。

利用設定例（既存のimage-state／look有効profile内）:

```json
"attention": {
  "enabled": true,
  "policy": "exclusive-hierarchical-v2",
  "sampling": "domain-separated-v1",
  "taskFrame": "attention-v1"
}
```

attentionなしはOFF、enabledだけは前の方式。taskFrameは階層方式だけに許可する。未知の設定や不正分布は実行前または判断時に検出し、正常な選択に見せかけない。

## 別に見つかったサンプラーの不具合

gateとgazeを同じseed・同じdrawIndexで初期化していたため、sampleモードでは条件付き注視分布が歪んでいた。[修正前の独立再現](attention-repair-sampler-before.json)ではgate(.8,.2)・注視4点均等でも、10,000seed中2,025inspectが全てlook_3だった。**今回の実モデル比較は全てargmaxなので、この不具合は222要求の継続偏重の原因ではない。**

修正はgate／gazeに異なるdomainから導出したseedを使い、通常操作はroot seedを保つ。rootと導出seedを記録し、replayで再計算する。新policyのsampleではsamplingタグを必須にし、タグなしの誤った組み合わせを拒否する。従来方式は比較用として維持し、旧argmax原本も検証できる。

[独立した修正後再現](attention-repair-sampler-after.json)では10,000seedの1,927inspectが[478,454,497,498]へ分かれた。実actorのモック512seedでも109inspectが[27,35,24,23]。これは実装の条件付き抽選を検証したもので、人間の頻度との校正ではない。

## 比較条件と実測

[第1段階のstudy](../../experiments/virtual-beta/attention-repair-v2/study.json)はOFF／前の方式／排他的flat／排他的階層×crop・foveated×各3反復、24試行。独立した注視目的はまだ付けない。UI6/look4/判断8/API12/150秒、6batch各48要求以内、並列1・retry0。実138要求。

結果はOFFが往復継続、前の方式もcontinue後に通常lookを1回してから往復。排他的flat・階層は12件すべて初手continue→STUCKだった。**ループ件数0を改善とは数えない。動かずに停止しただけだった。** [全24件](attention-repair-phase1-results.json)、[phase](attention-repair-phase1.json)、[独立原本検証](attention-repair-actual-v1.json)。

[第2段階のstudy](../../experiments/virtual-beta/attention-task-frame-v1/study.json)はOFF／階層・元のgoal／階層・注視goalの3条件×2視覚×各3反復、18試行。主比較はOFFと修正後、副比較は同じ階層方式でtaskFrameだけを変更。ON双方に同じsamplingタグを使い、全条件argmax。UI6/look4/判断8/API8/150秒、6batch各24要求以内、実84要求。先の138＋追加最大144＝282で総上限288を守り、実際の合計は222だった。

UI、1280×900、初期fixation(640,450)、初心者A・専用PC、image-state、記憶3、goal方策を固定し、各試行は新しいcontext/state/samplerで初期化。初期fingerprintは各段階内で一致した。seed6001〜3／7001〜3は対応割当用で、外部モデルのseedは制御していない。条件順は事前に巡回させたが完全な順序効果の除去や統計的有意差は主張しない。

[第2段階の全18件](attention-repair-results.json)、[判断ごとの境界と分布](attention-repair-timeline.json)、[phase](attention-repair-phase2.json)、[独立原本検証](attention-repair-actual-v2.json)。

- foveated OFF：3/3で設定→backを反復。各6UI、初回look1、UI_ACTION_LIMIT。
- foveated 階層・元のgoal：3/3が初手continue→STUCK。UI0/look0。
- **foveated 階層・注視goal：3/3で通知画面に入った後にinspectを選び、別の領域を観察してe3を新しく候補化し、停止操作を実行。** 各UI2、look2／2／3。2件はSUBJECTIVE_DONE。残り1件は停止済みでobjective=trueだが最終確認前にAPI_LIMIT。3件の正常完了とは数えない。
- crop：修正前後とも問題が残る。OFFは往復、元のgoal・注視goalの双方が各3/3で初手continue→STUCK。改善なし。

同じAPI上限でも追加判断に要求を使うため、観察機会は条件間で違う。共有prefixと実操作、上限の種類を併記する。成功率だけを成果にしない。

## 何が変わった動きか

foveated修正後2件は `look_3 → 通知設定 → look_0 → 停止 → done`。1件は通知設定後に`look_1`を試し、候補が増えず、さらに`look_0`へ移ってから停止した。正解地点を毎回指定した経路ではない。foveated・注視goal3件の計7回の実注視はUI操作0、次のfixation一致。6回で候補が増え、look_1の1回は追加0だった。通知画面でlook_0後にe1/e2/e3が現れた。

比較例の実配送画像は[対応JSON](attention-repair-frames.json)と[注視前](attention-repair-frames/framed-notification-before-look.png)／[新しい視野](attention-repair-frames/framed-new-view-before-stop.png)。監査画像とモデル入力を混同しない。

## 分担・検証・版

親はcontracts/config、固定protocol、比較driver・解析、統合、viewer、文書を担当。実装Aはattention.tsと専用テスト、実装Bはcore・strict replay・generic replay・attention-sampling.tsと専用テスト。別コンテキストの検証担当がテスト、原本、画像、分布、実操作、会計を独立に確認した。依存追加・学習・既定ブランチ変更なし。

親の最終対象回帰129件は129通過、独立の第2事前検証は67件通過・build通過。旧12＋第1段階24の36原本を新コードでreplayした。[事前検証1](attention-repair-preflight-v1.json)、[修正後の事前検証2](attention-repair-preflight-v2.json)。[集計と時系列の独立再計算](attention-repair-independent-comparison.json)、[原本の保全](attention-repair-independent-preservation.json)、[独立レビュー](attention-repair-independent-review.json)。追加の解析器改ざんテスト22件も通過した。全体suiteの合格は主張しない。過去の固定sourceを現行treeへ要求する原本依存テストなど、今回の対象外の検証範囲は残る。

独立検証で見つかったsamplerの不具合は、失敗テストを保存して修正・再検証した。集計器の4条件中2条件しか設定同一性を比較しない不足も全条件照合へ修正した。テストfixture側の「同じ注視点への再訪不可」「root seedと導出seedが同じ」という誤った期待は製品を曲げずに訂正し、初期失敗と修正理由を保存した。

第1実行sourceHashはa997e3ac…・195ファイル、[実バイト列](attention-repair-source-a997e3ac.zip)。第2実行は**44ea22fb53a3da5ecb17e3ee3c3407119f44b28ad8d4c656558c93352201c12b**・196ファイル、[実バイト列](attention-repair-source-44ea22fb.zip)。[解析器・driverの実バイト列](attention-repair-analysis-source.zip)、[前回原本の診断器](attention-repair-diagnostic-source.zip)。両方とも実行時revision5eb463e＋今回の変更。Gitの改行正規化と区別し、実行中actor変更0。原本・traceはreports/attention-repair-2026-11-10/live-r1／live-r2、集計はanalysis-r1／analysis-r2に保持する。

## 再実行

プロジェクトrootで実行する。単batchは3条件・最大24要求。既存の台帳やoutを上書きしない。他の反復はseed7002／7003の別planを使う。

```powershell
$budgetFile = 'reports/my-attention-frame-budget.json'
if (Test-Path -LiteralPath $budgetFile) { throw '既存台帳を上書きしないでください' }
@{schemaVersion=1;status='APPROVED';phase='my-attention-frame';newMaximum=24;perRunMaximum=8;used=0;attempts=@()} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $budgetFile -Encoding utf8
npm run experiment:virtual-beta -- --comparison-plan experiments/virtual-beta/attention-task-frame-v1/foveated-seed7001.json --phase-budget $budgetFile --persona experiments/persona/clear-notifications-v1/a.json --env-file E:/ChatGPT/Ux_test/.env --out reports/my-attention-frame-run
node --import tsx --test --test-concurrency=1 tests/attention-policy-v2.test.ts tests/attention-engine-v2.test.ts tests/attention-stream-v2.test.ts tests/attention-task-frame.test.ts tests/attention-frame-protocol.test.ts tests/attention-repair-config.test.ts tests/attention-repair-frame-config.test.ts tests/attention-repair-independent.test.ts
npm run build
node --import tsx scripts/analyze-attention-task-frame.ts --phase reports/attention-repair-2026-11-10/live-r2/phase.json --out reports/my-retained-frame-analysis
```

解析の最終行は保持した実原本が必要で、APIを呼ばない。専用テストの原本依存部分は実原本のないcloneでは理由付きskip、runtime部分は実行する。モックの確率テストと実Jev222要求を混ぜない。秘密値をログに出さず、保存済み入力の直接再送や人間のログ送信はしていない。

[全42試行のローカル一覧](http://127.0.0.1:4182/)は「全試行」で両段階を確認できる。異なるsource・configを自動で同一グループへまとめない。各判断で実配送画像、状態、gate／gaze／通常行動の分布、選択、実操作、終了理由、traceを確認できる。

## 残る課題

cropの継続偏重は未解決。現在視野で可能な操作と、その見込みを注視判断へどう伝えるかを別対照で調べる必要がある。STUCKなら機械的に移動させる等の救済は今回入れていない。次は、今回の注視目的を固定したまま別配置・別課題への移行と、cropでの現在視野の評価を優先する。サンプル頻度の人間との校正、Persona差、人間の動きとの一致、UX問題検出力は未検証。API待ち時間とモデル上のユーザー時間は別で、後者と人間時間は今回null。
