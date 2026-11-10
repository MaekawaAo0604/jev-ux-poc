# 未解決条件の保持方式と実モデル比較

画面から見えなくなった条件の過去根拠を、容量 3 の記憶へ優先的に残す設定を追加した。
実モデルでも保持を確認したが、比較は 4 予定枠中 2 枠で連続タイムアウト停止となった。
探索性能の優位性、人間への一致、残る計測要件の完了は確認していない。

[個別結果 JSON](condition-retention-results.json)、[CSV](condition-retention-results.csv)、[実行版と原本の照合情報](condition-retention-versions.json)を参照。
以前の [条件継続記憶](condition-continuity.md)とは別の 4 枠比較であり、停止した枠を入れ替えたり、版の異なる試行を合算したりしていない。

## 基準と変更範囲

基準は feature/virtual-beta-information-state の 563389a、実行版は 43f2f062e98f7e8892c48c1ec93a6f8d96ba1c8f。
実行時の 154 ソースを sourceHash b1f1f204df8779617f4f2b19a39720e3544a219d5d3b09c864b0cbaba1c28b4b と ZIP で固定した。
Git は改行を正規化するため、実行時のバイト列は sourceHash と保存 ZIP に束縛する。

既存の Persona、Charter、画像抽出、二段階判断、候補、分布、sampler、独立 oracle を維持した。
新しい依存・学習モデル・重み・正解経路・一律の再訪禁止は追加していない。
比較対象は既存の continuity と、同じ設定に grounded-unresolved を加えた retention。
両方式へ共通に追加した timeout 計画の監査値は、モデル入力へ渡さない。
モデル、native 出力スキーマ、生成指示、effort、UI、行動重みは変更していない。

実装サブ A は jev/virtual-beta/condition-continuity.ts と担当テスト、サブ B は runner/visual-dispatch-timing.ts と担当テストを実装した。
親は config・contracts・profile・core・native 入力投影・replay・比較 runner・統合テストと出力処理を担当した。
別コンテキストの独立担当が、実装後と修正後、実モデル原本を検証した。
作業ツリーの編集範囲を分け、元の E:/ChatGPT/Ux_test の既存変更は編集していない。

## 保持設定

~~~json
{"visualHypotheses":{"enabled":true,"capacity":3,"continuity":{"capacity":3,"retentionPolicy":"grounded-unresolved"}}}
~~~

上記は既存 config 内の該当部分であり、単独の完全な config ではない。
retentionPolicy を省略するか recent とすると、以前の直近優先方式になる。
新方式は、現在未達と判断した条件、過去に未達の根拠があるが現在は不明な条件、その他の順で保持する。
同順位では新しい項目を優先し、容量は 3 を超えない。
全候補の順位・採否と容量破棄を監査へ保存する。

未観測の条件は currentStatus を uncertain にする。
過去根拠 lastGrounded は現在の事実へ昇格させず、根拠が見えた時の更新・解消は従来の厳格な受理条件を使う。
順位や方針名は監査専用とし、native の実 HTTP 本文と Jev の両判断段階から除く。
両方式の最初の native 本文は同一になる。
この保持優先度は実装上の仮説であり、人間の記憶モデルとして較正していない。

## 実モデルの結果

図書の条件不変画面で、新方式、対照方式の順に実行した。
講座の条件不変画面では対照方式、新方式の順を予定していたが、両方未実行となった。
各試行は 12 判断、15 UI 操作、3 注視、36 要求、180 秒を上限とし、並列 1・再試行 0・バッチ 20 分・最大 144 要求で固定した。

- 新方式：22 要求、7 UI 操作、8 判断。8 回目の native 抽出で TIMEOUT、HTTP 受領は未確認。
- 対照方式：26 要求、8 UI 操作、9 判断。9 回目の native 抽出は採用され、その後の Jev 評価で TIMEOUT。評価側ログは elapsedMs 約 278.66、budgetExhausted true。
- 有効な性能比較試行は 0。両方の終了時点で目的未達を観測したが、これを有効な UX 失敗や成功率 0/2 として集計しない。
- 合計 48 要求。native は 17 要求中 16 出力採用・1 TIMEOUT、Jev 評価は 16 要求中 15 正常・1 TIMEOUT、行動は 15 正常。HTTP 受領確認は 46、未確認は 2。

保存記録の事後確認では、両方式とも最初の 7 UI 操作列は同じだった。
新方式は記録画面へ到達した次の抽出で停止し、対照方式は記録画面から戻った後の評価で停止した。
両方とも照合件数 0、保存値の変更なしであり、現在の中間操作選択は未解決である。

以前の同フェーズ 130 要求と今回 48 要求を合わせて 178/288、残り 110。
今回の枠としては 144 中 48 を使用し、96 が未使用、別に 14 が未割当である。
過去の別フェーズの要求はこの会計へ合算していない。

## ログで確認した保持の違い

図書の o4 では両方式が、予約記録との照合が未完了という現在の根拠を抽出した。
新方式では o1_c3 の内容を更新し、次の o5 でも同じ ID と o4 の過去根拠を保持し、現在状態を uncertain とした。
この ID と過去根拠は o7 まで残った。
対照方式では o4_c3 を o5 で容量破棄し、同じ説明を持つ根拠なしの uncertain 条件 o5_c3 を新たに作っていた。
個別 JSON の steps.continuity が、前後の状態・遷移・破棄・新方式の順位を保持している。

これは専用記憶での保持を示す記録であり、全履歴から情報が消えたことや、保持によって選択が良くなったことは示さない。
各モデル出力、履歴、後続入力は異なり、単回の停止比較から因果効果を認定しない。
引用は model-transcribed-unverified のままであり、全引用の意味・逐字精度を認定するものでもない。

## 検証と修正

独立 Round 1 は関連 339 件、独立 6 件、プロジェクト型検査、exporter 単独型検査、build、旧版の達成・TIMEOUT 各 1 replay を通過した。
ただし出力画像名の旧 actor 判定により、2 方式目が同名 PNG となって EEXIST で停止したため、ゲートを FAIL とした。
元の FAIL と失敗ログは [Round 1](condition-retention-review-round1.json) に保存した。

親が画像名を recent と grounded に分ける 1 行だけを修正した。
独立 [Round 2](condition-retention-review-round2.json) は関連 15 件、出力処理 4 検査、単独型検査を再実行し PASS。
2 方式の元画像 hash、JSON・CSV、8 予定画像枠と欠測、既存出力不変の拒否、不一致 manifest の出力前拒否を確認した。
本体 339 件・build の結果は同一 154 ソースの Round 1 検証を継承し、Round 2 での全再実行とは記載しない。

実モデルの事前画像は各予定枠の最初の 2 観察、計 8 枠に固定した。
保存できた 4 PNG は [画像ディレクトリ](condition-retention-evidence/)、残り 4 は個別 JSON で欠測と記録する。
全 2 試行、台帳、入力・画像、分布・選択、保持順位、実操作、初期入力一致、原本 75 件の独立照合は [実行後監査](condition-retention-review-live.json) を参照。
旧原本 5709 件と今回 75 件の計 5784 件、以前のゲート・ZIP を保持する。

## 残る改善と受入条件

**P0：最終 HTTP timeout の計測を完成させる。**
今回保存した dispatch は core から extractor へ渡す計画値で、最終 HTTP 値ではない。
実行 adapter は外側の試行期限と台帳予約の時間で再度短縮する。
新方式の最後の保存値は 19778 ms、抽出全体は約 18075.35 ms だったが、最終 AbortSignal の値は保存していない。
対照方式の最後の native は保存値 17608 ms で成功し、続く評価で残り時間を消費した。
最終送信直前の timeout・準備時間・どの期限が最小となったかを成功・失敗両方へ記録し、実 fetch へ渡した値と一致する回帰検査を追加する。
この計測要件が未達のため、基盤全体を完了とはしない。

**P0：条件の同一性を現在の確証から分ける。**
新方式でも新 ID による重複や条件の取り違えを一般的に防いでいない。
未観測の同じ条件を対応付けられる契約を検討し、現在根拠を捏造せず、過去根拠を現在の事実へ昇格させないことを再検証する。

**P1：保持から中間操作選択への接続を検証する。**
未完了の条件を保持しても、今回照合操作は実行されなかった。
最終待ち時間の計測を先に直し、反復・別課題で条件の再評価、候補の副作用、操作後確認を比較する。
要求時間や effort を変える場合は別の設定・版として固定する。

対象集団の人間データ、persona による行動頻度、未学習画面への一般化は別に取得・検証する。
多様性や記憶の保持を人間の体験再現と同一視しない。

## 実行方法

管理 worktree のルートで実行する。
認証情報は E:/ChatGPT/Ux_test/.env を読む。
原本・snapshot・ZIP は Git 対象外のため、新規 clone だけでは過去原本の保全確認や replay はできない。

~~~powershell
# API 0。今回の関連回帰を実行する。
node --import tsx --test --test-concurrency=1 tests/condition-continuity.test.ts tests/condition-continuity-transport.test.ts tests/condition-continuity-comparison.test.ts tests/condition-continuity-integration.test.ts tests/visual-hypotheses.test.ts tests/openai-visual-hypotheses.test.ts tests/visual-conditions-integration.test.ts tests/recovery-transport.test.ts tests/visual-conditions-comparison.test.ts tests/condition-retention-integration.test.ts tests/visual-dispatch-timing.test.ts
npm run build

# API 0。今回の新方式の原本を replay する。
npm run replay:virtual-beta -- reports/condition-retention-2026-10-30/live/recovery-library-unchanged-r1-experience-visual-conditions-retention/exploration

# 新規実行の例。出力先を新規とし、保存入力を直接再送しない。
# 残る今回枠 96 を指定する。4枠完走や過去の未実行2枠の置換ではない。
node --import tsx runner/condition-continuity-comparison.ts --retention --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot (Resolve-Path reports/condition-retention-2026-10-30/prior-raw.json).Path --max-requests 96 --out reports/condition-retention-next

# API 0。実行版ソースが一致する場合のみ、新規出力先へ再集計。
node --import tsx docs/experiments/2026-10-30-condition-retention-report.ts reports/condition-retention-2026-10-30/live/manifest.json 2ef732b7bae28d60488c2ea8ecafa9d0e9292c6032946c788c0111a0cf13c1d6 reports/condition-retention-report-new
~~~
