# 保留理由再評価の独立検証（2026-10-28）

初回受入ゲートは通過した。凍結製品のコードを直接読み、独立したテストを作成して実行した。現時点で受入を妨げる製品不具合は見つかっていない。実モデルの意味判断の妥当性と保存12試行の監査は、この初回ゲートの結論に含めない。

対象 revision は `08984057c1801eb0af2637551e3c67931ffaceb9`、`sourceIdentity()` の sourceHash は `b7300a74648308d9ce821c48b1388fee3fc6bc061fd186f71385e74eb3987003`。一回限りの監査スクリプトで両方を厳密照合した。継続利用する回帰テストは実行開始時の sourceIdentity を取得し、各 run manifest と実行後の版が一致することを検査するため、後の文書コミットだけで失敗する構成にはしていない。

所有変更は `tests/deferral-reason-independent.test.ts`、本書、および `reports/deferral-reason-2026-10-28/independent*` だけ。製品・既存テスト・依存関係を編集していない。.env と人間記録は読んでいない。実API要求は0件。通常の gateway アダプターを、架空キーとローカル fetch スタブで通した。ブラウザーは実際のローカルUIを操作した。これは実モデル試験ではない。

適用した祖先指示は `C:/Users/Maekawa Ao/AGENTS.md` と `C:/Users/Maekawa Ao/.codex/AGENTS.md`。参照先の12追加Markdownは親の調査で不存在と伝達されたため、内容を推測して補っていない。事前仕様は `docs/virtual-beta/deferral-reason.md` と `docs/superpowers/plans/2026-10-28-deferral-reason.md` を読んだ。

## 実施と結果

`node --import tsx --test tests/deferral-reason-independent.test.ts` は最終6件通過、失敗0、skip0、約44.5秒。追加した独立TypeScriptテストを含む型検査 `node node_modules/typescript/bin/tsc --noEmit` も実行ツールの返値でexit 0を確認した。標準出力が空だったためTee-Objectの独立ログは生成されておらず、この型検査については実行時のツール結果が証拠である。結果は `reports/deferral-reason-2026-10-28/independent-preflight-final-types.log`。入力・画像・台帳・trace・再生材料は `reports/deferral-reason-2026-10-28/independent-1793199208259-256832/` に保存した。

`node --import tsx reports/deferral-reason-2026-10-28/independent-offline-compatibility.mjs` は、旧 `reports/holdout-stability-2026-10-28/live/manifest.json` に列挙された24試行を全件再生し24/24検証済み。追加で旧temporary-deferralのlive-control保存物も再生した。版の厳密照合、各保存物のパスと再生結果は `independent-offline-compatibility.json`、コマンド出力は同名 `.log`。

初回実行は5件中ブラウザー1件が実行前の台帳検査で失敗した。独立fixtureで perRunMaximum を24にした私の誤りで、既存契約は段階ごとに12だった。fixtureだけを12へ直した再実行は5/5通過。その後、未変更経路の制御と回帰テストの汎用化を加えた最終版は6/6通過。初回と再実行のログを上書きせず保持しており、製品修正を通過の条件にしていない。

## 境界の独立証拠

理由状態はモデルの仮説として保存され、画像・候補・出発観察・帰還観察の同一世代に結び付く。コード上、capture は帰還経路の provisional な質問に留まり、実際の学習済み raw deferral の同一世代と、その学習evidenceに一致する添付画像がなければ記憶に入らない。サイト名、ラベル、本人確認状態での解除例外は見つからなかった。

実ブラウザーの revisit-alpha を同じスクリプトのモデル応答で比較した。第6判断は e2=0.97、e3=0.02、stuck=0.01 の生分布である。旧方式と still_blocks 制御では e2 の重みが0.01に補正され、実際に e3 が選ばれクリックされた。basis_changed 制御では raw deferral が残り、対応世代だけ effective から除外され、e2の重み1で実際に e2 がクリックされた。解除側は7UI操作・8判断で独立目的判定も達成した。通常recency3から外れた元画像o2は、保持理由から理由画像1枚として実送信され、その base64 のSHA-256が参照先と一致した。各判断は既存のassessment/action各1要求、合計2要求で、追加段階はなかった。

元notification badの未変更campaign経路でも、無関係な進展を回答した後の第6判断を制御した。ホーム画像は第1判断と同じだった。モデルが再び e4=0.95を提案しても still_blocks なら effective にe4が残り、重み0.01、実選択・クリックはe3だった。再訪の生確率と理由の解除は別の記録として確認した。

負例では still_blocks、unknown、元画像なし、後続根拠なし、学習以前の根拠、未来の根拠、後続でもホームと同じ画素、後続でも元blockerと同じ画素を拒否した。statusの選択が still_blocks/unknown のとき、basis_changedが確率最大でも解除しなかった。unknownな元理由も解除しない。解除済み世代とは画像・候補・出発/帰還世代のいずれかが異なるraw保留を解除しなかった。理由記憶は最大8、脱落理由からの原画像再取得はなし、理由参照最大1、通常画像記憶最大3、実送信画像最大4を確認した。

wireにはDOM画面テキスト、oracle、audit、rawScreenshot、ROI、人間記録が現れなかった。各通常記憶/理由/現在画像の参照は実送信assetに存在し、参照ハッシュを実base64から検査した。旧方式ではreason context、reason observations、reason質問がなかった。

オフライン再生は、解除record、effective state、世代、原画像画素の各改変を拒否した。理由の観察IDを未観察のo500へ書き換え、assessment入力ハッシュも再計算した改変も `REASON_SOURCE_NOT_PREVIOUSLY_OBSERVED` で拒否した。改変試験後は原保存物を復元し、再生通過を再確認した。

## 未検証と判定限界

重大度P0/P1/P2の修正必須指摘は現時点で0件。ここで確かめたのは機械的な受理境界と実選択への伝達である。モデルが選んだ分類や後続画像が元の阻害要因を意味的に解消するかは、スクリプト応答では検証できない。any progressだけの自動解除をしないことと、モデルが無関係な画像をbasis_changedと誤判定する可能性は別であり、後者は実保存画像の独立監査で確認する。

この検証はユーザー理解の証明、一般的成功率、因果効果、人間行動への一致を示さない。オフライン再生はAPI/UIを再実行せず、保存物一式を整合的に置き換える攻撃の完全検出も主張しない。親の型検査・114件・build成功は親からの報告であり、独立件数へ重複計上していない。

初回ゲートの後に親が同版で実API比較を実行し、独立担当は実APIを呼ばずに保存された入力・画像・根拠・分布・選択・再生を監査した。最終結果は下記追補に記録する。



## 実モデル12試行の最終独立監査

`node --import tsx reports/deferral-reason-2026-10-28/independent-live-audit.mjs` はexit 0。根拠は同名 `.json` と `.log`。監査担当の実API要求は引き続き0件で、保存入力を再送していない。

全12試行のmanifestとresultは凍結revision/sourceHashに一致した。予定された順序と反復2でのペア内順序反転を確認し、6ペアすべてで準備時の初期画像・最初の番号付き入力画像・charterが一致した。設定差はidと宣言されたdeferralReasonだけだった。新方式は理由仮説・質問・原画像が増える比較であり、重みだけを変える比較ではない。

新しい12台帳の合計は208/288要求で、全送信は各1attempt、保存応答のlongContextもtrueだった。予約/終了時刻は逐次で重ならず、追加レビュー要求は0。通常入力のallowlist、recency3、経験8、理由8、原画像1、旧最大3/新最大4画像の上限を全保存入力で確認した。実assetのハッシュを含む再構築は全12件で通過した。旧34台帳も事前SHA-256と一致した。INVALID_DISTRIBUTION/API_ERROR/ACTION_ERROR/OBSERVATION_ERROR/SAFETY_STOPおよびoracle/terminal観察エラーは0件。DECISION_LIMITとSTUCKは行動終了として別記し、基盤障害へまとめていない。TIME_LIMIT/API_LIMITの試行はなかった。

各ペアの独立目的判定・UI操作数は次の通り。詳細な生分布、重み、実選択、実操作、URL経路は監査JSONに全判断分残した。

- 通知r1：旧は達成・6操作、新は未達・12操作（DECISION_LIMIT）。
- 通知r2：旧は未達・9操作、新は未達・6操作（双方STUCK）。
- 再訪alpha r1：旧は未達・5操作（STUCK）、新は達成・7操作。
- 再訪alpha r2：旧・新とも達成・7操作。
- 再訪beta r1：旧は達成・9操作、新は達成・7操作。
- 再訪beta r2：旧・新とも達成・9操作。

達成は両方式4/6、主観完了と独立目的判定の食い違いは今回0件。全12のfinal.pngは6種類のバイト列に分かれ、それぞれを実際に表示して確認した。達成側には「リンクの状態 無効」「共有リンクを無効にしました」、または通知の「現在の設定：停止」「メール通知を停止しました」が表示されていた。未達側はキャンペーン、利用履歴、アルバムホームだった。対応は最終画像SHA-256に結び付けて監査JSONへ保存した。

### 理由機能が成立した範囲

新方式6試行のcapture質問は計14件、登録は1件、reviewは1件、実際の理由解除も1件だった。成立したのは `revisit-beta-r1-reason` のみ。第3判断でe3/o1→o3のraw保留と、原画像o2のprerequisite仮説が結び付いた。第6判断では通常記憶から外れたo2がreason_0として添付され、後続o5を根拠とするbasis_changedを受理した。rawのe3世代は保存したままeffectiveから除外され、生分布e3=0.98、重み1、実選択e3、実クリック、次の共有設定画面まで一致した。同じ判断の保存生分布にraw保留を残した場合の独立再計算ではe4がargmaxとなった。

原画像o2には「共有設定を変更するには、本人確認が必要」「アカウントで確認を完了してから、もう一度この画面を開いて」と表示され、後続o5には「本人確認が完了しました」「共有設定のお手続きを続けられます」と表示されていた。両画像を独立にviewし、解除に使ったlater evidenceが元の阻害要因に対応することを、この1事例では確認できた。誤った意味解除はこの保存1件では見つからなかった。他の5試行にはreviewがなく、未変更行き止まりに対する実モデルのstill_blocks精度は測れていない。そこはスタブ制御の受理境界までが検証範囲である。

alpha r1の新方式の達成は新しい理由解除ではなく、旧ALTERNATIVES_EXHAUSTEDによる再訪だった。alpha r2では最初の帰還が旧raw保留として学習されずCAPTURE_NOT_LEARNEDであり、その後の別世代captureも未知/根拠なしだった。旧alpha r2もraw保留を作らず直接進行した。単に達成した試行、既存解除で戻った試行、理由再評価で解除した試行を成功例として合算していない。

### 重要度 中：有効な原画像でも登録できない到達性の制限

再現は `revisit-alpha-r1-reason` 第3判断、および `revisit-beta-r2-reason` 第3判断。モデルはprerequisite/o2を選び、o2は実際に添付され、帰還経路内にあり、必要な本人確認を表示していた。それでも当時の経験評価はprogress=unknown・expectation=supportedで、旧保留のnegative learned evidenceにo2が入らなかった。raw保留のevidenceは帰還ホームo3だけだったため、`CAPTURE_BASIS_NOT_MATCHING_LEARNED_EVIDENCE` で拒否された。

期待される契約は「実学習済みの同一世代・同一negative evidenceに結び付く画像だけを登録」であり、実際の拒否はこの契約通りである。したがって修正必須の実装不具合とは判定しない。ただし、実画像に理由が見えていても過去のモデル分類がunknown/supportedなら後から理由を持てない、という実用上の制限は残る。原画像の未添付や画像破損が原因ではない。

beta r2はこの制限で理由記憶がなく、第6判断のe3=0.97に旧重み0.01が残った。同時にe4も保留され、未保留e2=0.01が補正後約0.50251、e3は約0.48744となり、実際にe2で利用履歴へ迂回した。第8判断でALTERNATIVES_EXHAUSTEDとなって重みが1へ戻り、共有設定へ再訪して9操作で達成した。beta r1とr2のo2/o5画像はそれぞれSHA-256が一致する。画像上の前提変化は同じでも、理由の登録可否は過去のモデル分類に依存していた。

今回の結果に合わせた分類・重み・閾値・サイト固有ルールの修正は行っていない。全体達成数が同じで、理由解除も1件のみ、反復2では迂回が残ったため、一般的な改善、安定した復旧、ユーザー理解の成立は結論しない。機械的境界と保存会計の受入は通過し、意味判断の一般的な精度とこの登録制限は今後の未検証事項として残す。

新規独立テストの可搬性も修正した。phase親フォルダをrecursive:trueで作成してから固有出力をrecursive:falseで作成するため、別テストの並列mkdirに依存しない。修正後の最終独立6/6と型検査exit 0を確認済み。製品コードと原実モデル保存物は編集していない。これを独立担当の最終受入記録として固定する。
