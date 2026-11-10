# crop初手STUCKの原因分離と観察契約

基準7f35def、clean worktreeから開始。旧crop修正後3件はgatecontinue→normalSTUCK。現在画像では通知設定の見出し・説明が見えるが、クリック本体は67.46%のみ・badge0%のためe5は候補外。gateはcandidateIdsのみを受け、通常段の厳密なクリック適格性と現在候補の型を受け取らない。さらにimageが切り取りだという明示説明もなく、数値のoffset等のみ。画像・座標・bindingの独立検査は正常。現時点でモデル内部の原因は仮説。

介入はattention.observationContextの明示option。geometry-v1は既に公開している観察のサイズ・viewport・clearRect・transform・fixationとmodeの意味だけを説明し、画像端がviewport端とは限らないこと、look座標はviewport系であることを渡す。actions-v1は既にofferedである非look候補だけから匿名ID・action型・中立ラベルを作り、部分的な文字が見えても未提示の対象はクリックできないという一般規則を渡す。geometry-actions-v1は両方。正解のe5、目標部品名、未提示IDの集合、監査矩形、oracle、新画素、正解注視座標は追加しない。

元の候補化・画像変換・UI操作・look点・選択方式は変えない。inspect強制、STUCKの自動look変換、再訪禁止をしない。モデルが現在の情報だけからcontinue/inspectと注視先を判断する。追加契約はgate入力だけで、通常段のgoalや候補には混ぜない。optionなしの旧結果・入力・replayを維持。

事前固定はcontrol/geometry/actions/both×3反復＝12試行。全て前回と同じcrop・初心者A・専用PC・goal・argmax・記憶3・image-state・階層判断・注視task・分離sampling設定。修正なしは前回crop+taskFrame profile。UI6/look4/判断8/API12/150秒、各batch48・600秒、全体最大144要求・45分、並列1・retry0。モデルseed非制御、候補・PNGの同一性を記録する。必要な修正再確認も当面の実API総上限240以内とし、成功するまで無制限にpromptを変えない。

受入条件：公開情報のallowlist、DOM/意味付きlabel/監査の漏洩なし、画像・UI候補の無変更、lookUI0、分布→選択→実操作の対応、入力hash/replayの改ざん検出、制約・上限・API障害とSTUCKの分類、旧foveated成功と旧crop失敗の原本replay回帰。成績向上自体を実装合格に偽装しない。新しい独立検証担当を実行前と実原本検査へ使う。
