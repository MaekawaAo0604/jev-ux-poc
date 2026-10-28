# 不明点と副作用を判断へ渡す実装と実Jev確認 — 2026-10-28

観察から「何が不明か・操作の予想結果・目的全体の達成状況」を評価し、その状態を行動選択へ渡す部品を実装した。実Jevで、案内を探して取得し、内容に対応する操作を選んで完了した1例を得た。別の1件は案内を見ずに正解を押したため、同じ設定で安定して情報を探す段階には達していない。

今回追加したのは既存のTypeScript runnerへの任意の二段階判断である。モデルを変更したり、正解位置や操作手順を教えたり、間違いそうな候補を除外したりはしていない。全8試行を保持し、実APIは新規承認32要求のうち31要求。前フェーズの47/48要求は別の台帳のまま保持した。

## 基準・分担・変更範囲

開始基準は `a064e98c22858f256c66e8f0353aa54949075bcf`、その製品固定版は `e13a3be`。前回の全体回帰708件、705成功・失敗0・skip3を引き継ぎ、cleanな隔離worktreeで `feature/virtual-beta-information-state` を作成した。元の `E:\ChatGPT\Ux_test` は変更していない。

親が共通の型・config・core・CLI・API境界・replayの初期接続・比較設定・予算・統合を担当。`information_state` サブが `jev/virtual-beta/deliberation.ts` と専用テスト・仕様、独立指摘後のreplay修正を担当した。`information_analysis` サブが `runner/deliberation-analysis.ts` と解析テストを担当した。別の新しい `information_verify` サブが製品を変更せず、独立テスト、実ブラウザー、保存された実モデル結果、全体回帰を検証した。

主要ファイルは `jev/virtual-beta/deliberation-contracts.ts`、`deliberation.ts`、既存の `contracts.ts/config.ts`、`runner/virtual-beta-core.ts`、`virtual-beta-evaluator.ts`、`virtual-beta-replay.ts`、`virtual-beta.ts`、`deliberation-analysis.ts`。依存・ロックファイル・UI fixture・既存のPersona/Charter・samplerは変更していない。

- 初版固定：`b4d6a36d7228d71c6b2f79e12a250c21a1c0871c`。source hash `6321583c95843cd5b7da84f1518d24a467668b004cc355ff14653c8658dc2111`。従来方式と状態提示のみの各2試行を実行した。
- 最終製品固定：`6b3c418baf8bb89496ae3ce023cfb76586aec356`。source hash `c18306347c31b0e511feb619e2e9145d2485d0ff717625c1431d7e2cae5f6641`。候補説明への評価提示と可視対照を各2試行実行した。replayの画像参照照合も修正した。

版を混ぜて成功率の検定は行っていない。この後の最終記録コミットは製品を変更しない。

## 判断部の仕様

`BetaConfig.deliberation` を省略すると従来の1要求/判断を維持する。明示的に無効化した場合も、従来の行動リクエストと同一であることを独立ブラウザーテストで確認した。

```json
{
  "state": {"enabled": true, "memoryCapacity": 3},
  "deliberation": {"enabled": true, "memoryCapacity": 3, "candidateEffects": true}
}
```

有効時は、通常の各判断で次の2要求を行う。両方を同じAPI・期限上限に数える。

1. 実際に渡したcrop画像と記憶画像だけから評価する。知識はsufficient/insufficient/conflicting、目的はsatisfied/unsatisfied/uncertain、各UI操作の予想結果はadvances/neutral/conflicts/unknown。根拠は添付済みの観察IDまたはnoneだけとする。
2. 評価状態を `userState.deliberation.assessments` へ保存し、同じ画像とともに通常の行動選択へ渡す。`candidateEffects:true` なら同じ評価を各候補の説明にも付加する。候補キー・順序・元ラベルは保持し、確率の変更・候補除外・注視の強制・doneの自動拒否は行わない。

最初の実測では状態に入れただけでは行動と整合しなかったため、候補説明への提示を追加条件として実装した。これは状態・候補説明・判断質問の変更を含む方策条件であり、記憶だけの効果とはしない。

評価は `kind:model-assessment-not-fact` の自己申告で、事実や内部判断の完全な記録ではない。モデルの確率も人間の行動頻度ではない。根拠noneの断定はunknown/uncertainへ落とし、変更を `NO_ADMITTED_EVIDENCE` として保存する。観察IDを付けただけで内容の正しさが保証されるわけではない。

保持する評価は1〜8件で設定でき、根拠となった画像が実際のユーザー記憶から消えると評価も消える。監査用DOM・全画面・正解対応・oracle・私的な変更回数は判断へ渡さない。固定特性のPersona、探索目的のCharter、動的な評価状態、独立した実行監査を分けたまま維持する。

評価要求・応答・分布・参照画像・入力hash・API数・時間は各stepの `deliberation` に、通常の行動判断は既存フィールドに保存する。評価だけで上限に達した場合、次の行動要求やUI操作を始めない。APIエラー、不正分布、主観的完了、独立oracle、上限終了を区別する。goal/userのbehavior設定も維持し、ユーザー再現モードだけを自動で目標優先に変更する処理はない。

詳細は [deliberation.md](deliberation.md)、計画・事前の比較条件と変更理由は [実施計画](../superpowers/plans/2026-10-28-information-state.md) と `experiments/virtual-beta/information-state/{protocol,followup-protocol}.json` を参照。

## 実Jevの全結果

Jev1.14.0、初心者A、同じ表示維持の目的、reference UI、反転対応A/B、crop640×480、初期注視640,450、観察記憶3、goal/argmax、同一seed・基準日・viewport・locale・フォント、fresh context、並列1で実行した。可視対照だけ初期注視を960,675へ変更する。自律条件は4判断・8API/試行、注視3・UI4・90秒。基準方式は1判断1要求なので最大4要求、二段階方式は最大8要求となる。

個別の入力・操作・自己評価・画像参照・結果・コード版は [information-results.json](information-results.json) に保存した。大きい画像・trace・実分布・生応答はignoredの `reports/information-state-2026-10-28/` に保持する。

従来方式baselineは5要求。対応AではB→A→doneで表示を変えてしまい目的失敗、対応BではB→doneで目的成功。両方注視0、SUBJECTIVE_DONE。目的成功1/2。

状態提示のみのtwo-stageは10要求。対応AではA→doneで目的成功、対応BではA→B→doneで表示を変えてしまい目的失敗。両方注視0、SUBJECTIVE_DONE。最初の自己評価は両方とも情報不足・両操作の結果不明だった。それでもAを押した。対応Bの最後では目的unsatisfiedと評価しながらdoneを選んだ。追加した状態が実際の行動リクエストへ届いたことと、その内容に沿った選択ができたことは区別できる。

候補説明へも提示したtwo-stage-candidatesは12要求。対応AはA→done、注視0、4要求で目的成功。これは案内未取得の正解なので、案内を使った選択には数えない。対応Bは左上を見る→右下を見る→B→done、注視2・UI1・8要求で目的成功。どちらもSUBJECTIVE_DONE。

可視対照exposedは4要求。案内が初めから見える条件でA/Bをそれぞれ正しく選び、表示を変えず通知を停止した。各1判断・2要求なのでDECISION_LIMITで終了し、主観的doneは取得していない。自律取得の成功には加算しない。

合計8試行、5+10+12+4=31要求。内訳は評価13要求と通常の行動選択18要求、実クリック10回、注視2回。全31要求が1実試行でOK。新規枠の残り1要求は使っていない。以前の47要求と合算して台帳をリセットする操作はしていない。

## 実際に成立した連鎖

代表例は `reports/information-state-2026-10-28/two-stage-candidates/semantic-02-reference-b-r1/`。4つの判断、計8要求である。

1. 初期画像にA/B両ボタンが見え、両候補も選べるが、意味を記した案内は画像外。自己評価はinformation insufficient、両操作unknown。実選択はlook_0（320,225）。UI操作は発生しない。
2. 左上の画像でも自己評価は不足。ボタンも見えないため、この観察ではクリック候補が視覚境界により存在しない。実選択はlook_3（960,675）。正解位置を指示したリクエストは送っていない。
3. 右下の実入力画像 `input-3.png` に「設定Bはメール通知の停止、設定Aは画面表示の切り替え」という案内が入る。A/B両ボタンと番号も見え、両方の候補がある。自己評価はsufficientに変わり、同じ画像o3を根拠にA=conflicts、B=advancesとなる。行動選択はBで、実クリックもB。表示は標準のまま、メールが停止する。
4. 次の実画像を評価し、目的satisfied、行動done。独立oracleも「メール停止かつ表示変更回数0」でtrue。

注視中の監査用全画面hashは変わらず、画像の見える範囲だけが変わった。初期と最初のクリック時には、A/Bの両方が実際に候補として提示された。最初の正解クリック前にA/Bを安全フィルタで片方だけにする処理はない。途中で左上を見た時には両ボタンが見えなくなっており、全時点でクリック可能だったとまでは主張しない。

最終A/Bの初期評価リクエスト、採用した評価状態、初期行動リクエストのhashはそれぞれ同一だったが、実選択は「Aを押す」と「左上を見る」に分かれた。状態提示のみのA/Bでも初期入力は同一で、行動分布は異なった。APIの生成seedは固定できていない。したがって、モデル出力のばらつきと提示方式の効果を分離した改善の推定はまだできない。

この例は「自律的な注視→新しい案内の可用化→その案内と整合する評価→操作→独立した成功判定」の成立事例である。内部で人間と同じ理解をしたこと、常にこの経路を選ぶこと、候補への提示が改善の原因であることまでは証明しない。

元の12試行プロトコルはAPI4要求以下など別の条件を固定していた。今回の `semantic-comparison.json` では、その厳しいプロトコルに対して不適格でscore0・正確検定unavailableと表示される。代表例の `cueSupportedFirstChoiceCorrect:true` は観察上の連鎖の判定であり、古いscoreを成功へ書き換えた結果ではない。旧12試行も負の結果のまま残している。

## 独立検証・修正

独立検証で、保存された評価の記憶画像参照が実アセットへ結び付いていなくてもreplayがverifiedを返すP2を再現した。実際の入力から情報が漏れた事例ではなく、保存監査の整合性検査の不足だった。

担当サブへ戻し、参照先画像の存在、画像hash、現在の観察identity、同一IDの衝突を検査するよう修正した。異なる観察IDが同じ画像bytesを使う正しいケースは維持した。独立RED2件→修正後GREEN、関連の既存runner/replayも再検証した。最終製品6b3c418に含めた。

最初の全体回帰は752件中747成功・2失敗・skip3だった。失敗は既存の予約待ち/未送信精算テストで、Vite初期読み込みが試験用3秒を超えてreserve自体に到達していなかった。保存結果はelapsed3156ms/decisions0/used0と、elapsed3124ms/DEADLINE_BEFORE_INFERENCE/used0。期待する境界を試せていないことを確認した。製品を変えず、実際の永続reserve完了を確認した直後だけテスト内の単調時計を期限後へ進めるfixtureへ修正し、同じ「HTTP0・実要求0・永続debit1・精算失敗はAPI_ERROR」という検証を保つ。テスト修正だけを `00a4ad07b0717682ce3d8652b58b4ac8c5a5330c` に固定し、担当の関連25件、独立の該当2件、再build・型チェックが成功した。実探索コードとsource hashは6b3c418/c1830634のまま。最終の全体回帰は752件中749成功・失敗0・skip3、exit0（685800ms）。skipは明示フラグが必要な実OCR統合・live composite・live semanticsで、実施済みとは扱わない。最終build・型チェックもexit0。初回REDを残したうえで、修正後の全体確認まで完了した。独立の詳細とログは [information-independent-review.md](information-independent-review.md) と `reports/information-state-2026-10-28/verification-*`。検証サブの実API要求は0である。

TDDでは新runnerの6件を最初に失敗させてから接続した。期限の追加テストは、Viteの初回読み込みだけで試験用2秒を使い切り、評価要求へ到達していなかった。実測elapsed2842ms/API0/steps0を確認して試験用予算を6秒へ変え、評価要求のtimeout+30msまで応答を遅らせても第二段階もクリックも始まらないことを確認した。製品の90秒制限や受入条件は緩めていない。

## 実行方法

Node22.12以上（または20.19系）、既存のnpm依存とPlaywright Chromiumを用意する。以下のローカル検証は実APIを使わない。

```powershell
Remove-Item Env:JEV_LIVE_COMPOSITE,Env:JEV_LIVE_SEMANTICS,Env:RUN_OCR_INTEGRATION -ErrorAction SilentlyContinue
npm run build
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test --test-concurrency=1 tests/*.test.ts

# 両段階の実ブラウザー疎通。対応を知るスクリプトなので性能の証拠ではない
npm run experiment:virtual-beta -- --mock --semantic --preserve-display --repeat 1 --order-seed 313977649 --conditions information-candidates --ui reference --config experiments/virtual-beta/information-state/candidates.json --charter experiments/persona/charter-semantic-preservation.json --max-total-api 16 --out reports/information-mock-new

# 評価・画像根拠・分布の保存記録を検証。APIも操作も再送しない
npm run replay:virtual-beta -- reports/information-state-2026-10-28/two-stage-candidates/semantic-02-reference-b-r1
```

通常runnerで実施したコマンドは以下。使用済み出力先を再利用したり、予算JSONをリセットしたりして再実行しない。次の実実験には別の明示承認枠が必要。

```powershell
npm run experiment:virtual-beta -- --semantic --preserve-display --repeat 1 --order-seed 313977649 --conditions information-baseline --ui reference --config experiments/virtual-beta/information-state/baseline.json --charter experiments/persona/charter-semantic-preservation.json --phase-budget reports/information-state-2026-10-28/api-budget.json --max-total-api 8 --env-file E:\ChatGPT\Ux_test\.env --out reports/information-state-2026-10-28/baseline

npm run experiment:virtual-beta -- --semantic --preserve-display --repeat 1 --order-seed 313977649 --conditions information-two-stage --ui reference --config experiments/virtual-beta/information-state/two-stage.json --charter experiments/persona/charter-semantic-preservation.json --phase-budget reports/information-state-2026-10-28/api-budget.json --max-total-api 16 --env-file E:\ChatGPT\Ux_test\.env --out reports/information-state-2026-10-28/two-stage

npm run experiment:virtual-beta -- --semantic --preserve-display --repeat 1 --order-seed 313977649 --conditions information-candidates --ui reference --config experiments/virtual-beta/information-state/candidates.json --charter experiments/persona/charter-semantic-preservation.json --phase-budget reports/information-state-2026-10-28/api-budget.json --max-total-api 16 --env-file E:\ChatGPT\Ux_test\.env --out reports/information-state-2026-10-28/two-stage-candidates

# 実施前に残>=4を確認した条件付き可視対照
npm run experiment:virtual-beta -- --semantic --preserve-display --repeat 1 --order-seed 313977649 --conditions information-exposed --ui reference --config experiments/virtual-beta/information-state/exposed.json --charter experiments/persona/charter-semantic-preservation.json --phase-budget reports/information-state-2026-10-28/api-budget.json --max-total-api 4 --env-file E:\ChatGPT\Ux_test\.env --out reports/information-state-2026-10-28/exposed
```

`manifest.json` が版・設定・Persona・Charter・環境・割当・予算、各runの `result.json/step-N.json` が評価と操作、`input-N.png` が実入力、`audit-N.png` が別の全画面監査、`trace.zip` が実ブラウザー記録。`deliberation-comparison.json` は評価数・API内訳・自己評価と実行の時系列、`semantic-comparison.json` は案内可用化と元プロトコルの適格性、`comparison.json/csv/html` は共通集計を出す。

## 残る範囲

人間の操作計測は指定どおり後日。今回のgoal/argmax条件や追加の候補説明を、人間の行動予測モデルとして検証したとは扱わない。実時間はAPI待ちとUI処理に分け、未校正のユーザー時間はnullのままである。目標は達成例を1つ作ることだけではないため、次は以下の3件を別タスクとして扱う。

1. 最終版を固定した反転対応の反復実験。自律取得の再現性と、同一入力に対するモデル分布のばらつきを測る。今回のAのblind正解や可視対照を自律取得へ加算しない。
2. 評価と選択の不整合を測る。今回の「不足→即クリック」「目的未達→done」を回帰課題にし、同じモデル自己評価が候補説明にある/ない条件を十分反復する。正解位置の指定やdoneの自動書換えで隠さない。
3. 用意済みの記録器で人間データを取得する。全画面とcropの観察条件の差を定義し、利用者の制約理解・読んだ情報・操作・離脱を比較する。較正と未見課題の評価は分ける。
