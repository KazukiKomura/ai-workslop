// Isolated local D1/Worker integration tests; never connect to production.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import cases from '../src/cases.js';
let mf,db;
before(async()=>{
 const bundle=await build({entryPoints:[new URL('../src/worker.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser'});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-18',d1Databases:['DB'],bindings:{ADMIN_KEY:'local-campaign-test-key',READ_GATE_SECONDS:'4'},serviceBindings:{ASSETS:async request=>{const p=new URL(request.url).pathname;const file=p==='/'?'index.html':p==='/admin'?'admin.html':p.slice(1);if(!['index.html','admin.html','app.js','admin.js','app.css'].includes(file))return new Response('Not found',{status:404});return new Response(await readFile(new URL('../public/'+file,import.meta.url)),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}})}}}));
 db=await mf.getD1Database('DB');
 const schema=await readFile(new URL('../schema.sql',import.meta.url),'utf8');
 const migration=await readFile(new URL('../migrations/2026-09-21-v4.sql',import.meta.url),'utf8');
 await db.batch(schema.split(';').map(x=>x.trim()).filter(Boolean).map(x=>db.prepare(x)));
 for(const sql of migration.split('\n').filter(x=>x.startsWith('ALTER TABLE')))await db.prepare(sql).run();
 await db.prepare("INSERT INTO studies VALUES('current',?,?)").bind(JSON.stringify({enrollmentOpen:true,finalKeyword:'local-test-only',resetIps:''}),new Date().toISOString()).run();
});
after(async()=>{await mf?.dispose()});
async function req(path,data,cookie='',admin=false,extra={}){const r=await mf.dispatchFetch('http://localhost'+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'content-type':'application/json'}),...(admin?{authorization:'Bearer local-campaign-test-key'}:{}),...(cookie?{cookie}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie}}
const adm=(path,data)=>req('/api/admin/'+path,data,'',true);
const payload=entry=>({entry,resumeToken:randomUUID()+randomUUID(),consent:true,meta:{gender:1,age:30}});
const newCampaign=async target=>{const r=await adm('campaigns',{label:'isolated verification',capacity:0,completionTarget:target});assert.equal(r.status,200);return r.data};
const start=async p=>{const r=await req('/api/start',p);assert.equal(r.status,200,JSON.stringify(r.data));return r};
async function action(s,answers={},extra={}){const r=await req('/api/action',{phase:s.data.phase,revision:s.data.revision,actionId:randomUUID(),answers,...extra},s.cookie);assert.equal(r.status,200,JSON.stringify(r.data));return r}
const answers=block=>Object.fromEntries(block.questions.map(q=>[q.id,q.type==='choice'?0:q.type==='range'?50:q.type==='text'?(q.required?'回答例':''):4]));

test('shared entry: concurrent retries allocate one participant, no keyword/condition leak',async()=>{
 const c=await newCampaign(50),p=payload(c.token);
 const r=await Promise.all(Array.from({length:8},()=>req('/api/start',p)));
 r.forEach(x=>assert.equal(x.status,200,JSON.stringify(x.data)));assert.equal(new Set(r.map(x=>x.data.sessionId)).size,1);
 const {results}=await db.prepare('SELECT * FROM sessions WHERE id=?').bind(r[0].data.sessionId).all();assert.equal(results.length,1);
 const rows=(await db.prepare('SELECT * FROM session_cases WHERE session_id=?').bind(results[0].id).all()).results;assert.equal(rows.length,1);assert(cases.conditions.includes(rows[0].condition));assert.equal(results[0].condition,rows[0].condition);
 const plan=JSON.parse(results[0].plan_json);assert.equal(plan.allocation,'between-v8');assert.equal(plan.readGateSeconds,4);assert.equal(plan.disclosureProbability,0.5);assert(!('text'in plan.cases[0]));
 assert(!('condition'in r[0].data));assert(!('disclosure'in r[0].data));assert(!('finalKeyword'in(await req('/api/config')).data));assert(!('keyword'in r[0].data));
 // Closed recruitment must not invalidate retries or resumption.
 await adm('campaign',{tokenHash:c.tokenHash,open:false});assert.equal((await req('/api/start',p)).data.sessionId,r[0].data.sessionId);assert.equal((await req('/api/start',payload(c.token))).status,403);
});

test('over 50 starts and completions never stop recruitment; preserve active participants',async()=>{
 const c=await newCampaign(50),starts=[];
 for(let batch=0;batch<6;batch++){const ps=Array.from({length:10},()=>payload(c.token));const rs=await Promise.all(ps.map(start));rs.forEach((s,i)=>starts.push({s,p:ps[i]}));}
 assert.equal(new Set(starts.map(x=>x.s.data.sessionId)).size,60);
 for(const x of starts.slice(0,5))await action(x.s,{}, {withdraw:true});
 let status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.started,60);assert.equal(status.completed,0);
 // This fixture changes completion status only in the isolated local database.
 await db.batch(starts.slice(5,55).map(x=>db.prepare("UPDATE sessions SET phase='complete' WHERE id=?").bind(x.s.data.sessionId)));
 status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.completed,50);
 await db.prepare('UPDATE campaigns SET capacity=1,completion_target=1 WHERE token_hash=?').bind(c.tokenHash).run();const extra=await req('/api/start',payload(c.token));assert.equal(extra.status,200);
 const pending=starts.at(-1);assert.equal((await req('/api/start',pending.p)).data.sessionId,pending.s.data.sessionId);assert.equal((await req('/api/state',undefined,pending.s.cookie)).status,200);
 const withdrawn=(await req('/api/state',undefined,starts[0].s.cookie)).data;assert.equal(withdrawn.canRestart,true);
 const counts=(await adm('campaigns')).data.progress.filter(x=>x.campaign_hash===c.tokenHash);assert.equal(counts.reduce((a,x)=>a+x.n,0),61);assert.equal(counts.filter(x=>x.phase==='withdrawn').reduce((a,x)=>a+x.n,0),5);
});

test('full one-case path (v8): read gate blocks an early advance, disclosure kept, factual MCs scored, keyword only at end',async()=>{
 const c=await newCampaign(1),p=payload(c.token);let s=await start(p);const saved=(await db.prepare('SELECT disclosure FROM sessions WHERE id=?').bind(s.data.sessionId).first()).disclosure;
 let reads=0,edits=0;
 for(let step=0;s.data.phase!=='complete'&&step<80;step++){
  const phase=s.data.phase.replace(/_\d+$/,'');let a={};
  if(phase==='intro')a={...answers(s.data.block),...(cases.common.introCheck?{knowledge:cases.common.introCheck.map(x=>x.answer)}:{})};
  else if(phase==='materials')a={knowledge:cases.common.precheck.map(x=>x.answer)};
  else if(phase==='read'){reads++;assert.equal(Boolean(s.data.disclosureText),saved==='disclosed');assert.equal(s.data.readGateSeconds,4);const early=await req('/api/action',{phase:s.data.phase,revision:s.data.revision,actionId:randomUUID(),answers:{}},s.cookie);assert.equal(early.status,400,'read gate: immediate advance rejected');assert(String(early.data.error).includes('秒'));await new Promise(r=>setTimeout(r,2300))}
  else if(phase==='edit'){edits++;a={text:s.data.initialText}}
  else if(s.data.block)a=answers(s.data.block);
  assert(!('keyword'in s.data));s=await action(s,a);
 }
 assert.equal(s.data.phase,'complete');assert.equal(reads,1);assert.equal(edits,1);assert.equal(s.data.keyword,'local-test-only');assert(s.data.completionCode);
 const perc=JSON.parse((await db.prepare("SELECT value_json FROM responses WHERE session_id=? AND phase='perception_1'").bind(s.data.sessionId).first()).value_json);const cond=(await db.prepare('SELECT condition FROM session_cases WHERE session_id=?').bind(s.data.sessionId).first()).condition;const keyed=cases.common.fmcKeyed[cond];for(const q of ['fmc_info','fmc_policy','fmc_accuracy'])assert.equal(perc[q+'_correct'],keyed[q]==='はい'?1:0,q+' scored (answered はい)');
 const read=JSON.parse((await db.prepare("SELECT value_json FROM responses WHERE session_id=? AND phase='read_1'").bind(s.data.sessionId).first()).value_json);assert(read.read_seconds>=2,'read_seconds recorded');
 assert.equal((await req('/api/start',payload(c.token))).status,200);
 assert.equal((await req('/api/start',p)).data.phase,'complete');
});


test('browser: shared entry needs no invitation code; admin shows one flow and arm progress without participant quotas',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const origin=String(await mf.ready);const c=await newCampaign(50);
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(origin+'#entry='+c.token);await page.locator('#consent').waitFor();assert.equal(await page.locator('#code').count(),0);
  await page.locator('#consent').check();await page.locator('input[name=gender][value="1"]').check();await page.locator('#age').fill('30');await page.getByRole('button',{name:'次ページ',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#withdraw')&&!document.querySelector('#withdraw').hidden);
  const before=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(before.casesTotal,1);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#withdraw')&&!document.querySelector('#withdraw').hidden);
  const after=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(after.sessionId,before.sessionId);
  await page.goto(origin+'admin');await page.locator('#key').fill('local-campaign-test-key');await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.locator('#export-from').waitFor();assert.equal(await page.locator('#campaign-target').count(),0);assert.equal(await page.locator('#campaign-capacity').count(),0);assert.equal(await page.locator('#campaign-mode').count(),0);assert.equal(await page.locator('#mode').count(),0);assert.equal(await page.locator('#campaign-label').count(),0);await page.locator('#export-to').waitFor();
  assert.match(await page.locator('#admin').innerText(),/参加開始日時/);
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../test-results/campaign-randomization-admin.png',import.meta.url).pathname,fullPage:true});
 }finally{await browser.close()}
});


test('one participant flow: former researcher IP cannot change mode; all participants follow the same flow',async()=>{
 await adm('config',{resetIps:'*'});const c=await newCampaign(1);
 const s=await req('/api/start',payload(c.token),'',false,{'cf-connecting-ip':'127.0.0.1'});assert.equal(s.status,200);assert.equal(s.data.mode,'live');
 assert(!('researcher'in(await req('/api/config')).data));
 await db.prepare("UPDATE sessions SET phase='complete' WHERE id=?").bind(s.data.sessionId).run();
 assert.equal((await req('/api/start',payload(c.token),'',false,{'cf-connecting-ip':'127.0.0.1'})).status,200);
 const status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.started,2);assert.equal(status.completed,1);
});

test('50 simultaneous starts and 50 simultaneous event batches: no duplicate participants or missing logs',async()=>{
 const c=await newCampaign(0);const ps=Array.from({length:50},()=>payload(c.token));
 const began=performance.now();const started=await Promise.all(ps.map(p=>req('/api/start',p)));
 started.forEach(s=>assert.equal(s.status,200,JSON.stringify(s.data)));assert.equal(new Set(started.map(s=>s.data.sessionId)).size,50);
 const rows=(await db.prepare('SELECT sc.*,s.disclosure FROM session_cases sc JOIN sessions s ON s.id=sc.session_id JOIN invitations i ON i.code_hash=s.invitation_hash WHERE i.campaign_hash=?').bind(c.tokenHash).all()).results;
 assert.equal(rows.length,50);
 for(const s of started){const own=rows.filter(r=>r.session_id===s.data.sessionId);assert.equal(own.length,1);}
 const startWallMs=performance.now()-began;
 const batches=started.map(s=>{const page=randomUUID();return {events:Array.from({length:100},(_,i)=>({id:randomUUID(),page,seq:i+1,phase:s.data.phase,type:'heartbeat',wall:new Date().toISOString(),mono:i,payload:{test:'local concurrency verification'}}))}});
 const first=await Promise.all(started.map((s,i)=>req('/api/events',batches[i],s.cookie)));first.forEach(r=>{assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.ack.length,100)});
 const retried=await Promise.all(started.map((s,i)=>req('/api/events',batches[i],s.cookie)));retried.forEach(r=>assert.equal(r.status,200));
 const count=await db.prepare('SELECT count(*) AS n FROM events e JOIN sessions s ON s.id=e.session_id JOIN invitations i ON i.code_hash=s.invitation_hash WHERE i.campaign_hash=?').bind(c.tokenHash).first();assert.equal(count.n,5000);
 const resumed=await Promise.all(ps.map(p=>req('/api/start',p)));resumed.forEach((r,i)=>{assert.equal(r.status,200);assert.equal(r.data.sessionId,started[i].data.sessionId)});
 const actual=await db.prepare('SELECT count(*) AS n FROM sessions s JOIN invitations i ON i.code_hash=s.invitation_hash WHERE i.campaign_hash=?').bind(c.tokenHash).first();assert.equal(actual.n,50);
 const result={checkedAt:new Date().toISOString(),environment:'isolated local Miniflare + D1, not production load or performance measurement',simultaneousStarts:50,successfulStarts:50,uniqueParticipants:50,caseRecords:200,uniqueEvents:count.n,retriedEvents:5000,successfulResumes:50,localStartWallMs:Math.round(startWallMs),localTotalWallMs:Math.round(performance.now()-began)};
 await mkdir(new URL('../reviews/recruitment-20260921/',import.meta.url),{recursive:true});await writeFile(new URL('../reviews/recruitment-20260921/concurrency-50.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
});

test('export filters by server-side participant start time with inclusive start and exclusive end',async()=>{
 const c=await newCampaign(0);const a=await start(payload(c.token)),b=await start(payload(c.token));
 await db.batch([db.prepare('UPDATE sessions SET created_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',a.data.sessionId),db.prepare('UPDATE sessions SET created_at=? WHERE id=?').bind('2020-01-02T00:00:00.000Z',b.data.sessionId)]);
 const query='from=2020-01-01T00%3A00%3A00.000Z&to=2020-01-02T00%3A00%3A00.000Z';
 const sessions=await adm('export?table=sessions&'+query);assert.equal(sessions.status,200);assert.deepEqual(sessions.data.rows.map(r=>r.id),[a.data.sessionId]);
 const sc=await adm('export?table=session_cases&'+query);assert.equal(sc.data.rows.length,1);assert(sc.data.rows.every(r=>r.session_id===a.data.sessionId));
 assert.equal((await adm('export?table=sessions&from=not-a-date')).status,400);
});
