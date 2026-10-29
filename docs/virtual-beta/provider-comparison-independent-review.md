# Jev / OpenAI Decisions 比較の独立検証

実装A/Bと別の新規コンテキストの検証担当が、実行前のコード・テストと、実モデル実行後の原本・公開値を検証した。独立検証からの実API要求、環境ファイル読取り、実行後監査でのブラウザー再実行はすべて0。

**実装と記録証拠の判定はPASS。探索安定性・人間再現は未達または未検証。** Jev8/12、OpenAI4/12という今回の結果を、人間への一致やモデル全般の優劣へ広げない。[実行方法・本文](provider-comparison.md)、[全結果JSON](provider-comparison-results.json)、[CSV](provider-comparison-results.csv) を参照。

## 固定対象

producerは0d4b450544d12ac9fafd9ba32c7bb7b25f938d9a、sourceHashは8cf3d1669b78711b4d8977d1d411e35a9dd2e59229161ca0887fde3be00eae1d。141 source、149固定ファイル、以前の2851原本を照合した。実行後も同じhashだった。文書追記によりHEADが進んでも、実測producerは変えない。

実モデルmanifestのSHA256は72707058bcd9086df6246bf534abdbead674c6fca0986aec131886f37ef54d4b。source ZIPは141ファイルすべてのhash・CRC・余分なファイルなしを確認した。ZIP SHA256は79884247cc30bb7230a8dafc0ff9d78c79c3a20a86353be258a74743acaa7c33。原本や認証ファイルはGitへ追加しない。

## 実行前の検証と修正

独立が最終対象51件、独立5件、従来Jevのdispatch/coreと履歴のある初期画像・wire回帰2件、型検査を実行し成功した。固定149/source141/旧2851原本の検査も実行後に成功した。親の関連67件・並列HTTPスタブ2件・型/buildの結果は別の証拠で、重複する件数を合算しない。

P2として、台帳上の要求予約をAPI到達と誤集計する経路を再現した。HTTP前に止まってもcharged1になり得るため、予約消費、明示されたHTTP試行、応答等による到達証拠を分けた。result.apiCalls0等の非送信証拠はfalse、情報不足はnull、timeoutの送信とAPI受領も区別した。消費数は減らさず、独立のRED再現がGREENになることを確認した。最終preflight gateはPASS_OFFLINE_PREFLIGHT。

確率配列を保存するだけでなく、変換した確率が既存samplerの選択へ使われることを、providerのchoiceと最大確率が違う負例で確認した。候補・根拠画像・質問・順序の保持、異常分布、拒否、誤model、HTTP/timeoutと再送0、並列時のprovider/ブラウザー/台帳の分離も確認した。

実HTTP後の台帳保存障害が後始末の例外で隠れる負例でも、次のpairを開始せず消費3要求を保持することを実行した。全体suiteは完走しておらず、旧EPERM・ブラウザーテスト失敗を含む中断結果を成功としない。固定版3ファイルの末尾空行は書式上の残件として記録し、空白診断成功とは扱わない。

## 実モデル原本の監査

全24試行、有効24、欠損0、初回assessmentが一致する12pairを確認した。408予約消費、408明示HTTP試行、408応答が一致し、ERROR/RESERVEDは0。返却modelはjev-1.14.0が184応答、gpt-6-lunaが224応答。unknown送信/到達は0だった。

原本903件のhashを保存し、監査前後の不変性を確認した。全24 replay、現在画像408件の有効性・正常応答、1058件のreplay画像参照、204選択の分布→候補→実操作、24 traceのCRCと操作を照合した。初回action以降の分岐を初期入力不一致と扱っていない。

クリックはtraceと記録を照合した。native Backは既存adapterがCDP Page.navigateToHistoryEntryを使い、Playwright traceにpage.goBack呼出しが直接現れない。成功したframenavigated待機と記録された前後状態に基づいて照合した。当初の監査側の仮定を訂正し、元の仮定による結果も保存した。製品コードの変更やBack実施の推測補完はしていない。

閉じた要求予約の最大同時数は2、最大trialの記録時間は55,560ms、最終settlementまで737,000msで、設定上限内だった。実行sourceの停止・時間制御も実行前に検証している。プロセスクラッシュ・電源断時の永続性や実サービス側の受領時刻までは検証していない。

## 結果と公開値

switchは両モデル4/4、changedはJev4/4・OpenAI0/4、unchangedは両モデル0/4。OpenAIもchangedの全4件で前提変更と画像提示に到達したが、元画面への再訪・保存は0。unchanged全8件は照合未実行で、変更後の再訪機会が発生していない。機会発生後の8失敗へ置き換えない。主観的完了の誤り・基盤障害・不正分布・安全停止は0、未達12件はDECISION_LIMITとして残る。

公開JSONは解析全値とmetadata、CSVは全24行を原本から再集計して一致確認した。端末固有の3パスを除いた以外に試行の除外はない。API時間・token・費用unknown、本文の数値と適用範囲も照合した。掲載PNGは実入力の完全コピーで独立に目視し、eligible=true、確認回数1の時点でe1確認を再実行した記録と一致した。表示の配信は意味理解の証明ではない。

## 証拠の保存先

- reports/provider-comparison-2026-10-29/independent-preflight/review.json：実行前の再現・修正・再検証とgate。
- reports/provider-comparison-2026-10-29/independent-audit/raw-audit.json：原本・公開値の独立PASS監査の完全コピー。SHA256 64c91d8ef580c875208c331b69203bf1b962f0a66230ff519317c81a9bd43ead。
- reports/provider-comparison-2026-10-29/independent-audit/exhibit-audit.json：掲載画像・状態・選択の監査。SHA256 873a6f96f5f37a1359828e304f9dcac95f261c1acd663bee71e7454db4814e20。
- reports/independent-audit/：独立スクリプト、903件のraw-inventory、ZIP/trace検査、修正した監査側仮定と元の結果。元のlive-auditは公開metadata更新前のPENDING snapshotを保持する。

公開JSONのindependentAuditは上記PASSの範囲だけを表す。比較に重大な未解決の計測不具合は検出していないが、探索上の未達12件はそのまま残している。
