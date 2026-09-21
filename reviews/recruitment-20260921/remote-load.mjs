// Explicitly user-authorized remote load verification. Writes synthetic records.
// Not part of the ordinary test glob. Run manually with node --test <this file>.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base='https://handoff-research.research-public.workers.dev';
const out=new URL('./',import.meta.url);
const key=(await readFile(new URL('../../.private/admin-key.txt',import.meta.url),'utf8')).trim();
async function request(path,data,cookie='',admin=false){const t=performance.now();try{const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...(admin?{authorization:'Bearer '+key}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie,ms:performance.now()-t,edge:r.headers.get('cf-ray')?.split('-').at(-1)}}catch(e){return {status:0,error:String(e.message),ms:performance.now()-t}}}
function stats(rows){const a=rows.map(x=>x.ms).sort((a,b)=>a-b);return {requests:rows.length,success:rows.filter(x=>x.status===200).length,statusCounts:rows.reduce((m,x)=>(m[x.status]=(m[x.status]||0)+1,m),{}),medianMs:Math.round(a[Math.floor(a.length/2)]||0),p95Ms:Math.round(a[Math.ceil(a.length*.95)-1]||0),maxMs:Math.round(a.at(-1)||0)}}
async function exportRows(table,from,to){const rows=[];let cursor='0';do{const q=new URLSearchParams({table,from,to,cursor});const r=await request('/api/admin/export?'+q,undefined,'',true);assert.equal(r.status,200);rows.push(...r.data.rows);cursor=r.data.next}while(cursor);return rows}
test('REMOTE: 50 simultaneous starts, 5000 log records, idempotent replay and resume',{timeout:180000},async()=>{
 const from=new Date().toISOString(),runId='remote-load-'+Date.now(),ps=Array.from({length:50},()=>({resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:3,age:30,language:'ja',timezone:'Asia/Tokyo',viewport:{width:1440,height:1000}}}));
 const recovery=new URL('../../.private/'+runId+'.json',import.meta.url);await writeFile(recovery,JSON.stringify({runId,from,ps}),{mode:0o600});
 const result={runId,kind:'synthetic remote API load verification',from,participants:[],stages:{},errors:[]};let started=[];
 try{
  const cfg=await request('/api/config');assert.equal(cfg.status,200);assert(cfg.data.defaultCampaign);assert.equal(cfg.data.enrollmentOpen,true);
  const begin=performance.now();started=await Promise.all(ps.map(p=>request('/api/start',p)));result.stages.start={...stats(started),wallMs:Math.round(performance.now()-begin)};console.log(JSON.stringify({stage:'50 starts',...result.stages.start}));
  result.participants=started.filter(x=>x.status===200).map(x=>x.data.sessionId);await writeFile(new URL('remote-load-progress.json',out),JSON.stringify(result,null,2));assert.equal(result.participants.length,50);assert.equal(new Set(result.participants).size,50);
  const payloads=started.map((s,i)=>({events:Array.from({length:100},(_,n)=>({id:randomUUID(),page:runId+'-'+i,seq:n+1,phase:'intro',type:'load_probe',wall:new Date().toISOString(),mono:n,payload:{synthetic:true,runId,participantIndex:i}}))}));
  const logs=await Promise.all(started.map((s,i)=>request('/api/records',payloads[i],s.cookie)));result.stages.logs=stats(logs);console.log(JSON.stringify({stage:'5000 logs',...result.stages.logs}));logs.forEach(r=>{assert.equal(r.status,200);assert.equal(r.data.ack.length,100)});
  const replay=await Promise.all(started.map((s,i)=>request('/api/records',payloads[i],s.cookie)));result.stages.replay=stats(replay);replay.forEach(r=>assert.equal(r.status,200));
  const resumed=await Promise.all(ps.map(p=>request('/api/start',p)));result.stages.resume=stats(resumed);resumed.forEach((r,i)=>{assert.equal(r.status,200);assert.equal(r.data.sessionId,started[i].data.sessionId)});
 }catch(e){result.errors.push(String(e.stack||e));throw e}
 finally{
  const cleanup=await Promise.all(started.filter(x=>x.status===200).map(s=>request('/api/action',{phase:s.data.phase,revision:s.data.revision,actionId:randomUUID(),withdraw:true},s.cookie)));result.stages.withdraw=stats(cleanup);result.to=new Date().toISOString();
  const ids=new Set(result.participants);
  const raw={};for(const table of ['sessions','session_cases','events','actions','responses'])raw[table]=(await exportRows(table,from,result.to)).filter(r=>ids.has(table==='sessions'?r.id:r.session_id));
  result.stored={sessions:raw.sessions.length,caseRecords:raw.session_cases.length,events:raw.events.length,withdrawn:raw.sessions.filter(s=>s.phase==='withdrawn').length,uniqueEventIds:new Set(raw.events.map(e=>e.session_id+'|'+e.event_id)).size,disclosure:raw.sessions.reduce((m,s)=>(m[s.disclosure]=(m[s.disclosure]||0)+1,m),{})};
  result.verdict=result.errors.length===0&&result.stored.sessions===50&&result.stored.caseRecords===200&&result.stored.events===5000&&result.stored.uniqueEventIds===5000&&result.stored.withdrawn===50?'PASS':'FAIL';
  await writeFile(new URL('remote-load-results.json',out),JSON.stringify(result,null,2));await writeFile(new URL('remote-load-raw.json',out),JSON.stringify({manifest:result,raw},null,2));
  console.log(JSON.stringify({verdict:result.verdict,from:result.from,to:result.to,stored:result.stored,stages:result.stages}));assert.equal(result.verdict,'PASS');
 }
});
