# Phase 2 診断

担当範囲は保存済み実行の分類と分析コードである。
分析担当は新規 API 要求、資格情報の読取り、保存入力の再送を行っていない。
親が実施した今回の通常 runner 診断 23 要求と、前フェーズの保存済み 23 要求を分けて記述する。
今回の実モデル診断対象は ff372ab であり、以後の分析変更を含む最終固定版そのものの再実行ではない。

## 対象版

- 今回の開始基準は `5f7051d`。分析モジュールは `runner/virtual-beta-analysis.ts`、回帰は `tests/virtual-beta-analysis.test.ts`。
- 今回の通常 runner 診断は `reports/beta-next-phase/live-diagnostic/manifest.json`。版は `ff372ab34384803931f86f59198ff7ebc445724f`、モデルは `jev-1.14.0`、sourceHash は `3682d0047b86fd95de78f2b1c5837b45475eb60d87077f4de25aae62fa25ac1d`。
- 初回ログは `reports/virtual-beta-live-2026-10-27/manifest.json`。記録された版は `f09047e45ab13fe891a3686c58c310b2d03f7f82`、モデルは `jev-1.14.0`、sourceHash は `25086cf04ed29b8eb952767e31a806a86be244840878c77bfc861d4fb79ef8b6`。
- v2 ログは `reports/virtual-beta-live-v2-2026-10-27/manifest.json`。版は `5b336d4cd93d70a3869444206a6c802a3189e314`、モデルは `jev-1.14.0`、sourceHash は `37c746b9e777dc9d42b1b111f759898e5e9faad48623e11af17489b6adbd8a0e`。

各 manifest の版は異なる。
いずれも独立指摘修正後の固定版 `9218366` や今回の開始基準と同一視しない。

## 今回の通常 runner 診断

今回の 4 条件は viewport 1280×900、seed 20261027、API 上限 12、判断上限 12、注視上限 4、UI 操作上限 6 の共通条件で実行された。
条件ごとの初期 fingerprint は `7852be83a4cca94b795aa2519dfaaa2c6accde9ebde07d72e6e0cd72a83f8908` で一致する。
4 件とも final screenshot は RECORDED、最終 oracle は OK、validForComparison は true であり、分析関数は artifact-valid と分類した。
この分類は保存メタデータに基づき、独立したファイル hash 検証そのものではない。

- current は 3 要求、注視 0 回、UI 操作 2 回。e5、e3、done を選択し、SUBJECTIVE_DONE、perceivedDone=true、objectiveSuccess=true。
- vision は 7 要求、注視 1 回、UI 操作 6 回。look_3、e5、back、e5、back、e5、back を選択し、UI_ACTION_LIMIT、perceivedDone=false、objectiveSuccess=false。
- state は 3 要求、注視 0 回、UI 操作 2 回。e5、e3、done を選択し、SUBJECTIVE_DONE、perceivedDone=true、objectiveSuccess=true。
- combined は 10 要求、注視 4 回、UI 操作 3 回。look_3、e5、look_3、back、reread、e5、reread、look_3、look_3、stuck を選択し、STUCK、perceivedDone=false、objectiveSuccess=false。

合計は 23 要求である。
今回の承認枠は親が管理する 48 要求で、このバッチ後の残りは 25 要求である。
これは前フェーズの消費数に加算して今回の承認を拡大するものではない。
このバッチは UI 版指定がなく manifest の uiVariants は [null] であり、事前定義 ROI も記録していない。
ROI の初回注視は not-recorded とする。

vision と combined の判断 1 から 2 では、後述する旧 v2 と同じ raw source のまま注視を移し、新たに提示された e5 をクリックした。
combined の判断 3、8、9 の look_3 は現在と同じ座標 (960, 675) への再注視であり、各直後の判断と raw source が一致し、新しい eN 候補は増えていない。
通知設定画面の e3 の対象矩形は (330, 440.0625, 173.3125, 50)、鮮明領域の左端は x=480 なので、対象全体を含むという候補提示条件を満たしていない。
これは audit.targets と vision.clearRect に基づく幾何的観測であり、モデルが何を読んだかの判定ではない。

combined の最後の判断 10 では、モデル提案は reread（raw 0.42）だが、実選択は stuck（raw 約 0.20）である。
直前に注視数が 4 回へ達したため、LOOK_BUDGET_EXHAUSTED により look_0、look_1、look_2、look_3 を除外した。
除外した raw 確率は順に 0.04、0.09、0.05、0.13、合計 0.31 である。
残る 0.69 を再正規化した結果、reread は約 0.608696、stuck は約 0.289855 となり、draw 0.9088529823347926 により stuck を選択した。
証拠は combined-1/step-9.json、step-10.json、および result.json である。

実際の終了理由は STUCK のまま保持する。
同時に、終端分布から正の確率質量を予算上限で除いたことを terminalBudgetInfluenced=true と記録する。
この観測を、予算の影響がない自主的離脱とも、上限がなければ別の行動を取った証明とも扱わない。
vision の UI_ACTION_LIMIT は明示的な予算打ち切り、combined は予算フィルタの影響を受けた STUCK として区別する。

## 前フェーズの実行分類

初回ログは合計 11 要求である。
current は 3 要求で主観的終了、記録上の objectiveSuccess は true。
vision は 6 要求で API_LIMIT、記録上の objectiveSuccess は false。
state と combined は各 1 要求で HTTP 400 の API_ERROR となり、基盤障害として比較から除く。
エラー内容だけでは HTTP 400 の詳細原因を特定できない。

v2 ログは各条件 3 要求、合計 12 要求である。
current と state は、e5、e3、done の順で操作し、主観的終了かつ記録上の objectiveSuccess は true。
vision は注視 1 回、UI 操作 2 回、combined は注視 2 回、UI 操作 1 回で API_LIMIT に達し、記録上の objectiveSuccess は false。
両条件の終了は予算による打ち切りであり、自主的離脱や確定した能力不足に分類しない。
前フェーズ合計は 23 要求となる。

古い result.json には terminalObservation、objectiveAssessment、validForComparison がない。
そのため、基盤エラーが明示された初回の 2 件以外は、終了種別を分類しつつ「監査有効性 unknown」とする。
古い boolean の objectiveSuccess は記録値として残し、現在の最終監査契約を満たした成功とは読み替えない。

## 前フェーズの注視後経路

v2 の vision と combined は、次の同一経路を判断 2 まで記録している。
証拠は各 run の step-1.json、step-2.json と、それらが参照する audit-1.png、audit-2.png、input-1.png、input-2.png である。

1. 判断 1 の注視は (640, 450)、鮮明領域は (160, 140, 960, 620)。提示されたクリック ID は e3、e4、e6 で、e5 は含まれない。モデル提案と実選択は look_3、実行結果は FIXATION_MOVED。
2. 判断 2 の注視は要求どおり (960, 675)、鮮明領域は (480, 365, 800, 535)。判断 1 と 2 の raw sourceSha256 は `bea8c424a1456af4013d4eb99b451db78f00e31565084ab284513839dcb79802` で一致する。
3. 入力画像の hash は `5bc229cc439823e85908c7de09575cb9f36acda396a80cdca0baeea0ff3e0049` から `2774ad3f6c5c84a0cc3b7e4b71a2d1e2c1acd11d4889b310946b5293922fb095` へ変わる。候補は e4、e5 となり、新たに提示された e5 を次の判断で選択し、click e5 を UI_PERFORMED と記録している。

この観測は「方策上利用可能となった情報に続き、それを使ったことと整合する次の選択」を示す。
候補の適格性やモデルの理由説明だけから、文字を認識した、意味を理解した、内部記憶へ定着したとは判定しない。
分析コードの対応表現は `available under policy, next selection consistent with using it` である。

判断 3 は通知設定画面へ移ったため、raw sourceSha256 は `dbd695b776be3bbda208f7c32175dddaedfeb312c96d75ec628cd563c7fd265e` へ変わる。
注視は (960, 675) のままで、提示された eN クリック候補は 0 件である。
vision は back を提案してそのまま選択し、戻る操作を実行した。
combined は back を提案したが、sample で look_3 を選択した。
分布は back が 0.31、stuck が 0.26、look_3 が 0.13、draw は 0.6018468029797077 であり、モデル提案と実選択の相違を分布処理の誤りとは扱わない。
combined の判断 3 後は API 上限で次画像がなく、再注視による新情報の有無は未観測である。
初回 vision では同様の設定画面で back、再入場を繰り返して 6 要求で終了しているが、異なる版の追加観測である。

## 原因の切り分け

1. **必要な領域へ注視が移らない**：今回も判断 1 から 2 では入口側への注視移動を確認した。一方、通知設定画面では vision が戻る操作を繰り返し、combined は同じ look_3 を再選択して別の領域へ移らなかった。選択方策の観測であり、実行器の座標処理の不具合とは確定しない。
2. **注視しても文字や対象を認識できない**：入力画像と後続行動を確認できるが、内部認識は直接測定していない。e5 のクリックは利用と整合する選択であり、文字認識精度や設定画面での認識失敗の測定ではない。
3. **認識できる情報が状態へ渡らない**：combined の状態 revision は判断 10 で 10 となり、過去観測画像の参照を保持する。制約条件の visibleText が空なのは既存契約である。認識した文字を渡し損ねたという証拠はない。
4. **過去情報の不適切な消失や漏洩**：combined の記憶は容量 3 を維持し、最後は o8、o9、o10 の 3 観測を持つ。古い入口画像が容量制約で外れることは契約どおりであり、不適切な消失とは断定しない。容量が再訪行動へどう影響したかは未分離である。観測外情報の漏洩はローカル回帰で別に確認する。
5. **候補生成や分布処理が不適切**：設定画面の e3 全体が鮮明領域へ入らずクリック候補が 0 件となることは、保存した対象矩形と提示条件で説明できる。combined の最後の分布では注視予算フィルタの正の除外質量 0.31 を明示する。モデル提案、フィルタ前分布、フィルタ後分布、sample の選択を保存し、確率的な相違を誤りとは扱わない。
6. **実行器が選択操作を実行しない**：click e5 後に設定画面へ移り、back 後に画面が戻る。combined の再注視直後も要求位置と観測位置が一致する。注視では UI 操作数が増えない。この経路で実行器の誤動作は確認していない。
7. **完了判断と客観結果の接続が不適切**：今回の current と state は主観的 done と最終 oracle の true が一致し、vision と combined は主観的 done=false、最終 oracle=false。4 件とも最終 capture と oracle のステータスを個別に記録している。古いログの欠損監査とは区別する。
8. **確率的選択や自主的離脱**：combined には提案と sample の実選択が異なる判断が複数ある。最後は STUCK だが、注視予算フィルタが分布を変えた状態での選択であり、予算の影響がない自主的離脱とは扱わない。今回 ABANDONED の終了はない。
9. **予算や時間や操作上限**：vision は UI_ACTION_LIMIT。combined は上限終了ではなく、注視上限により候補分布を変更した後の STUCK。旧 v2 の API_LIMIT とも分ける。API の応答時間と runner の経過時間を人間の迷いや思考時間として集計しない。

今回の実モデル経路と保存経路から、根拠付きで修正できる共通製品コードの不具合は確定しなかった。
分析コードへ予算の影響を示す注記と回帰を追加し、候補提示、視覚制約、sampling、実行、終了条件は変更しない。

## 分析コードの契約

analyzeRun(result) はファイル読取りや API を行わず、入力を変更せずに分析値を返す。
artifact-valid は記録された最終監査契約を満たす分類であり、画像ファイルの存在や hash を再検証したという意味ではない。
API、分布、操作、観測、安全停止のエラー、最終 oracle/capture エラー、監査と視覚の source hash 不一致は infra-invalid とする。
監査メタデータがない古い結果は unknown とし、比較可能へ自動昇格させない。
予算打ち切りは監査有効性と独立に保持し、完了例の指標へ混ぜない。

timeline は判断ごとの入力参照、注視、鮮明領域、記憶 revision と各 entry、候補、モデル提案、分布と抽選、実選択、実操作、結果、記録された counter を保持する。
lookEffectPairs は実行済み注視と直後の判断を対応付け、同一 raw source、異なる raw source、証拠不足を分ける。
同一画面でも、次の注視が要求位置と一致したかを別に記録する。
異なる画面の新候補を、注視だけの効果と解釈しない。

budgetInfluence.steps は予算による除外があった判断、各候補と理由、raw と normalized の除外質量を保持する。
選択前に全質量を失った selectionFailure の証拠も同じ形式で扱う。
terminalBudgetInfluenced は、明示的な上限終了、または最終判断で正の予算除外質量を確認した場合に true とする。
最終判断のフィルタ記録がなく、明示的な上限終了でもない場合は null とする。
以前の判断の除外と最後の判断の除外、確率 0 の候補除外も区別する。
この注記は分布の算術的な変化を示し、上限がなかった場合の人間やモデルの代替行動を示さない。

ROI は監査だけの notification-entry と notification-stop を扱い、viewport の矩形に対する注視点の包含と、鮮明領域による対象矩形全体の包含を別々に記録する。
初回の判断番号は記録済み幾何情報に基づき、読み取りや理解を表さない。
対象の右辺と下辺に等しい点は矩形の外、鮮明領域と対象の辺が一致する全体包含は true とする。
保存済み実ログには事前定義 ROI がないため、初回注視は not-recorded とし、後から正解位置を推定して補わない。

## 最小の次実験

旧ログから提案していた上限 12 要求での通常 runner 診断は、今回の 4 条件診断で実施済みである。
combined の最後の分類については、まず今回追加した予算注記を適用すればよく、同じ実行を追加して確定した終了種別を読み替える必要はない。

UI 比較へ進む場合は、親が承認残枠内で選ぶ通常 runner 実行に UI 版と監査 ROI を付け、観測された初回注視と全体鮮明化を収集する。
注視の反復と選択方法の影響を分離する必要が残れば、同じ視覚、状態、候補生成、質問を保ち、選択方法だけを変更する通常 runner の小規模比較を検討する。
各試行の途中では候補や分布が分岐するため、結果差を特定の一判断だけの因果効果とは解釈しない。
保存入力の直接再送は行わない。
単一試行から人間の挙動、成功率、UI の一般的な優劣は推定しない。

## ローカル検証

```powershell
npx tsx --test tests/virtual-beta-analysis.test.ts
```

11 件成功、失敗 0、skip 0。
同一画面と画面変更、欠損監査、oracle/capture エラー、5 種の予算上限、提案と抽選の相違、ROI 幾何、入力不変性を確認した。
STUCK の予算フィルタ有無、明示的 API_LIMIT、証拠欠損、過去の判断だけのフィルタ、確率 0 の除外、全質量除外の failure を追加検証した。
初回と v2 の 8 result.json、今回の 4 result.json に分析関数を適用し、上記の分類と注視後の経路を確認した。
npx tsc --noEmit も成功した。
分析担当による新規実モデル要求は 0 件。
全体回帰と最終版の型検証は親の統合確認の対象である。
