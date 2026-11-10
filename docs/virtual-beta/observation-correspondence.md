# 過去の観察と現在の候補の対応付け

## 今回の変更

保存された履歴があっても、現在の候補との関係が入力から分からなければ、過去の操作結果を次の判断に使えない。前回の通知設定の2試行では、同じ設定画面の候補が繰り返し現れる一方、入力画像のhash差によって既存の同一画面判定が成立しなかった。1組は1,152,000画素中18画素、最大チャンネル差1だった。ただし、別の段階では非進展を示す根拠の受理自体が欠けており、対応付けだけで全LOOPが解決するとは予測しない。

新方式 `experience-reason-correspondence` は、直前の `experience-reason-conditional` に対応付け部品だけを加える。元の画像hash・操作履歴・保留条件は書き換えない。再訪を禁止せず、候補の確率補正や終了判定も変更しない。

1. 実際にモデルへ渡した過去の画像を最大8枚保存する。DOM、候補ラベル、URL、監査用全画面をユーザー情報として渡さない。
2. 実行済み操作と引用付き結果判断のある画像を優先し、縮小画素距離で比較候補を検索する。距離は検索順だけに使い、同じ画面だと確定しない。
3. 現在と過去の実画像を既存の評価要求へ添付し、候補ごとに `unchanged_eN`、`changed_eN`、`none` を問い合わせる。目的に関わる前提条件・文脈・効果の変更を区別する。
4. `unchanged` と受理された候補だけに、実行された過去の操作と当時の進展・期待の判断を付ける。過去の判断は仮説であり、現在の事実とは扱わない。`changed` と `none` には転記しない。

対応付け先の重複は受理せず、補正理由を記録する。不正な確率・候補はエラーとして停止する。1要求あたり最大4種類の画像、追加過去画像は最大1枚。直近記憶・阻害理由の画像を含めて上限を守り、収まらない場合は `IMAGE_CAPACITY` を記録する。追加API段階はない。

## 境界と記録

固定Persona、Charter、観察、可変ユーザー状態、判断、実操作・監査の既存境界を維持した。対応付けarchiveは試行ごとに新規作成し、実際に提示した制約画像だけを保持する。検索距離や全履歴はモデル入力にしない。

`step-N.json` と `result.json` の `correspondence` に検索理由、出典、archive、未加工の分布、受理した仮説、棄却理由、候補説明の変更前後を保存する。評価・行動の両入力には実際に添付した画像参照が残る。`selection` の分布・seed・draw・実選択と `action/outcome` を使い、説明への追記と実操作の変化を分けて検査する。

replayは保存済み仮説を正解として信用せず、PNG、実際に提示した候補、時系列、画像上限、質問、受理、注記を再構成する。保存分布から選択を再計算するローカル検査で、外部APIへの再送やブラウザー操作の再実行はしない。

## 実行

依存関係をインストールしたリポジトリrootで実行する。出力先は未使用のディレクトリにする。

```powershell
npx tsx --test --test-concurrency=1 tests/observation-correspondence.test.ts tests/observation-correspondence-profile.test.ts tests/observation-correspondence-experiment.test.ts tests/observation-correspondence-integration.test.ts tests/observation-correspondence-independent.test.ts
npx tsc --noEmit
npm run build

# 架空UI・実Jev。12試行、最大288要求、並列1、再試行なし
node --import tsx runner/deferral-reason-experiment.ts --comparison observation-correspondence --env-file .env --out reports/correspondence-new

# 保存記録をローカル再検査
node --import tsx docs/experiments/2026-10-29-observation-correspondence-audit.mjs reports/correspondence-new reports/correspondence-new/audit.json
```

比較は通知設定、前提条件変更後の必要再訪2課題、それぞれ2反復、旧・新の順序を反転する12試行。UI、目的、Persona、初期画面、seed、上限を合わせ、設定差はidとcorrespondence部品だけを許可する。画像検索・必要時の過去画像・質問・注記を一つの変更部品として比較するため、その内訳の効果は分離できない。各試行最大12判断、24要求、15UI操作、3注視、180秒。phase最大20分。

## 独立検証と修正

製品を `b42a41bc4171282f2264983a63ce216945804ddd`、sourceHash `6c32976401b2593ea61a233a20c8bc83b73996a386f384c858a4fea1f54d6b09` に固定した。独立検証34件は全合格、skip0。実Chromiumと通常gatewayのfetch stubを通す75要求を使用し、外部APIは0。過去48試行のreplayと82台帳の不変も確認した。

初回に監査改変6件が通る問題を再現し、2回の最小修正と再検証を行った。提案のない段階や無効設定で行動入力へ仮説を混入する改変、実候補を状態から抜く改変、必須メタデータをまとめて削る改変を拒否するようにした。テストのassertや受入条件は維持した。最終21種類の改変をすべて拒否した。独立テスト側の型注釈・過去成果物の相対pathの修正は製品不具合と区別して記録した。

最初の部品・統合73件、既存browser回帰3件、従来4条件のmock疎通も成功。mock・stubは接続と監査整合性の検査であり、モデルの意味精度や性能を示さない。

## 実モデルの結果

実Jev1.14.0で12試行、224/288要求を実行した。旧・新それぞれ112要求、全要求は再試行なし。客観的成功は旧4/6、新4/6で、今回は改善を確認できなかった。通知設定は旧新それぞれ0/2、全4試行が12判断・12UI操作でDECISION_LIMIT。前提変更後の必要再訪2課題は旧新それぞれ4/4、全8試行が7UI操作・8判断で達成した。基盤障害、操作失敗、誤ったdoneは0。

新方式の対応付け提案は35段階。実際の評価・行動の両入力へ出典が35/35で添付され、最大画像数は4。通知設定では15段階に65問を送り、unchanged48、changed6、none7、対応先衝突による棄却4。再訪2課題では合わせて20段階、unchanged4、changed16、none8だった。これらは仮説数であり、正解数や精度ではない。

過去経験の注記は通知設定の7候補に入り、そのうち5回は注記された候補を再選択した。注記後の実クリックもUI_PERFORMEDで、次の画像とURLに反映された。新通知r1のo6/o8は現在e4と過去o2:e4をunchangedとし、実画像では同じ「お知らせ」と設定文脈だった。しかし、注記元o2:e4→o3のモデル評価自体がprogress=neutral、expectation=unknown、根拠o3だった。集約処理で否定判断を失ったわけではない。r2の最初の同経験はneutral/not_supported、後の注記元はneutral/unknownで、再選択が続いた。

したがって今回確認できたのは、微小描画差で失われていた候補と過去経験の接続が実モデル入力へ届いたこと。目的に近づかなかった経験から他候補へ切り替える能力は未改善である。新再訪課題の保留解除は既存の理由判断で成立しており、correspondence部品だけの効果とは扱わない。

6組すべてで初回評価の入力hashは同じだったが、回答分布は異なった。初回行動入力は5組で同じ、1組は先行評価の差を反映して異なった。操作列の差をこの部品の因果効果と断定せず、少数反復の記述比較として保存する。

独立raw監査では35枚の実PNGを直接確認し、重大な未解決の整合性不具合は見つからなかった。今回の実画像o2→o6は21,592画素・最大差73で、先行診断の18画素とは別の組である。

12保存replayと12traceのZIP CRC・完了click/scroll数・mainframe遷移を照合し、旧82台帳も不変だった。BackのCDP履歴操作はtraceのbefore-eventに残らないため、raw action/outcomeと後続frame URL・画像で補う。モデルの確率や記録されたmodel tagは、人間頻度やprovider内部の保証ではない。

[集計と実選択のJSON](observation-correspondence-results.json)、[独立検証・修正](observation-correspondence-independent-review.md) に記録した。raw成果物はローカルの reports/observation-correspondence-2026-10-29/live/。

## 残る検証

対応付けはモデルの仮説であり、画面の同一性や前提条件の変化を正しく理解する保証はない。最大8枚の検索と既知結果の優先には取りこぼしがあり、同じ画面でも有効な候補が検索対象外になることがある。保持する操作結果も短い進展・期待判断であり、ページに何があったかという十分な意味記憶を保証しない。

目的達成、探索の切り替え、必要再訪、誤った結果の持ち越しを分けて測る。人間の比較データを今回のモデルへ送らず、人間一致度は未検証とする。小数試行の多様性や成功率だけで人間の再現とは結論しない。

## 基準・分担・成果物

棚卸しの基準はpush済みの `76b6b269`。既存の視覚制約、Persona/Charter分離、ユーザー状態、seed付き選択、2段階判断、保留理由、UI内だけの確率補正、比較・replayを流用した。過去のLOOPは未解決として現ログを再分析し、過去の問題を新規実装したと扱わない。

親は共通contract/config、profile、core、replay、比較の統合と実行・報告を担当した。実装サブA（reason_memory）は `jev/virtual-beta/correspondence.ts` と部品テスト、実装サブB（reason_experiment）は既存 `runner/deferral-reason-experiment.ts` の比較追加と専用テストを担当した。同じ隔離worktree内で編集範囲を分けた。独立サブ（correspondence_verify）は新しいコンテキストで専用テストとraw監査を担当し、製品コードを編集しなかった。

実装commitは `a469c2b1`、監査修正は `0da8f162` と `b42a41bc`。統合先は `feature/virtual-beta-information-state`。既定ブランチ、リリース、本番は変更しない。元の `E:/ChatGPT/Ux_test` の未コミット変更を保持し、実装・実験は隔離worktreeで行った。

ローカル成果物は `reports/observation-correspondence-2026-10-29/`。`live/manifest.json` が版・設定・順序・予算、各試行の `exploration/` が実際の画像・入力・分布・操作・結果・trace、`independent-review-final.json` が独立配線検証の結論。追試用コードは `docs/experiments/2026-10-29-correspondence-diagnosis.mjs`、`2026-10-29-observation-correspondence-audit.mjs`、`2026-10-29-correspondence-independent-raw.mjs`。人間比較データの追加測定と、未学習画面への一般化は未実施。

次の優先順位は、(1)実画像から「何を探し、何が見つかった／見つからなかったか」を根拠付きで保持する意味記憶と、その結果を次の探索仮説へ接続する切り分け、(2)前提条件を変える正例・負例付きの対応精度検証、(3)未学習課題と人間記録による切り替え・必要再訪の比較とする。現在のneutralを制御器で一律に失敗へ変換したり、訪問済み候補を禁止したりしない。意味記憶の追加は次の独立した変更・比較として行い、今回の修正や成功率に混ぜない。

追試用のraw・trace検査も外部通信を行わない。実モデル実行の保存入力をAPIへ再送しない。

```powershell
node --import tsx docs/experiments/2026-10-29-correspondence-independent-raw.mjs reports/observation-correspondence-2026-10-29/live reports/observation-correspondence-2026-10-29/independent-recheck.json
python docs/experiments/2026-10-29-correspondence-trace-audit.py reports/correspondence-new reports/correspondence-new/trace-audit.json
```

独立raw検査は今回のproducer版・台帳・上限に固定した監査コードであり、新しい製品版の実験では固定値をその検証対象へ明示的に合わせる。docsだけの追加commitは、全製品sourceHashesが一致する場合に追試できる。
