// Pilot summary: manipulation checks, timing, dropout, reading/precheck, edits, leakage signals.
// Usage: node tools/pilot-summary.mjs [--mode live|test] [--label <substring of invitation label>] [--since ISO] [--json out.json]
import {readFile,writeFile} from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map((a,i,arr)=>a.startsWith('--')?[a.slice(2),arr[i+1]&&!arr[i+1].startsWith('--')?arr[i+1]:true]:null).filter(Boolean));
const base=process.env.TEST_URL||'https://handoff-research.research-public.workers.dev';
const key=process.env.ADMIN_KEY||(await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
const mode=args.mode||'live',label=args.label||'',since=args.since||'';
async function adm(path){const r=await fetch(base+'/api/admin/'+path,{headers:{authorization:'Bearer '+key}});if(!r.ok)throw new Error(path+' '+r.status);return r.json()}
async function all(table){let cursor='0',rows=[];do{const b=await adm(`export?table=${table}&cursor=${cursor}`);rows.push(...b.rows);cursor=b.next}while(cursor);return rows}
const [sessions,cases,responses,actions,events]=await Promise.all(['sessions','session_cases','responses','actions','events'].map(all));
const sel=sessions.filter(s=>s.mode===mode&&(!label||String(s.invitation_label||'').includes(label))&&(!since||s.created_at>=since)&&s.protocol_version.startsWith('recipient-20260921-v'));
const ids=new Set(sel.map(s=>s.id));
const by=(rows,k='session_id')=>{const m=new Map();for(const r of rows)if(ids.has(r[k])){if(!m.has(r[k]))m.set(r[k],[]);m.get(r[k]).push(r)}return m};
const C=by(cases),R=by(responses),A=by(actions),E=by(events);
const median=a=>{const v=a.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);return v.length?v[Math.floor((v.length-1)/2)]:null};const mean=a=>{const v=a.filter(x=>Number.isFinite(x));return v.length?+(v.reduce((x,y)=>x+y,0)/v.length).toFixed(2):null};
const min=ms=>ms==null?'–':(ms/60000).toFixed(1);
// --- completion and dropout ---
const done=sel.filter(s=>s.phase==='complete'),withdrawn=sel.filter(s=>s.phase==='withdrawn'),active=sel.filter(s=>!['complete','withdrawn','screened_out'].includes(s.phase));
const dropAt={};for(const s of [...withdrawn,...active]){const k=s.phase.replace(/_\d+$/,'');dropAt[k]=(dropAt[k]||0)+1}
// --- timing from actions (from_phase → received_at) ---
const phaseDur={};const total=[];
for(const s of sel){const acts=(A.get(s.id)||[]).sort((a,b)=>a.received_at.localeCompare(b.received_at));let prev=s.created_at;for(const a of acts){const d=new Date(a.received_at)-new Date(prev);const k=a.from_phase.replace(/_\d+$/,'');(phaseDur[k]=phaseDur[k]||[]).push(d);prev=a.received_at}if(s.phase==='complete'&&s.completed_at)total.push(new Date(s.completed_at)-new Date(s.created_at))}
// --- per case rows: condition, answers ---
const rows=[];for(const s of sel){const rs=R.get(s.id)||[];const get=ph=>{const r=rs.find(x=>x.phase===ph);return r?JSON.parse(r.value_json):null};
 for(const c of (C.get(s.id)||[])){const i=c.idx;const cog=get(`cognition_${i}`),perc=get(`perception_${i}`),post=get(`post_${i}`),tp=get(`trust_post_${i}`);
  const S=cog?mean([cog.suff_1,8-cog.suff_2,cog.suff_3,cog.suff_4,cog.suff_5,cog.suff_6]):null;
  rows.push({session:s.id,idx:i,condition:c.condition,disclosure:s.disclosure,S,perc_2:perc?.perc_2,perc_3:perc?.perc_3,perc_5:perc?.perc_5,perc_1:perc?.perc_1,readcheck:cog?.readcheck_correct,effort:post?.effort_total,tlx_md:post?.tlx_md,trust_pre:cog?mean([8-cog.tr_1,cog.tr_2,8-cog.tr_3,cog.tr_4]):null,trust_post:tp?mean([8-tp.tr_1,tp.tr_2,8-tp.tr_3,tp.tr_4]):null,edited:c.submitted_text!=null&&c.submitted_text.trim()!==c.initial_text.trim(),delta:c.submitted_text!=null?[...c.submitted_text].length-[...c.initial_text].length:null})}}
const conds=['baseline','missing_info','off_focus','overreach'];
const byCond=k=>conds.map(c=>{const v=rows.filter(r=>r.condition===c&&r[k]!=null).map(r=>Number(r[k]));return `${c}: ${mean(v)??'–'} (n=${v.length})`}).join(' | ');
// --- precheck attempts, reading check, leakage ---
const attempts=sel.map(s=>s.attempts).filter(Number.isFinite);
const rc=rows.filter(r=>r.readcheck!=null);const rcAcc=rc.length?(rc.filter(r=>r.readcheck===1).length/rc.length*100).toFixed(0)+'%':'–';
const evCount=t=>[...E.values()].flat().filter(e=>e.type===t).length;const sessWith=t=>[...E.entries()].filter(([,v])=>v.some(e=>e.type===t)).length;
const u=sel.map(s=>{const rs=R.get(s.id)||[];const r=rs.find(x=>x.phase.startsWith('understanding_'));if(!r)return null;const v=JSON.parse(r.value_json);return {u1:(v.u1||'').length,u2:(v.u2||'').length}}).filter(Boolean);
const out=[];const p=(...a)=>out.push(a.join(''));
p(`# 試行の集計（mode=${mode}${label?`, label∋"${label}"`:''}${since?`, since ${since}`:''}）`);
p(`- 開始 ${sel.length} ／ 完了 ${done.length} ／ 中止 ${withdrawn.length} ／ 進行中 ${active.length}`);
p(`- 脱落・進行中の画面: ${Object.entries(dropAt).map(([k,v])=>`${k} ${v}`).join(', ')||'なし'}`);
p(`- 完了までの時間（分）: 中央値 ${min(median(total))}, 平均 ${min(mean(total))}`);
p(`- 画面別の中央値（分）: ${Object.entries(phaseDur).map(([k,v])=>`${k} ${min(median(v))}`).join(', ')}`);
p(`- 理解確認の回数（attempts）: 中央値 ${median(attempts)}, 最大 ${attempts.length?Math.max(...attempts):'–'}`);
p(`- 読了確認の正答率: ${rcAcc}（案件 ${rc.length} 件）`);
p(`- 編集した案件の割合: ${rows.filter(r=>r.delta!=null).length?(rows.filter(r=>r.edited).length/rows.filter(r=>r.delta!=null).length*100).toFixed(0)+'%':'–'}; 文字数変化の中央値 ${median(rows.map(r=>r.delta))}`);
p(`- ページ外コピーの遮断: ${evCount('copy_blocked')} 回（${sessWith('copy_blocked')} 人）; 貼り付け ${evCount('page_paste')} 回; タブ非表示 ${evCount('visibility')} 回（${sessWith('visibility')} 人）`);
p(`- U1/U2 の文字数（中央値）: U1 ${median(u.map(x=>x.u1))}, U2 ${median(u.map(x=>x.u2))}（${u.length} 人）`);
p(``);p(`## マニピュレーションチェック（状態別の平均、1〜7）`);
p(`- perc_2 必要情報（情報不足で下がるはず）: ${byCond('perc_2')}`);
p(`- perc_3 依頼への回答（焦点ずれで下がるはず）: ${byCond('perc_3')}`);
p(`- perc_5 適用範囲の区別（根拠超えで下がるはず）: ${byCond('perc_5')}`);
p(`- perc_1 正確さ: ${byCond('perc_1')}`);
p(`- S 完全性（主要指標、編集前）: ${byCond('S')}`);
p(`- 信頼 前→後: ${conds.map(c=>{const v=rows.filter(r=>r.condition===c);return `${c}: ${mean(v.map(r=>r.trust_pre))??'–'}→${mean(v.map(r=>r.trust_post))??'–'}`}).join(' | ')}`);
p(`- 精神的努力 effort_total（0〜10）: ${byCond('effort')}`);
p(`- 編集率: ${conds.map(c=>{const v=rows.filter(r=>r.condition===c&&r.delta!=null);return `${c}: ${v.length?(v.filter(r=>r.edited).length/v.length*100).toFixed(0)+'%':'–'}`}).join(' | ')}`);
p(`- 開示別の想起（memory が「生成AI使用の説明があった」= 0 の割合）: ${['disclosed','undisclosed'].map(d=>{const ss=sel.filter(s=>s.disclosure===d&&s.phase==='complete');const vals=ss.flatMap(s=>{const r=(R.get(s.id)||[]).find(x=>x.phase==='recall');if(!r)return[];const v=JSON.parse(r.value_json);return [v.memory]});return `${d}: ${vals.length?(vals.filter(x=>x===0).length/vals.length*100).toFixed(0)+'%':'–'} (n=${vals.length})`}).join(' | ')}`);
console.log(out.join('\n'));
if(args.json)await writeFile(String(args.json),JSON.stringify({generatedAt:new Date().toISOString(),mode,label,since,sessions:sel.length,rows},null,2));
