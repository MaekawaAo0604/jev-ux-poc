# 試した条件の結果を次の判断へ渡す

2026-10-31。前回選んだ条件・確認対象・実行操作を次の観察へ引き継ぎ、その条件について分かった結果を直近3件まで判断へ渡す任意部品を追加した。
予定8枠のうち実行8、有効8、無効0、未実行0。新方式は有効4件中3件、従来方式は有効4件中2件が目的達成。合計222要求。各条件1反復であり、安定した改善はまだ判定できない。
実装と計測の検証、実モデルの成績、人間との一致を別々に扱う。[試行別JSON](inquiry-outcome-results.json)から各結果を追える。

## 基準・実装範囲

基準は[前フェーズ](working-inquiry.md)の1f28508656c13b6cdcc92768a5c98d4ceec2a587、実行ソースec48493aの161ファイル。
前フェーズのOpenAI講座予約では、照合を3回繰り返し、最初の照合後に変更可能となっても保存しなかった。
全履歴が存在しないという問題ではなく、選んだ条件とcheckを次の判断で評価する専用の受け渡しがなかった。

今回の実行生成版は5ad0919bbd9b7325fd688f7ba931c691312a4c84、ソースhashは58d606cf923d3ec814f6525975dfb673a137f195647a2213ce3cb925f74f467c、実行に関係する164ファイル。
feature/virtual-beta-information-stateの既存隔離worktreeへ統合した。元のE:/ChatGPT/Ux_testの未コミット変更は保持した。
資料の公開コミットを実行生成版と混同しない。[事前計画](../superpowers/plans/2026-10-31-inquiry-outcome.md)と[比較設定](../../experiments/virtual-beta/inquiry-outcome-comparison.json)を固定して実行した。

- 実装A：[inquiry-outcome.ts](../../jev/virtual-beta/inquiry-outcome.ts)と担当テスト。操作の引き継ぎ、条件別結果の受理、容量・出典検証を担当。
- 実装B：[inquiry-outcome-projection.ts](../../jev/virtual-beta/inquiry-outcome-projection.ts)と担当テスト。受理済み結果のみの投影、過去情報のscope、候補説明を担当。
- 親：[共通契約](../../jev/virtual-beta/inquiry-outcome-contracts.ts)、config/contracts、[core](../../runner/virtual-beta-core.ts)、[replay](../../runner/virtual-beta-replay.ts)、profiles、recovery-analysis、action-instructions、[既存比較runner](../../runner/condition-continuity-comparison.ts)、統合・障害・非UI・比較テストを担当。
- 別コンテキストの検証担当：固定版で独自の実行・改ざん・失敗経路・比較を検査し、修正後に新規実行で再検証した。

生成コミットは20ファイル。新しいフレームワーク・学習依存・正解経路・再訪禁止・確率補正は追加していない。
画像抽出は従来のOpenAI Responses/gpt-6-luna、評価と行動はJev1.14.0を使う。
主比較はJevの新旧方式であり、OpenAI Decisionsの追加機能確認は別枠・別の分母に分けた。

## 設定と情報の境界

新プロファイルexperience-inquiry-outcomeはexperience-working-inquiryを継承する。
visualHypotheses.inquiryOutcome=trueを追加し、workingInquiry、state、deliberationを必須とする。既定の動作は変更しない。
固定persona、目的と禁止事項のcharter、観察画像、利用可能な状態、分布と実行監査を引き続き分ける。
今回のpersonaはnull、behaviorはgoal。ペルソナ効果や人間の行動再現は今回の比較対象ではない。

実行した操作だけからpending-inquiry-operationを作る。
条件の記述と元の根拠、受理済みintent/check、候補ID・操作種別、実行結果を保持する。
候補IDは出典画面にだけ属し、次画面の同名IDを同じボタンとはみなさない。
注視・読み直し・待つも扱い、UI候補に存在しないことだけで操作エラーにしない。
done・諦め・stuck・操作失敗から次のpendingを作らない。次のモデル観察がなければ、最終監査画面からモデルの判断を補わない。

2判断目以降、既存の評価要求へ次の2問を加える。追加のAPI段階はない。

1. inquiryOutcome_result：条件が満たされた／未達／不確か、経路が見つかった／見つからない、不明。
2. inquiryOutcome_basis：現在の画像を根拠にした／根拠なし。

前のcheckと互換性がない結果、条件なしの条件評価、根拠を申告しない非unknown回答はunknownへ下げ、raw回答と補正理由を監査に残す。
current_imageもモデルによる根拠の申告であり、正しい転記や意味理解の証明ではない。
条件別の満足と、全体Goalの達成を連動させて書き換えない。

評価段階は前の操作と評価前の記憶を受け取る。行動段階ではその文脈を取り除き、更新後の直近3結果だけを渡す。
raw回答・補正過程は監査側に置き、行動側は受理済みの結果だけを受け取る。
過去の条件はhistorical、評価はlast-assessed-at-sourceと明示する。現在の事実や人間の確信度へ昇格させない。
新しい記憶画像や監査用DOM・客観的成功・全履歴を追加送信しない。
既存の共有選択方針は残る。新部品が候補を除外したり、再訪や特定候補の確率を強制変更したりしない。

## 実行方法と比較条件

同じローカルUI・目的・初期状態・空の記憶で、新旧2方式を図書館／講座予約のchanged／unchanged条件で比較した。
changedは前提変更後の再訪、unchangedは照合が必要なケースを含む既存fixture。
4組・8枠、各条件1反復で、fixtureごとに新旧の実行順を交互にした。
各試行は12判断、15UI操作、3注視、300秒、画像抽出60秒、36要求。合計上限288要求、42分、並列1、再試行0。
失敗枠を差し替えず、API・不正出力・会計異常と未実行を分ける。

リポジトリルートのPowerShellから、新しい出力先を指定する。

    npm run build
    node --import tsx --test --test-concurrency=1 tests/inquiry-outcome.test.ts tests/inquiry-outcome-projection.test.ts tests/inquiry-outcome-runtime.test.ts tests/inquiry-outcome-integration.test.ts tests/inquiry-outcome-failures.test.ts tests/inquiry-outcome-nonui.test.ts tests/inquiry-outcome-comparison.test.ts
    $stamp = Get-Date -Format yyyyMMdd-HHmmss
    $prior = (Resolve-Path experiments/virtual-beta/empty-prior-snapshot.json).Path
    node --import tsx runner/condition-continuity-comparison.ts --outcome --mock --trial-ms 300000 --visual-request-ms 60000 --prior-snapshot $prior --out "reports/outcome-mock-$stamp"

実モデル比較は次で行う。資格情報をログ・コミットへ含めない。

    $stamp = Get-Date -Format yyyyMMdd-HHmmss
    node --import tsx runner/condition-continuity-comparison.ts --outcome --trial-ms 300000 --visual-request-ms 60000 --max-requests 288 --prior-snapshot $prior --env-file E:/ChatGPT/Ux_test/.env --out "reports/outcome-live-$stamp"

empty-prior-snapshot.jsonは過去原本のない新規checkout用で、以前の原本保全を証明しない。
この作業環境では$priorをreports/inquiry-outcome-2026-10-31/final-prior-raw.jsonの絶対パスへ変える。
今回の実行は以前の6546件を指定して保護した。保存済み入力の直接再送や、人間の操作・感想のモデル送信は行っていない。

## 実モデルの結果と判断の限界

- 図書館・changed・新方式：21要求、7判断、照合0回、客観達成true、SUBJECTIVE_DONE、有効=true。
- 図書館・changed・従来方式：21要求、7判断、照合0回、客観達成true、SUBJECTIVE_DONE、有効=true。
- 図書館・unchanged・従来方式：36要求、12判断、照合0回、客観達成false、DECISION_LIMIT、有効=true。
- 図書館・unchanged・新方式：36要求、12判断、照合0回、客観達成false、DECISION_LIMIT、有効=true。
- 講座予約・changed・新方式：21要求、7判断、照合0回、客観達成true、SUBJECTIVE_DONE、有効=true。
- 講座予約・changed・従来方式：21要求、7判断、照合0回、客観達成true、SUBJECTIVE_DONE、有効=true。
- 講座予約・unchanged・従来方式：36要求、12判断、照合0回、客観達成false、DECISION_LIMIT、有効=true。
- 講座予約・unchanged・新方式：30要求、10判断、照合1回、客観達成true、SUBJECTIVE_DONE、有効=true。

実照合は新方式1回、従来方式0回。このうちeligibilityと保存値が変わらない後続照合は新0回、旧0回だった。照合回数の増加だけを改善と扱わない。

新方式の図書館changedのstep4では、直前の条件をcondition_satisfied、全体Goalをuncertainと分けて評価し、受理済み結果が行動入力へ届いた。最終目的達成は別の客観判定で確認した。

事前の画像方針で選んだ実入力。保存前の画像を保存完了の証拠とは扱わない。

![新方式・図書館unchanged：最初の記録画面](assets/inquiry-outcome-records.png)

このstep6では「予約記録を照合する」e1が見えていたが、e2「マイページへ」を選んだ。記録画面には到達しており、照合を実行しないまま移動した。実照合後の変更画面は今回の新方式・図書館unchangedにはなく、2枚目の選定画像は欠測とする。

条件別の結果は32件中27件が補正後unknownだった。内訳は新方式の図書館changedが4/6、unchangedが9/11、講座予約changedが5/6、unchangedが9/9。成功した講座予約unchangedも9件全てunknownであり、「条件を理解した結果、探索を切り替えた」とは認定できない。

この試行のstep7の条件は「照合完了」と「変更後の保存結果確認」を含む複合条件だった。前提の照合が画面上で完了していても、条件全体のunknownだけで前提認識の失敗とは断定しない。step10ではrawのcondition_satisfied/current_imageが、直前checkとの不整合によりunknownへ補正された。条件の粒度・確認意図・根拠申告を別々に検証する必要がある。

別の反例として、新方式の図書館unchangedのstep8は、現在o8の引用として「保存済みの受取館　中央図書館」を生成したが、実入力PNGにはその行がなかった。値が監査上正しくても、現在画像から読めたという証拠にはならない。元のmodel-transcribed-unverifiedを維持し、hash一致で意味の正しさを認めない。

## OpenAI判断バックエンドでの追加機能確認

主比較のJev8枠は変更せず、条件を満たしたため事前に定めた別枠2試行を同じ新方式で実行した。72要求、有効2・無効0・未実行0。客観達成は有効試行中0件だった。

- library：36要求、照合0回、客観達成false、DECISION_LIMIT。
- workshop：36要求、照合0回、客観達成false、DECISION_LIMIT。

利用情報の確認は図書館2回、講座予約4回だった。これは記録画面での照合とは異なり、両試行とも記録照合は0回、記録画面への到達もなかった。

個別の結果は22件中22件が受理後unknownだった。checkがnew_route_visibleなのに条件状態を回答して不整合になる例と、根拠なしの回答を分けて原本に残した。モデルを替えれば解決するとは認めない。

新規の初期状態から通常runnerのdecisionBackend=openai-decisionsを使い、gpt-6-lunaで評価・行動を選んだ。保存入力や人間記録は再送しない。画像抽出の出力と後続履歴が異なるため、同一入力での優劣比較ではない。実行スクリプトはreports/inquiry-outcome-2026-10-31/parent/openai-sanity.tsと各出力のorchestrator-source.tsにhash付きで保存した。既存出力先をそのまま再実行しない。

[追加原本の独立監査](inquiry-outcome-review-openai.json)も、実装・会計・配送・再生の整合性に範囲を限定する。

目的達成率だけで、探索切替の安定化や人間との一致を認定しない。
初期UI・画像・目的・画像抽出要求本文は一致を検査するが、モデル出力と後続の履歴は新規生成で異なる。
各条件1反復では条件内のばらつきを評価できず、変更の因果効果や安定した優位は主張できない。
API待機時間はユーザーの行動時間ではない。

## 回帰・独立検証・修正

親の関連300件は最終修正前、修正版の関連108件は全て通過した。集合は重複するため合算しない。
型検査とViteビルドも成功した。全テストスイート完走という主張はしない。
独立担当は修正版で46関連検査と追加の正規化実行、17の新規失敗経路、40の改ざん拒否を確認した。
8枠の通常CLIモックは有効8・要求0・客観達成0。実モデルの成功とは区別する。

独立1回目は2件を発見した。

- IO-R1-001（P1）：5判断目以降、評価前の3件と更新後の3件が行動入力に併存し、異なる4件が見えていた。行動入力から評価前文脈を取り除き、更新後3件だけを渡すよう修正した。
- IO-R1-002（P2）：行動段階へ評価用質問を足してhashを再計算しても、リプレイが受け入れた。旧方式・native途中障害でも再現した。評価以外の段階にある新質問を拒否する検査を追加した。

最初のFAILと固定ソース・改変ログを保持した。修正はcoreの配送とreplayの検査、回帰テストと計画の追記に限る。
native画像抽出、UI、候補、モデル、確率・重み・選択は変えていない。
修正後の正常ログへ同じ改変を施して新規検査し、6判断以上の実入力でも3件以内を確認した。
以前の版のログは以前の固定ソースと共に保存している。修正版の段階配置と異なる旧ログを、新版の正常実行として扱わない。

- [独立1回目：FAILを保持](inquiry-outcome-review-round1.json)
- [修正後の独立2回目：PASS](inquiry-outcome-review-round2.json)
- [新規実ログの独立監査](inquiry-outcome-review-live.json)

実ログの独立監査の対象と未検証範囲は原文に保存した。PASSは会計・出典・配信・再生・集計の整合性を示す。条件解釈や人間再現の合格ではない。

過去6546件の実体を一括参照する独立検査は、自動承認レビューが実行前に拒否した。
独立側は安全な代替としてmanifestの一致を確認し、過去実体の再hashは未検証と記録した。
親の全過去実体SHA検査と、新規の架空UI実ログの独立検査を分けている。独立側が過去実体まで検証したとは主張しない。

## 未解決の機能と追加調査

1. 複合条件を分け、作業対象とintent/checkの整合を条件別結果と合わせて検証する。unknown補正の原因を、条件粒度・check・根拠申告に分けて調べる。正解経路や一律の再訪禁止は追加しない。
2. 現在引用への過去文混入と、モデルのcurrent_image申告の意味を独立に検査する。hash一致で転記・理解を認定しない。
3. 同じ条件の反復、別課題、非null personaでばらつきを測る。人間比較は別途取得する。

現在引用への過去文混入の検証、条件の分割、intent/checkの整合した生成、根拠申告の評価、活動中の条件と保持する過去条件の分離は別の未解決課題として残る。
今回、新しい論文コード・学習モデル・重みは導入していない。部品の実装だけで人間モデルの未検証部分を解決したとしない。
人間との比較データ取得と、非null persona・複数反復での評価が今後必要である。

## 成果物の場所

原本・台帳・実入力画像・段階別要求と回答・固定ソース・検証スクリプトはreports/inquiry-outcome-2026-10-31/。
reportsはGit管理外。公開資料には結果JSON、独立監査原文、選定した実入力画像を収録する。
manifest.jsonで版・設定・実行ID・未実行、summary.jsonで有効／無効と客観結果、live-observations.jsonで条件別結果と実照合を追える。
最終原本は6947件、固定ソースZIPは164件・SHA-256 0598460e0b3e6bc3ab741727dcf0ee18a47a7d1468403b487a9149892fec87b8。
親と独立担当のZIP検査の範囲は各原文に記録した。

    node --import tsx runner/virtual-beta-replay.ts "C:/Users/Maekawa Ao/.codex/worktrees/virtual-beta/Ux_test/reports/inquiry-outcome-2026-10-31/live/recovery-library-changed-r1-experience-inquiry-outcome/exploration" --require-final-http
