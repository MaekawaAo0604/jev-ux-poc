# 未解決条件の継続記憶：実装と実モデル検証

画面から抽出した条件を、次画面で「継続・変更・充足・未観測」として更新する部品を追加した。既存方式は維持し、専用actorで切り替える。実モデルでは生成指示の修正後、最初の課題を達成したが、8予定枠中5枠で連続タイムアウト停止した。**探索の安定化、条件記憶による改善、人間との一致は未証明である。**

[最終版JSON](condition-continuity-results.json)、[CSV](condition-continuity-results.csv)、[版と会計](condition-continuity-versions.json)、[事後診断](condition-continuity-posthoc/analysis.json)。原本はローカルの reports/condition-continuity-2026-10-30 に保持する。

## 基準と担当

開始時点は feature/virtual-beta-information-state の930be34、source150の7e27d09a。過去18枠と3枠の疎通確認を、新実装の実績に付け替えない。元のEドライブの変更は上書きせず、管理worktreeで実装した。

親は共通契約・config・core/input・profile・runner・replay・比較と統合を担当。実装Aは jev/virtual-beta/condition-continuity.ts と専用テスト、実装Bは runner/openai-visual-hypotheses.ts と通信テストを担当した。独立検証は実装担当とは別のコンテキストで開始し、製品コードを変更せず、固定ソース・実テスト・原画像・実ログから確認した。

## 追加した部品

actor名は experience-visual-conditions-continuity。従来の experience-visual-conditions を継承し、設定断片は次のとおり。

~~~json
{"visualHypotheses":{"enabled":true,"capacity":3,"continuity":{"capacity":3}}}
~~~

ユーザー仕様と探索チャーター、監査用製品状態、ユーザー側の観察・記憶は分離したままである。今回はpersonaなし・目的達成モードを固定し、人間模倣モードの性能を測っていない。

条件の固定ID、最後の根拠とその出典、現在の状態、更新の説明を容量3で管理する。未観測は現在uncertainとし、過去の根拠を現在の事実にしない。容量破棄はevictionとして記録し、解消と区別する。resolvedは現在の充足を示す契約で、初めて解消した件数と同義ではない。

モデルが条件の対応を選ぶ。コードに正解経路・画面名・再訪禁止を登録していない。既存の一時保留方策は維持しているため、元分布・補正・選択は別々に保存する。最終版の1試行には既存方策による選択補正1回があり、補正ゼロとは表現しない。

native抽出へ渡すcontext、返却された遷移、更新前後、容量破棄を保存し、同じ更新をJevの評価・行動両段階へ渡す。replayは保存値を信用するだけでなく、出典・before/after・両段階への配送を再計算する。短い説明と引用はモデルの説明・転記であり、内部判断全体や逐字一致の保証ではない。

## 修正と独立検証

初回の独立ゲートはFAILだった。部分停止ログ内の状態改ざん、最初の入力欠落、同じ観察IDに異なる画像hashを入れたケースを再現し、検出を修正した。[初回FAIL](condition-continuity-review-round1.json)を残し、[再検証](condition-continuity-review-round2.json)で198件・型・buildが通過した。

最初の実モデル版dd8527bは2/8枠・22要求で停止した。対照1件は達成、新方式は最初のHTTP400で判断前停止。元のエラー本文が保存されていないため、正確な400原因は不明である。[停止版](condition-continuity-stops/provider/results.json)と[独立監査](condition-continuity-review-provider-stop.json)を別に保持する。

次に、新モードだけの説明文スキーマからlookaheadを除去し、HTTP400では最大8192bytesから許可済み診断だけを残す修正を加えた。本文・任意のエラー文字列・認証情報は保存しない。読み取り失敗後もHTTP400をタイムアウトへ付け替えない。[独立234件・型・build](condition-continuity-review-round3.json)を通過し、旧本文は同一、新本文の差は正規表現2か所だった。これは元の400原因の確定ではない。

39e36adは最初の抽出とJev二段階を通過したが、次のHTTP200出力が「uncertain・根拠null」と「revised」を同時に返し、既存の厳格な受理で停止した。1/8枠・4要求。[停止版](condition-continuity-stops/schema/results.json)、[独立監査](condition-continuity-review-schema-stop.json)。元画像を復元したオフライン再現でも、この2件の矛盾を独立に拒否できた。保存要求のtimeoutは記録されていないため、再現用30000msは仮値で、実dispatch値と主張しない。

生成指示だけを一般化して補強した。「根拠なし・過去根拠のみならunobservedとnull、revisedかつuncertainなら現在画像の実引用が必要」と明記し、引用の捏造を禁止した。受理条件やスキーマは緩めていない。[独立239件・型・build](condition-continuity-review-prompt-preflight.json)が通過。旧方式の本文は不変、新方式の差は指示文だけ。同じ矛盾が再発すれば停止し、さらに指示を重ねる方針は採用していない。

## 最終版の実測

producerは71989e7e2f914f79f73dbc5316dd7e6ee3909a00、source153はd7bdc1dda5b4202a784a8106f907e88ec3e39a4cad5ddcd42417dca7e7e49e2f。manifest SHA256は3ad5053d4b94851cecc672da646511636357b111b7b497b4c483473134aaef5e。

図書予約と工房予約の changed/unchanged、各1回、2actorの8枠を予定した。UI・目的・初期状態・personaなし・argmax seed20261028を固定し、actor順は条件ごとに交替。並列1、再試行0、各36要求・12判断・15UI操作・3注視・180秒、全体30分である。

- 従来方式：図書changedは21要求・6UI操作、図書unchangedは30要求・9UI操作で達成。試行2件は有効、残り2件は未実行。
- 継続記憶方式：図書changedは21要求・6UI操作で達成。図書unchangedは25要求・8UI操作後、9判断目の抽出でTIMEOUT。工房changedは7要求・2UI操作後、3判断目の抽出でTIMEOUT。残り1件は未実行。
- 合計：5試行・有効3・基盤障害2・未実行3。連続基盤障害で停止し、8枠比較は未完了。HTTP試行104、受領確認102、受領未確認2。費用と人間時間は不明のnullである。

図書changedの操作列は両方式で一致し、共通初期入力は完成した2ペアで一致した。新方式の2件のタイムアウトを人間の迷い・離脱や有効なUX失敗として集計しない。前段の22＋4要求を含む今回の累計は130/288、残枠158。版ごとの性能を合算せず、停止枠を成功枠へ差し替えない。

事前に各予定枠の最初の2観察、計16枠を固定した。10画像が保存され、未実行分6画像は欠測のままである。画像と引用の意味を全出力へ一般化する標本ではない。

[独立した最終証拠監査](condition-continuity-review-live.json)は394チェック・整合性指摘0で通過した。ただし保持上の限界があり、性能合格ではない。固定ZIPの153ソースで全5試行をreplayし、native36要求のうち34採用、Jev評価34＋行動34、continuity17記録・41遷移・28容量破棄の再計算と両段階への配送を確認した。原本5709件は不変。人間の再現や、全出力の意味の正しさを証明する監査ではない。

初回ゲートの3件は実装上の不具合として修正した。元400は原因未特定、HTTP200の矛盾はモデル出力の契約違反、現在の2件は通信上のタイムアウトである。条件の容量破棄は定めた実装契約どおりに起きており、目標に対する表現・保持方針の限界として扱う。これらを一つの「ユーザーの失敗」へまとめない。

## 残った問題と次の実装

**P0：条件の同一性と、現在の確証を分ける。** 達成した新方式のo2でも、前の3条件を未観測とし、容量によってすべて破棄して新しい3条件へ入れ替えていた。専用のcontinuity記憶では古いIDとその根拠を失う。既存の別記憶や添付履歴画像もすべて失われた、という意味ではない。観測できない同じ条件を対応付けることと、現在の根拠で状態を確定することを別に表せる契約を次の候補にする。旧根拠を現在の事実にせず、同じ条件を新IDで重複登録しないことを検証する。

**P1：中間操作の選択は未解決。** 事後に選んだ[同じ記録画面](condition-continuity-posthoc/records.png)で、従来方式は照合を選び、新方式はマイページへ戻った。両方とも照合候補をinformationと分類していた。新方式の元分布は照合0.02・戻る0.86、対照は照合0.44・戻る0.37で、両地点の重みはすべて1。実操作後、対照は照合件数0→1・利用可能false→true、新方式は戻るだけで変わらなかった。後続履歴・全入力は異なるため、この差を継続記憶の因果効果や分類名だけの問題と断定しない。

**P1：API待ちを分離計測する。** nativeの実dispatch期限と残り試行時間を保存し、30秒の単一要求上限と試行期限による停止を判別できるようにする。推論effortを変えるなら、この計測を共通にした単独要因比較とし、品質向上を先に仮定しない。

人間の対象集団との比較、persona整合性の新しい実測、反復による効果の安定性、全出力の引用精度は未検証である。今回の達成や行動差を、人間再現の成功と結論しない。

## 実行方法

以下は管理worktreeのルートで実行する。外部認証ファイルはE:/ChatGPT/Ux_test/.env。キー値は表示・Git保存しない。過去原本とsnapshotはGitに含めていないため、新規cloneだけでは過去の保全確認やreplayはできない。

~~~powershell
# API0：今回の関連回帰（実モデル性能ではない）
node --import tsx --test --test-concurrency=1 tests/condition-continuity.test.ts tests/condition-continuity-transport.test.ts tests/condition-continuity-comparison.test.ts tests/condition-continuity-integration.test.ts tests/visual-hypotheses.test.ts tests/openai-visual-hypotheses.test.ts tests/visual-conditions-integration.test.ts tests/recovery-transport.test.ts tests/visual-conditions-comparison.test.ts
npm run build

# API0：この環境に保存された原本のreplay
npm run replay:virtual-beta -- reports/condition-continuity-2026-10-30/prompt-fixed-live/recovery-library-changed-r1-experience-visual-conditions-continuity/exploration

# 新規比較。残枠158を明示するため、8枠完走を保証するコマンドではない。
# 出力先は必ず新規。過去の保存入力を直接再送しない。
node --import tsx runner/condition-continuity-comparison.ts --env-file E:/ChatGPT/Ux_test/.env --prior-snapshot (Resolve-Path reports/condition-continuity-2026-10-30/prior-raw-v4.json).Path --max-requests 158 --out reports/condition-continuity-new
~~~

新規比較の自動台帳、manifest、summary、各result、モデル入力画像、分布と選択、根拠・状態更新・実操作・終了理由をreportsの新規出力先へ保存する。先頭2枠だけなら --limit 2 を追加する。実行条件や上限を変える場合は別の版・実験として記録する。

保存済み結果をAPIなしで再集計するコマンドも追加した。現在のソース・protocolとの一致、manifest hash、台帳、原画像を確認し、新規出力先へ書き出す。旧版の停止結果はそのproducerで再集計する。

~~~powershell
node --import tsx docs/experiments/2026-10-30-condition-continuity-report.ts reports/condition-continuity-2026-10-30/prompt-fixed-live/manifest.json 3ad5053d4b94851cecc672da646511636357b111b7b497b4c483473134aaef5e reports/condition-continuity-report-new
~~~

このコマンド自体も型検査し、今回のJSON・CSV・10PNGの12ファイルが完全一致で再生成されることを実行確認した。実モデルの再実行ではない。
