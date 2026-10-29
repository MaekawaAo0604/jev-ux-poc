# 探索切替・再訪評価の独立検証

実装担当と別の新規コンテキストの検証サブが、製品コードを修正せず、テスト、実ブラウザー、モック、実モデル原本の監査を実施した。独立検証からの外部API要求は0、認証ファイルの読取りも0だった。

判定は実装・計測・保存証拠に対するPASSである。実モデルの探索安定性は未達、人間への一致は未検証。[実験本文](recovery-transfer.md)、[全試行JSON](recovery-transfer-results.json)、[CSV](recovery-transfer-results.csv) を併せて参照する。

## 対象の固定

実モデルproducerは ca1f078d6c12eea67d421cee2858b161cee9caf3、source137ファイルのhashは 16ab01b0315c6935bb26c6acb80d7d2637e3700f69543a06aa1ad5c1ad7fa47d。
事前のsource・テスト・protocol等147ファイル、以前の原本2428件、今回の実モデル原本423件の不変性を確認した。
実測manifestのSHA256は 9923cd40bdc508379e6e5672f09d3275e1952e6623f7014d67dfd311f6ca8f98。
source ZIPは137ファイルの内容・CRC・hashを確認し、認証・人間記録の追加はなかった。
公開文書の追記でGit revisionが進んでも、実測producerは上記から変更しない。

## 実行前検証と修正

独立の関連テスト32件、監査境界7件、従来transport2件、停止規則の検証と通常wrapperのモック3試行を実行した。モックの主観完了3件は客観成功0件であり、実モデル性能へ加算しなかった。

P1として、HTTP402の後に台帳settlementも失敗すると402が外側へ伝わらない問題を実際のdispatchで再現した。基準actor/dispatchを維持し、新batchが既知の台帳障害でも即停止する修正を行った。修正前の再現を残し、部分結果内とwrapper直接例外の双方を再検証した。ERROR/RESERVEDの削除やHTTP再送は行わない。

最終preflightは PASS_FOR_BOUNDED_REAL_EXECUTION。修正の独立検証5件、関連unit4件を確認した。親側は新規36件、従来関連44件、型チェック・build、通常transport3件を確認した。これらの件数は一部重複するため合算しない。全体suiteの成功とは報告しない。

## 実モデル原本の監査

全12試行の結果・台帳・replay・trace CRC・現在画像・分布・選択・実操作・上限を照合した。184要求は184 OK、ERROR/RESERVEDは0。12件有効、8成功、4未達で、未達はすべて12判断のDECISION_LIMITだった。基盤障害、偽の主観完了、安全停止、不正分布は0。

switchは4/4、changedは4/4、unchangedは0/4。全6セルの初期画像とconfigが反復間で一致した。changed/unchangedの確認前step1〜3も両課題・両反復で画像が一致し、最初の差分はstep4だった。補足監査は236チェック、実画像6枚の目視確認を含む。

changedの4件で前提変更・画像提示・再訪・保存を確認した。unchangedの4件はrecordChecks=0、eligible=falseで、前提変更の機会は未発生だった。機会が発生した後の再訪失敗4件とは数えない。前提が変わらないまま元画面へ戻った試行は4件、計6回。

代表失敗例のstep6は可視で有効な照合候補0.11、戻る候補0.64、全補正重み1。実選択も戻るだった。評価と行動の両要求にstep4の失敗フィードバック画像が含まれていた。uncertainty/navigationはモデル自己報告として扱う。全8回の選択補正を失敗の原因と断定する対照実験は行っていない。

## 公開値の確認

公開JSONの全12試行・6セル・合計・上限、CSV12行、掲載PNGの完全なバイト一致を233チェックで確認した。
オフライン変換をfetch/環境ファイル読取り禁止で独立再実行し、API0で一致した。raw内出力、誤manifest hash、既存出力先の3拒否も実行確認した。原本423件は不変だった。

最終公開JSONのindependentAuditは、この独立監査の範囲だけをPASSとして記録する。オフライン変換直後のPENDINGは未監査の派生物を勝手に合格扱いしないための初期値である。

## 保存された独立証拠

以下はローカルreports配下に保存し、生の全質問や履歴はGitへ追加しない。

- independent-preflight/gate-final.json：最終実行前gate、修正とモックの結果。
- independent-audit/completed-raw-audit/audit.json：SHA256 03cf4a6e307b553175cbbb9ecdbd1206dca20d0e750bd2a1b66322c42a3522af。
- independent-audit/supplemental-visual-and-bounds.json：SHA256 3e7a03446a41304c1defa3311906f2dbe4787115f21b07b777551d2239c0d6e9。
- independent-audit/public-values-audit.json：SHA256 9078eac76294fe013992dbe236e9d561c3b925b6684cc3bbf7e2a400ac06ede3。

すべて reports/recovery-transfer-2026-10-29/ を基点とする。今回の実装・監査に重大な未解決不具合は検出していないが、照合を選ばず未達となった4件はモデルの未達結果として残る。
