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
