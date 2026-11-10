# 保留理由の根拠受理を分離する変更の独立検証

受入条件を満たす限定的な変更として、実モデル比較へ進めることを確認した。
独立テストは最終実行で 6 件すべて成功し、確定した実モデル比較も 12 件すべての保存記録が整合した。
今回の記録は、探索全体の改善や人間の行動の再現を示すものではない。

検証担当は実装担当と別のコンテキストでコードと実行を確認した。
製品、既存テスト、依存関係を編集せず、新規独立テストと本書、独立検証用の報告だけを追加した。
実 API 呼出し、保存入力の API 再送、環境ファイルと人間記録の読取りは各 0 件である。

## 検証したソース

- 基準：`aed3dcd`
- 凍結 commit：`959c5de32ba5d52ecf13725ef2584c5a4d5a989f`
- sourceHash：`e1a64bb13ec7dde4ac703482b7dab5950a987e9ed0cf960d8ac9b018a1677233`
- 今回限定の厳密照合：[independent-frozen-source.json](../../reports/deferral-admission-2026-10-29/independent-frozen-source.json)

差分を読んで、profile の設定差が id と basisAdmission のみであることを確認した。
core、replay、質問文、保留重み、解除判定には変更がない。
恒久的な独立テストは実行前後の sourceIdentity を比較し、将来の正常な commit を固定ハッシュで拒否しない。
今回の凍結識別子との照合は、上記の別 artifact に残した。

## 独立実行

次のコマンドを実行した。

```powershell
node --import tsx --test tests/deferral-admission-independent.test.ts
npx tsc --noEmit
node --import tsx reports/deferral-admission-2026-10-29/independent-live-audit.mjs
node --import tsx reports/deferral-admission-2026-10-29/independent-review-followup.mjs
```

最終テストは 6 件成功、失敗 0 件、skip 0 件、55.2 秒だった。
型検査は exit 0 だった。
全体の build と既存関連テストは親担当の範囲であり、ここでは再実行していない。
実行ログは [independent-tests-final.log](../../reports/deferral-admission-2026-10-29/independent-tests-final.log) と [independent-types-final.log](../../reports/deferral-admission-2026-10-29/independent-types-final.log) に保存した。

独立テストでは次を確認した。

- basisAdmission の省略と negative-evidence は、質問、記録、返り値が同じだった。旧方式が拒否する home のみの非進展根拠に対し、新方式は実際に学習した同世代の o2 を受理した。raw の保留と入力は不変だった。
- 未学習、世代の相違、未添付、矛盾する画像、別経路、未来、home、経路の不連続、未実行結果を使う登録を拒否した。negativeEvidence は以前の画像と home を保持し、excursionEvidence と独立した上限を検査した。
- still_blocks、unknown、原根拠未添付、古い根拠、未来の根拠、同じ画像、別世代では解除しなかった。
- 実ブラウザーを通常 wrapper と gateway 境界に通した。架空キーと fetch stub により実 API は呼ばず、legacy、changed、still の 3 条件を実行した。新方式の changed だけが o2 を保持し、o6 で reason_0 として実添付し、weight 1 で e2 を実クリックして 7 UI 操作で目的を達成した。legacy と still は weight 0.01 で e3 を実クリックした。
- negativeEvidence、excursionEvidence、世代、有効保留、再ハッシュした未知の画像参照、画像 bytes の 6 種の改変を replay が拒否した。復元後は replay に成功した。
- 前回の実保存 12 件すべてを offline replay できた。前回 alpha-r1 と beta-r2 の同じ保存応答をオフラインで機械的に再構成すると、旧方式は拒否、新方式は o2 を受理した。これは新しいモデル性能の観測ではない。
- 比較 runner の mock 2 slot は、親ディレクトリが存在しない nested 出力先から成功した。同名出力先の再使用は拒否し、今回存在する旧台帳 46 件は不変だった。旧保存がない環境では台帳 0 件を検証する分岐も実装したが、clean clone 自体は起動していない。

最終のブラウザー、replay、比較接続の証拠は [independent-1793205121836-252868](../../reports/deferral-admission-2026-10-29/independent-1793205121836-252868) に保存した。
画像を目視し、o2 の本人確認要求、o5 の本人確認完了、最終画面の共有リンク無効化も確認した。

## 実モデル比較の保存監査

親担当が実施した比較は COMPLETED、12 試行、204/288 要求だった。
独立監査は [independent-live-audit.json](../../reports/deferral-admission-2026-10-29/independent-live-audit.json) に保存した。
監査 script は fetch と環境ファイル読取りを禁止する。

- 全 12 試行の revision と sourceHash、事前固定順序、要求台帳、通常 transport の longContext と attempt 1 を照合した。ledger の ERROR は 0 件だった。
- 上限は 24 要求、12 判断、15 UI 操作、3 look、180 秒で、全体 288 要求、20 分、逐次 1 の設定だった。追加 API 段階は 0、追加の UX 抽出もなかった。
- 旧台帳 46 件の内容ハッシュはすべて不変で、全 12 試行の offline replay に成功した。
- 6 ペアすべてで、初期画像、goal、persona、設定を照合した。設定から除外した差は id と basisAdmission だけである。
- 添付画像ファイルの bytes と参照ハッシュを検査した。通常画像は最大 3、理由原画像は最大 1、合計最大 4、経験と理由記憶は最大 8 だった。
- 登録時は実学習の同世代、添付された経路内画像、negativeEvidence と excursionEvidence の record/entry の一致を照合した。解除時は原画像、後続の変更画像、モデルの status/evidence、raw と effective の保留、選択、実 UI 操作をつないだ。
- モデルの capture 提案は 33 件、受理は 7 件、review は 11 件、解除は 5 件だった。目的 true は 9/12 件である。これは自己申告件数と客観目的判定の別の集計である。

通知停止は旧方式 0/2、新方式 1/2 だったが、4 試行とも理由の受理と review がなかった。
この差から根拠受理や誤解除の精度を評価できない。
alpha は旧 2/2 と新 2/2 が成功し、UI 操作は旧 7/7、新 9/9 だった。
beta も両方式 2/2 が成功し、UI 操作は旧 9/9、新 9/7 だった。
理由の受理が増えたことを、そのまま効率の改善とは数えない。

## 次に検証するモデル判断

優先度 P2 の品質課題として、添付された変更根拠に対する review の選択が残る。
再現場所と具体的な入力、確率、選択、画像参照は [independent-review-followup.json](../../reports/deferral-admission-2026-10-29/independent-review-followup.json) に保存した。

新 alpha-r1 は o6 で still_blocks と evidence none、新 alpha-r2 と新 beta-r1 は o6 で basis_changed と evidence none を選んだ。
3 試行とも原根拠 o2 と変更済み o5 を実添付していたが、その回では解除しなかった。
その後 o8 で basis_changed と o7 を選び、解除した。
各試行で o5 と o7 はハッシュだけでなく bytes も同一だった。
旧 beta の 2 試行にも、最初の basis_changed と evidence none の組合せがあった。
したがって、この判断の課題は新方式だけに固有とはいえない。

期待する検証対象は、原根拠と変更画像を比較した分類と、その変更画像への引用を一貫して行えるかである。
現行の解除ガードは evidence none を拒否しており、契約どおり動作した。
o6 と o8 は観察 ID、記憶、添付画像全体が異なるため、同じ画像 bytes だけからモデルの回答差の原因を特定できない。
次の反復では、この分類と引用の組合せを独立した仮説として検証する必要がある。

新 beta-r2 の 7 UI 成功は理由解除によるものではなかった。
o6 で basis_changed と evidence none を選び、raw と effective の保留を保持したまま、e3 と e4 の両候補が保留になった。
既存の ALTERNATIVES_EXHAUSTED により一時的に weight 1 を使い、raw e3=0.93 の候補を実クリックした。
この試行の解除件数は 0 であり、新方式の成功 4 件すべてを解除による改善と解釈できない。

## 独立検証中の基盤障害

独立テストの最終成功だけでなく、先行した失敗も保存した。
最初の legacy と still は検証対象の実操作後、固定 script が次画面にない候補を指定して API_ERROR で終わっていた。
これは独立 test harness の誤りであり、対象操作を確認した後に done へ進むよう修正した。
初回 artifact は削除していない。

その後、still 条件で 2 回、既存 PhaseBudget.persist の境界が失敗した。
一方は o4 action の REQUEST_FAILED、もう一方は o2 action 前の BUDGET_ADMISSION_ERROR だった。
両方で有効な JSON を持つ ledger.json.tmp-* が残った。
前者の temp は 8 件目まで OK で、決済時の永続化に失敗していた。
後者の本体 ledger は 3 OK、temp は 4 件目の RESERVED を含み、予約時の永続化に失敗していた。
本体と temp の状態とハッシュは [independent-budget-persist-diagnostic.json](../../reports/deferral-admission-2026-10-29/independent-budget-persist-diagnostic.json) に保存した。
fetch stub の診断では assertion の失敗を観測しなかった。

透過的に再 throw する persist 診断 wrapper を新規テストへ加えた後は再現せず、最終 6 件は成功した。
隔離した writeFile→rename の probe も 500/500 回成功した。
[この probe の結果](../../reports/deferral-admission-2026-10-29/independent-fs-probe.json) と全先行 artifact を残し、temp と lock を削除していない。
失敗範囲は台帳永続化まで絞れたが、生の errno、writeFile と rename のどちらか、環境依存条件は未確定である。
これは優先度 P2 の基盤安定性調査として次へ残す。
実モデル 12 試行の保存監査では同じ障害を観測していない。

## 検証の限界

モデルの category、review、理由説明は仮説である。
架空の画面で実行した UI と独立目的判定の整合を確認した範囲を超えて、人間の理解、注視、行動時間を再現したとは主張しない。
人間の時間は null のままである。
各条件 2 反復の記述的比較から、一般化や信頼性の推定も行わない。
