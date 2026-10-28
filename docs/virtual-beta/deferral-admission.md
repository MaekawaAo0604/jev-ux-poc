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

## 固定版の結果

実行版959c5de32ba5d52ecf13725ef2584c5a4d5a989f、sourceHash=e1a64bb13ec7dde4ac703482b7dab5950a987e9ed0cf960d8ac9b018a1677233。12試行204/288要求（旧100、新104）、基盤障害0、旧46台帳不変、6ペアの初期画像・目的・宣言外設定が一致、全12オフライン再生が通過した。[匿名測定](deferral-admission-results.json) と [独立記録](deferral-admission-independent-review.md) を参照。

- 達成：旧4/6、新5/6。ただし増えた1件は理由記憶0・レビュー0の通知停止であり、今回の受理契約の効果とは判断しない。
- 通知停止：旧0/2、新1/2。両条件の全4件で理由記憶0。未知の理由を捏造して解除していないが、誤解除の意味精度を評価した例でもない。
- 必要再訪alpha：両条件2/2達成、旧平均7UI・新平均9UI。
- 必要再訪beta：両条件2/2達成、旧平均9UI・新平均8UI。
- 理由の提示/受理/レビュー/解除：旧16/2/4/2、新17/5/7/3。新受理5件のうち4件は最初の共有画面のprerequisite、1件は再訪したアカウントのunknown。unknownは解除を許さないので、受理数すべてを有効な理由更新とは数えない。

今回修正した接合部分は、保存応答2件と実モデルの両方で成立した。保存応答alpha-r1/beta-r2のオフライン再構成では、同一の原応答に対して旧方式が拒否し、新方式だけがnegativeEvidence=o3とexcursionEvidence=o2を分けて受理した。原ファイルは変更せずAPI要求0。新規実モデルでもalpha両反復はo2が旧の非進展根拠に含まれない状態からprerequisite/o2を保持できた。

一方、保持できた理由を適切な時点で再評価する能力は未達だった。新alpha反復1のo6は本人確認済みo5と元画面o2が添付されていてもstill_blocks、o8で同じ画素のo7を根拠にbasis_changedとして解除した。新alpha反復2とbeta反復1のo6はbasis_changedだが根拠noneを選び、ガードが解除せず、o8のo7で解除した。これらは9UI操作で達成し、不要な往復が残った。o5/o7は同じ画像でも周辺の記憶・質問・履歴は異なるため、同一入力での出力差とまでは主張しない。

新beta反復2は7UI操作で達成したが、理由の解除は0だった。o6で共有とアカウントの両入口が保留され、既存ALTERNATIVES_EXHAUSTEDで重みが1へ戻り、raw e3=0.93の共有入口を選んだ結果である。この到達も新たな理由解除の成果に数えない。

## 検証と未解決事項

理由担当が新35＋旧22の57件、比較担当が新6＋旧9の15件、親が新旧統合・旧アダプターを含む34件、合計106件を確認した。型とbuildが成功。独立担当は新しいコンテキストで6件と型を確認し、通常gatewayのfetchスタブと実ブラウザーで原画像の保持・再添付・実選択、状態/世代/根拠/画像の改変拒否、旧12保存物の互換再生、46旧台帳保全を確認した。独立の実API要求は0。ソース凍結前の末尾整形は空行のみで、正式独立/liveは整形後の同じ版を使った。

独立の追加反復では、実APIを使わない台帳保存中の基盤エラーも観測した。初回制御の対照scriptが存在しない次操作を指定した問題は、step6の検証を維持したまま対照をdoneで終了するようテストを修正した。その後にもpersist境界の失敗と完全な一時ファイルの残存があり、最終6件は通ったが、ファイル保存が常に安定したとは結論しない。透過診断と隔離500回のwrite/rename検査では未再現で、正確なOSエラーは未特定。製品の変更で失敗を隠したり、API障害を利用者の迷いと数えたりしていない。原ログと一時ファイルを保持する。

次の改善を継続する。

1. **判断と根拠の整合性。** basis_changedと根拠noneを別々の選択質問で出せることが、保存画像が揃っていても解除を遅らせていた。変更判断と具体的な根拠参照を一つの選択として扱う案を、既存の二段階・上限内で旧条件と比較する。根拠なしの強制解除はしない。
2. **台帳保存の診断。** persistのwrite/replaceのどこで失敗したかを、秘密を含まないOSエラーコードとともに記録できるようにする。実送信前の予約失敗と、送信後の保存失敗の要求数を区別して検証する。未特定のエラーへ闇雲な再試行を入れない。
3. **見え方が変わった後の同じ経路。** 過去の通知失敗では、ホームのscroll後に画像と候補番号が変わり、同じ設定へ入り直した。settingsにもhover等の見え方の差がある。見えないDOMやoracleを使わず、実観察に基づいて経路・操作を対応させる必要がある。

保存前プレビューの完了誤認、人間の行動への一致、ペルソナ効果、別製品への一般化も未解決のまま。この反復では受理漏れを修正し、解除判断と根拠の不一致を次の改善対象として特定した。改善を続ける目標は継続中である。

変更は同じfeature/virtual-beta-information-stateブランチ。製品凍結は959c5de、成果物はdocs/virtual-beta/deferral-admission*、原画像・trace・台帳・診断はローカルreports/deferral-admission-2026-10-29/に保持する。
