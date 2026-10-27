# T00 棚卸し

2026-10-27。元作業ツリー E:/ChatGPT/Ux_test、branch fix/sufficiency-voting、HEAD a442b44f2c9e235fdf23d94c082da9964be95930。指定された virtual-beta/README.md, research.md, tasks.md は元ツリー、origin/master、origin/fix/sufficiency-votingに存在しませんでした。今回のファイルは新規です。親ディレクトリまでfilesystem AGENTSもなく、ユーザー提供のAGENTS指示を適用。参照されたFLAGS等の実体はリポジトリにはありません。

最新の未コミットPersona/Charter、completion-frames、Local/ClientToolPage、比較/診断runnerとテストをnative worktreeへコピーし、基準f09047e45ab13fe891a3686c58c310b2d03f7f82に保存しました。元ツリーは変更していません。秘密情報、reports、node_modules、無関係なsales/watcher実装は基準コミットへ取り込んでいません。依存は既存node_modulesをjunctionで参照。

1. 実装され今回動作確認: Persona/Charter分離と禁止操作、既存探索メモリ接続、共有経路への再訪、completion画像のhash検証・長文脈回復、iframe-only Back。型チェックと18件回帰テスト通過。旧9操作LOOPは既存メモリ接続ありでは回帰テストで解消しており、未修正問題として再実装しません。
2. 実装はあるが今回すべての性能再確認はしない: 画像のみ送信境界、視覚記憶/完了proof、OCR、公開サイト安全制約、過去のSVGOMG/GitHubペルソナ実験。過去資料は docs/persona-experiment.md、docs/persona-phase2.md、docs/experiments/2026-10-26-* と元reportsにあります。過去結果と今回の新規実行を区別します。
3. 今回必要: full/crop/foveatedの画像変換・注視独立行動、制限情報の送信allowlist、容量制限ユーザー記憶と画像参照、seed sampling/argmax、4条件設定・実行・監査・リプレイ、独立検証。
4. 所在/仕様未確認: 指定の過去virtual-beta資料、学習済み注意モデル・重み、人間の比較データ、感情・疲労・信頼等の更新則。実在や有効性を仮定しません。
