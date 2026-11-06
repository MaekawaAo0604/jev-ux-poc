# flow最終：有効全trajectoryは0件、無効prefix4件の移動確認

予定8件のうち4件試行、4件invalid、4件未試行、65 requests（manifest/result記載、台帳未読）。最初はXK0のassessment TIMEOUT、続くXK1/XE0/XE1のnative incomplete3連続で停止した。XP0/XP1/XD0/XD1は未試行。

- **XK0：9 UI／10観測／29 requests**。入口↓→管理↓→概要↓同期説明→管理↓→削除説明anchor→概要、最後assessment TIMEOUT。既見画像への再訪はあるが、同期取得と新subsectionの探索もある。重複した「判断に必要な説明」条件が3entry中2枠を占める具体例を保存。
- **XK1：5 UI／6観測／16 requests**。入口↓→管理↓追加手順↓アップグレード説明↓その手順、最後native incomplete。6画像は別hashで、記録範囲に往復はない。
- **XE0：3 UI／4観測／10 requests**。入口↓→管理↓、最後native incomplete。本人端末の適合という広い条件を、対象ユーザー説明を読んだという狭い条件へ対応付けresolvedにする例がある。ただしunknownsには本人適合未確認が残り、利用可能と断定したとは扱わない。
- **XE1：3 UI／4観測／10 requests**。同じ短い入口→管理prefix。広い適合・同期・復旧条件を分割する一方、状態に重なる条件も残る。native3件すべてに目標未要求の「判断結果保存」unknownがある。最後はnative incomplete。

20個のselected/actionは次画像・URLと整合した。XK0の削除はアカウント操作ではなくDocs内anchor。再訪、現在視野のunobserved、時間切れを、それぞれ無意味loop、忘却、利用断念と同一視しない。全trajectoryの有効性が0件なので、Personaの経路因果差・達成率・人間らしさの採点には用いない。

各actor-review.jsonとfinal-review.jsonに、全24観測の画像file/SHA、原文JSON Pointer、native/assessment/state、制約付きの解釈を保存した。過去raw/ledger/env/API/product編集はいずれも0。後続pollは行わず終了する。
