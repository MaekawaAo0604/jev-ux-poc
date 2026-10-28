# 阻害理由と非進展の根拠を分離 — 2026-10-29

前回の有効画像o2の受理漏れを、同一経路内の根拠を使って改善する。基準はaed3dcd。製品の観察・UI・質問文・保留重み・解除条件は維持し、理由を記憶する根拠の契約だけをopt-inで分離する。改善を続ける目標の1反復であり、探索全体が安定したとは扱わない。

## 原因と変更

前回alpha反復1/beta反復2は「本人確認が必要」と表示されたo2を実際に添付し、モデルもprerequisite/o2を選んだ。しかし以前の経験評価はo2をunknown/supportedとし、保留の非進展根拠は帰還ホームo3だけだった。旧契約は両方の根拠画像が一致することを要求したため、理由を捨てていた。

新profileはexperience-reason-excursion。deferralReason.basisAdmission='excursion-evidence'を指定する。省略またはnegative-evidenceは既存の契約を維持する。新方式では、実際に同一の画像・候補・出発/帰還世代で保留を学習した場合に限り、同じ連続した経路で実操作後に見た、現在添付済みの中間画像を理由の根拠として受理する。未添付・別経路・未来・ホーム画像は受理しない。

captureProvenanceにnegativeEvidence（実学習の非進展根拠）とexcursionEvidence（同じ経路の添付済み画像）を分けて記録する。各8件以内、理由記憶8、通常画像3＋理由原画像1の上限を維持する。原画像・世代・後続根拠を照合する解除条件は変えない。元の保留は監査用に残し、有効な保留だけを選択に使う。

モデルの理由・レビューは仮説であり、意味の正しさは画像と実結果を独立に確認する。サイト固有の本人確認イベントや正解ルートを解除規則にしない。理由登録が増えただけでは探索の改善と数えない。

## 比較を事前に固定

旧experience-reason、新experience-reason-excursionで、通知停止bad/共有停止alpha/共有停止betaを各2回、計12試行。順序は前回と同じ固定配列で、反復2はペア内順序を反転する。設定差として許すのはidとdeferralReason.basisAdmissionだけ。両側とも画像最大4・追加API段階0。

Jev1.14.0、ペルソナなし、goal/argmax、seed20261028、通常画像3、経験8、理由8、原画像1、保留重み0.01・代替閾値0.01、longContext有効、1attempt、追加UX抽出なし。1試行12判断・24要求・15UI操作・注視3・180秒。全体288要求・20分・逐次1。失敗も要求へ算入し、以前の46台帳を保全する。通常runnerのみ使用し、架空画面・目的・制限内記憶を送信する。人間記録や保存済み入力をAPIへ再送しない。

旧保存応答2件のオフライン再構成、純粋テスト、実ブラウザー制御を先に実施する。その後ソースを固定して別コンテキストの独立担当が確認し、新規実モデル比較へ進む。モデル結果を見て質問・重み・分類を調整しない。

## 実行

出力先は毎回未使用の名前にする。

```powershell
# APIなし、比較基盤の接続のみ
node --import tsx runner/deferral-reason-experiment.ts --comparison reason-admission --mock --limit 2 --out reports/admission-smoke-new

# 実Jev12試行
node --import tsx runner/deferral-reason-experiment.ts --comparison reason-admission --env-file E:/ChatGPT/Ux_test/.env --out reports/admission-live-new

# 保存入力をAPIへ送らずに検査
npm run replay:virtual-beta -- reports/admission-live-new/revisit-beta-r1-reason/exploration

# APIなしの担当テスト
node --import tsx --test tests/deferral-admission.test.ts tests/deferral-admission-experiment.test.ts tests/deferral-admission-integration.test.ts
npm run build
```

manifestに版・順序・台帳・設定、summaryに理由の提示/受理/レビュー/解除・実選択・経路・客観結果・障害、各試行に画像・trace・result・offline replayを保存する。API/UI/経過時間は分け、人間の行動時間はnullのままとする。原記録や認証情報はコミットしない。
