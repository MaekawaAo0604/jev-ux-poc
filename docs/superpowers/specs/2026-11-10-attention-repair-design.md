# 注視判断の継続偏重：修正設計

基準5eb463e。原本の36continueは選択器の上書きではなくモデル提案と一致した。配送114段・260asset照合に不一致なし。容量3の記憶には現在画像＋過去2観察と実操作があり、A→B→Aが渡っていた。モデルがそれを理解したかは未測定。

確認した設計欠陥：continueの後も通常判断でlook可能であり、継続と注視が排他的でなかった。ON6初手はcontinue→通常look。したがって36continueを36回の注視維持意図と呼べない。別の仮説は1continue対4lookのargmax競合。保存分布合算が上回るのは4/36で、これだけで全件は説明できない。

最小修正はattention.policyを追加し、既存OFF・無指定legacyを保持する。exclusive-flat-v2は同じ5候補で排他的契約に変更し、continue後の通常候補からlookだけを除く。exclusive-hierarchical-v2は同じ排他的契約のまま、継続／inspectの二択と、inspect時に使う既存4地点の条件付きgazeTargetを別の質問にする。両質問は同じ1回のJev要求で回答し、gateとgazeの分布・sampler・選択は独立に保存する。これは連続した内部推論の観測ではない。

inspectはUI操作ではなく、選んだgazeTargetのlookだけを実行する。continueは現在視野の非look行動だけを選ぶ。正解位置・DOM・oracle・監査・全履歴・ゴール判定はモデルへ渡さない。back/再訪/迷いを禁止せず、正解重みや注視リセットを導入しない。利用可能な記憶・画像・ペルソナ・目標は固定し、記憶意味づけの変更は次の別実験へ残す。

受入条件：OFFとlegacyの回帰、gate/point分布が実選択に使われる、continue後look不可かつ非look再訪可能、inspectでUI0と新画像、各sampler再現、容量/試行分離、異常分布・予算・deadline・安全・replay改ざん検出、全要求の通常runner台帳化。

事前固定4条件×2視覚×3反復＝24試行。各UI6/look4/判断8/API12/150秒、6batch各48要求・10分以内、全体288要求・60分以内、並列1/retry0。主比較はoff/hierarchical、副比較legacy/exclusive-flatとexclusive-flat/hierarchical。追加要求コストと共有する観察prefixを明示する。外部モデルseed非制御・1課題・1Personaで一般化しない。改善を完了条件に偽装せず、実結果の負例を保存する。


## 第1実行後に追加する切り分け（後付け結果変更なし）

24試行は138要求で完了し、修正12件は初手continue→STUCK、注視0で、改善なし。最上位input.goalは従来の通知停止のままで、注視専用の目的は質問instructionsにだけ置かれていた。次はこの入力の役割混在を仮説として、同じ階層方策で最上位の注視目的だけを変更する。taskFrame:attention-v1はendUserGoalとcharter.goalを保持し、decisionTaskとgoalに現在の注視判断を明示する。正解地点・新しい画像・新しい行動重みは追加しない。

同時にsampleモードに実装不具合を独立検証で発見。gateとgazeが同じseed/indexから同じ乱数を使い、gate(.8,.2)・注視4点均等でも、10,000seed中2,025inspectが全てlook_3となった。argmaxの138要求には影響しない。修正はattention.sampling:domain-separated-v1でgate/gazeに別domainから導出したseed、通常行動には従来root seedを使い、導出値を記録・replay検証する。新policyのsampleにはこのタグを必須にし、誤った分布を正常扱いにしない。旧argmax原本は無変更で検証可能とする。

追加実行はOFF／階層・旧task／階層・注視taskの3条件×2視覚×3反復＝18件。各8要求、合計最大144要求。先の実138＋追加最大144＝282で、今回の総計288上限を維持する。比較期間内は全てargmax、ON双方に同じsamplingタグ、taskFrame以外を固定。全6batch各24要求・600秒、全体60分・並列1・retry0。第1実行を捨てず、新しいfreeze-v2とlive-r2へ保存する。改善を事後的に前提としない。
