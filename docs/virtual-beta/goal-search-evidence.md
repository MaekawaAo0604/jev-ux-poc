# Goal 証拠の出典参照

要求と背景、入口と直接実行を混ぜる判定を分離し、過去 observed がない否定を受理しない opt-in を追加した。
実行中に判明した初期読み込みと Windows 台帳置換の不具合も修正した。
最終の通常実 Jev は 12 試行、194 要求が全て正常だったが、目的達成は旧 6/6、新 5/6 で、探索の安定化は未達である。
人間への一致は未検証。

## 基準と担当

着手時のブランチ先頭は d6acdb9、最新の実比較記録と未解決の分類対立を基準にした。
製品修正は 9c6207a（役割・入口）、02ec896（出典・初期ロード）、0f0ba07（台帳保存）の順に固定した。
以下の最終比較の旧は `experience-goal-search-v2`、新は `experience-goal-search-grounded`。
通知、必要再訪 alpha、必要再訪 beta を各条件 2 回実行し、条件順を反転した。
UI、初期画像、全 Goal、persona=null、選択器 seed と既存補正を固定し、設定の除外差分は id と goalSearch.evidenceMode だけとした。
モデル出力の乱数固定は確認できておらず、2 反復を因果効果や安定性の証明とは扱わない。

親は共通型、config、core、replay、profile、比較 runner、接続テストと統合を担当した。
実装サブは goal-search.ts と担当テスト、その後 budget-persistence.ts と担当テストを編集した。
別コンテキストの独立サブは専用テストと原本監査を担当し、製品コードを修正しなかった。
同じ作業ツリーで編集範囲を分け、既存 E: 作業ツリーの変更は上書きしていない。
主な変更箇所は次のとおり。

- `jev/virtual-beta/goal-search.ts`、`goal-search-contracts.ts`、`config.ts`：質問・参照・保存契約。
- `runner/virtual-beta-core.ts`、`virtual-beta-replay.ts`：通常実行と再構築、初期ロード予算。
- `runner/human-jev-profiles.ts`、`deferral-reason-experiment.ts`：設定と新旧の対照。
- `runner/budget-persistence.ts`：限定再試行と FIFO、保存先固定。
- `runner/engine.ts` と `tests/persona-initial-load.test.ts`：旧 persona の初期 goto だけの予算修正と実遅延回帰。
- `tests/goal-search-*`、`virtual-beta-initial-load.test.ts`、`budget-persistence-*`：担当・接続・独立回帰。
- `docs/experiments/2026-10-29-goal-search-semantics-audit.mjs` と本書関連 JSON：読み取り専用集計と根拠。

## 実装

`goalSearch.interpretation='role-state-v2'` は、全 Goal での役割 required/context/uncertain と、現在画像の証拠状態を別々に選ぶ。
execute と navigate も分離する。
この修正の 12 試行、210 要求と独立監査は [goal-search-semantics.md](goal-search-semantics.md) に記録した。
当該 rubric の分類対立は減ったが、旧 6/6、新 5/6 で、ループは残った。

`goalSearch.evidenceMode='source-grounded'` は role-state-v2 と組み合わせる。
同じ Goal と文字どおりの断片を、容量 8 の保持中の記録で observed と判断した場合だけ、`contradicted_oN` を提示する。
受理記録には `assessment='contradicted'` と `contradicts={observationId,imageSha256}` を保存する。
過去画像が今の要求に添付されない場合も明示し、過去の判断を現在の事実として扱わない。

未来参照、同一 ID の hash 衝突、違う Goal と断片、不正確率、mode 混在、根拠のない新規参照を拒否する。
既に受理済みの参照は元の観察が容量から落ちても保持できるが、新しく引用する資格は再生成しない。
raw 回答、受理記録、利用可能な記憶、分布と実選択、実行結果を分け、replay で再構築する。
mode 未指定の従来質問と plain contradicted は完全互換で残す。
候補、画像数、API 段階、選択補正、成功 oracle、再訪可否は変更していない。

標準 runner の初期 goto は、無関係な 10 秒制限を残り実行予算以内、最大 30 秒へ修正した。
10.5 秒遅延の画面と 150ms 予算の RED/GREEN、既存の予算注入 2 件の回帰を確認した。
Windows の台帳置換は同じ完全 temp の rename だけを限定再試行し、同じ台帳の保存順序と呼び出し時の絶対保存先を固定した。
HTTP は再送しない。
保存の受入条件、実 FS と独立検証は [budget-replace-retry.md](budget-replace-retry.md) に分けた。

## 実モデルの結果

実モデル最終比較の producer は 0f0ba0735b2a60e49103df9d70aeddb9ce434923、全 122 製品ファイルの sourceHash は 5120f9a4c3bd33c3f1e0f974407a86b3647af9fffdb0980a16e4cb233e984d73。
統合ブランチは feature/virtual-beta-information-state。
文書版は同ブランチの先頭から辿れる。

[最終結果 JSON](goal-search-evidence-results-final.json) の通常 12 試行は 194/288 要求、OK194、ERROR0、RESERVED0、全試行が比較に使用可能だった。
旧は 6/6 達成、通知 2 件は共に 6 UI、必要再訪 4 件は全て 7 UI。
新は 5/6 達成、通知 1 回目は 12 UI・12 判断で DECISION_LIMIT、2 回目は 6 UI で達成し、必要再訪 4 件は全て 7 UI で達成した。
false done はなく、未達を基盤障害や離脱に置き換えていない。

今回の rubric に対する役割判断は旧 74、新 89 断片で一致し、入口と直接実行の分類対立も 0 だった。
旧の contradicted 7 件は全て過去 observed がなく、新は 0 件だった。
両条件とも引用資格を持つ機会は 0 で、新のゼロは契約による制限である。
実モデルによる正しい出典引用、否定の意味理解、未知画面の分類精度は未測定。
目標への切り替えがモデルの理解によるか、既存 controller の補正によるかも分けて監査する。
最終新通知の未達は最終画面が利用情報で、受信停止画面へ達していなかった。
step1–3 は「各種設定→お知らせ→マイページへ戻る」、step7–9 でも「各種設定→お知らせ→マイページ」を選んだ。
step3/9 の finding は no-target-in-view だったが、既に見た経路から別候補へ切り替える判断には結びつかなかった。
補正による選択変更は旧 2、新 6 で、新の未達試行に 5 件含まれた。
knowledge=sufficient は旧 12/46 判断、新 11/51 判断で、知識状態の改善も確認できなかった。

台帳の retry/recovered/exhausted 診断は、この最終実モデル 194 要求では 0 件だった。
実行中の回復を観測したとは扱わない。
実 native 共有ロックと fetch stub での回復、枯渇、要求数維持は独立テストで検証した。

### 保存障害を含む初回比較

前の 02ec896/source ea90b286 版は 12 試行、193 要求で、192 OK と 1 RESERVED を保持した。
旧は有効 5/6 のうち達成 4、新は 6/6 達成だった。
旧 beta 反復 1 は 9 要求目の応答後に replace-ledger/EPERM となり、disk は 8 OK と 1 RESERVED、同じ予約 ID の完全 temp は 9 OK だった。
メモリ上の phase-budget-after.json の 9 OK を保存成功とみなさず、欠けた応答本文と未決済を後から修復していない。
[初回結果](goal-search-evidence-results-initial.json) と [独立原本監査](goal-search-evidence-independent-live-review-initial.json) を保存した。

初回の新 6/6 が最終では 5/6 へ変わった。
部品の優位や人間の探索切り替えを再現できたと結論しない。
新通知反復 2 の初回 step7 では raw e4=.96、e5=.01 から、既存補正が e5=.33784 を選んでおり、自発的な理解し直しとは区別した。

## 独立検証と回帰

出典参照の最初の実装は、新規 orphan 引用と evicted 参照の再引用を公開保存関数が許す P2 を独立に検出した。
新規記録だけを保持中 observed へ照合し、初回と同じ 2 RED を含む 31/31、skip0、型検査 exit0 で再検証した。
[初回](goal-search-evidence-independent-review-round1.json) と [再検証](goal-search-evidence-independent-review-round2.json) を残す。
旧 29 replay、165 件の保存質問と記録の完全互換も確認した。

親の出典参照、接続と初期読み込みの関係 59 件、worker の出典参照と旧回帰 154 件、保存の新旧 65 件が成功した。
保存の旧 wrapper21 件は初回保存版で、独立の回復と枯渇 14 件は最終保存版で成功した。
これらには重複があり、足して独立テスト数とはしない。
本編の 2 回の全体テストは修正へ移るため中断した。
その後 0f0ba07/source5120 の全体テストは約 39 分で完走し、1666 件中 1656 成功、7 失敗、3 skip、exit1 だった。
全体成功とは記録しない。skip は opt-in の実 OCR 1 件と実モデル画像評価 2 件である。

7 失敗は、過去版の byte 不変証明を現在版へ適用した 2 件、必須 config がない provenance fixture 3 件、
評価前の cold load が 6 秒予算を消費した期限 fixture 1 件、旧 persona CLI の実初期 goto 10 秒超過 1 件だった。
過去証明は固定コミット間の厳密比較へ戻し、config を補い、期限 fixture は同 URL を準備してから元の 6000ms と同じ要求数を検査する。
元の test 名、拒否 regex、受理条件、API1・UI0 の期待値は維持し、追加 skip はない。
[独立の差分レビュー](goal-search-test-fixes-independent-review.json) に、元 assertion へ逆変換できることと失敗原本を残した。
旧 persona の修正は engine の初回 goto のみ timeout30000 とし、他の default10000 は維持する。
11 秒遅延の実 RED（PAGE_ERROR、判断 0）を先に保存し、同じ test を変えず GREEN 1/1 を確認した。
修正後は 11006ms の HTML 遅延を経て目的達成・3 操作、通常 locator は引き続き 10000ms で timeout、fetch と外部通信は 0 だった。
この工程検証は fake であり、実モデルや人間の性能の根拠には含めない。
この後続製品変更は runner/engine.ts だけで、実モデル比較 producer0f0/source5120 の観察・判断・選択コードは変えていない。
後続工程検証の sourceHash は f65a0feaef10f31c512b008685ddbc359715dc99bc9c0dd8bd28b49fd9b9f063（他 121 製品ファイル不変）。
この版の型チェックと Vite build は exit0 だった。
修正後の同じ失敗 7 件を含む関連 8 ファイルは 42/42、fail0、skip0、exit0 だった。
[全体と再検証の記録](goal-search-project-tests-results.json) に各コマンドとログ hash を保存した。
[最終独立再検証](goal-search-final-repairs-independent-review.json) は元の 7 失敗、新しい遅延 1 件、beta 初期ロード 2 件、
元の fakeHTTP5 回を維持する支持 3 件を実行し、13/13、fail0、skip0、exit0 だった。
source122 ファイルと修正 test5 件の hash を前後で固定し、現行 consumer で実記録 12 replay も検査した。
修正後に全 1666 件をもう一度通したとは記録しない。
後続 f65 の実モデル再実行はしていない。実モデル比較が使う virtual-beta の観察・判断・選択・保存・replay の byte は 5120 版と同じである。

最終原本の [独立監査](goal-search-evidence-independent-live-review-final.json) は親集計を正解に使わず、
194 元応答、12 replay と trace、6 pair、全 24 種類の実入力・最終 PNG を確認した。
全 Goal の satisfied 11 件と、直接実行後の実画面も照合した。
前の 1517 原本と 130 台帳、最終 422 原本の hash は監査前後で不変だった。
この監査は全体テストとは別で、モデル内部の処理内容や人間との一致は保証しない。

## 実行方法

新しい出力先を使う。
API 設定は `.env.example` の形式で、検証 worktree 外の `../jev-model.env` に準備する例を示す。
実測では既存の外部設定ファイルを明示し、全体テストは `.env` のない隔離 worktree で実行した。
上限は 12 試行、288 要求、1 試行 24 要求、12 判断、15 UI、3 注視、180 秒、全体 20 分、並列1、API再試行なし。

```powershell
node --import tsx runner/deferral-reason-experiment.ts --comparison goal-search-evidence --env-file ../jev-model.env --out reports/goal-evidence-fresh
node --import tsx docs/experiments/2026-10-29-goal-search-semantics-audit.mjs reports/goal-evidence-fresh reports/goal-evidence-fresh/audit.json
node --import tsx runner/virtual-beta-replay.ts reports/goal-evidence-fresh/notifications-r1-reason/exploration
node --import tsx --test --test-concurrency=2 tests/*.test.ts
node --import tsx --test tests/persona-initial-load.test.ts
npm run build
```

単発は既存 human runner の `--mode experience-goal-search-grounded` を使い、実モデルの場合は既存 phase-budget も指定する。
従来の v2 は experience-goal-search-v2、さらに前の形式は experience-goal-search として残す。
一般 JSON の設定は `goalSearch: {enabled:true,capacity:8,interpretation:'role-state-v2',evidenceMode:'source-grounded'}`。

## 成果物と適用範囲

最終原本は reports/goal-search-evidence-persistence-fixed-2026-10-29/live/ の result、実入力 PNG、trace.zip、各台帳と manifest。
全製品 byte の archive は同親フォルダの producer-source-5120f9a.zip、SHA256 は 35a87393b0d9881856d05889279f1524c9d3896cf7cb3fc9bb3d0a82858c327c。
認証情報と raw 記録は製品 archive に含めない。
前の 1517 原本と 130 台帳も別途 hash で保全し、元の RESERVED はそのまま残す。
保存済み入力のモデルへの直接再送、人間の操作と感想の送信は行っていない。
原本フォルダは gitignore 対象で、共有用の結果と検証記録はこの docs 配下に保存する。

## 次の検証

P0 は、正しい役割と過去の非進展が伝わっても同じ入口を選ぶ判断と、候補ごとの観察 ID 付き経路の接続。
対応履歴がないことを「未試行で有望」と決めず、正解経路の投入や再訪禁止で隠さない。
P1 は保持中 observed が本当に覆る正負対照、無関係変更、未知画面、複合 Goal、対象ユーザー集団との比較。
非 Windows 実ホストと人間一致は未検証である。
