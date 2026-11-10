# 32件の初手における Persona trait 表現の確認

完了した probe 32/32件（各4件）と新規Persona8定義だけを照合した。原文引用・JSON Pointer・元result/PersonaのSHA-256はreview.jsonに全件分ある。flow、台帳、過去の人間raw、環境変数は読んでいない。

初手はscroll_down 25件、管理リンクe23 7件。reason自己申告はgoal 30件、uncertainty 2件。assessmentは全32件でknowledge=insufficient、goalはuncertain/unsatisfiedが各16件。全件cap1のDECISION_LIMIT、主観完了false、客観結果UNVERIFIED/nullである。

- **知識（XK0/XK1）**：XK1の4/4件は紛失・別端末利用を独立条件にした。ただしXK0も4/4件で同期・復旧を未知点に挙げる。XK0の条件リストには用語定義や意味理解を独立に確かめる条件がなく、語彙知識ゼロが処理へどう反映されたかは弱い証拠にとどまる。両側のinsufficientはGitHub固有情報不足と両立し、詳しい人が初心者に変えられたとは断定しない。初手は4scroll対3scroll+1click。
- **経験（XE0/XE1）**：XE1はGitHubの未確認条件を未知に保っており、他サービスの経験からGitHubの経路を既知扱いしてはいない。一方、毎日・500回の経験を生成条件/unknownsが明示的に使った記述は4件とも確認できない。両側に同様の画面説明の確認があり、初手も2scroll+2click対3scroll+1clickで重なる。
- **優先（XP0/XP1）**：XP1の4/4件に独立した紛失・復旧条件がある。しかしXP0も3/4件のunknownsで復旧を挙げる。XP0側で手間と根拠のtradeoffを明示する記述はなく、efficiency理由も0件。両側とも3scroll+1clickで、文章の違いを早さや完了の違いに読み替えない。継続は速度優先への直接違反ではない。
- **端末（XD0/XD1）**：XD1は4/4件で共用OS・個人認証情報保存禁止をnative条件に明示し、今回もっとも直接的なtrait利用が見える。スマートフォン/外付けキーがないことまで明示したunknownは1/4件。残る沈黙は完全処理・無視のどちらの証明でもない。初手は3scroll+1click対4scrollで大半は同じ。

明確な逆の経歴や、禁止された端末を使えるとする自己申告は、確認した初手フィールドでは特定できなかった。ただし、これは忠実な認知の証明ではない。別の共通懸念として、charterにない「判断結果を保存したか/保存が必要か」というunknownが5/32件（XD0r2、XD1r4、XK0r3、XP1r2/r3）にある。実行された保存や必須終了条件になった証拠はない。

nativeの条件やreasonはモデルの自己申告であり、人間らしさ・意味理解成功・因果的な人格差の採点には使わない。1判断、各4反復、部分的な順序釣り合い、ID/名前の影響という限界がある。引用例だけを選んで結論を作らず、全32件をreview.jsonのtrialsに残した。
