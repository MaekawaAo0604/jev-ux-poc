// Recover an explicitly interrupted experiment from immutable completed step logs.
// This performs no browser actions or Jev calls and does not manufacture success.
import {readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, join} from 'node:path';
import {report} from '../../runner/report.ts';

const receiptPath=resolve('docs/experiments/2026-09-23-museum-goal-only.json');
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
const root=resolve(receipt.reportDirectory),dir=join(root,'exploration');
const stoppedAt='2026-09-22T17:31:25Z';
const directoryTimestamp='2026-09-22T17:21:22.853Z';
const files=(await readdir(dir)).filter(name=>/^step-\d+\.json$/.test(name)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const steps=[],evidenceFiles=[];
for(const name of files){
 const bytes=await readFile(join(dir,name)),metadata=await stat(join(dir,name));
 const step=JSON.parse(bytes.toString('utf8'));
 if(step.result!=='OK'||!step.recordedAction)throw new Error('Recovery expects completed, recorded operations only');
 if(step.number!==steps.length+1)throw new Error('Non-contiguous step records');
 steps.push(step);
 evidenceFiles.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),createdAt:metadata.birthtime.toISOString(),lastWrittenAt:metadata.mtime.toISOString()});
}
if(steps.length!==4)throw new Error('Unexpected completed step count for this interruption');
for(const [name,expected] of Object.entries(receipt.sourceSha256)){
 if(createHash('sha256').update(await readFile(resolve(name))).digest('hex')!==expected)throw new Error(`Source changed during trial: ${name}`);
}
const observationAndRecordingGapsMs=evidenceFiles.slice(1).map((entry,index)=>Date.parse(entry.createdAt)-Date.parse(evidenceFiles[index].lastWrittenAt));
const interruption={
 status:'MANUAL_INTERRUPTION',stoppedAt,
 reason:'Controller stopped after about ten minutes of slow observation, while the next observation was in progress. This was not Jev stuck/done or the configured action limit.',
 stopRuleWasPreRegistered:false,
 reportDirectoryToStopMs:Date.parse(stoppedAt)-Date.parse(directoryTimestamp),
 commandRequestToStopMs:Date.parse(stoppedAt)-Date.parse(receipt.commandRequestedAt),
 completedSteps:steps.length,
 completedStepElapsedMs:steps.reduce((sum,step)=>sum+step.elapsedMs,0),
 recordedActionDurationMs:steps.reduce((sum,step)=>sum+step.recordedAction.durationMs,0),
 observationAndRecordingGapsMs,
 gapMeaning:'Filesystem timestamps: prior completed-step write to next pending-step creation. Includes observation, screenshot and JSON work. Excludes the next Jev call. Not a direct observation-only timer.',
 apiAttemptsInCompletedDecisions:steps.reduce((sum,step)=>sum+step.decision.request.attempts,0),
 apiFailuresInCompletedDecisions:steps.flatMap(step=>step.decision.request.failures),
 inferenceTimeMs:null,
 goalComplete:false,
 goalAssessment:'Observed evidence is insufficient: adult fee and hours are visible, but the high-school applicability/total and reentry policy are not established in saved observations.',
 evidenceFiles,
 codeGeneration:{status:'NOT_RUN',reason:'No successful trace. Public generation extension remains unimplemented.'},
 regression:{status:'NOT_RUN'},
 provenance:'Recovered after Ctrl-C from saved OK step files. No final screenshot or original runner final result exists. Source hashes checked unchanged. Do not treat as a naturally terminated or fully timed run.'
};
const result={
 variant:'public',goalText:receipt.goal,pom:'auto',font:true,repeat:1,fake:false,
 successMode:'jev',objectiveSuccess:null,perceivedSuccess:false,comparison:'UNVERIFIED',
 reason:'MANUAL_INTERRUPTION',status:'INTERRUPTED',actionCount:steps.length,backCount:0,loopCount:0,
 elapsedMs:interruption.reportDirectoryToStopMs,
 path:steps.at(-1).state.history,
 steps,dir,finalURL:steps.at(-1).recordedAction.urlAfter,
 completionAudit:{status:'NOT_RUN',objectiveVerified:false,evidence:[],uncertainEvidence:[],warnings:[]},
 settings:receipt.settings,interruption,
 warnings:['Manually interrupted. Final URL is the last completed action URL; no final observation was captured.']
};
await writeFile(join(dir,'interruption.json'),JSON.stringify(interruption,null,2)+'\n',{flag:'wx'});
await writeFile(join(dir,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
await report(root,[result]);
const htmlPath=join(root,'index.html');
let html=await readFile(htmlPath,'utf8');
html=html.replace('<h1>目的までの道のりを、見える形に。</h1>',`<h1>東京国立博物館：Goal のみの探索を途中停止</h1><p class="notice">約10分で4操作。観測が遅いため、Codex が途中停止しました。Jev の行き詰まり判定や操作上限ではありません。成功経路は得られておらず、raw 生成・回帰テストは未実施です。</p><p>一般料金と最終入館の条件は観測できましたが、高校生への適用条件・2人分の料金と再入館可否は、保存済み観察では未確認です。サイトに情報がないという意味ではありません。</p><p>次の判断データの保存までの間隔は75.330秒、74.653秒、74.547秒でした。この区間に次の Jev 呼び出しは含まれません。観測・画像保存等の内訳は未計測です。画面を2回観測する既存処理も確認しました。</p><p class="hint">約10分は実行ディレクトリの時刻から停止までの値です。停止基準は事前設定ではありません。元の step JSON と画像は未変更で、このレポートだけを停止後に再構成しました。サイト評価や40分との速度倍率には使えません。取得物はローカル確認用です。</p>`);
await writeFile(htmlPath,html);
console.log(JSON.stringify({report:htmlPath,...interruption}));
