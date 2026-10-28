独立検証サブが実装担当と別に作成した最終監査メモ。原本と実行ログはローカルreports/experience-recovery-2026-10-28/に保持する。

# basis試行の独立保存監査・最終判定

基盤監査PASS、探索の経路切替は未達。経験状態がないだけでは説明できない継続選択を、今回の試行内で確認した。一般的に経験を理解できないと結論づけるものではない。

対象は `live-basis/`、凍結commit `b01161b8b04e371792e521ec75b3bd6866d3f512`、sourceHash `8c364708de992c135d344953f5a3abb52e90e728cf0bf3710ac52f0ab78591f7`。現ソースと保存manifest/result/全台帳予約の版が一致した。監査は実API要求0、.env・本人記録アクセス0、製品編集0、commit0。

独立担当が `independent-basis-live-audit.mjs` を作成して保存物を直接検査した。全assert成功、exit0。詳細は `independent-basis-live-audit.json` と `.log`。親のaudit PASSは結論の根拠にしていない。

## 保存の整合性

- 12assessment＋12action＝24要求。全応答model=jev-1.14.0、longContext=true、attempt1、failures=[]。227回答のキー・確率数値・合計を全て検証した。
- 全12選択の生分布と応答が一致、argmax、選択除外なし。selectedが実click.elementIdと一致し、全12操作はUI_PERFORMED。候補ID全体、doneを保持。
- 全66画像参照はSHA256一致、1280×900、計76,032,000参照画素。memory画像の参照、各assessment/action input hash、result内stepと個別stepが一致。各判断の入力画像は旧experience試行の対応画像とbyte hash一致。初期画像は旧deliberationと同一、最終画像も初期画像と同一。
- 各経験のsource/action/prediction/resultが、実際の過去の選択・受理評価・観察と一致。最新経験への新しい判定時に両端がID/hashで添付されている。画像記憶は3、経験上限は8。評価結果は同じ判断の行動入力とcontextへ伝播している。
- replayは12選択・12assessment・66画像参照で成功。旧7台帳のSHA256は事前snapshotと一致。新台帳used24/remaining0で全予約OK、追加UX要求なし。旧2試行と合計72要求、各台帳remaining0。
- 12判断、12実クリック、注視0、主観done=false、客観通知停止false、終了DECISION_LIMIT、比較valid=true。実行時間32.10秒、API時間27.34秒。通信・分布・操作・観察の基盤エラーなし。

## 経験評価の検算

経験3問は初回以外の11回。

- raw progress: neutral10、unknown1。
- raw expectation: supported2、not_supported3、unknown6。
- evidence: 当該result画像8、none3。
- 受理progress: neutral7、unknown4。
- 受理expectation: supported2、not_supported2、unknown7。
- none補正: progress neutral→unknown3、expectation not_supported→unknown1、計4項目。受入規則の緩和なし。画像引用8件ではresultのID/hashだけを根拠として保存し、引用から成功を導いていない。
- goalはraw unsatisfied12→受理uncertain12、knowledgeはinsufficient12。goalの根拠規則も変更されていない。

親が提示した集計と全て一致した。

## 経験が届いた後にも同じ入口を選んだ証拠

経路は `e4（各種設定）→e4（お知らせ）→e2（マイページ）` の4循環。ホーム帰還後の判断4/7/10は全てe4実クリック。e4の生確率は0.93/0.95/0.89、候補に残っていたe5は0.03/0.01/0.03。経路切替0、直接成功0。

判断10では次を独立にassertした。

1. 直前の帰還経路はo7→o8→o9→o10で、o7と現在o10の観察画像hashが一致する。
2. o7で実際に選んだe4はprediction=advances。o8でこの実到達結果をneutral/not_supportedと評価し、evidence=o8を選んだ。これはnone補正されず受理された。
3. 判断10のuserState.experienceにこの遷移とjudgmentが残る。o8画像もmemoryObservationsへ実際に添付されている。新たに古い未添付sourceから判定を捏造したのではなく、o8時点で受理された意味的回想を保持したもの。
4. 判断10の候補e4説明には `source=o7; prediction=advances; result=o8; execution=performed; progress=neutral; expectation=not_supported` と帰還経路が入る。
5. その同じ判断の新評価はe4=advances、evidence=o8。続く生分布はe4=0.89、e5=0.03。argmaxがe4を選び、e4をUI_PERFORMEDとして実行した。

したがって「過去の予測と結果を結んだ、根拠付きの経験が行動入力と候補説明に届いたが、この試行では別入口への選択変更が観測されなかった」という記述は成立する。「履歴が未接続だったから同じ入口を選んだ」という説明はこの判断には当てはまらない。モデルがその意味を理解したか、別のUI手掛かりや情報制限をどう評価したかは保存されたカテゴリ回答から特定できない。

## 最終的な品質判定と限界

重大な基盤不具合は未検出。画像記憶と独立したbounded経験、操作予測と実到達の接続、根拠の受理・失効、実分布選択、保存replayが成立している。一方、旧質問2試行もbasis1試行も、通知停止と経路切替は達成していない。追加の第四patchを根拠なく要求する発見ではない。

現版のテストは、親実行94件のログ（fail0/skip0、124,556ms）と独立実行31件＋7件の結果を確認した。profile5件の重複を除く127ユニークテストに相当する。独立担当が現版で直接実行した範囲は31＋7件、型チェック・build、旧2試行replay、新試行保存監査である。旧c4024では別途113＋6件を直接実行済み。

これは3つの小規模な非ランダム能力観測であり、文言の因果効果・一般成功率・人間との一致は未検証。basisで引用が8/11になった事実を、文言だけが改善原因だったとは断定しない。画像引用は比較根拠の出所であり、理解や目的進捗の保証ではない。offline replayはUIとoracleを再実行せず、実到達と客観未達は保存画像・実行記録・oracle値の整合する範囲で確認した。
