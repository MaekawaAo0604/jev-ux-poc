# 実モデル最終監査（commit 前）

計測の不一致は **0 件**。修正版の実行結果は **5 試行すべて無効**であり、有効な Persona 比較分母は **0** です。モデル性能・人間一致・Persona 効果は未認定です。監査からの API 呼出しと保存入力再送は0回、製品ソース編集もありません。

## 凍結対象

revision: 3fd144ccbdeb6229ca5b2c873cc711581e9ee647

sourceHash: 696fd78a43715f17f6b54ecd2bea41ae4589badb2f24a57a6d3ea1dd7643b663

検証前後と最終現物の186 filesがfreeze.jsonに一致しました。対象はcommit前の固定コード・原本です。

## 実測結果

- live-r2: 計画16枠、試行5、有効0、無効5、89要求、active0、未実行11。preservationAfter true。
- model-invalid記録は true / false / true / true / true。A-r1はTIMEOUT/HTTP未受信でstreakをリセットし、最後のB-r1/C-r1/A-r2の3連続不正でCONSECUTIVE_INVALID_TRIALSとなりました。無効試行の補充はありません。
- 旧live-r1: 別sourceの2無効試行・41要求・未実行14。operatorHoldによるprotocol identity変更を境界で検出したFROZEN_SOURCE_CHANGEDです。preservationAfter:falseを成功扱いせず、人間の離脱とも扱いません。rawは記録済みSHA256と一致し、新mainとは別groupです。
- 今回の実サイトモデル実行総計: **7試行 / 130要求 / 41 UI操作 / 48 steps**。raw apiCalls、台帳used=130、reserved=0と一致。
- 実一覧: **73計画枠 / 結果48 / 未記録25 / pending0**。結果48は既存36 + mock5 + 今回real7。全48のraw bytesと151正規化steps、分布・選択・画像hashが原本と一致しました。全試行表示は異なるgroupを合算せず、修正版5件のgroupは無効5・集計分母0です。
- 旧raw9468 files / 1,960,682,389 bytesは最終SHA256照合で全件一致。人間の旧rawはハッシュだけを読み、内容解析していません。

## 試行ごとの観測

- baseline / public-persona-baseline-r1: 5判断、4 UI操作、13要求。API_ERROR、最終error INVALID_VISUAL_HYPOTHESES、valid false。
- A / public-persona-A-r1: 9判断、8 UI操作、25要求。API_ERROR、最終error TIMEOUT、valid false。
- B / public-persona-B-r1: 5判断、4 UI操作、13要求。API_ERROR、最終error INVALID_VISUAL_HYPOTHESES、valid false。
- C / public-persona-C-r1: 8判断、7 UI操作、22要求。API_ERROR、最終error INVALID_VISUAL_HYPOTHESES、valid false。
- A / public-persona-A-r2: 6判断、5 UI操作、16要求。API_ERROR、最終error INVALID_VISUAL_HYPOTHESES、valid false。

完了済み原本だけを対象に、source/config/Persona/charter/HAR identity、native/assessment/actionのPersonaとexpectations、モデル入力hash、実画像SHA256とopaque binding、利用可能候補、実分布とmodel/actual choice、実action、全step、API台帳を照合しました。初期PNG、初期モデル画像、native非Persona入力のhashも修正版5試行すべてで一致しました。モデル入力へaudit payloadを混ぜていないことを記録上確認し、監査画像・準備済み入力・受信済み入力・終了時監査を区別しています。

失敗はAPI_ERROR/infrastructure/invalid、客観評価はUNVERIFIED/nullのままです。native出力の不正を修正して受理したり、離脱・客観成功へ読み替えたりしていません。これらは失敗までの観測prefixです。

## 証拠と限界

詳細ディレクトリ: C:\Users\Maekawa Ao\.codex\worktrees\virtual-beta\Ux_test\reports\exploration-observatory-2026-11-06\independent\live-audits\2026-11-06T02-35-27-473Z

audit.json / audit.md / final-viewer-audit.json / final-post-model-summary.jsonを保存。最終UIの全73枠desktop、修正版5件desktop/mobile画像も同じ場所にあります。初期監査は別timestampディレクトリに残しています。

実行: node --import tsx に続けて independent/live-model-audit.ts、independent/final-viewer-audit.ts、independent/verify-prior-hashes.ts、independent/verify-r2-integrity.ts、independent/write-final-post-summary.ts。最終実行はいずれもexit 0。

trace ZIPは原本をコピーしてhash一致を確認しましたが、内部イベントの意味を総合評価していません。終端PNGは監査時点のhashを測定してコピーしています。rawの終端メタデータには撮影時hashがないため、viewerのSOURCE_HASH_NOT_RECORDED表示を保持します。以前の78件関連検証とbuildは通過済みですが、今回リポジトリ全体のnpm testを再実行したとの主張はしません。合成400枠を実モデル400回と扱わず、実モデルの有効分母0からPersona効果・人間一致の推定を行いません。
