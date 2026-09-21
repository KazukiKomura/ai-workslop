import specimen from './case.js';
const VERSION='recipient-20260919-v2';
const TERMINAL=['complete','withdrawn','screened_out'];
const PHASES=['intro','read','burden1','edit','post','recall','manipulation',...TERMINAL];
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
const defaults={title:'文書の引継ぎと確認作業',operator:'',contact:'',reward:'募集案内に記載した条件に従います。',retention:'',enrollmentOpen:true};
async function config(env){const row=await env.DB.prepare("SELECT config_json FROM studies WHERE id='current'").first();return {...defaults,...(row?JSON.parse(row.config_json):{})}}
async function admin(r,env){if(!env.ADMIN_KEY)fail('管理認証が未設定です。',503);const expected=await sha(env.ADMIN_KEY);if(cookie(r,'research_admin')!==await sha('admin-session:'+env.ADMIN_KEY)&&r.headers.get('authorization')!==`Bearer ${env.ADMIN_KEY}`)fail('管理者ログインが必要です。',401);return expected}
const publicQuestions=()=>specimen.knowledgeCheck.map(({question,options})=>({question,options}));
async function state(s){const result={sessionId:s.id,phase:s.phase,revision:s.revision,mode:s.mode,protocolVersion:s.protocol_version,attempts:s.attempts};
 if(s.phase==='intro')Object.assign(result,{background:specimen.background,request:specimen.request,questions:publicQuestions(),trust:specimen.trustQuestions.beforeAndAfter});
 if(['read','edit'].includes(s.phase))Object.assign(result,{background:specimen.background,request:specimen.request,sources:specimen.sources,handoff:specimen.handoff,disclosureText:s.disclosure==='disclosed'?specimen.disclosures.disclosed.text:'',draftTitle:specimen.draftTitle,initialText:s.initial_text,draftText:s.draft_text,draftSeq:s.draft_seq,submission:specimen.submission});
 if(s.phase==='post')result.trustQuestions=[specimen.trustQuestions.beforeAndAfter,...specimen.trustQuestions.after];
 if(s.phase==='recall')result.recall=specimen.disclosureCheck;
 if(s.phase==='manipulation')Object.assign(result,{initialText:s.initial_text,request:specimen.request,questions:JSON.parse(s.question_order).map(id=>specimen.manipulationChecks.find(q=>q.id===id))});
 if(TERMINAL.includes(s.phase))result.completionCode=s.completion_code;
 return result;
}
function number(v,min,max,unknown=false){if(unknown&&v==='unknown')return v;if(!Number.isInteger(v)||v<min||v>max)fail('未回答、または範囲外の回答があります。');return v}
function validate(phase,a){
 if(phase==='intro'){if(!Array.isArray(a.knowledge)||a.knowledge.length!==4)fail('理解確認に回答してください。');a.knowledge.forEach((v,i)=>number(v,0,specimen.knowledgeCheck[i].options.length-1));number(a.experience,0,4);number(a.trust,1,7,true);}
 if(phase==='burden1')number(a.burden,0,10);
 if(phase==='edit'&&(typeof a.text!=='string'||!a.text.trim()||a.text.length>20000))fail('報告書を1〜20,000文字で入力してください。');
 if(phase==='post'){number(a.burden,0,10);if(!Array.isArray(a.trust)||a.trust.length!==5)fail('評価に回答してください。');a.trust.forEach(v=>number(v,1,7,true));}
 if(phase==='recall'){number(a.memory,0,3);number(a.belief,0,10);}
 if(phase==='manipulation'){for(const id of ['I1','I2','F1','F2','accuracy','coverage','traceability','naturalness'])number(a[id],1,7,true);number(a.aiExperience,0,4);}
}
async function transition(r,env,s,b){
 if(typeof b.actionId!=='string'||!/^[-\w]{10,80}$/.test(b.actionId))fail('操作IDが不正です。');
 const old=await env.DB.prepare('SELECT action_id FROM actions WHERE session_id=? AND action_id=?').bind(s.id,b.actionId).first();if(old)return state(s);
 if(b.revision!==s.revision||b.phase!==s.phase)fail('別画面で進行しています。再読み込みしてください。',409);
 if(TERMINAL.includes(s.phase))fail('この参加は終了しています。',409);
 const a=b.answers||{};let next,attempts=s.attempts,condition=s.condition,disclosure=s.disclosure,initial=s.initial_text,draft=s.draft_text,submitted=s.submitted_text,assigned=s.assigned_at,submittedAt=s.submitted_at,completed=s.completed_at;
 if(b.withdraw===true){next='withdrawn';completed=now()}else{validate(s.phase,a);next={read:'burden1',burden1:'edit',edit:'post',post:'recall',recall:'manipulation',manipulation:'complete'}[s.phase];
 if(s.phase==='intro'){attempts++;const correct=a.knowledge.every((v,i)=>v===specimen.knowledgeCheck[i].answer);if(!correct)next=attempts>=2?'screened_out':'intro';else{next='read';condition=['A','B','C'][integer(3)];disclosure=integer(2)?'disclosed':'undisclosed';initial=specimen.drafts[condition].paragraphs.join('\n\n');draft=initial;assigned=now()}}
 if(s.phase==='edit'){submitted=a.text;draft=a.text;submittedAt=now()}
 if(TERMINAL.includes(next))completed=now();}
 const time=now(),phaseKey=s.phase==='intro'?`intro_attempt_${attempts}`:s.phase;
 const batch=[env.DB.prepare('UPDATE sessions SET phase=?,revision=revision+1,last_action=?,attempts=?,condition=?,disclosure=?,initial_text=?,draft_text=?,submitted_text=?,assigned_at=?,submitted_at=?,completed_at=?,updated_at=? WHERE id=? AND revision=? AND phase=?').bind(next,b.actionId,attempts,condition,disclosure,initial,draft,submitted,assigned,submittedAt,completed,time,s.id,s.revision,s.phase),
 env.DB.prepare('INSERT INTO actions SELECT id,?,?,?,revision,? FROM sessions WHERE id=? AND last_action=?').bind(b.actionId,s.phase,next,time,s.id,b.actionId),
 env.DB.prepare('INSERT INTO responses SELECT id,?,?,?,? FROM sessions WHERE id=? AND last_action=?').bind(b.withdraw?`withdraw_${s.phase}`:phaseKey,b.actionId,JSON.stringify(a),time,s.id,b.actionId)];
 const res=await env.DB.batch(batch);if(!res[0].meta.changes)fail('進行状態が更新されています。再読み込みしてください。',409);
 return state(await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(s.id).first());
}
async function events(r,env,s,b){
 if(!Array.isArray(b.events)||b.events.length>100)fail('イベント件数が不正です。');
 const time=now();for(const e of b.events){if(typeof e.id!=='string'||e.id.length>100||typeof e.page!=='string'||e.page.length>100||!Number.isSafeInteger(e.seq)||e.seq<1||typeof e.type!=='string'||e.type.length>50||!PHASES.includes(e.phase)||typeof e.wall!=='string'||e.wall.length>40||!Number.isFinite(e.mono)||!e.payload||typeof e.payload!=='object'||JSON.stringify(e.payload).length>100000)fail('イベント形式が不正です。');}
 if(b.events.length)await env.DB.prepare(`INSERT OR IGNORE INTO events(session_id,event_id,page_id,seq,phase,type,client_wall,client_mono,received_at,payload_json)
 SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.page'),json_extract(value,'$.seq'),json_extract(value,'$.phase'),json_extract(value,'$.type'),json_extract(value,'$.wall'),json_extract(value,'$.mono'),?,json_extract(value,'$.payload') FROM json_each(?)`).bind(s.id,time,JSON.stringify(b.events)).run();
 return {ack:b.events.map(e=>e.id),receivedAt:time};
}
async function exportPage(env,url){const table=url.searchParams.get('table')||'sessions';if(!['sessions','events','responses','actions','versions'].includes(table))fail('種類が不正です。');const cursor=url.searchParams.get('cursor')||'0';const limit=500;let query;
 if(table==='events')query=env.DB.prepare('SELECT e.*,s.mode,s.condition,s.disclosure,s.case_id,s.protocol_version FROM events e JOIN sessions s ON s.id=e.session_id WHERE e.id>? ORDER BY e.id LIMIT ?').bind(Number(cursor),limit);
 else if(table==='sessions')query=env.DB.prepare('SELECT rowid AS cursor_id,id,mode,phase,revision,created_at,updated_at,assigned_at,condition,disclosure,case_id,protocol_version,stimulus_hash,initial_text,draft_text,submitted_text,submitted_at,completed_at,completion_code,attempts,question_order,consent_json,meta_json FROM sessions WHERE rowid>? ORDER BY rowid LIMIT ?').bind(Number(cursor),limit);
 else query=env.DB.prepare(`SELECT rowid AS cursor_id,* FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT ?`).bind(Number(cursor),limit);
 const {results}=await query.all();return {table,rows:results,next:results.length===limit?String(results.at(-1)[table==='events'?'id':'cursor_id']):null};}
async function api(r,env,url){const path=url.pathname;
 if(path==='/api/config'&&r.method==='GET')return json(await config(env));
 if(path==='/api/admin/login'&&r.method==='POST'){const b=await body(r);if(!env.ADMIN_KEY||typeof b.key!=='string'||await sha(b.key)!==await sha(env.ADMIN_KEY))fail('管理キーが一致しません。',401);return json({ok:true},200,{'set-cookie':setCookie('research_admin',await sha('admin-session:'+env.ADMIN_KEY),28800)})}
 if(path.startsWith('/api/admin/')){await admin(r,env);
 if(path==='/api/admin/status')return json({config:await config(env),counts:(await env.DB.prepare('SELECT mode,phase,condition,disclosure,count(*) AS n FROM sessions GROUP BY mode,phase,condition,disclosure').all()).results,events:(await env.DB.prepare('SELECT count(*) AS n FROM events').first()).n});
 if(path==='/api/admin/invites'&&r.method==='POST'){const b=await body(r);number(b.count,1,100);if(!['live','test'].includes(b.mode))fail('mode不正');const rows=Array.from({length:b.count},()=>({code:random(),mode:b.mode}));const records=[];for(const row of rows)records.push({hash:await sha(row.code),mode:row.mode});await env.DB.prepare("INSERT INTO invitations(code_hash,label,mode,created_at) SELECT json_extract(value,'$.hash'),?,json_extract(value,'$.mode'),? FROM json_each(?)").bind(String(b.label||'').slice(0,100),now(),JSON.stringify(records)).run();return json({invitations:rows.map(x=>({...x,url:`${url.origin}/#invite=${x.code}`}))})}
 if(path==='/api/admin/config'&&r.method==='POST'){const b=await body(r);const c=await config(env);for(const key of ['operator','contact','reward','retention'])if(typeof b[key]==='string')c[key]=b[key].slice(0,1000);if(typeof b.enrollmentOpen==='boolean')c.enrollmentOpen=b.enrollmentOpen;await env.DB.prepare("INSERT INTO studies VALUES('current',?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at").bind(JSON.stringify(c),now()).run();return json(c)}
 if(path==='/api/admin/export')return json(await exportPage(env,url));
 if(path==='/api/admin/stimulus')return json({version:VERSION,specimen});
 if(path==='/api/admin/logout')return json({ok:true},200,{'set-cookie':setCookie('research_admin','',0)});
 fail('Not found',404)}
 if(path==='/api/start'&&r.method==='POST'){const b=await body(r);if(b.consent!==true)fail('参加への同意が必要です。');if(typeof b.code!=='string'||typeof b.resumeToken!=='string'||!/^[-\w]{32,100}$/.test(b.resumeToken))fail('参加コードを確認してください。');const c=await config(env);if(!c.enrollmentOpen)fail('現在、新規参加の受付を停止しています。',403);const codeHash=await sha(b.code),tokenHash=await sha(b.resumeToken);const inv=await env.DB.prepare('SELECT * FROM invitations WHERE code_hash=?').bind(codeHash).first();if(!inv)fail('参加コードを確認してください。',403);
 const existing=await env.DB.prepare('SELECT * FROM sessions WHERE invitation_hash=?').bind(codeHash).first();if(existing){if(existing.token_hash!==tokenHash)fail('この参加コードは使用済みです。元のブラウザで再開してください。',409);return json(await state(existing),200,{'set-cookie':setCookie('participant',b.resumeToken)})}
 const id=random(),time=now(),hash=await sha(JSON.stringify(specimen)),order=JSON.stringify(shuffle(specimen.manipulationChecks.map(x=>x.id)));const consent={...c,consentedAt:time,version:VERSION,logging:'編集欄内の入力・削除・変換・選択・コピー貼付の操作、資料の開閉・スクロール、画面の表示状態、回答変更、提出文書を記録。氏名・メール・IP・他サイト操作はアプリで保存しない。'};
 const meta={viewport:b.meta?.viewport||null,language:String(b.meta?.language||'').slice(0,30),timezone:String(b.meta?.timezone||'').slice(0,100)};
 await env.DB.batch([env.DB.prepare('INSERT INTO sessions(id,token_hash,invitation_hash,mode,created_at,updated_at,case_id,protocol_version,stimulus_hash,completion_code,question_order,consent_json,meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,tokenHash,codeHash,inv.mode,time,time,specimen.id,VERSION,hash,random().slice(0,8).toUpperCase(),order,JSON.stringify(consent),JSON.stringify(meta)),env.DB.prepare('UPDATE invitations SET session_id=? WHERE code_hash=? AND session_id IS NULL').bind(id,codeHash),env.DB.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?)').bind(VERSION,hash,JSON.stringify({specimen,version:VERSION,allocation:'independent uniform 3x2 after understanding check',scale:'burden 0..10, trust 1..7 or unknown'}),time)]);
 return json(await state(await env.DB.prepare('SELECT * FROM sessions WHERE id=?').bind(id).first()),200,{'set-cookie':setCookie('participant',b.resumeToken)});}
 const s=await session(r,env);
 if(path==='/api/state'&&r.method==='GET')return json(await state(s));
 if(path==='/api/action'&&r.method==='POST')return json(await transition(r,env,s,await body(r)));
 if(path==='/api/events'&&r.method==='POST')return json(await events(r,env,s,await body(r)));
 if(path==='/api/draft'&&r.method==='POST'){const b=await body(r);if(s.phase!=='edit')fail('編集区間ではありません。',409);if(typeof b.text!=='string'||b.text.length>20000)fail('本文が長すぎます。');if(!Number.isSafeInteger(b.seq)||b.seq<1)fail('保存順序が不正です。');const saved=await env.DB.prepare("UPDATE sessions SET draft_text=?,draft_seq=?,updated_at=? WHERE id=? AND phase='edit' AND revision=? AND draft_seq<?").bind(b.text,b.seq,now(),s.id,s.revision,b.seq).run();return json({saved:!!saved.meta.changes,seq:b.seq})}
 fail('Not found',404);
}
export default {async fetch(r,env){const url=new URL(r.url);let response;try{
 if(r.method!=='GET'&&r.headers.get('origin')&&r.headers.get('origin')!==url.origin)fail('許可されない送信元です。',403);
 if(url.pathname.startsWith('/api/'))response=await api(r,env,url);
 else if(['/stimulus','/stimulus/','/stimulus/index.html','/stimulus/case_data.js'].includes(url.pathname))response=new Response('Not found',{status:404});
 else response=await env.ASSETS.fetch(r);
 }catch(e){response=json({error:e.status?e.message:'保存処理に失敗しました。接続を確認して再試行してください。'},e.status||500)}
 const res=new Response(response.body,response);res.headers.set('cache-control','no-store');res.headers.set('x-content-type-options','nosniff');res.headers.set('referrer-policy','no-referrer');res.headers.set('x-frame-options','DENY');res.headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");return res;
}};
