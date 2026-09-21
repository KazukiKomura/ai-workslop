import cases from './cases.js';
import {PROTOCOL_VERSION as VERSION, measurement, isV5, nextPhase, PHASES_V5, phaseList, splitPhase, scoringNotes, CASES_PER_PARTICIPANT as K, SENDERS} from './measurement.js';
const TERMINAL=['complete','withdrawn','screened_out'];
const LEGACY_PHASES=['intro','read','burden1','edit','post','responsibility','repair_appraisal','recall','manipulation','cognition','trust_post','understanding','perception'];
const STATES=cases.conditions; // baseline, missing_info, off_focus, overreach
// Complete within-participant design: every participant meets all four content states once, in a Williams (carryover-balanced) order.
const WILLIAMS=[[0,1,3,2],[1,2,0,3],[2,3,1,0],[3,0,2,1]]; // each state once per position; every ordered pair of adjacent states exactly once across rows
const SEQUENCES=[];for(const disclosure of ['disclosed','undisclosed'])for(let r=0;r<WILLIAMS.length;r++)SEQUENCES.push({disclosure,row:r});
function permutations(a){if(a.length<=1)return [a];const out=[];a.forEach((x,i)=>{for(const p of permutations([...a.slice(0,i),...a.slice(i+1)]))out.push([x,...p])});return out}
const enc=new TextEncoder();
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID();
const integer=n=>{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%n};
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=integer(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const now=()=>new Date().toISOString();
function fail(message,status=400){throw Object.assign(new Error(message),{status})}
function json(x,status=200,extra={}){return new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}})}
const cookie=(r,name)=>r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const setCookie=(name,value,max=604800)=>`${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${max}`;
async function body(r){const text=await r.text();if(text.length>900000)fail('送信サイズが大きすぎます。',413);try{return JSON.parse(text)}catch{fail('送信データを読み取れません。')}}
async function session(r,env){const token=cookie(r,'participant');if(!token)fail('参加を開始してください。',401);const s=await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha(token)).first();if(!s)fail('参加情報を確認できません。',401);return s}
const defaults={title:'文書の引継ぎと確認作業に関する調査',affiliation:'',operator:'',contact:'',reward:'募集案内に記載した条件に従います。',retention:'',finalKeyword:'21wra0966',enrollmentOpen:true};
async function config(env){const row=await env.DB.prepare("SELECT config_json FROM studies WHERE id='current'").first();return {...defaults,...(row?JSON.parse(row.config_json):{})}}
async function admin(r,env){if(!env.ADMIN_KEY)fail('管理認証が未設定です。',503);const expected=await sha(env.ADMIN_KEY);if(cookie(r,'research_admin')!==await sha('admin-session:'+env.ADMIN_KEY)&&r.headers.get('authorization')!==`Bearer ${env.ADMIN_KEY}`)fail('管理者ログインが必要です。',401);return expected}
const caseById=id=>cases.cases.find(c=>c.id===id)||fail('案件を確認できません。',500);
const available=(c,baseId)=>{const b=c.bases.find(x=>x.id===baseId)||c.bases[0];return {base:b,versions:STATES.filter(k=>b.versions[k])}};
const fill=(text,map)=>String(text).replace(/\{(\w+)\}/g,(_,k)=>map[k]??'');
function readcheckFor(rows,index){const cur=rows[index-1].case_id;const inPlan=new Set(rows.map(r=>r.case_id));const order=cases.cases.map(c=>c.id);const pick=[cur,...order.filter(id=>!inPlan.has(id)),...order.filter(id=>inPlan.has(id)&&id!==cur)].slice(0,4);const ids=order.filter(id=>pick.includes(id));const options=ids.map(id=>caseById(id).title);return {question:{id:'readcheck',type:'choice',text:'いま読んだ報告案は、何についての報告案でしたか。',options},answer:ids.indexOf(cur)}}
function publicBlock(base,map){const b=measurement.blocks[base];if(!b)return null;return {phase:base,title:fill(b.title,map),instruction:fill(b.instruction,map),questions:b.questions.map(({source,reverse,...q})=>({...q,text:fill(q.text,map)}))}}
const materials=(c,map={})=>({request:{...c.request,lead:fill(c.request.lead||'',map)},terms:c.terms,sources:c.sources,caseTitle:c.title,domain:c.domain,caseRole:c.role});
const precheckFor=idx=>cases.common.precheck;
async function loadCases(env,s){return (await env.DB.prepare('SELECT * FROM session_cases WHERE session_id=? ORDER BY idx').bind(s.id).all()).results}
function recallBlock(rows){const map=i=>({position:i,title:caseById(rows[i-1].case_id).title,sender:rows[i-1].sender});const b=measurement.blocks.recall;const questions=[];for(let i=1;i<=rows.length;i++)for(const q of b.questions){const {source,...rest}=q;questions.push({...rest,id:`${q.id}_${i}`,text:fill(q.text,map(i))})}return {phase:'recall',title:b.title,instruction:b.instruction,questions}}
async function campaignOf(env,s){return env.DB.prepare('SELECT c.keyword,c.label,c.mode FROM invitations i JOIN campaigns c ON c.token_hash=i.campaign_hash WHERE i.code_hash=?').bind(s.invitation_hash).first()}
async function state(s,env){
 const result={sessionId:s.id,phase:s.phase,revision:s.revision,mode:s.mode,protocolVersion:s.protocol_version,attempts:s.attempts,casesTotal:K};
 if(!isV5(s.protocol_version)){result.legacy=true;if(TERMINAL.includes(s.phase))result.completionCode=s.completion_code;return result}
 const plan=JSON.parse(s.plan_json||'{}');const rows=await loadCases(env,s);const {base,index}=splitPhase(s.phase);
 const disclosure=s.disclosure==='disclosed'?cases.common.disclosure.present:'';
 const row=index?rows[index-1]:null;const c=row?caseById(row.case_id):null;const map=row?{sender:row.sender,title:c.title,position:index,domain:c.domain}:{};
 if(base==='intro')Object.assign(result,{notice:cases.common.notice,role:cases.common.role,workRule:cases.common.workRule,senders:plan.senders||SENDERS.slice(0,K),block:publicBlock('background',{domain:cases.cases.map(x=>x.domain).filter((v,i,a)=>a.indexOf(v)===i).join('・')})});
 if(base==='materials')Object.assign(result,{position:index,...materials(c,map),sender:row.sender,precheck:precheckFor(index).map(({question,options})=>({question:fill(question,map),options:options.map(o=>fill(o,map))}))});
 if(base==='read')Object.assign(result,{position:index,...materials(c,map),sender:row.sender,handoff:fill(c.handoff,map),disclosureText:disclosure,draftTitle:c.draftTitle,initialText:row.initial_text,readInstruction:cases.common.readInstruction});
 if(base==='cognition'){const blk=publicBlock('cognition',map);blk.questions=[readcheckFor(rows,index).question,...blk.questions];Object.assign(result,{position:index,...materials(c,map),sender:row.sender,disclosureText:disclosure,draftTitle:c.draftTitle,initialText:row.initial_text,block:blk})}
 if(base==='edit')Object.assign(result,{position:index,...materials(c,map),sender:row.sender,handoff:fill(c.handoff,map),disclosureText:disclosure,draftTitle:c.draftTitle,initialText:row.initial_text,draftText:row.draft_text,draftSeq:row.draft_seq,editInstruction:cases.common.editInstruction});
 if(base==='post')Object.assign(result,{position:index,caseTitle:c.title,block:publicBlock('post',map)});
 if(base==='trust_post')Object.assign(result,{position:index,caseTitle:c.title,sender:row.sender,block:publicBlock('trust_post',map)});
 if(base==='responsibility')Object.assign(result,{position:index,caseTitle:c.title,sender:row.sender,block:publicBlock('responsibility',map)});
 if(base==='reflection')Object.assign(result,{block:publicBlock('reflection',{k:K})});
 if(base==='perception')Object.assign(result,{position:index,...materials(c,map),sender:row.sender,initialText:row.initial_text,draftTitle:c.draftTitle,block:publicBlock('perception',map)});
 if(base==='recall')Object.assign(result,{block:publicBlock('recall',{k:K})});
 if(TERMINAL.includes(s.phase)){result.completionCode=s.completion_code;const camp=await campaignOf(env,s);if(camp)result.campaignLabel=camp.label;const cfg=await config(env);result.canRestart=!!camp||!!cfg.defaultCampaign;if(s.phase==='complete'){const kw=String(cfg.finalKeyword||'').trim()||(camp?camp.keyword:'');if(kw)result.keyword=kw}}
 return result;
}
function number(v,min,max,unknown=false){if(unknown&&v==='unknown')return v;if(!Number.isInteger(v)||v<min||v>max)fail('未回答、または範囲外の回答があります。');return v}
function validateQuestions(questions,a){for(const q of questions){const v=a[q.id];
 if(q.type==='choice')number(v,0,q.options.length-1);
 else if(q.type==='range')number(v,q.min,q.max);
 else if(q.type==='text'){if(v===undefined||v===null){if(q.required)fail('未回答の記述欄があります。');continue}if(typeof v!=='string'||v.length>q.maxLength)fail('記述が長すぎます。');if(q.required&&!v.trim())fail('未回答の記述欄があります。')}
 else number(v,q.min,q.max,q.unknown);}}
function validate(phase,a,rows){const {base,index}=splitPhase(phase);
 if(base==='intro')validateQuestions(measurement.blocks.background.questions,a);
 else if(base==='materials'){const pre=precheckFor(index);if(!Array.isArray(a.knowledge)||a.knowledge.length!==pre.length)fail('理解確認に回答してください。');a.knowledge.forEach((v,i)=>number(v,0,pre[i].options.length-1))}
 else if(base==='edit'){if(typeof a.text!=='string'||!a.text.trim()||a.text.length>20000)fail('報告書を1〜20,000文字で入力してください。')}
 else if(base==='recall')validateQuestions(measurement.blocks.recall.questions,a);
 else if(measurement.blocks[base])validateQuestions(measurement.blocks[base].questions,a);
}
async function transition(r,env,s,b){
 if(typeof b.actionId!=='string'||!/^[-\w]{10,80}$/.test(b.actionId))fail('操作IDが不正です。');
 const old=await env.DB.prepare('SELECT action_id FROM actions WHERE session_id=? AND action_id=?').bind(s.id,b.actionId).first();if(old)return state(s,env);
 if(b.revision!==s.revision||b.phase!==s.phase)fail('別画面で進行しています。再読み込みしてください。',409);
 if(TERMINAL.includes(s.phase))fail('この参加は終了しています。',409);
 if(!isV5(s.protocol_version))fail('この参加は旧版で作成されたため再開できません。新しい参加リンクをお使いください。',409);
 const rows=await loadCases(env,s);const a=b.answers||{};let next,attempts=s.attempts,completed=s.completed_at;const {base,index}=splitPhase(s.phase);const extra=[];
 if(b.withdraw===true){next='withdrawn';completed=now()}else{validate(s.phase,a,rows);if(base==='cognition'){const rc=readcheckFor(rows,index);number(a.readcheck,0,rc.question.options.length-1);a.readcheck_correct=a.readcheck===rc.answer?1:0}next=nextPhase(s.phase,s.protocol_version);
  if(base==='materials'){attempts++;const pre=precheckFor(index);if(!a.knowledge.every((v,i)=>v===pre[i].answer))next=s.phase}
  if(base==='edit')extra.push(env.DB.prepare('UPDATE session_cases SET submitted_text=?,draft_text=?,submitted_at=? WHERE session_id=? AND idx=?').bind(a.text,a.text,now(),s.id,index));
  if(TERMINAL.includes(next))completed=now();}
 const time=now(),phaseKey=base==='materials'?`${s.phase}_attempt_${attempts}`:s.phase;
 const batch=[env.DB.prepare('UPDATE sessions SET phase=?,revision=revision+1,last_action=?,attempts=?,completed_at=?,updated_at=? WHERE id=? AND revision=? AND phase=?').bind(next,b.actionId,attempts,completed,time,s.id,s.revision,s.phase),
 env.DB.prepare('INSERT INTO actions SELECT id,?,?,?,revision,? FROM sessions WHERE id=? AND last_action=?').bind(b.actionId,s.phase,next,time,s.id,b.actionId),
 env.DB.prepare('INSERT INTO responses SELECT id,?,?,?,? FROM sessions WHERE id=? AND last_action=?').bind(b.withdraw?`withdraw_${s.phase}`:phaseKey,b.actionId,JSON.stringify(a),time,s.id,b.actionId),...extra];
 const res=await env.DB.batch(batch);if(!res[0].meta.changes)fail('進行状態が更新されています。再読み込みしてください。',409);
 return state(await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(s.id).first(),env);
}
async function events(r,env,s,b){
 if(!Array.isArray(b.events)||b.events.length>100)fail('イベント件数が不正です。');
 const okPhase=p=>PHASES_V5.includes(p)||LEGACY_PHASES.includes(p)||TERMINAL.includes(p);
 const time=now();for(const e of b.events){if(typeof e.id!=='string'||e.id.length>100||typeof e.page!=='string'||e.page.length>100||!Number.isSafeInteger(e.seq)||e.seq<1||typeof e.type!=='string'||e.type.length>50||typeof e.phase!=='string'||!okPhase(e.phase)||typeof e.wall!=='string'||e.wall.length>40||!Number.isFinite(e.mono)||!e.payload||typeof e.payload!=='object'||JSON.stringify(e.payload).length>100000)fail('イベント形式が不正です。');}
 if(b.events.length)await env.DB.prepare(`INSERT OR IGNORE INTO events(session_id,event_id,page_id,seq,phase,type,client_wall,client_mono,received_at,payload_json)
 SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.page'),json_extract(value,'$.seq'),json_extract(value,'$.phase'),json_extract(value,'$.type'),json_extract(value,'$.wall'),json_extract(value,'$.mono'),?,json_extract(value,'$.payload') FROM json_each(?)`).bind(s.id,time,JSON.stringify(b.events)).run();
 return {ack:b.events.map(e=>e.id),receivedAt:time};
}
async function exportPage(env,url){const table=url.searchParams.get('table')||'sessions';if(!['sessions','session_cases','events','responses','actions','versions'].includes(table))fail('種類が不正です。');const cursor=url.searchParams.get('cursor')||'0';const limit=500;let query;
 if(table==='events')query=env.DB.prepare('SELECT e.*,s.mode,s.condition,s.disclosure,s.case_id,s.protocol_version FROM events e JOIN sessions s ON s.id=e.session_id WHERE e.id>? ORDER BY e.id LIMIT ?').bind(Number(cursor),limit);
 else if(table==='sessions')query=env.DB.prepare('SELECT s.rowid AS cursor_id,s.id,s.mode,s.phase,s.revision,s.created_at,s.updated_at,s.assigned_at,s.condition,s.disclosure,s.sequence,s.plan_json,s.case_id,s.protocol_version,s.stimulus_hash,s.completed_at,s.completion_code,s.attempts,s.consent_json,s.meta_json,i.label AS invitation_label,i.campaign_hash FROM sessions s JOIN invitations i ON i.code_hash=s.invitation_hash WHERE s.rowid>? ORDER BY s.rowid LIMIT ?').bind(Number(cursor),limit);
 else query=env.DB.prepare(`SELECT rowid AS cursor_id,* FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT ?`).bind(Number(cursor),limit);
 const {results}=await query.all();return {table,rows:results,next:results.length===limit?String(results.at(-1)[table==='events'?'id':'cursor_id']):null};}
async function allocate(env,mode,campaignHash=null){
 // 1. Sequence (disclosure x Williams row): least started count within this campaign and protocol version, random tie-break. Keeps disclosure 1:1 and Williams rows balanced within each disclosure group.
 const seqCounts=(await env.DB.prepare('SELECT s.sequence,count(*) AS n FROM sessions s JOIN invitations i ON i.code_hash=s.invitation_hash WHERE s.mode=? AND i.campaign_hash IS ? AND s.protocol_version=? AND s.sequence IS NOT NULL GROUP BY s.sequence').bind(mode,campaignHash,VERSION).all()).results;
 const n=i=>seqCounts.find(x=>x.sequence===i)?.n||0;const eligible=SEQUENCES.map((seq,i)=>({seq,i}));const least=Math.min(...eligible.map(x=>n(x.i)));const pool=eligible.filter(x=>n(x.i)===least);const seqIndex=pool[integer(pool.length)].i;const seq=SEQUENCES[seqIndex];
 const states=WILLIAMS[seq.row].map(i=>STATES[i]);
 // 2. Themes: least-used within this campaign/protocol (random tie-break).
 const usage=(await env.DB.prepare('SELECT sc.case_id,sc.base_id,sc.idx,sc.condition,s.disclosure,count(*) AS n FROM session_cases sc JOIN sessions s ON s.id=sc.session_id JOIN invitations i ON i.code_hash=s.invitation_hash WHERE s.mode=? AND i.campaign_hash IS ? AND s.protocol_version=? GROUP BY sc.case_id,sc.base_id,sc.idx,sc.condition,s.disclosure').bind(mode,campaignHash,VERSION).all()).results;
 const themeN=id=>usage.filter(x=>x.case_id===id).reduce((a,x)=>a+x.n,0);
 const chosen=shuffle(cases.cases.map(c=>c.id)).sort((a,b)=>themeN(a)-themeN(b)).slice(0,K);
 // 3. Theme -> position assignment: minimise theme x condition counts within this disclosure group (primary) and theme x position counts (secondary).
 const cell=(id,st)=>usage.filter(x=>x.case_id===id&&x.condition===st&&x.disclosure===seq.disclosure).reduce((a,x)=>a+x.n,0);
 const pos=(id,p)=>usage.filter(x=>x.case_id===id&&x.idx===p).reduce((a,x)=>a+x.n,0);
 let best=null,bestCost=Infinity;for(const perm of shuffle(permutations(chosen))){let cost=0;perm.forEach((id,p)=>{cost+=10*cell(id,states[p])+pos(id,p+1)});if(cost<bestCost){bestCost=cost;best=perm}}
 // 4. Base: least used within the theme.
 const plan={allocation:'least-count-sequence-v2',sequence:seqIndex,disclosure:seq.disclosure,row:seq.row,states,cases:[],senders:SENDERS.slice(0,K)};
 for(let i=0;i<K;i++){const c=caseById(best[i]);const baseN=b=>usage.filter(x=>x.case_id===c.id&&x.base_id===b).reduce((a,x)=>a+x.n,0);const base=shuffle(c.bases.slice()).sort((x,y)=>baseN(x.id)-baseN(y.id))[0];const st=states[i];if(!base.versions[st])fail('刺激が未登録です。',500);plan.cases.push({idx:i+1,case_id:c.id,base_id:base.id,condition:st,sender:plan.senders[i],text:base.versions[st].paragraphs.join('\n\n')})}
 return plan;
}
async function api(r,env,url){const path=url.pathname;
 if(path==='/api/config'&&r.method==='GET'){const c=await config(env);const {resetIps,finalKeyword,...pub}=c;return json(pub)}
 if(path==='/api/leave'&&r.method==='POST')return json({ok:true},200,{'set-cookie':setCookie('participant','',0)});
 if(path==='/api/admin/login'&&r.method==='POST'){const b=await body(r);if(!env.ADMIN_KEY||typeof b.key!=='string'||await sha(b.key)!==await sha(env.ADMIN_KEY))fail('管理キーが一致しません。',401);return json({ok:true},200,{'set-cookie':setCookie('research_admin',await sha('admin-session:'+env.ADMIN_KEY),28800)})}
 if(path.startsWith('/api/admin/')){await admin(r,env);
 if(path==='/api/admin/status')return json({config:await config(env),version:VERSION,casesPerParticipant:K,sequences:SEQUENCES.length,cases:cases.cases.map(c=>({id:c.id,title:c.title,available:available(c).versions})),counts:(await env.DB.prepare('SELECT mode,phase,condition,disclosure,count(*) AS n FROM sessions GROUP BY mode,phase,condition,disclosure').all()).results,events:(await env.DB.prepare('SELECT count(*) AS n FROM events').first()).n});
 if(path==='/api/admin/invites'&&r.method==='POST'){const b=await body(r);number(b.count,1,100);b.mode='live';const rows=Array.from({length:b.count},()=>({code:random(),mode:b.mode}));const records=[];for(const row of rows)records.push({hash:await sha(row.code),mode:row.mode});await env.DB.prepare("INSERT INTO invitations(code_hash,label,mode,created_at) SELECT json_extract(value,'$.hash'),?,json_extract(value,'$.mode'),? FROM json_each(?)").bind(String(b.label||'').slice(0,100),now(),JSON.stringify(records)).run();return json({invitations:rows.map(x=>({...x,url:`${url.origin}/#invite=${x.code}`}))})}
 if(path==='/api/admin/config'&&r.method==='POST'){const b=await body(r);const c=await config(env);for(const key of ['title','affiliation','operator','contact','reward','retention','finalKeyword'])if(typeof b[key]==='string')c[key]=b[key].slice(0,1000);if(typeof b.resetIps==='string')c.resetIps=b.resetIps.slice(0,500);if(typeof b.defaultCampaign==='string'){const v=b.defaultCampaign.trim();if(v&&!/^[0-9a-f]{64}$/.test(v))fail('既定の募集枠が不正です。');c.defaultCampaign=v}if(typeof b.enrollmentOpen==='boolean')c.enrollmentOpen=b.enrollmentOpen;await env.DB.prepare("INSERT INTO studies VALUES('current',?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at").bind(JSON.stringify(c),now()).run();return json(c)}
 if(path==='/api/admin/campaigns'&&r.method==='GET'){const rows=(await env.DB.prepare('SELECT c.token_hash,c.label,c.mode,c.keyword,c.capacity,c.completion_target,c.open,c.created_at,(SELECT count(*) FROM invitations i JOIN sessions s ON s.invitation_hash=i.code_hash WHERE i.campaign_hash=c.token_hash AND s.mode=c.mode) AS started,(SELECT count(*) FROM invitations i JOIN sessions s ON s.invitation_hash=i.code_hash WHERE i.campaign_hash=c.token_hash AND s.mode=c.mode AND s.phase=\'complete\') AS completed FROM campaigns c ORDER BY c.created_at DESC').all()).results;const progress=(await env.DB.prepare('SELECT i.campaign_hash,s.disclosure,s.phase,count(*) AS n FROM sessions s JOIN invitations i ON i.code_hash=s.invitation_hash JOIN campaigns c ON c.token_hash=i.campaign_hash WHERE s.mode=c.mode GROUP BY i.campaign_hash,s.disclosure,s.phase').all()).results;return json({campaigns:rows,progress})}
 if(path==='/api/admin/campaigns'&&r.method==='POST'){const b=await body(r);b.mode='live';const capacity=b.capacity==null?0:number(b.capacity,0,100000);const completionTarget=b.completionTarget==null?0:number(b.completionTarget,0,100000);const keyword=String(b.keyword||'').slice(0,60);const token=random()+random().slice(0,8);const hash=await sha(token);await env.DB.prepare('INSERT INTO campaigns(token_hash,label,mode,keyword,capacity,open,created_at,completion_target) VALUES(?,?,?,?,?,1,?,?)').bind(hash,String(b.label||'').slice(0,100),b.mode,keyword,capacity,now(),completionTarget).run();return json({token,url:`${url.origin}/#entry=${token}`,tokenHash:hash,mode:b.mode,keyword,capacity,completionTarget})}
 if(path==='/api/admin/campaign'&&r.method==='POST'){const b=await body(r);if(typeof b.tokenHash!=='string')fail('対象が不正です。');const c=await env.DB.prepare('SELECT * FROM campaigns WHERE token_hash=?').bind(b.tokenHash).first();if(!c)fail('募集枠がありません。',404);const open=typeof b.open==='boolean'?(b.open?1:0):c.open;const keyword=typeof b.keyword==='string'?b.keyword.slice(0,60):c.keyword;const capacity=b.capacity==null?c.capacity:number(b.capacity,0,100000);const completionTarget=b.completionTarget==null?c.completion_target:number(b.completionTarget,0,100000);await env.DB.prepare('UPDATE campaigns SET open=?,keyword=?,capacity=?,completion_target=? WHERE token_hash=?').bind(open,keyword,capacity,completionTarget,b.tokenHash).run();return json({ok:true,open:!!open,keyword,capacity,completionTarget})}
 if(path==='/api/admin/export')return json(await exportPage(env,url));
 if(path==='/api/admin/stimulus')return json({version:VERSION,casesPerParticipant:K,sequences:SEQUENCES,cases,measurement,phases:phaseList(),scoring:scoringNotes()});
 if(path==='/api/admin/logout')return json({ok:true},200,{'set-cookie':setCookie('research_admin','',0)});
 fail('Not found',404)}
 if(path==='/api/start'&&r.method==='POST'){const b=await body(r);if(b.consent!==true)fail('参加への同意が必要です。');if(typeof b.resumeToken!=='string'||!/^[-\w]{32,100}$/.test(b.resumeToken))fail('参加コードを確認してください。');const c=await config(env);
 if(typeof b.code!=='string'){
  const campHash=typeof b.entry==='string'?await sha(b.entry):(c.defaultCampaign||null);
  const camp=campHash?await env.DB.prepare('SELECT * FROM campaigns WHERE token_hash=?').bind(campHash).first():null;
  if(!camp)fail('参加リンクを確認してください。',403);
  b.code='shared-'+await sha(camp.token_hash+':'+b.resumeToken);
  const previous=await env.DB.prepare('SELECT s.* FROM sessions s JOIN invitations i ON i.code_hash=s.invitation_hash WHERE s.token_hash=? AND i.campaign_hash=?').bind(await sha(b.resumeToken),camp.token_hash).first();
  if(previous)return json({...await state(previous,env),code:b.code},200,{'set-cookie':setCookie('participant',b.resumeToken)});
  if(!c.enrollmentOpen)fail('現在、新規参加の受付を停止しています。',403);
  if(!camp.open)fail('この募集は終了しました。',403);
  {const counts=await env.DB.prepare("SELECT count(*) AS started,sum(s.phase='complete') AS completed FROM invitations i JOIN sessions s ON s.invitation_hash=i.code_hash WHERE i.campaign_hash=? AND s.mode=?").bind(camp.token_hash,camp.mode).first();if(camp.capacity>0&&counts.started>=camp.capacity)fail('この募集は定員に達しました。',403);if(camp.completion_target>0&&counts.completed>=camp.completion_target)fail('必要な回答数に達したため、新規参加の受付を終了しました。',403);}
  if(!b.meta||typeof b.meta!=='object')fail('参加者情報を入力してください。');number(b.meta.gender,0,3);number(b.meta.age,18,99);
  await env.DB.prepare('INSERT OR IGNORE INTO invitations(code_hash,label,mode,created_at,campaign_hash) VALUES(?,?,?,?,?)').bind(await sha(b.code),'campaign:'+camp.label,camp.mode,now(),camp.token_hash).run();
 }
 if(typeof b.code!=='string')fail('参加コードを確認してください。');const codeHash=await sha(b.code),tokenHash=await sha(b.resumeToken);const inv=await env.DB.prepare('SELECT * FROM invitations WHERE code_hash=?').bind(codeHash).first();if(!inv)fail('参加コードを確認してください。',403);
 const existing=await env.DB.prepare('SELECT * FROM sessions WHERE invitation_hash=?').bind(codeHash).first();if(existing){if(existing.token_hash!==tokenHash)fail('この参加コードは使用済みです。元のブラウザで再開してください。',409);return json({...await state(existing,env),code:b.code},200,{'set-cookie':setCookie('participant',b.resumeToken)})}
 if(!c.enrollmentOpen)fail('現在、新規参加の受付を停止しています。',403);
 if(!b.meta||typeof b.meta!=='object')fail('参加者情報を入力してください。');number(b.meta.gender,0,3);number(b.meta.age,18,99);const meta={viewport:b.meta?.viewport||null,language:String(b.meta?.language||'').slice(0,30),timezone:String(b.meta?.timezone||'').slice(0,100),gender:b.meta.gender,age:b.meta.age};
 const id=random(),time=now(),hash=await sha(JSON.stringify(cases));const plan=await allocate(env,inv.mode,inv.campaign_hash||null);const consent={...c,consentedAt:time,version:VERSION,logging:'編集欄内の入力・削除・変換・選択・コピー貼付の操作、資料の開閉・スクロール、画面の表示状態、回答変更、提出文書を記録。氏名・メール・IP・他サイト操作はアプリで保存しない。'};
 const stmts=[env.DB.prepare('INSERT INTO sessions(id,token_hash,invitation_hash,mode,phase,created_at,updated_at,assigned_at,case_id,condition,disclosure,sequence,plan_json,protocol_version,stimulus_hash,completion_code,question_order,consent_json,meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,tokenHash,codeHash,inv.mode,'intro',time,time,time,plan.cases[0].case_id,`williams${plan.row}`,plan.disclosure,plan.sequence,JSON.stringify({...plan,cases:plan.cases.map(({text,...x})=>x)}),VERSION,hash,random().slice(0,8).toUpperCase(),'[]',JSON.stringify(consent),JSON.stringify(meta)),
  env.DB.prepare('UPDATE invitations SET session_id=? WHERE code_hash=? AND session_id IS NULL').bind(id,codeHash)];
 for(const pc of plan.cases)stmts.push(env.DB.prepare('INSERT INTO session_cases(session_id,idx,case_id,base_id,condition,sender,initial_text,draft_text,draft_seq,version_hash) VALUES(?,?,?,?,?,?,?,?,0,?)').bind(id,pc.idx,pc.case_id,pc.base_id,pc.condition,pc.sender,pc.text,pc.text,await sha(pc.text)));
 stmts.push(env.DB.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?)').bind(VERSION,hash,JSON.stringify({cases,measurement,measurementHash:await sha(JSON.stringify(measurement)),version:VERSION,allocation:`k=${K} cases per participant; all four content states within, disclosure between; four Williams orders x disclosure; AI disclosure independent Bernoulli(0.5); Williams rows balanced within disclosure/campaign/protocol; no completion-dependent reallocation; themes balanced by usage and theme x state x disclosure; see phases for questionnaire schedule`,phases:phaseList(),scoring:scoringNotes()}),time));
 try{await env.DB.batch(stmts)}catch(e){const retried=await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND invitation_hash=?').bind(tokenHash,codeHash).first();if(!retried)throw e;return json({...await state(retried,env),code:b.code},200,{'set-cookie':setCookie('participant',b.resumeToken)})}
 return json({...await state(await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first(),env),code:b.code},200,{'set-cookie':setCookie('participant',b.resumeToken)});}
 const s=await session(r,env);
 if(path==='/api/state'&&r.method==='GET')return json(await state(s,env));
 if(path==='/api/action'&&r.method==='POST')return json(await transition(r,env,s,await body(r)));
 if((path==='/api/records'||path==='/api/events')&&r.method==='POST')return json(await events(r,env,s,await body(r)));
 if(path==='/api/draft'&&r.method==='POST'){const b=await body(r);const {base,index}=splitPhase(s.phase);if(base!=='edit')fail('編集区間ではありません。',409);if(typeof b.text!=='string'||b.text.length>20000)fail('本文が長すぎます。');if(!Number.isSafeInteger(b.seq)||b.seq<1)fail('保存順序が不正です。');const saved=await env.DB.prepare('UPDATE session_cases SET draft_text=?,draft_seq=? WHERE session_id=? AND idx=? AND draft_seq<?').bind(b.text,b.seq,s.id,index,b.seq).run();return json({saved:!!saved.meta.changes,seq:b.seq})}
 fail('Not found',404);
}
export default {async fetch(r,env){const url=new URL(r.url);let response;try{
 if(r.method!=='GET'&&r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('許可されない送信元です。',403);
 if(url.pathname.startsWith('/api/'))response=await api(r,env,url);
 else if(['/stimulus','/stimulus/','/stimulus/index.html','/stimulus/case_data.js'].includes(url.pathname))response=new Response('Not found',{status:404});
 else response=await env.ASSETS.fetch(r);
 }catch(e){if(!e.status)console.error('unhandled',url.pathname,String(e&&e.stack||e).slice(0,1500));response=json({error:e.status?e.message:'保存処理に失敗しました。接続を確認して再試行してください。'},e.status||500)}
 const res=new Response(response.body,response);res.headers.set('cache-control','no-store');res.headers.set('x-content-type-options','nosniff');res.headers.set('referrer-policy','no-referrer');res.headers.set('x-frame-options','DENY');res.headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");return res;
}};
