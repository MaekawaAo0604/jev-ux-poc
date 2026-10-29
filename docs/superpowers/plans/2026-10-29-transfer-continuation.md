# HTTP402後の未試行スロットの継続

ユーザーが課金・復旧を報告。API利用・subagent・feature pushの既存承認は継続し、再承認は求めない。

## 固定するもの

- 実行用の別managed worktreeを73b1ff3603b84c0019332970590b1f0d1406dc91に固定。
- 元の129sourceのbyte hash/source8a5bc5c03daaf99df38795fd218dc5e19e0ed916d390620e602286955c6ee3d7に完全一致させる。checkoutの改行も元hashで検証する。
- protocol ae65d167928aa0990acc17c9e27944f28c9f2133c537f2436c28f0d3f883163b、charter 0eb9deca2bc00c4cbbc4878d3ab89ea1b528848215dd3d59a731e301d6313e38を維持。
- 同じnormal runHumanJev、profile、nullpersona、画像・質問・選択・transportを使用。初回help-betaのmock入力・質問・画像と旧実測を厳密比較済。モックはAPI0で性能測定ではない。

## 継続の境界

元の13試行・92要求・HTTP402の原本は保持し、失敗したcatalog-alpha-r2も再実行しない。残りはcanonical scheduleのslice13..21に相当する8件だけ。残り8を新しいrunUUID・新規wx台帳で別フェーズ実行し、出力を旧バッチへ追記しない。

上限8試行/192要求/27分/並列1。試行ごとの24要求・12判断・15UI・3注視・180秒、段階ごとの12要求を維持。元92と合計最大284（元の全体上限504以内）。HTTP402即停止、連続2基盤障害停止、再送なし。ERROR・RESERVEDも計上する。

事前に元manifestとpending digest・source/protocol/charter/config・順序/IDを確認し、各試行前後でも固定を検証。旧1939原本・142台帳と停止バッチ299原本は前後hashを比較する。秘密と人間記録は読まない。実APIは親だけが通常wrapperから行う。

## 担当

- 親: execution worktree、共通契約、厳密なbyte再現、mock配信一致確認、実API実行、旧新別出力からの集計、報告とfeature push。
- 実装B: docs/experiments/2026-10-29-transfer-continuation.ts と tests/transfer-continuation.test.tsのみ。製品129sourceを編集しない。RED/GREENと停止/拒否・分母テスト。
- 新しいcontextの独立検証: 実装後に固定snapshotを検証。純粋guardとmock、元raw保全、実API後の分布/画像/replay/trace/分母を実行監査。製品編集や実APIをしない。

## 受入

1. 先頭13件と失敗slotを再実行しない。残り8の順序・条件・freshIDを追跡できる。
2. 129source/初期条件/質問/画像/profileは元固定版と一致。正解手順・auditをモデルへ渡さない。
3. 明示上限・停止・永続計上・失敗結果/部分結果保持を実装し、モック/実APIを区別する。
4. 原本は不変。独立で検証し、異常を成功や人間の離脱にしない。
5. 合計21予定スロットの結果・有効分母・既知/新規・反復/画像/経路を別途derived集計する。API障害の1件は有効分母から除外する。
6. 既存の補助集計修正版v2はオフライン解析だけに使う。実測producerとは版を区別する。
7. 全部実行できても、行き詰まりが観測されない成功から回復能力や人間一致を結論しない。

実装/実行/独立再検証後に結果とコマンドを追記する。サービス復旧を挟む別フェーズであることを記録する。

## 第3フェーズの事前追記（課金反映後、未実行7枠のみ）

第2フェーズは catalog/beta-r2 のassessment要求がHTTP402となり、1要求・UI操作0で停止した。2件目の障害も原本のまま保持し、再実行しない。ここまで21予定・14試行・12有効・基盤障害2・未実行7、93要求（91 OK・2 ERROR・0 RESERVED）。

課金反映後の読み取り専用metadataではcredits正・HTTP available・両Jevモデルeligibleを確認した（モデル要求0）。次はcanonical slice14の7枠だけを別フェーズで実行する。順序は既知direct/alpha-r3、help/alpha-r3、help/beta-r3、catalog/alpha-r3、catalog/beta-r3、draft/alpha-r3、draft/beta-r3。

上限7試行・168要求・24分・並列1、既存93との合計最大261。試行内上限・停止・再送なし・同じ129source/producer/profile/protocol/charterは前述のまま。旧2238原本に第2フェーズ20原本を加えた2258を保全する。新script/test/pendingだけを追加し、第2フェーズが参照する旧script/testは変更しない。

3フェーズ専用の新しいオフライン集計は、元13件＋停止1件＋新7件の一意性と、2件の既存HTTP402・RESERVED0を厳密に照合する。2フェーズだけを前提にした旧集計scriptのassertionは緩めず、適用不可のまま保持する。21枠を試行し終えることと、21件の有効結果を得ることは区別する。

親は実行・集計・文書、実装Bは新final7script/test/pending、独立担当は新snapshotの事前確認と実行後監査を担う。製品sourceは変更しない。実行後の結果を別節へ追記する。

## 第3フェーズの実行結果

実Jevは固定producerで未試行7枠だけを実行し、全7件が客観達成と主観完了で終了した。
追加54要求、累計147要求（145 OK/2 ERROR/0 RESERVED）。21予定枠すべてを試行、有効19件（新規16/既知3）、基盤障害2件を保持、未試行0。
旧2,258原本は前後不変。製品129 source、profile、protocol、charter、旧script/test、新script/pendingの固定を維持した。
親の厳密な3フェーズ集計は成功し、関連28件と継続10件、型/buildも成功した。
独立監査の最終結果は transfer-independent-review.md に追記する。

catalog/alpha-r3は先に土曜日filterを選ぶ3操作で、r1の直接2操作と経路差がある。他の有効セルの経路は各1種類。
catalog各版は2有効反復、他は3有効反復。行き詰まりや必要再訪がないため、その一般化や人間再現は未検証のまま。
