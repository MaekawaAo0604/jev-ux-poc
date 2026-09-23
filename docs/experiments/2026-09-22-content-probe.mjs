import {evaluateChoices,safeRequestFailure} from '../../jev/client.ts';
import {writeFile,mkdir} from 'node:fs/promises';
process.loadEnvFile('.env');
const root=`reports/content-probe-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(root,{recursive:true});
const quotes=['利用上の注意点','エニタイムは、ヘルシアプレイスを必要とする高校生を応援します。','・保護者様：セキュリティキー','・保護者がエニタイムメンバーであること','・15歳以上18歳以下であること（高校在学期間）','・利用できるのは、保護者の登録店舗のみとします。','・利用できるのは、スタッフアワー内のみとします。 （深夜早朝利用など利用不可）'];
const out=[];
const criteria={stated:'本文自体が求める情報の答え・条件を明確に述べている',not_stated:'本文自体は求める情報を述べていない（見出し・質問・宣伝・別の情報など）',uncertain:'部分表示や曖昧さがあり判断できない'};
for(const requestedInformation of ['制度の対象条件','利用できる店舗','時間帯']){
 const questions=Object.fromEntries(quotes.map((quote,i)=>[`q${i}`,{type:'choice',instructions:`判定対象: ${JSON.stringify({requestedInformation,quote})}。quoteの本文自体がrequestedInformationについて具体的な情報・条件を述べているか。誰に適用されるかや情報が全部そろっているかは判定しない。見出し・質問文・宣伝には回答を補わない。`,criteria}]));
 try{const r=await evaluateChoices({requestedInformation},questions);out.push({mode:'single-topic-batch',requestedInformation,quotes,result:r});console.log(JSON.stringify({mode:'single-topic-batch',requestedInformation,answers:Object.values(r.answers).map(a=>a.choice)}));}catch(e){out.push({error:safeRequestFailure(e),requestedInformation});}
}
for(const requestedInformation of ['制度の対象条件','利用できる店舗','時間帯']){
 const questions=Object.fromEntries(quotes.map((quote,i)=>[`q${i}`,{type:'choice',instructions:`${JSON.stringify({requestedInformation,quote})}\nこの引用はrequestedInformationとの関係でどの種類の文章か。一番近いものを選ぶ。`,criteria:{direct:'求める情報に直接答える、事実・条件・規則の明示',promotion:'応援・理念・宣伝であり、資格や利用規則ではない',procedure:'準備する持ち物や登録手順であり、求める資格・場所・時間の規則ではない',heading:'見出しまたは質問だけで、答えの記載ではない',different:'別の情報項目の説明であり、求める項目への答えではない',uncertain:'何を意味するか不明'}}]));
 try{const r=await evaluateChoices({},questions);out.push({mode:'contrastive-role',requestedInformation,quotes,result:r});console.log(JSON.stringify({mode:'contrastive-role',requestedInformation,answers:Object.values(r.answers).map(a=>a.choice)}));}catch(e){out.push({error:safeRequestFailure(e),requestedInformation});}
}
for(const quote of quotes){
 const requestedInformation='制度の対象条件';
 try{const r=await evaluateChoices({requestedInformation,quote},{content:{type:'choice',instructions:'quoteの本文自体がrequestedInformationについて具体的な情報・条件を述べているか。ここでは誰に適用されるかや情報が全部そろっているかは判定しない。見出し・質問文・宣伝には回答を補わない。',criteria}});out.push({mode:'isolated-state',quote,result:r});console.log(JSON.stringify({mode:'isolated-state',quote,answer:r.answers.content.choice}));}catch(e){out.push({mode:'isolated-state',quote,error:safeRequestFailure(e)});}
}
await writeFile(`${root}/result.json`,JSON.stringify(out,null,2));console.log(JSON.stringify({report:`${root}/result.json`}));
