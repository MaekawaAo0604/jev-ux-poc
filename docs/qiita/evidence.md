# 記事用の根拠と素材

この一覧は執筆者向けです。
本文にローカルパスをそのまま転載しないでください。
パスはプロジェクトルートからの相対パスです。

## 主実験：24 試行

保存先：`reports/2026-09-18T19-37-43.902Z/`

集計元：`summary.json`
個別の操作と入力：各試行フォルダーの `result.json` および `step-*.json`
画像：各試行フォルダーの `step-*.png`

Good は 12 試行すべて SUCCESS、実操作数は各 2。
Bad の請求書は文字サイズあり／なし各 3 回が STUCK、実操作数は各 2。
Bad の通知は文字サイズなしの 3 回、ありの 2 回が LOOP、実操作数は各 9。
文字サイズありの通知の残る 1 回は DECISION_ERROR で、3 操作後に API がタイムアウト。

代表経路：

- 請求書：マイページ → 利用情報 → 利用履歴 → stuck。
- 通知：マイページ → 各種設定 → お知らせ → 今月のおすすめ → マイページへ戻る。後半はアカウント情報も選び、再訪を繰り返して停止。

この実験時点では、処理成功時に終了していました。
Jev が `done` を選んだ 12 件という意味ではありません。
古いレポートを新しい描画コードで再表示していますが、実行ログの実験条件は変わりません。

## 完了認識と POM の追加検証

自動 POM：`reports/2026-09-18T20-04-59.554Z/`
手書き POM：`reports/2026-09-18T20-05-18.834Z/`

Good の請求書／通知を各方式で 1 回ずつ実行。
計 4 試行とも `objectiveSuccess=true`、`perceivedSuccess=true`、`CONFIRMED_SUCCESS`。
各 2 操作の後、次の Jev 判断で `done` を選択。
操作数と判断回数は同じではありません。

誤完了や完了未認識の振り分けは `tests/browser.test.ts` のプログラムによる検証であり、実 Jev でその UX 問題を実証したものではありません。

## 実サイト

保存先：`reports/2026-09-19T03-35-08.957Z-public/exploration/`
Goal：福井高専の入学情報が知りたい。
最終結果：LOOP、実操作 4 回。
最初の 2 操作：入試情報 → 中学生の入試。
次の 2 操作：同じ学生募集要項をクリック。
Step 5 で同じ操作の 3 回目を検知し、実行前に停止。

到達先：https://www.fukui-nct.ac.jp/examination/middle-school/
選択された PDF：https://www.fukui-nct.ac.jp/wp/wp-content/uploads/2026/08/R9bosyuyoukou_honbun.pdf

PDF リンクは探索後の別の読み取り確認で特定しました。
探索中の Jev にリンク先や正解ルートを先に教えたわけではありません。
PDF は実行器の観察対象外です。
ダウンロードイベントや PDF 表示の挙動まで当時のログに記録していないので、原因の内部挙動を断定しません。

## 費用

24 試行前の残高：14.999828682 USD。
24 試行後の残高：14.995505874 USD。
差額：0.004322808 USD。

出典はこの作業セッションで行った Gateway 残高照会です。
試行ごとの請求明細ではなく、実行前後の残高差です。
本文に載せるなら「この 24 試行を行った前後の残高差は約 0.0043 ドル」とします。
以降の自動 POM 検証や実サイト探索は、この差額に含まれません。
外部で同じキーを使用していないことを厳密に確認した請求分析でもありません。

## 公式資料

- Jev の紹介：https://docs.typesafe.ai/introduction
- Choice：https://docs.typesafe.ai/primitives/choice
- TypeSafe API：https://docs.typesafe.ai/introduction/quickstart
- Vercel の Jev 対応：https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway
- Gateway の価格：https://vercel.com/ai-gateway/models/jev
- 日本語の文章規範スキル：https://github.com/hikimay/japanese-tech-writing

料金や API 仕様の記載は本文作成時にも確認します。
実測していない高速化倍率、他モデルに対する優位性、人間との一致率は書きません。
