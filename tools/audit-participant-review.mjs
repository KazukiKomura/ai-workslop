import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const id=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('UUID required');
const dir=new URL('../.private/participant-review-20260921-'+id.slice(0,8)+'/',import.meta.url);
const data=JSON.parse(await readFile(new URL('rawdata.json',dir),'utf8')),r=data.tables,s=r.sessions[0];
const current=JSON.parse(await readFile(new URL('current-protocol.json',dir),'utf8'));
const snapshot=JSON.parse(r.versions[0].snapshot_json),M=snapshot.measurement,meta=JSON.parse(s.meta_json),consent=JSON.parse(s.consent_json),plan=JSON.parse(s.plan_json);
const checks=[];const check=(name,ok,detail)=>checks.push({name,status:ok?'PASS':'FAIL',detail});
const normalize=p=>p.replace(/_attempt_\d+$/,'');const base=p=>normalize(p).replace(/_\d+$/,'');
const actions=[...r.actions].sort((a,b)=>a.revision-b.revision),responses=r.responses.map(x=>({...x,value:JSON.parse(x.value_json)}));
const events=r.events.map(x=>({...x,payload:JSON.parse(x.payload_json)}));
check('参加完了',s.phase==='complete'&&!!s.completed_at,{phase:s.phase,completedAt:s.completed_at});
check('年齢・性別',Number.isInteger(meta.age)&&meta.age>=18&&meta.age<=99&&Number.isInteger(meta.gender)&&meta.gender>=0&&meta.gender<=3,{age:meta.age,gender:meta.gender});
check('同意日時・版',!!consent.consentedAt&&consent.version===s.protocol_version,{consentedAt:consent.consentedAt,version:consent.version});
check('保存された質問定義と現行定義の一致',JSON.stringify(M)===JSON.stringify(current.measurement),M.version);
check('刺激定義のハッシュ',createHash('sha256').update(JSON.stringify(snapshot.cases)).digest('hex')===s.stimulus_hash,s.stimulus_hash);
check('4案件・4条件・異なる4テーマ',r.session_cases.length===4&&new Set(r.session_cases.map(c=>c.case_id)).size===4&&new Set(r.session_cases.map(c=>c.condition)).size===4,r.session_cases.map(c=>({idx:c.idx,case:c.case_id,condition:c.condition})));
check('割付計画と案件の対応',r.session_cases.every(c=>plan.cases.some(p=>p.idx===c.idx&&p.case_id===c.case_id&&p.condition===c.condition&&p.sender===c.sender)),plan.disclosure);
check('初期文と保存版の刺激の一致',r.session_cases.every(c=>c.initial_text===snapshot.cases.cases.find(x=>x.id===c.case_id)?.bases.find(x=>x.id===c.base_id)?.versions[c.condition]?.paragraphs.join('\n\n')),r.session_cases.map(c=>c.idx));
check('全画面の確定回答',snapshot.phases.filter(p=>p!=='complete').every(p=>responses.some(x=>normalize(x.phase)===p)),{expectedMinimum:snapshot.phases.length-1,actual:r.responses.length});
check('画面遷移の連続性',actions.length===s.revision&&actions.every((a,i)=>a.revision===i+1&&(i===0?a.from_phase==='intro':a.from_phase===actions[i-1].to_phase))&&actions.at(-1).to_phase==='complete',actions.length);
check('回答と遷移の1対1対応',actions.every(a=>responses.filter(x=>x.action_id===a.action_id&&normalize(x.phase)===a.from_phase).length===1)&&responses.every(x=>actions.some(a=>a.action_id===x.action_id)),{actions:actions.length,responses:responses.length});
const itemProblems=[],optionalMissing=[];let requiredItems=0;
for(const response of responses){const b=base(response.phase),val=response.value;let qs=M.blocks[b==='intro'?'background':b]?.questions||[];
 for(const q of qs){const v=val[q.id];if(q.type==='text'&&!q.required&&(v===undefined||v==='')){optionalMissing.push({phase:response.phase,id:q.id});continue}requiredItems++;let ok=q.type==='text'?typeof v==='string'&&v.length<=q.maxLength:q.type==='choice'?Number.isInteger(v)&&v>=0&&v<q.options.length:Number.isInteger(v)&&v>=q.min&&v<=q.max;
 if(q.type==='range'&&ok)ok=(v-q.min)%(q.step||1)===0;if(!ok)itemProblems.push({phase:response.phase,id:q.id,value:v??null});}
 if(b==='materials'){requiredItems+=2;const pre=snapshot.cases.common.precheck;if(!Array.isArray(val.knowledge)||val.knowledge.length!==pre.length||val.knowledge.some((v,i)=>!Number.isInteger(v)||v<0||v>=pre[i].options.length))itemProblems.push({phase:response.phase,id:'knowledge'});}
 if(b==='cognition'){requiredItems++;if(!Number.isInteger(val.readcheck)||val.readcheck<0||val.readcheck>3||![0,1].includes(val.readcheck_correct))itemProblems.push({phase:response.phase,id:'readcheck'});}
}
check('必須質問の未回答・範囲外なし',itemProblems.length===0,{requiredItems,problems:itemProblems,optionalMissing});
const caseSummary=r.session_cases.map(c=>{const answer=responses.find(x=>x.phase==='edit_'+c.idx)?.value.text;const snapshots=events.filter(e=>e.phase==='edit_'+c.idx&&e.type==='editor_snapshot');const last=snapshots.at(-1)?.payload.text;return {idx:c.idx,caseId:c.case_id,condition:c.condition,initialChars:c.initial_text.length,submittedChars:c.submitted_text?.length,unchanged:c.initial_text===c.submitted_text,submittedAt:c.submitted_at,answerMatches:c.submitted_text===answer,draftMatches:c.submitted_text===c.draft_text,lastSnapshotMatches:last===c.submitted_text,inputEvents:events.filter(e=>e.phase==='edit_'+c.idx&&e.type==='editor_input').length,snapshotEvents:snapshots.length,initialHashMatches:createHash('sha256').update(c.initial_text).digest('hex')===c.version_hash}});
check('4提出文・回答・自動保存・最終スナップショットの一致',caseSummary.every(c=>c.submittedChars>0&&c.submittedAt&&c.answerMatches&&c.draftMatches&&c.lastSnapshotMatches&&c.initialHashMatches),caseSummary);
const pages=[...new Set(events.map(e=>e.page_id))].map(pageId=>{const es=events.filter(e=>e.page_id===pageId).sort((a,b)=>a.seq-b.seq),missing=[];for(let n=1;n<=es.at(-1).seq;n++)if(!es.some(e=>e.seq===n))missing.push(n);return {pageId,count:es.length,min:es[0].seq,max:es.at(-1).seq,missing,first:es[0].client_wall,last:es.at(-1).client_wall}});
check('操作ログの重複なし',new Set(events.map(e=>e.event_id)).size===events.length&&new Set(events.map(e=>e.page_id+'|'+e.seq)).size===events.length,events.length);
check('各ページの連番欠落なし',pages.every(p=>p.missing.length===0),pages);
check('全遷移元画面の表示・遷移要求ログ',actions.every(a=>events.some(e=>e.phase===a.from_phase&&e.type==='phase_render')&&events.some(e=>e.phase===a.from_phase&&e.type==='action_requested')),actions.length);
check('終了画面ログの保存',events.some(e=>e.phase==='complete'&&e.type==='phase_render'&&e.payload.revision===s.revision),events.filter(e=>e.phase==='complete').map(e=>({type:e.type,seq:e.seq,receivedAt:e.received_at})));
check('記録された通信・クライアントエラーなし',!events.some(e=>['network_error','client_error'].includes(e.type)),events.filter(e=>['network_error','client_error'].includes(e.type)));
const answerLogProblems=[];let comparedAnswerFields=0;
for(const response of responses){const b=base(response.phase),a=actions.find(a=>a.action_id===response.action_id);const changes=events.filter(e=>e.phase===a.from_phase&&e.type==='answer_change'&&e.received_at<=a.received_at);for(const [k,v]of Object.entries(response.value)){if(['text','readcheck_correct'].includes(k))continue;if(k==='knowledge'){v.forEach((v,i)=>{const last=changes.filter(e=>e.payload.name==='k'+i).at(-1);if(last){comparedAnswerFields++;if(Number(last.payload.value)!==v)answerLogProblems.push({phase:response.phase,id:'k'+i})}});continue}if(typeof v!=='number')continue;const last=changes.filter(e=>e.payload.name===k).at(-1);if(last){comparedAnswerFields++;if(Number(last.payload.value)!==v)answerLogProblems.push({phase:response.phase,id:k})}}}
check('変更ログと確定回答の一致（対応ログがある数値項目）',answerLogProblems.length===0,{comparedAnswerFields,problems:answerLogProblems});
const eventTypes=events.reduce((a,e)=>(a[e.type]=(a[e.type]||0)+1,a),{});
const findings={...data.manifest,checkedAt:new Date().toISOString(),checks,caseSummary,eventTypes,optionalMissing,pages,readcheck:responses.filter(x=>base(x.phase)==='cognition').map(x=>({phase:x.phase,correct:x.value.readcheck_correct})),limitations:['DBだけでは利用者ブラウザ内の未送信キューを直接確認できない。受信済み範囲の連番・終了ログを照合した。','4案件とも初期文と提出文が同一で入力イベントは0件。無修正提出の記録として整合しており、この参加から入力差分の収集可否は検証できない。','任意の自由記述が未入力の場合は欠落障害と扱わない。','スクロールは500ms間隔、heartbeatは60秒間隔。物理キー・視線・画面外作業は収集対象ではない。'],verdict:checks.every(c=>c.status==='PASS')?'保存済みデータの照合で欠落・不整合は検出されませんでした':'確認事項があります'};
await writeFile(new URL('audit.json',dir),JSON.stringify(findings,null,2),{mode:0o600});
const md='# 模擬参加の保存確認\n\n'+findings.verdict+'\n\n'+checks.map(c=>'- '+c.status+'：'+c.name).join('\n')+'\n\n## 件数\n\n'+JSON.stringify(data.manifest.counts,null,2)+'\n\n## 注意点\n\n'+findings.limitations.map(x=>'- '+x).join('\n')+'\n';await writeFile(new URL('AUDIT.md',dir),md,{mode:0o600});
let html=await readFile(new URL('../reviews/recruitment-20260921/viewer-template.html',import.meta.url),'utf8');
html=html.replace('公開環境でPlaywrightの通しテストを行い、D1から書き出したデータです。','今回ご自身で行った模擬参加（2026-09-21 15:23開始・16:17完了）のD1保存データです。').replace('動作確認用の合成データです。参加者の研究結果には含めません。','ご自身による模擬参加の記録です。自動テストのデータとは分けています。').replace('<a href="remote-load-raw.json" download>50人同時アクセステストのJSON</a>','<a href="audit.json" download>欠落確認のJSON</a><a href="AUDIT.md">確認記録</a>');
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
html=html.replace('<div class="controls">',`<p><strong>${esc(findings.verdict)}</strong> 回答35行・提出文4件・操作ログ${events.length}件。4案件とも無修正提出です。<details><summary>確認結果と確認できない範囲</summary><ul>${checks.map(c=>`<li>${c.status}：${esc(c.name)}</li>`).join('')}</ul><ul>${findings.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></p><div class="controls">`);
html=html.replace('/*__DATA__*/',JSON.stringify({e2e:{raw:r}}).replaceAll('<','\\u003c'));
await writeFile(new URL('rawdata-viewer.html',dir),html,{mode:0o600});
console.log(JSON.stringify({directory:dir.pathname,verdict:findings.verdict,checks:checks.map(c=>({name:c.name,status:c.status})),requiredItems,optionalMissing,comparedAnswerFields,pages,caseSummary},null,2));
