# Windows 台帳置換の限定再試行

通常の実 Jev 比較で、API 応答後の台帳置換が EPERM となった。
探索とユーザー行動を変えず、この保存処理を修正する。
実障害の発生元プロセスは未特定である。

## 実際の障害

producer 02ec896、source ea90b286 の 12 試行中、revisit-beta-r1-old の 9 要求目の評価で発生した。
result は BUDGET_SETTLEMENT_AFTER_REQUEST、requestOutcome=response、stage=replace-ledger、fsCode=EPERM、API_ERROR、validForComparison=false、apiCalls9。
disk 台帳は 8 OK と 1 RESERVED、一時 JSON は同じ予約 ID の 9 件目を OK にした完全な内容だった。
phase-budget-after.json の 9 OK はメモリ上の状態であり、保存成功の証拠ではない。
応答本文は失敗 step に保存されておらず、原本の欠損として保持する。

この失敗をユーザーの迷い、離脱、タスク失敗には数えない。
HTTP を再送して応答を取り直したり、過去台帳を後から OK に修復したりしない。
初回 12 試行の 193 要求、192 OK と 1 RESERVED はそのまま残す。

## 実 FS の再現

新規 probe ファイルだけを使い、読み取り側が削除共有を許可しない Windows handle を保持すると native rename が EPERM になった。
handle の解放後は、同じ完全な一時 JSON から置換できた。
4 回、25/50/100ms 待機と 250ms の新規試行開始ガードを使う probe では、60ms 後の解放で 3 回目に成功した。
保持継続時は 4 回で失敗し、元台帳と一時 JSON を保持した。
製品、原台帳、一時 JSON の調査前後 hash は一致した。
記録は reports/goal-search-evidence-2026-10-29/persistence-probe-1793256327736/report.json。

この再現は同じ OS 失敗機序を示すが、実障害のロック元の同定ではない。

## 受入条件

- JSON 化と排他的な一時ファイル書き込みは 1 回だけ行う。
- Windows の replace-ledger/EPERM だけを、同じ一時 JSON から初回を含め最大 4 回試行する。待機は 25/50/100ms。
- 250ms は新しい再試行を始める際のガードであり、既に始まった native I/O の強制中断ではない。
- write 失敗と他の OS コードは即時失敗とする。枠を使い切った場合も従来の失敗分類と保守的な会計を保持する。
- 同じ台帳は、呼び出し時に JSON 化した値を順番に保存する。異なる台帳は相互に待たせない。
- reserve、settle、HTTP 要求自体は再実行しない。原本と失敗 temp を削除しない。
- 診断には固定 kind、台帳パスの SHA256、attempt、delayMs、EPERM だけを残し、原 path、message、stack、cause を出さない。
- retry の delayMs は次の待機、recovered/exhausted の delayMs は 0 とする。

## 分担

実装サブは runner/budget-persistence.ts と新 tests/budget-persistence-retry.test.ts を担当する。
親は既存 runner との統合、全体回帰と実モデル比較、文書を担当する。
独立サブは別のテスト、実 FS、通常 wrapper での要求数と失敗分類、原本不変を検証する。
大規模な新フレームワークや依存は導入しない。

実装前の専用 RED は 18 件中 10 成功、8 失敗、skip0 だった。
共有ロックの解放後に回復できない例、回数制限と診断の不足、同一解決パスと大文字小文字 alias の保存順序の競合を再現した。
新規 probe ディレクトリ以外の製品と原本を変更せず、保持用プロセスの解放と終了も確認した。

## 検証コマンド

```powershell
node --import tsx --test --test-concurrency=1 tests/budget-persistence-retry.test.ts tests/budget-persistence.test.ts tests/virtual-beta-budget.test.ts tests/budget-diagnostics-integration.test.ts tests/budget-diagnostics-independent.test.ts
npm run build
```

再試行が存在することだけで、未知の保存障害全般が解決したとは扱わない。
永続するアクセス拒否と、回数枠後の失敗は別に記録する。

## 独立指摘と修正

初回 source 84bcfa7 は新 18、既存 helper42、budget3 の 63 件、旧 wrapper21 の 21 件、型検査が成功した。
独立担当は 14 件中 13 成功、1 失敗で、相対 file と作業ディレクトリの境界を実際の child process と native I/O で再現した。
FIFO キーは呼び出し時の絶対パスだったが、実 I/O は後から元の相対パスを解決していた。
そのため A で保存を依頼して直後に B へ移ると、B の台帳を更新し A を残してしまった。

修正は保存先の絶対パスを呼び出し時に固定し、キーと実際の temp write、rename に同じ値を使うものとした。
実装担当は直接保存と FIFO 待ちの 2 例で実際の RED を確認し、修正後に新 20 と既存 45 の 65/65、型検査 exit0 を確認した。
旧テストの期待値と独立の挙動 assertion は変更していない。
親の build も成功した。
初回所見は [独立レビュー](budget-replace-retry-independent-round1.json) に保存した。

FIFO は同じプロセス内の保存順序を管理する。
複数プロセス間の予算制御は、既存の phase budget の排他機構を引き続き使う。

## 独立再検証

修正後 source 5120f9a を全 122 ファイルで固定し、[再検証](budget-replace-retry-independent-review-round2.json) は 14/14、fail0、skip0、型検査 exit0 だった。
元の相対パスの RED は A 更新、B 不変の期待値のまま成功した。
実 native 外部 timer によるロック解放は 3 回目で回復し、保持継続は 4 回で枯渇した。
独自 human wrapper と完全 fetch stub でも、回復時 HTTP2（評価と行動各1）、枯渇時 HTTP1（応答後の保存障害）で再送0を確認した。
枯渇時は disk RESERVED と同じ ID の temp OK を残し、基盤障害を保持した。

独立担当は、旧 1517 原本と 130 台帳の不変を検査した。
テストの版切り替えと OS 適用範囲だけを整え、変換を戻すと初回の全挙動期待値へ一致することを機械的に確認した。
[形式と適用範囲の記録](budget-replace-retry-independent-test-format-portability.json) も保存した。
Windows では同じ 14 件が全て実行された。
非 Windows 実ホストは未実行であり、Windows 固有の機序は当該 OS 以外で理由付き skip する。
歴史原本のない clean clone は checked0 と理由を記録し、壊れた JSON や権限エラーを不在として扱わない。

実モデル再比較の producer は 0f0ba0735b2a60e49103df9d70aeddb9ce434923、sourceHash 5120f9a4c3bd33c3f1e0f974407a86b3647af9fffdb0980a16e4cb233e984d73。
認証情報を含まない全製品 snapshot は reports/goal-search-evidence-persistence-fixed-2026-10-29/producer-source-5120f9a.zip に保存した。
