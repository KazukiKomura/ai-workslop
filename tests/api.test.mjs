import {PROTOCOL_VERSION} from '../src/measurement.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_URL||'http://localhost:8791',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function request(path,data,cookie='',admin=false){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(admin?{authorization:'Bearer '+key}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:await r.json().catch(()=>null)}}
const adm=(path,data)=>request('/api/admin/'+path,data,'',true);
async function start(meta={gender:1,age:34}){const i=await adm('invites',{count:1,mode:'live',label:'automated API verification v5'});assert.equal(i.status,200);const payload={code:i.data.invitations[0].code,resumeToken:randomUUID()+randomUUID(),consent:true,meta};const s=await request('/api/start',payload);assert.equal(s.status,200,JSON.stringify(s.data));return {...s,payload}}
const act=(s,answers={},extra={})=>request('/api/action',{phase:s.data.phase,revision:s.data.revision,actionId:randomUUID(),answers,...extra},s.cookie);
async function all(table){let cursor='0',rows=[];do{const r=await adm(`export?table=${table}&cursor=${cursor}`);assert.equal(r.status,200);rows.push(...r.data.rows);cursor=r.data.next}while(cursor);return rows}
const fillBlock=(block,override={})=>Object.fromEntries(block.questions.map(q=>[q.id,override[q.id]??(q.type==='choice'?0:q.type==='range'?50:q.type==='text'?'テスト回答。':4)]));
async function step(s,answers={}){const n=await act(s,answers);assert.equal(n.status,200,JSON.stringify(n.data));return {...n,cookie:s.cookie}}
async function runCase(s,i,opts={}){
  assert.equal(s.data.phase,`materials_${i}`);assert.equal(s.data.position,i);assert.equal(s.data.precheck.length,2);assert(s.data.sender);
  if(opts.wrongFirst){const w=await act(s,{knowledge:s.data.precheck.map(()=>0)});assert.equal(w.status,200);assert.equal(w.data.phase,`materials_${i}`);s={...w,cookie:s.cookie}}
  s=await step(s,{knowledge:s.data.precheck.map(()=>1)});assert.equal(s.data.phase,`read_${i}`);assert(s.data.initialText);assert(s.data.handoff.includes(s.data.sender));
  s=await step(s,{});assert.equal(s.data.phase,`cognition_${i}`);assert.equal(s.data.block.questions.length,13);assert.equal(s.data.block.questions[0].id,'readcheck');assert.equal(s.data.block.questions[0].options.length,4);assert(s.data.block.questions.find(q=>q.id==='tr_2').text.includes(s.data.sender+'さん'));
  s=await step(s,fillBlock(s.data.block,{suff_2:2}));assert.equal(s.data.phase,`edit_${i}`);
  const initial=s.data.initialText;assert.equal((await request('/api/draft',{text:initial+' newer',seq:2},s.cookie)).data.saved,true);assert.equal((await request('/api/draft',{text:'stale',seq:1},s.cookie)).data.saved,false);assert.equal((await request('/api/state',undefined,s.cookie)).data.draftText,initial+' newer');
  const submitted=opts.editText?initial+'\n'+opts.editText:initial;s=await step(s,{text:submitted});assert.equal(s.data.phase,`post_${i}`);assert.equal((await request('/api/draft',{text:'late',seq:3},s.cookie)).status,409);
  assert.equal((await act(s,fillBlock(s.data.block,{tlx_md:101}))).status,400);
  s=await step(s,fillBlock(s.data.block,{effort_total:3}));assert.equal(s.data.phase,`trust_post_${i}`);assert.equal(s.data.block.questions.length,4);
  s=await step(s,fillBlock(s.data.block,{tr_1:3}));assert.equal(s.data.phase,`perception_${i}`);assert(s.data.initialText);assert(!('disclosureText'in s.data));assert.equal(s.data.block.questions.length,9);
  s=await step(s,fillBlock(s.data.block));assert.equal(s.data.phase,`responsibility_${i}`);assert.equal(s.data.block.questions.length,9);assert(s.data.block.instruction.includes(s.data.sender));assert(!JSON.stringify(s.data.block.questions).includes('AI'));assert.equal((await act(s,fillBlock(s.data.block,{responsibility_influence:7}))).status,400);
  s=await step(s,fillBlock(s.data.block,{sender_control:3,responsibility_influence:0}));
  return {s,submitted};
}
async function finish(s){
  assert.equal(s.data.phase,'reflection');assert.equal(s.data.block.questions.length,1);s=await step(s,{resp_free:''});
  assert.equal(s.data.phase,'recall');assert.equal(s.data.block.questions.length,6);assert(!('cases' in s.data));
  assert.equal((await act(s,{memory:2,belief:11,disc_confidence:5,disc_attention:3,disc_influence:3})).status,400);
  s=await step(s,{memory:2,belief:3,disc_confidence:5,disc_attention:3,disc_influence:3,disc_free:''});assert.equal(s.data.phase,'complete');assert(s.data.completionCode);assert.equal(s.data.keyword,'21wra0966');assert.equal((await act(s,{})).status,409);
  return s;
}

test('authorization, hidden stimuli, validation and demographics',async()=>{
  assert.equal((await request('/api/admin/status')).status,401);assert.equal((await request('/api/state')).status,401);assert.equal((await fetch(base+'/stimulus/case_data.js')).status,404);
  const s=await start();const text=JSON.stringify(s.data);
  assert(!text.includes('"answer"'));assert(!('drafts'in s.data));assert(!('condition'in s.data));assert(!text.includes('baseline'));assert(!text.includes('plan'));
  assert.equal(s.data.phase,'intro');assert.equal(s.data.casesTotal,4);assert.equal(s.data.senders.length,4);assert.equal(s.data.block.phase,'background');
  assert.equal((await act(s,{bg_work:0})).status,400);assert.equal((await act(s,{...fillBlock(s.data.block),ptt_1:9})).status,400);
  const inv=await adm('invites',{count:1,mode:'live',label:'demographics validation'});assert.equal((await request('/api/start',{code:inv.data.invitations[0].code,resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:1,age:17}})).status,400);assert.equal((await request('/api/start',{code:inv.data.invitations[0].code,resumeToken:randomUUID()+randomUUID(),consent:true})).status,400);
  const dupe=await request('/api/start',{...s.payload,resumeToken:randomUUID()+randomUUID()});assert.equal(dupe.status,409);assert.equal((await request('/api/start',s.payload)).data.sessionId,s.data.sessionId);
});

test('full path: four cases per participant, closing blocks, immutable submissions, keyword',async()=>{
  let s=await start();const id=s.data.sessionId;const cookie=s.cookie;
  s=await step(s,fillBlock(s.data.block,{bg_ai:2}));
  const submitted=[];const senders=[];for(let i=1;i<=4;i++){senders.push(s.data.sender);const r=await runCase(s,i,{wrongFirst:i===1,editText:i===2?'追記した確認事項。':''});s=r.s;submitted.push(r.submitted)}
  assert.equal(new Set(senders).size,4);
  s=await finish(s);
  const rows=(await all('session_cases')).filter(x=>x.session_id===id).sort((a,b)=>a.idx-b.idx);assert.equal(rows.length,4);
  assert.equal(new Set(rows.map(r=>r.case_id)).size,4);assert.equal(new Set(rows.map(r=>r.condition)).size,4);for(let i=0;i<4;i++){assert.equal(rows[i].submitted_text,submitted[i]);assert(rows[i].submitted_at);assert.equal(rows[i].sender,senders[i])}
  const sess=(await all('sessions')).find(x=>x.id===id);assert.equal(sess.protocol_version,'recipient-20260921-v7.2');assert(['disclosed','undisclosed'].includes(sess.disclosure));assert(Number.isInteger(sess.sequence));const plan=JSON.parse(sess.plan_json);assert.equal(plan.cases.length,4);assert(!plan.cases[0].text);assert.equal(JSON.parse(sess.meta_json).age,34);
  const resp=(await all('responses')).filter(x=>x.session_id===id);const phases=resp.map(x=>x.phase);assert(phases.includes('materials_1_attempt_1')&&phases.includes('materials_1_attempt_2'));assert(phases.includes('cognition_3')&&phases.includes('trust_post_2')&&phases.includes('recall'));
  assert.equal(JSON.parse(resp.find(x=>x.phase==='recall').value_json).belief,3);
});

test('allocation: independent disclosure and least-used Williams row within its group; all four states and four distinct themes per participant; theme x state balanced',async()=>{
  const tally=(await all('sessions')).filter(x=>x.mode==='live'&&!x.campaign_hash&&x.protocol_version===PROTOCOL_VERSION&&x.sequence!=null).reduce((m,x)=>{m[x.sequence]=(m[x.sequence]||0)+1;return m},{});const count=i=>tally[i]||0;
  const mine=[];for(let i=0;i<16;i++){const s=await start();const sess=(await all('sessions')).find(x=>x.id===s.data.sessionId);assert(sess.sequence>=0&&sess.sequence<8);const plan=JSON.parse(sess.plan_json);assert.equal(new Set(plan.cases.map(c=>c.case_id)).size,4);assert.deepEqual([...plan.states].sort(),['baseline','missing_info','off_focus','overreach']);assert.equal(plan.cases.length,4);plan.cases.forEach((c,k)=>assert.equal(c.condition,plan.states[k]));assert.equal(plan.allocation,'bernoulli-disclosure-v1');assert.equal(plan.disclosureProbability,0.5);const offset=sess.disclosure==='disclosed'?0:4;const min=Math.min(...Array.from({length:4},(_,k)=>count(k+offset)));assert.equal(count(sess.sequence),min,'least-used Williams row within the randomly selected disclosure');tally[sess.sequence]=count(sess.sequence)+1;mine.push({disclosure:sess.disclosure,plan})}
  const pos={};for(const x of mine)x.plan.states.forEach((st,p)=>{pos[st+p]=(pos[st+p]||0)+1});assert.equal(Object.keys(pos).length,16,'every state appears in every position across 16 starts');
});

test('withdrawal, stale and concurrent transitions, event phases',async()=>{
  let s=await start();const end=await act(s,{},{withdraw:true});assert.equal(end.data.phase,'withdrawn');
  s=await start();const cookie=s.cookie;s=await step(s,fillBlock(s.data.block));const results=await Promise.all([act(s,{knowledge:[1,1]}),act(s,{knowledge:[1,1]})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
  const e={id:randomUUID(),page:randomUUID(),seq:1,phase:'cognition_2',type:'answer_change',wall:new Date().toISOString(),mono:0.5,payload:{name:'suff_1',value:'5'}};for(let i=0;i<2;i++)assert.equal((await request('/api/records',{events:[e]},cookie)).status,200);assert.equal((await all('events')).filter(x=>x.session_id===s.data.sessionId&&x.event_id===e.id).length,1);assert.equal((await request('/api/records',{events:[{...e,id:randomUUID(),seq:2,phase:'nonexistent_9'}]},cookie)).status,400);
  assert.equal((await request('/api/admin/export?table=sessions',undefined,cookie)).status,401);
});

test('large event queue fits production limits',async()=>{const s=await start();const page=randomUUID();const ev=Array.from({length:50},(_,i)=>({id:randomUUID(),page,seq:i+1,phase:'intro',type:'pointermove',wall:new Date().toISOString(),mono:i,payload:{x:i,y:i}}));const r=await request('/api/records',{events:ev},s.cookie);assert.equal(r.status,200,JSON.stringify(r.data));});

test('100 invitations; admin stimulus snapshot; campaign entry with keyword precedence',async()=>{
  const r=await adm('invites',{count:100,mode:'live',label:'batch-limit regression'});assert.equal(r.status,200);assert.equal(r.data.invitations.length,100);
  const st=await adm('stimulus');assert.equal(st.data.version,'recipient-20260921-v7.2');assert.equal(st.data.sequences.length,8);assert.equal(st.data.phases[1],'materials_1');
  const c=await adm('campaigns',{mode:'live',label:'yahoo test v5',keyword:'WORKSLOP',capacity:2});assert(c.data.url.includes('#entry='));
  const startEntry=async()=>request('/api/start',{entry:c.data.token,resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:3,age:52}});
  const a=await startEntry();assert.equal(a.status,200,JSON.stringify(a.data));assert(a.data.code);const b=await startEntry();assert.equal(b.status,200);assert.equal((await startEntry()).status,200);
  assert.equal((await adm('campaign',{tokenHash:c.data.tokenHash,open:false})).status,200);assert.equal((await startEntry()).status,403);
  const exported=(await all('sessions')).find(x=>x.id===a.data.sessionId);assert(exported.invitation_label==='campaign:yahoo test v5',exported.invitation_label);
});

test('open entry: top URL without code uses the default campaign; setting restored',async()=>{
  const before=(await adm('status')).data.config.defaultCampaign||'';
  const c=await adm('campaigns',{mode:'live',label:'open entry v5.1',capacity:0});assert.equal(c.status,200);
  try{assert.equal((await adm('config',{defaultCampaign:c.data.tokenHash})).status,200);
    const a=await request('/api/start',{resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:0,age:41}});assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(a.data.phase,'intro');assert(a.data.code);
    const pub=await request('/api/config');assert.equal(pub.data.defaultCampaign,c.data.tokenHash);
    assert.equal((await adm('config',{defaultCampaign:''})).status,200);
    assert.equal((await request('/api/start',{resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:0,age:41}})).status,403);
  }finally{assert.equal((await adm('config',{defaultCampaign:before})).status,200)}
});

test('unified participation ignores legacy researcher IP; leave clears the cookie; setting restored',async()=>{
  const before=(await adm('status')).data.config;const camp=await adm('campaigns',{mode:'live',label:'researcher-ip check',capacity:0});
  try{assert.equal((await adm('config',{resetIps:'*',defaultCampaign:camp.data.tokenHash})).status,200);
    const pub=await request('/api/config');assert.equal(pub.data.researcher,undefined);assert.equal(pub.data.resetIps,undefined);
    const a=await request('/api/start',{resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:1,age:33}});assert.equal(a.status,200,JSON.stringify(a.data));
    const sess=(await all('sessions')).find(x=>x.id===a.data.sessionId);assert.equal(sess.mode,'live');assert(sess.invitation_label.startsWith('campaign:'));
    const w=await act(a,{},{withdraw:true});assert.equal(w.data.phase,'withdrawn');assert.equal(w.data.canRestart,true);assert.equal(w.data.keyword,undefined);
    const l=await request('/api/leave',{},a.cookie);assert.equal(l.status,200);assert(String(l.cookie||'').startsWith('participant='));
    assert.equal((await adm('config',{resetIps:''})).status,200);assert.equal((await request('/api/config')).data.researcher,undefined);
  }finally{await adm('config',{resetIps:before.resetIps||'',defaultCampaign:before.defaultCampaign||''});await adm('campaign',{tokenHash:camp.data.tokenHash,open:false})}
});
