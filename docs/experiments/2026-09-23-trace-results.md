# Jev の成功経路から Playwright 回帰テストへの変換

ローカルデモで本物の Jev が成功した 2 操作を記録し、raw テストと POM を使った通常テストを作成した。
両方とも Jev の API キーを外した子プロセスで 3 回連続 PASS した。
今回の実装はローカルの通知停止 Goal に限定しており、任意サイトのテストを完成させる汎用機能ではない。

## 1. 変更したファイル

今回の変更は次のファイルである。
同じ作業ディレクトリにある以前の UX 判定修正は含めない。

- `pages/action-target.ts`：選択対象の属性、アクセシブル名、一意に決まる Locator を取得。
- `pages/AccountPage.ts`：Trace 用の `describeAction` と、探索と回帰テストで共用する `control` を追加。
- `pages/PublicSitePage.ts`：URL への直接遷移と、通信を止めた開閉操作を区別して記録。
- `runner/action-trace.ts`：Trace の型。
- `runner/generate-test.ts`：成功条件と記録を検査し、raw コードを生成、別名保存。
- `runner/generate.ts`：保存済み Trace から生成する CLI。
- `runner/engine.ts`：実行した操作、記録エラー、処理時間を保存。成功後の生成を追加。
- `runner/public-site.ts`：公開サイトの実行済み操作を保存。既存の安全制限は維持。
- `runner/run.ts`：`--generate-test` を追加。
- `tests/action-trace.test.ts`、`tests/generate-test.test.ts`：記録、生成、誤生成の拒否、記録エラー、通信制限を検証。
- `tests/regression/notifications.spec.ts`：成功経路から手直しした通常テスト。
- `tests/regression/fixtures.ts`、`tests/regression/global-setup.ts`：共用 POM、ローカル通信制限、Vite の起動と終了。
- `playwright.config.ts`、`playwright.raw.config.ts`：通常テストと raw の実行対象を分離。
- `package.json`、`package-lock.json`：既存 Playwright と同じ 1.63.0 の `@playwright/test` と実行コマンド。
- `tsconfig.json`：raw と Playwright 設定も型検査の対象に追加。
- `README.md`：実行方法と対応範囲。
- `docs/experiments/2026-09-23-trace-pipeline.mjs`：探索と再生の計測、ログ、raw のハッシュ照合。
- この文書、および以下の raw コードと Trace。

## 2. Action Trace の形式

[型定義](E:/ChatGPT/Ux_test/runner/action-trace.ts) の `RecordedAction` は、指定された各項目に加え、ブラウザーの「戻る」、採用した Locator、スクロール後の座標、実行方式、操作時間を持つ。
例は実際の最初の操作から抜粋した。

```json
{
  "step": 1,
  "action": "click",
  "target": {
    "anonymousId": "e5",
    "tagName": "a",
    "role": "link",
    "accessibleName": "通知設定",
    "locator": { "kind": "role", "role": "link", "value": "通知設定" }
  },
  "urlBefore": "http://127.0.0.1:5174/good/",
  "urlAfter": "http://127.0.0.1:5174/good/#notifications"
}
```

Trace 全体には Goal、初期 URL、画面サイズ、FAKE かどうか、独立した成功判定、Jev の完了判断、完了時刻を保存する。
`done`、`stuck`、実行前に止めた操作、失敗した操作は成功した操作列に追加しない。
記録だけが失敗した場合は探索を続け、`recordingErrors` に保存してコード生成を拒否する。

Locator は実行直前に test ID、role と name、label、placeholder、text、短い CSS の順に候補を確認する。
一致数が 1 であり、元の対象と同じ DOM 要素であるものだけを採用する。
raw 生成で POM のメソッドを推測せず、POM の再利用は Codex の手直しで行う。

## 3. 生成した raw コード

[raw の全文](E:/ChatGPT/Ux_test/generated/raw/2026-09-22T16-25-46-427Z-634ef882-81b7-4d7a-a265-5523cb8669b4.spec.ts) と [元 Trace](E:/ChatGPT/Ux_test/generated/raw/2026-09-22T16-25-46-427Z-634ef882-81b7-4d7a-a265-5523cb8669b4.trace.json) を保存した。
raw は手直し後も上書きせず、再生の前後で SHA-256 が一致することを確認した。

操作と成功条件は次のとおり。
全文には画面サイズ、ローカル通信制限、各操作後の URL 照合も含まれる。

```ts
await page.goto('/good/');
await page.getByRole('link', { name: '通知設定', exact: true }).click();
await page.getByRole('button', { name: 'メール通知を停止する', exact: true }).click();
await expect.poll(() => goals.notifications.check(page)).toBe(true);
```

## 4. 手直し後との差分

[通常テストの全文](E:/ChatGPT/Ux_test/tests/regression/notifications.spec.ts) は、raw の 2 操作と各操作後の URL 照合を維持している。
変更は POM、fixture、共用 Goal の利用に限定した。

```diff
- import { test, expect } from '@playwright/test';
+ import { test, expect } from './fixtures.js';
- page.getByRole('link', { name: '通知設定', exact: true })
+ good.control('link', '通知設定')
- page.getByRole('button', { name: 'メール通知を停止する', exact: true })
+ good.control('button', 'メール通知を停止する')
```

画面サイズと通信制限の重複を設定と fixture に移し、テスト名も既存の Goal から参照した。
URL の照合は既定のローカル接続先を使った完全一致にした。
Goal、操作順、クリック対象、最後の成功判定は変えていない。
生成後のテスト本体を直して失敗を回避する修正は 0 回だった。

## 5. 再利用した既存実装

- POM：既存の `GoodPage` とその既知ラベルを利用。新しい `control` メソッドは手書き POM の探索処理でも共用する。
- 成功判定：既存の `goals.notifications.check(page)` を raw と通常テストの両方で利用。
- テストデータ：既存の Goal の文言を利用。専用の test-data モジュールは元から存在しない。
- fixture：既存の専用 fixture はなかったため新設。`tests/browser.test.ts` の Vite 起動終了と外部通信禁止の方式を再利用。
- helper：別の既存 helper に同じ操作列はなかった。新しいシナリオや操作の抽象化は追加していない。

## 6. 実行結果

[実測の記録](E:/ChatGPT/Ux_test/reports/trace-pipeline-2026-09-22T16-25-37.530Z/validation.json) に成功経路、生成先、ハッシュ、各再生の結果を保存した。

- 実 Jev 探索：`typesafe-ai/jev`、`fake: false`、2 操作、`SUCCESS`。既存の成功判定と Jev の完了判断が両方成立。
- raw：3/3 PASS。終了方式の修正後に同じ raw を再実行して、再び 3/3 PASS、終了コード 0。
- 通常テスト：3/3 PASS、終了コード 0。strictness violation、操作 timeout、flaky は 0。
- 再生時は Jev 用 API キーを子プロセスの環境から除外し、探索モジュールを呼び出していない。
- 全体テスト：151 件中 150 PASS、失敗 0、既存 OCR スキップ 1。
- TypeScript と Vite build：終了コード 0。[全体検証の記録](E:/ChatGPT/Ux_test/reports/production-verification-2026-09-22T16-31-35.051Z/validation.json) で検証中のソース変更がないことも確認。

初期の検証基盤では問題が 3 つあった。
探索ログの `index.html` をディレクトリとして扱ったため、計測用スクリプトが探索成功後に終了した。
raw と Trace は生成済みだったので再探索せず復旧し、探索の外側の起動終了時刻だけログのファイル時刻から復元した。
探索本体の内部計測値は元の実行ログに残っている。

さらに、raw の 3 テスト終了後も Vite が残って Playwright が終了待ちになり、その途中で通常テストを起動した 1 回はポート競合で始められなかった。
今回の Vite の PID とコマンドを確認して停止し、回帰テストのサーバー管理を既存テストと同じ明示的な `server.close()` に変更した。
変更後の通常テストと raw は、ともに後片付けまで正常終了した。
ポート競合の [JSON](E:/ChatGPT/Ux_test/reports/trace-pipeline-2026-09-22T16-25-37.530Z/regression-1.json) と [ログ](E:/ChatGPT/Ux_test/reports/trace-pipeline-2026-09-22T16-25-37.530Z/regression-1.txt) も残した。
この失敗はブラウザー操作の失敗ではなく、テスト開始前の実行基盤の失敗である。

## 7. 処理時間

探索本体は 5.272 秒だった。
内訳のうち Jev の操作判断が合計 1.899 秒、Locator 情報の取得が 0.064 秒、ブラウザー操作が 0.112 秒で、これらは探索本体の時間に含まれる。
残りにはページの準備、観測、画像とログの保存、成功判定を含む。
終了後の Jev 監査は別に 0.764 秒、raw 生成と保存は 0.009 秒かかった。

Codex が通常テストを書き終えた時刻は、探索完了から約 86 秒後だった。
これはファイルの書き込み時刻との差で、内容の確認、計測用スクリプトの復旧、編集を含む経過時間であり、編集だけの CPU 時間ではない。
POM と fixture の準備、および生成機能そのものの開発時間は、この 86 秒より前の初期実装として別扱いにしている。

最初に通常テストの 3 回 PASS とプロセス終了がそろったのは、探索完了から 297.990 秒後だった。
初回 raw のプロセス終了待ちと調査を含む 169.671 秒、および起動競合、実行基盤の修正を除外していない。
修正後の raw 3 回実行はサーバー起動終了を含め 8.585 秒、通常テストの 3 回実行は 8.836 秒だった。

したがって、成功経路を短時間で POM を使うコードに翻訳できたことは確認できたが、「探索完了から 2〜3 分で安定した回帰テストが完成する」という仮説は初回の一連では達成していない。
Codex がブラウザーを逐次操作する方式との同条件比較もしていないため、総合的に速いという結論は出せない。

## 8. 現時点の弱点

- 実測は状態を初期化しやすいデモの 1 経路だけ。認証、入力、iframe、別タブ、ファイル保存は未検証。
- 生成時の独立した成功条件は `notifications` に固定。公開サイトの `JEV_DONE` は成功の証明に置き換えていない。
- 対象の取得と操作の間に DOM が変わる競合や、後日アクセシブル名が変わる問題までは解決していない。
- 一意の Locator が作れない場合は、`nth()` で回避せず生成を拒否する。生成可能な画面は限られる。
- raw の既存 Goal の import は `generated/raw` 配下を前提とする。任意の場所への持ち出しには対応しない。
- Trace の入力値や URL に個人情報が入る場合のマスキングは未実装。現在の探索にはフォーム入力を追加していない。
- 計測用スクリプトは逐次実行用。同一 manifest への並行実行は更新が競合するため使わない。

## 9. 次の改善

最初に、同じ実行基盤を用いて 3〜5 個の別 Goal で、探索から最終 PASS までの時間を測る。
初期開発を除いた条件で Codex の逐次操作方式とも比較し、中央値だけでなく失敗率と修正回数を残す。
次に、既存の請求書 Goal へダウンロード待機と PDF 検証を追加する。
公開サイトへの一般化は、守るべき操作制限と独立した成功条件をテスト側で定義してから行う。
