# 予測と実結果を結び付ける経験状態 — 2026-10-28

経験状態を実装して実モデルで3試行したが、今回も経路切替は起きなかった。実装と検証は成立し、要求された探索能力は未達である。最後の試行では根拠付きの「進展なし・予想不支持」が保持されても同じ入口を選んだ。単に履歴を保存すれば解決する問題ではなかった。

## 履歴があっても反復した理由

旧実行ではホーム帰還時の判断4に画像o2/o3/o4があり、最初のホームo1は容量3のbufferから消えていた。直近の操作e4/e4/e3は到達観察に付いており、出発画像と選択対象の対応を保持していなかった。評価も画像記憶の出典が失効すると落ちる。さらにoutcome=performedは実操作の実行を示すだけで、予想した効果が得られたかを表さない。そのため同じ見立てを更新する仕組みが不足していた。これが反復の唯一の原因だと確定したわけではない。

新実装はこの対応を明示する。履歴が存在すること自体を、理解や次の方針変更の保証とは扱わない。

## 実装

- 固定Persona/Charter、画像buffer3、既存の二段階判断とsamplerは維持。設定 `experience:{enabled:true,capacity:8}` を追加。
- 実行した操作の出発観察ID/画像hash、当時の候補ID/操作、予想効果と、次の到達観察を結び付ける。
- 次の既存評価要求に結果の進展・予想の支持・結果画像の根拠という3問を加える。要求数は評価1＋行動1のまま。
- 前後の両画像が実際に添付されたときだけ新しい結果評価を受理する。根拠noneはunknownへ補正し、元応答と補正を記録。不正分布はINVALID_DISTRIBUTIONで止める。
- 経験は画像bufferとは別に最大8件保持。画像が失効した後の記録はモデルの過去の仮説であり、新しい画像証拠や検証済み事実にはしない。
- 同じ観察画像へ戻った有限の操作列を提示し、該当画像・該当候補の経験だけを候補説明へ付記。同じe4でも別画面へ流用しない。
- 帰還を自動的に失敗と判定しない。再訪・done・代替候補はすべて残す。確率の罰則、未訪問優先、正解経路の注入は加えない。
- 実行監査のDOM/oracle、本人操作・感想はモデルへ送らない。保存入力・経験・分布はreplayで再構築して照合する。

親は共通契約/config/core/profile/wrapper/replay、実装サブはexperience moduleとunit test、別コンテキストの検証サブは独立テスト・監査を担当した。基準は1821317、実装凍結版はc4024c620b35bb45bcb30bcc498e75513445609f。前回の失敗は [deliberation-recovery.md](deliberation-recovery.md) に保持している。

## 実行方法

```powershell
# APIなし。配線確認であり能力評価ではない。新規出力先を指定
node --import tsx runner/human-jev-experiment.ts --mode experience --mock --out reports/experience-mock-new

# 新機能と統合
node --import tsx --test --test-concurrency=1 tests/virtual-beta-experience.test.ts tests/experience-recovery-integration.test.ts tests/experience-recovery-independent.test.ts

# 保存済み実入力・経験・分布を検査（APIを再送しない）
npm run replay:virtual-beta -- reports/experience-recovery-2026-10-28/live-1/exploration
```

通常のbaseline、二段階だけのdeliberationは従来どおり。新しいmodeはexperience。一般βconfigでもexperienceを指定できるが、state有効・画像記憶2以上・deliberation有効を必要とする。capacityは1〜8。`--long-context` は新旧とも明示指定であり、暗黙の再試行は加えない。

## 実測と検証

実行前の条件・上限・切替の定義は [experience-protocol.json](../../experiments/virtual-beta/human-comparison/experience-protocol.json)。今回は同じ通常bad画面・通知停止Charter・Personaなし・argmax・独立した初期化で2試行、各最大12判断/24要求/180秒、並列1、合計48要求以内。過去台帳をリセットしない。

最初の2試行はc4024c6で各12判断・24要求、全要求正常、主観的doneなし、客観的未達、DECISION_LIMIT、validForComparison=true。どちらも各種設定e4→お知らせe4→マイページe2を4回反復した。各試行の帰還後3回も、代替e5を残したままe4を再実行した。反復は観測されたがLOOP判定による終了ではない。

結果の生評価22件はneutral20/unknown2、期待はsupported6/not_supported5/unknown11だった。しかし根拠noneが22件すべてで、両状態はunknownへ補正された。補正は31項目。ここで「判断のbasis」と「目的達成の証明」を質問が混同させる可能性を検証対象にした。これがnoneの原因だと確定したわけではない。

[追加条件](../../experiments/virtual-beta/human-comparison/experience-evidence-amendment.json) を先に固定し、旧方式を保持する別設定 experience.evidenceMode=basis（CLI --mode experience-basis）を追加した。根拠質問の説明だけを変え、両端添付条件・選択肢・none補正・分布検証・行動方策は維持した。実gateway adapterの同一応答テストで、画像・状態・他の全質問を含むbodyは同一で、変わるのはexperienceEvidenceの説明だけと独立確認した。

追加版b01161b8b04e371792e521ec75b3bd6866d3f512も12判断・24要求、全要求正常、同じ経路4循環、客観的未達、DECISION_LIMITだった。source hashは8c364708de992c135d344953f5a3abb52e90e728cf0bf3710ac52f0ab78591f7。11評価のうち根拠画像8/none3、生の進展はneutral10/unknown1、受理後はneutral7/unknown4。受理後の期待はsupported2/not_supported2/unknown7、補正4項目だった。

判断10の入力には、o7のe4実行→o8について根拠付きneutral/not_supportedが残り、同じ観察へ戻った経路も候補説明へ渡っていた。それでも現在のe4をadvancesと再評価し、生分布e4=0.89/e5=0.03からargmaxでe4を実行した。判断4/7でもe4=0.93/0.95だった。履歴消失や入力の接続漏れだけでは、この反復を説明できない。モデルが保持された経験と矛盾する有望さを再評価し、選択分布へ反映しなかったことが今回の観測である。

3試行の合計は72要求（最初の固定48＋別に事前固定した追加24）。旧5台帳は最初の前後で不変、追加時は最初の2台帳も含む旧7台帳が不変。既存予算のリセットや隠れた再試行、UX抽出要求はない。初期の製品画像は過去deliberationと同一だった。帰還後の切替は0、直接達成も0。validForComparisonは実行証拠の有効性を示し、人間妥当性を意味しない。

実結果は [experience-recovery-results.json](experience-recovery-results.json)。3試行から一般的な成功率・追加部品や文言の因果効果を推定しない。人間の新規計測はなく、以前の1名記録にも視覚条件の差がある。人間一致は未検証である。

## テスト・独立検証・成果物

[独立検証の最終監査メモ](experience-independent-review.md) を保存した。

経験部品はRED→GREEN。c4024c6では独立6件を含む119件、追加版では既存94＋経験unit23＋統合3＋独立7＝関連127件が成功、0失敗/skip。型検査・buildも成功。全プロジェクトの全テストを再実行したという意味ではない。

独立検証の初回1失敗は、検証側が全画面にe4があると仮定したfixture不備だった。実際の第3画面にe4はなく、fetch内assert例外で停止していた。全候補一致とdone維持の確認は残し、e4の存在確認を対象ホームに限定して再検証した。製品の修正や受入条件の緩和はない。親レビューで見つけた、不正な保存補正文字列を黙って除く処理は、REDを確認して拒否へ修正済み。

独立保存監査は、最初の48要求・454回答分布・132画像参照・入力hash・状態受渡し・実選択・旧台帳を照合しPASS。追加版の24要求・227回答・66画像参照も独立監査PASS。合計72要求・681回答・198画像参照、36選択/36評価のreplayが整合した。ローカル証拠はreports/experience-recovery-2026-10-28/のindependent-*、parent-audit.*、basis-parent-audit.*、各live-*、台帳、PNG、trace.zipに保持。本人の生記録や秘密情報は公開しない。

実施した追加版コマンドは以下。出力先・台帳は使用済みなので、新しい実験で上書き・リセットしない。

```powershell
node --import tsx runner/human-jev-experiment.ts --mode experience-basis --long-context --phase-budget reports/experience-recovery-2026-10-28/api-budget-basis.json --env-file E:/ChatGPT/Ux_test/.env --out reports/experience-recovery-2026-10-28/live-basis
```

モデル試行完了後、別ブラウザーで既知手順の対照を実行した。初期の製品画像はモデル試行とhash一致し、3クリックで既存oracle=trueとなった。現版UIとブラウザー操作は到達可能だった。これは手順を与えたスクリプト対照であり、自律探索や人間の新規実測ではない。手順はJevへ渡していない。記録はscripted-ui-control.json、PNG、trace。

## 残る優先課題

優先は、経験の自己評価と次行動分布の矛盾を検出し、見立ての更新が選択へ反映される方策を比較すること。今回の状態保持だけでは解決していない。単なる容量増加や言い換えを続けず、予測が外れたときの再計画と、その再計画に従う行動選択を別の受入対象にする必要がある。

検証課題には、失敗した入口から別の入口を探す課題だけでなく、同じ入口への再訪が必要な課題を含める。訪問済み排除や候補IDの指定で成功を作らない。進展・期待支持の自己評価が正しいかも独立に確認する。人間モデルの較正は、別参加者・別課題の記録を分けて取得した後の課題である。

## 限界

画像hashの一致は再観察の十分条件であり、描画の変化で取りこぼす。意味的な同一画面の認識モデルではない。進展・期待支持はモデルの自己評価で、引用hashが正しくても意味が正しいとは限らない。画像bufferと経験容量は工学的な上限で、人間の記憶モデルとして較正していない。API待ち時間を人間の思考時間として比較しない。
