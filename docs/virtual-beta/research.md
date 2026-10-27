# 今回採用した部品と残るモデル課題

指定の過去research.mdは利用可能な版には存在しなかったため、欠落を隠して復元しません。今回の実装判断に必要な一次資料に限定しました。

- 採用: 既存pngjs 7.0.0のPNG decode/encodeと画素コピー。MIT、追加依存なし。公式公開コードとインストール済みの該当版を確認。詳細は vision-research.md。box blurは工学的な制約で、視覚モデルの学習や較正はありません。[公式コード](https://github.com/pngjs/pngjs)
- 採用: Node crypto SHA-256によるseed/counter決定的なdraw。独自の小さなアダプターで外部samplerをコピーしません。分布から実選択し、保存記録から同一結果を検証できます。詳細は state-research.md。[公式仕様](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options)
- 採用: 既存Playwrightのcontext初期化とtrace。UI操作と監査を追跡します。[公式Trace Viewer](https://playwright.dev/docs/trace-viewer)
- 維持: 既存Jevクライアント、Persona/Charter、ローカルPOM、通知停止oracle。既存の目的達成runnerは変更せず回帰テストします。
- 見送り: 動的注意や視線学習モデル、本格的な認知・感情モデル、モデル学習。今回必要な実装の成立を先に検証し、入手可能なコード/重み・利用許諾・観測データ・性能要件が確定してから候補を比較します。公開予定の資産を入手済みと扱いません。

視線学習の接続点は transformVision へ渡すfixationとlook候補、記憶・認識の接続点は UserObservation と updateUserState、方策の接続点は次行動分布と createSampler です。学習モデルをつなぐだけで人間再現が成立するとは限りません。

人間との比較に既存ログから使えるのは画面、行動、順序、客観結果、終了理由です。API latencyは人間の読了/迷い時間に変換できません。追加取得が必要なのは同条件での実参加者の経路・認識/再読・注視（必要なら専用計測）・離脱理由・操作時間、参加同意、母集団定義、ホールドアウト課題、パラメータ較正と検証の分離です。1条件1回の疎通や行動の多様性は予測能力の証拠になりません。
