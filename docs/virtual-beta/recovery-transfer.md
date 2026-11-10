# 別課題での探索切替と前提変更後の再訪

通知設定への追加調整を止めた方式が、別課題でも行き詰まり後の切替と再訪を行えるかを測る。
新しいローカル画面と監査を追加し、画像入力、候補生成、記憶、質問、行動方策、確率選択、HTTP転送は維持する。

## 条件

予約図書の受取館変更と、体験教室の参加回変更の2課題を用意した。
各課題で以下の3条件を2回ずつ、計12試行実行する。

- switch：最初の画面は閲覧専用で、別の予約一覧から変更できる。
- changed：確認操作で変更の前提が整い、最初の変更画面へ戻ると保存できる。
- unchanged：確認操作では前提が整わず、別の記録照合で整う。その前後の再訪を区別する。

全条件で、変更できない画面を初期状態として明示する。
自力で行き詰まりを発見する過程は測っていない。
changedとunchangedは、同じ課題の初期画面、ホーム、確認操作直前までの画面と候補が一致する。
確認操作後のフィードバックと変更可否が最初の差分になる。

unchangedは変更の前提であるeligibleが変わらないという意味で、すべての業務状態が不変という意味ではない。
確認申請を受け付けると記録照合が可能になるが、照合前は元の変更画面を操作できない。
申請がないと照合できない理由と申請番号は、通常の画面で表示する。

再訪は一律禁止しない。
前提が変わらないまま元の画面へ戻った回数を記録するが、それだけで人間として不自然、誤操作、UX不良とは判断しない。

## 固定した方式

[事前登録](../../experiments/virtual-beta/recovery-evaluation.json) と [実装計画](../superpowers/plans/2026-10-29-recovery-transfer.md) を結果の観測前に保存した。
方式は experience-goal-search-grounded、personaなし、全画面、状態記憶3、経験記憶8、argmax、Jev1.14、longContext、HTTP再送なし。
各6条件を順に実行し、2巡目は逆順にする。

上限は12試行、288要求、並列1、40分。
各試行は24要求、12判断、15 UI操作、3注視、180秒。
HTTP402で即停止、基盤障害が2件連続した場合も停止する。
ERRORと未決済RESERVEDも要求消費に含め、失敗した枠を成功試行で置き換えない。
最短UI操作数は3、6、9で、unchangedで前提未変化の再訪を1往復追加すると12判断の上限に達しうる。

## 実行と確認

Node、既存依存、Playwright Chromiumを使い、repoルートで実行する。
prior-raw.jsonは今回以前の2428原本のパスとhashをまとめたローカル保全用ファイルで、秘密情報や人間記録を含まない。
過去原本はGitに含めないため、この履歴がないcloneで同じ保全検証を実施できたとは扱わない。
既存出力への再実行は拒否する。

```powershell
# 疎通のみ。API0、モデル性能を示す結果ではない
node --import tsx runner/recovery-evaluation.ts --mock --limit 3 --prior-snapshot (Resolve-Path reports/recovery-transfer-2026-10-29/prior-raw.json).Path --out reports/recovery-smoke-new

# 通常Jev、全12枠。認証ファイルはworktree外の明示パス
node --import tsx runner/recovery-evaluation.ts --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot (Resolve-Path reports/recovery-transfer-2026-10-29/prior-raw.json).Path --out reports/recovery-live-new

node --import tsx --test --test-concurrency=1 tests/recovery-*.test.ts
npm run build
node --import tsx runner/virtual-beta-replay.ts reports/recovery-live-new/recovery-library-changed-r1/exploration
npx playwright show-trace reports/recovery-live-new/recovery-library-changed-r1/exploration/trace.zip
```

## 記録の境界

manifestに全予定順序、実行UUID、製品sourceの各hash、protocol、charter、profile、台帳、結果を保存する。
resultの各stepに実観察、判断分布、補正後分布、実選択、UI操作と監査snapshotを保存する。
監査snapshotや独立oracleの答え、課題条件、正解経路はmodelInputや候補ラベルに渡さない。
到達性確認の正解経路は専用のcertificationモジュールに分離し、UIと探索runnerは参照しない。

再訪は実際のUI移動で元の画面から離れ、戻った場合だけ数える。
同じ画面の読み直しや待機は再訪ではない。
前提変更の発生、変更後の画像をJevに提示できたこと、再訪、保存を別々に数える。
最後の操作後のterminal snapshotは実状態の証拠になるが、モデルに提示済みの証拠にはしない。
遷移先URLや機会が不明な場合は推測で補完しない。

summaryは予定12、有効結果、未試行、基盤障害、不正分布、安全停止、上限終了、主観完了と客観保存を分離する。
機会が生じなかった試行を、必要な再訪を成功させた試行として数えない。
API待ち時間と実操作時間は人間の行動時間ではない。

## 判定の範囲

各条件2回の記述的な実験であり、広い範囲の安定性や人間との一致は結論しない。
条件間の目的達成率だけで、人間がその画面をどう感じるかや、UI変更の因果効果を説明しない。
新しい研究コード、重み、依存、学習は導入していない。
実モデル実行前の到達性・モックと、実モデルの探索結果は分けて報告する。

## 実装時に修正した基盤障害

独立検証で、HTTP402の受領直後にERROR台帳の保存も失敗すると、既存dispatchが保存障害へ例外を置き換え、402の情報が外側へ届かないことを再現した。
再現はAPI0で、実際のdispatchコードを隔離実行した。
探索actorやdispatchを変えず、新しい比較batchが台帳のadmission/settlement障害でも即停止するようにした。
部分結果内の証拠と、wrapperが直接投げる例外の両方を扱い、安全な既知コードだけを保持する。
この停止を利用者の迷い・離脱に数えず、台帳のERROR/RESERVEDも消さない。
修正前の再現と修正後の検証は reports/recovery-transfer-2026-10-29/independent-preflight/ に保管する。

## 実モデルの結果

予定12試行をすべて実行し、全12件が計測上有効だった。
目的達成8件、未達4件、API障害0、不正分布0、安全停止0、誤った主観完了0。
184要求はすべてOKで、ERRORとRESERVEDは0だった。
未達4件はすべて12判断の上限で終了し、未実行や基盤障害に置き換えていない。

- 別の入口へ切り替えるswitch：図書館2/2、教室2/2。各3 UI操作で保存まで達成した。
- 確認で前提が整うchanged：図書館2/2、教室2/2。各6 UI操作で元の画面へ戻り、保存まで達成した。
- 確認だけでは前提が整わないunchanged：図書館0/2、教室0/2。全件が12 UI操作、12判断、24要求で未達だった。

全6条件で、2反復の初期画像とconfigは一致した。
確認後の前提変更はchangedの4件で発生し、その結果の画像提示、元画面への再訪、保存も4件すべてで確認した。
unchangedの4件は記録照合を実行しておらず、前提変更の機会自体が発生していない。
これらを「変更後の必要再訪を4件失敗した」とは数えない。
一方、前提が変わらないまま元の画面へ戻る行動は4件すべて、合計6回あった。

[全試行JSON](recovery-transfer-results.json)、[CSV](recovery-transfer-results.csv)、[独立検証](recovery-transfer-independent-review.md) に個別値と分母を保存した。
実測producerは `ca1f078d6c12eea67d421cee2858b161cee9caf3`、sourceは `16ab01b0315c6935bb26c6acb80d7d2637e3700f69543a06aa1ad5c1ad7fa47d`。
実行中にUI、actor、profile、protocol、charterを変更していない。

## 失敗例で観測できたこと

図書館unchangedの1回目では、step6で「予約記録を照合する」ボタンが有効な候補e1として画面内に表示されていた。
Jevの元分布は照合e1が0.11、ホームへ戻るe2が0.64で、補正重みは全候補1だった。
選択と実操作はいずれもe2で、照合を行わず戻った。
step12でも照合せず戻り、保存値は中央図書館のまま終了した。

![実際にモデルへ送ったstep6の現在画像](recovery-evidence/library-records-model-input.png)

この画像は事後に選んだ失敗例で、全12件の結果はJSONに残した。
表示上の候補番号は実モデルへ送ったものと同じで、画像を加工していない。
SHA256は `4a9a101f7cdd2d72f50e92d9a28f5e8018125a3131cc1c376f5a0e86095d1e12`。

step6の評価要求と行動要求には、照合が未完了と示したstep4の画像もmemory_0として含まれていた。
両要求は正常応答を得ている。
過去画像を入力として保持した事実と、それを使って必要操作を選べたかは別の結果になった。
目的別の探索評価はホームへのnavigationを報告し、理由の自己報告はuncertaintyだった。
これは短いモデルの自己報告で、内部判断の完全な説明ではない。

同じ失敗例のstep10と11では、一時保留の重みが選択を変更していた。
全体では選択変更が8回あった。
この補正を全失敗の原因とする対照実験は行っていない。
少なくともstep6の未照合は補正で強制された選択ではなく、元の分布でも戻る候補が最大だった。

## 改善の優先順位

1. P0：可視の「確認・照合」操作が、目的のために必要な前提をどう変えるかを判断へつなぐ。今回の根拠は照合候補が表示・提示されても実行されず、前提未変化の再訪が続いたこと。原因仮説は、現在画面に目的そのものの変更controlがない場合、前提操作の価値を低く評価していること。次はUI・上限を固定し、無関係な確認操作も含む対照で評価する。特定ラベルへの加点や再訪禁止で直したことにはしない。
2. P1：過去の非進展と前提変更の評価が、どの候補の保留解除・再試行に使われたかを検証する。今回の事実は8回の選択変更。改善の効果を主張するには、元分布と補正後の分布を保存した上で方策の有無を固定比較し、必要な再訪を損なわないことを確認する。
3. P2：自力で行き詰まりへ到達する過程、画面外の情報、ペルソナの制約、対象集団の人間との一致を別実験にする。今回は開始時からblocked、全画面、personaなしであり、この範囲の人間再現は未検証。

今回の変更は検証UI、計測、比較runnerと基盤障害時の即停止である。
未達を見た後のactor修正や、条件に合わせたUIの最適化は行っていない。

## 保存物とオフライン再集計

原本は `reports/recovery-transfer-2026-10-29/live/`、実入力PNG、全質問・応答、分布、選択、状態、trace、台帳を保持する。
以前の2,428原本は実行前後で同じhashだった。
source137ファイルのバイト列は `producer-source-16ab01b.zip` に保管し、ZIPのSHA256は `30251289d3d95f1d90b88b692f9d439cc0bc872911d37719ff700637beed2ede`。
認証・環境ファイルと人間記録は含めない。

次の[オフライン変換](../experiments/2026-10-29-recovery-report.ts)は、指定manifest、各台帳、保存結果、現在画像を照合して共有用JSON/CSVを生成する。
実API要求もUI再実行も0で、出力先は新規ディレクトリを指定する。

```powershell
node --import tsx docs/experiments/2026-10-29-recovery-report.ts reports/recovery-transfer-2026-10-29/live/manifest.json 9923cd40bdc508379e6e5672f09d3275e1952e6623f7014d67dfd311f6ca8f98 reports/recovery-transfer-2026-10-29/public-recheck
```

この実験で確認できたのは、固定した別課題での入口切替と、前提変更に到達した後の再訪・保存である。
前提未変更条件の4未達が残り、探索全体の安定化は未達だった。
正確な意味理解、対象集団の人間への一致、一般化したUX評価能力は実証していない。
