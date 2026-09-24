// v8 pretest summary (between participants, one case each): factual MC agreement by condition, perception items, dwell on the draft page, source use, completion.
// Usage: TEST_URL=<origin> node tools/pretest-summary-v8.mjs [--label <substring>] [--since ISO] [--json out.json]
import {readFile,writeFile} from 'node:fs/promises';
import cases from '../src/cases.js';
const args=Object.fromEntries(process.argv.slice(2).map((a,i,arr)=>a.startsWith('--')?[a.slice(2),arr[i+1]&&!arr[i+1].startsWith('--')?arr[i+1]:true]:null).filter(Boolean));
const base=process.env.TEST_URL||process.env.EXPERIMENT_URL||'https://handoff-research-pretest.research-public.workers.dev';
const key=process.env.ADMIN_KEY||(await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
const label=args.label||'',since=args.since||'';
async function adm(path){const r=await fetch(base+'/api/admin/'+path,{headers:{authorization:'Bearer '+key}});if(!r.ok)throw new Error(path+' '+r.status);return r.json()}
async function all(table){let cursor='0',rows=[];do{const b=await adm(`export?table=${table}&cursor=${cursor}`);rows.push(...b.rows);cursor=b.next}while(cursor);return rows}
const [sessions,scases,responses,actions,events]=await Promise.all(['sessions','session_cases','responses','actions','events'].map(all));
const sel=sessions.filter(s=>(!label||String(s.invitation_label||'').includes(label))&&(!since||s.created_at>=since)&&s.protocol_version.startsWith('recipient-20260925-v8'));
const ids=new Set(sel.map(s=>s.id));const by=(rows,k='session_id')=>{const m=new Map();for(const r of rows)if(ids.has(r[k])){if(!m.has(r[k]))m.set(r[k],[]);m.get(r[k]).push(r)}return m};
const C=by(scases),R=by(responses),A=by(actions),E=by(events);
const mean=a=>{const v=a.filter(x=>Number.isFinite(x));return v.length?+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2):null};const median=a=>{const v=a.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);return v.length?v[Math.floor((v.length-1)/2)]:null};
const conds=cases.conditions;const TARGET={missing_info:'fmc_info',off_focus:'fmc_policy',source_deviation:'fmc_accuracy'};const LIK={missing_info:'perc_2',off_focus:'perc_3',source_deviation:'perc_1'};
const rows=[];
for(const s of sel){const c=(C.get(s.id)||[])[0];if(!c)continue;const rs=R.get(s.id)||[];const get=ph=>{const r=rs.find(x=>x.phase===ph);return r?JSON.parse(r.value_json):null};
 const cog=get('cognition_1'),perc=get('perception_1'),read=get('read_1'),post=get('post_1');
 const acts=(A.get(s.id)||[]).sort((a,b)=>a.received_at.localeCompare(b.received_at));const enter=acts.find(a=>a.to_phase==='read_1'),leave=acts.find(a=>a.from_phase==='read_1');
 const ev=E.get(s.id)||[];const opened=phase=>ev.some(e=>e.type==='source_open'&&(e.phase||'').startsWith(phase)&&/^S\d/.test(JSON.parse(e.payload_json||'{}').source||''));
 rows.push({session:s.id,complete:s.phase==='complete',condition:c.condition,disclosure:s.disclosure,case_id:c.case_id,
  S:cog?mean([cog.suff_1,8-cog.suff_2,cog.suff_3,cog.suff_4,cog.suff_5,cog.suff_6]):null,readcheck:cog?.readcheck_correct,
  perc_1:perc?.perc_1,perc_2:perc?.perc_2,perc_3:perc?.perc_3,perc_5:perc?.perc_5,read_ease:perc?.read_ease,natural:perc?.natural,
  fmc_info:perc?.fmc_info_correct,fmc_policy:perc?.fmc_policy_correct,fmc_accuracy:perc?.fmc_accuracy_correct,
  target_ok:perc?(c.condition==='baseline'?(perc.fmc_info_correct&&perc.fmc_policy_correct&&perc.fmc_accuracy_correct?1:0):perc[TARGET[c.condition]+'_correct']):null,
  read_sec:read?.read_seconds??(enter&&leave?(new Date(leave.received_at)-new Date(enter.received_at))/1000:null),
  opened_read:opened('read_1'),opened_before_submit:opened('read_1')||opened('cognition_1')||opened('edit_1'),
  edited:c.submitted_text!=null&&c.submitted_text.trim()!==c.initial_text.trim(),effort:post?.effort_total})}
const done=rows.filter(r=>r.complete);
const out=[];const p=(...a)=>out.push(a.join(''));
p(`# v8 予備実験の集計（${base}${label?`, label∋"${label}"`:''}${since?`, since ${since}`:''}）`);
p(`- 開始 ${sel.length} ／ 完了 ${done.length} ／ 条件別の完了: ${conds.map(k=>`${k} ${done.filter(r=>r.condition===k).length}`).join(', ')} ／ 開示別: ${['disclosed','undisclosed'].map(d=>`${d} ${done.filter(r=>r.disclosure===d).length}`).join(', ')}`);
p(`- テーマ×条件の完了数: ${cases.cases.map(c=>c.id.split('_')[0]+' '+conds.map(k=>done.filter(r=>r.case_id===c.id&&r.condition===k).length).join('/')).join(' | ')}`);
p(`- 報告案ページの滞在秒: 中央値 ${median(done.map(r=>r.read_sec))}, 45秒未満 ${done.filter(r=>r.read_sec!=null&&r.read_sec<45).length} 人`);
p(`- 資料を開いた割合: 読了画面 ${done.length?(done.filter(r=>r.opened_read).length/done.length*100).toFixed(0):'–'}%, 提出前いずれか ${done.length?(done.filter(r=>r.opened_before_submit).length/done.length*100).toFixed(0):'–'}%`);
p(`- 読了確認の正答率: ${done.length?(done.filter(r=>r.readcheck===1).length/done.length*100).toFixed(0):'–'}% ／ 編集した割合: ${done.length?(done.filter(r=>r.edited).length/done.length*100).toFixed(0):'–'}%`);
p(``);p(`## 一次MC：事実型の意図一致率（操作条件は対象問、基準は3問すべて）`);
for(const k of conds){const v=done.filter(r=>r.condition===k&&r.target_ok!=null);p(`- ${k}: ${v.length?(v.filter(r=>r.target_ok===1).length/v.length*100).toFixed(0)+'%':'–'} (n=${v.length})${k!=='baseline'?`　対象問 ${TARGET[k]}`:''}`)}
p(`- 基準条件での各問の一致率: ${['fmc_info','fmc_policy','fmc_accuracy'].map(q=>{const v=done.filter(r=>r.condition==='baseline'&&r[q]!=null);return `${q} ${v.length?(v.filter(r=>r[q]===1).length/v.length*100).toFixed(0)+'%':'–'}`}).join(', ')}`);
p(``);p(`## 二次MC：同意評定（条件別の平均、1〜7）`);
for(const item of ['perc_1','perc_2','perc_3','perc_5','S','read_ease','natural']){p(`- ${item}: ${conds.map(k=>{const v=done.filter(r=>r.condition===k).map(r=>Number(r[item]));return `${k} ${mean(v)??'–'} (n=${v.filter(Number.isFinite).length})`}).join(' | ')}`)}
p(`- 目標項目の差（操作−基準）: ${Object.entries(LIK).map(([k,item])=>{const b=mean(done.filter(r=>r.condition==='baseline').map(r=>Number(r[item])));const c=mean(done.filter(r=>r.condition===k).map(r=>Number(r[item])));return `${k}/${item} ${b!=null&&c!=null?(c-b).toFixed(2):'–'}`}).join(' | ')}`);
console.log(out.join('\n'));
if(args.json)await writeFile(String(args.json),JSON.stringify({generatedAt:new Date().toISOString(),base,label,since,sessions:sel.length,rows},null,2));
