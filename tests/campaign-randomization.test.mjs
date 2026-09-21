// Isolated local D1/Worker integration tests; never connect to production.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import cases from '../src/cases.js';
let mf,db;
before(async()=>{
 const bundle=await build({entryPoints:[new URL('../src/worker.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser'});
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-18',d1Databases:['DB'],bindings:{ADMIN_KEY:'local-campaign-test-key'},serviceBindings:{ASSETS:async request=>{const p=new URL(request.url).pathname;const file=p==='/'?'index.html':p==='/admin'?'admin.html':p.slice(1);if(!['index.html','admin.html','app.js','admin.js','app.css'].includes(file))return new Response('Not found',{status:404});return new Response(await readFile(new URL('../public/'+file,import.meta.url)),{headers:{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}})}}}));
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
 const rows=(await db.prepare('SELECT * FROM session_cases WHERE session_id=?').bind(results[0].id).all()).results;assert.equal(rows.length,4);assert.equal(new Set(rows.map(x=>x.case_id)).size,4);assert.equal(new Set(rows.map(x=>x.condition)).size,4);
 const plan=JSON.parse(results[0].plan_json);assert.equal(plan.allocation,'least-count-sequence-v2');assert(!('text'in plan.cases[0]));
 assert(!('condition'in r[0].data));assert(!('disclosure'in r[0].data));assert(!('finalKeyword'in(await req('/api/config')).data));assert(!('keyword'in r[0].data));
 // Closed recruitment must not invalidate retries or resumption.
 await adm('campaign',{tokenHash:c.tokenHash,open:false});assert.equal((await req('/api/start',p)).data.sessionId,r[0].data.sessionId);assert.equal((await req('/api/start',payload(c.token))).status,403);
});

test('over 50 starts with attrition; stop new starts on 50 completions, preserve active participants',async()=>{
 const c=await newCampaign(50),starts=[];
 for(let batch=0;batch<6;batch++){const ps=Array.from({length:10},()=>payload(c.token));const rs=await Promise.all(ps.map(start));rs.forEach((s,i)=>starts.push({s,p:ps[i]}));}
 assert.equal(new Set(starts.map(x=>x.s.data.sessionId)).size,60);
 for(const x of starts.slice(0,5))await action(x.s,{}, {withdraw:true});
 let status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.started,60);assert.equal(status.completed,0);
 // This fixture changes completion status only in the isolated local database.
 await db.batch(starts.slice(5,55).map(x=>db.prepare("UPDATE sessions SET phase='complete' WHERE id=?").bind(x.s.data.sessionId)));
 status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.completed,50);
 const blocked=await req('/api/start',payload(c.token));assert.equal(blocked.status,403);assert.match(blocked.data.error,/回答数/);
 const pending=starts.at(-1);assert.equal((await req('/api/start',pending.p)).data.sessionId,pending.s.data.sessionId);assert.equal((await req('/api/state',undefined,pending.s.cookie)).status,200);
 const withdrawn=(await req('/api/state',undefined,starts[0].s.cookie)).data;assert.equal(withdrawn.canRestart,true);
 const counts=(await adm('campaigns')).data.progress.filter(x=>x.campaign_hash===c.tokenHash);assert.equal(counts.reduce((a,x)=>a+x.n,0),60);assert.equal(counts.filter(x=>x.phase==='withdrawn').reduce((a,x)=>a+x.n,0),5);
});

test('full four-case path keeps assigned disclosure throughout and returns completion keyword only at end',async()=>{
 const c=await newCampaign(1),p=payload(c.token);let s=await start(p);const saved=(await db.prepare('SELECT disclosure FROM sessions WHERE id=?').bind(s.data.sessionId).first()).disclosure;
 let reads=0,edits=0;
 for(let step=0;s.data.phase!=='complete'&&step<80;step++){
  const phase=s.data.phase.replace(/_\d+$/,'');let a={};
  if(phase==='intro')a={...answers(s.data.block),...(cases.common.introCheck?{knowledge:cases.common.introCheck.map(x=>x.answer)}:{})};
  else if(phase==='materials')a={knowledge:cases.common.precheck.map(x=>x.answer)};
  else if(phase==='read'){reads++;assert.equal(Boolean(s.data.disclosureText),saved==='disclosed')}
  else if(phase==='edit'){edits++;a={text:s.data.initialText}}
  else if(s.data.block)a=answers(s.data.block);
  assert(!('keyword'in s.data));s=await action(s,a);
 }
 assert.equal(s.data.phase,'complete');assert.equal(reads,4);assert.equal(edits,4);assert.equal(s.data.keyword,'local-test-only');assert(s.data.completionCode);
 assert.equal((await req('/api/start',payload(c.token))).status,403);
 assert.equal((await req('/api/start',p)).data.phase,'complete');
});


test('browser: shared entry needs no invitation code; admin shows completion target and arm progress',async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const origin=String(await mf.ready);const c=await newCampaign(50);
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto(origin+'#entry='+c.token);await page.locator('#consent').waitFor();assert.equal(await page.locator('#code').count(),0);
  await page.locator('#consent').check();await page.locator('input[name=gender][value="1"]').check();await page.locator('#age').fill('30');await page.getByRole('button',{name:'次ページ',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#withdraw')&&!document.querySelector('#withdraw').hidden);
  const before=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(before.casesTotal,4);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#withdraw')&&!document.querySelector('#withdraw').hidden);
  const after=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(after.sessionId,before.sessionId);
  await page.goto(origin+'admin');await page.locator('#key').fill('local-campaign-test-key');await page.getByRole('button',{name:'ログイン',exact:true}).click();
  await page.locator('#campaign-target').waitFor();assert.equal(await page.locator('#campaign-target').inputValue(),'50');assert.equal(await page.locator('#campaign-mode').count(),0);assert.equal(await page.locator('#mode').count(),0);await page.locator('#campaign-list table').waitFor();
  assert.match(await page.locator('#campaign-list').innerText(),/開示あり/);assert.match(await page.locator('#campaign-list').innerText(),/完了目標/);
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../test-results/campaign-randomization-admin.png',import.meta.url).pathname,fullPage:true});
 }finally{await browser.close()}
});


test('one participant flow: former researcher IP cannot change mode or bypass the completion target',async()=>{
 await adm('config',{resetIps:'*'});const c=await newCampaign(1);
 const s=await req('/api/start',payload(c.token),'',false,{'cf-connecting-ip':'127.0.0.1'});assert.equal(s.status,200);assert.equal(s.data.mode,'live');
 assert(!('researcher'in(await req('/api/config')).data));
 await db.prepare("UPDATE sessions SET phase='complete' WHERE id=?").bind(s.data.sessionId).run();
 assert.equal((await req('/api/start',payload(c.token),'',false,{'cf-connecting-ip':'127.0.0.1'})).status,403);
 const status=(await adm('campaigns')).data.campaigns.find(x=>x.token_hash===c.tokenHash);assert.equal(status.started,1);assert.equal(status.completed,1);
});
