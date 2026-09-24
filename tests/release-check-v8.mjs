// Release check against a deployed origin: creates a labelled verification campaign, runs the full v8 flow in Chrome (desktop and mobile),
// captures console/network errors and screenshots, verifies recorded data through the admin export, then closes the campaign.
// Usage: TEST_URL=https://... ADMIN_KEY=... node tests/release-check-v8.mjs
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:8795';
const key=process.env.ADMIN_KEY||(existsSync('.private/admin-key.txt')?(await readFile('.private/admin-key.txt','utf8')).trim():'local-test-admin-key');
const UA='Mozilla/5.0 (Macintosh) research-release-check';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json','user-agent':UA},body:body?JSON.stringify(body):undefined});assert(r.ok,path+' '+r.status+' '+await r.clone().text());return r.json()}
async function all(table){let cursor='0',rows=[];do{const b=await adm(`export?table=${table}&cursor=${cursor}`);rows.push(...b.rows);cursor=b.next}while(cursor);return rows}
await mkdir('test-results/release-v8',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,...(existsSync(chrome)?{executablePath:chrome}:{})});
for(const c of (await adm('campaigns')).campaigns)if(c.open&&String(c.label).startsWith('動作確認 v8 自動'))await adm('campaign',{tokenHash:c.token_hash,open:false});
const camp=await adm('campaigns',{label:'動作確認 v8 自動（2026-09-24 発行・分析から除外）',keyword:''});
const report={base,campaignLabel:camp.label||'動作確認 v8 自動',runs:[]};
async function run(name,viewport){
 const ctx=await browser.newContext({viewport,userAgent:undefined});const page=await ctx.newPage();
 const consoleErrors=[],failed=[],pageErrors=[];page.on('console',m=>{if(m.type()==='error'&&!/401/.test(m.text()))consoleErrors.push(m.text().slice(0,200))});page.on('pageerror',e=>pageErrors.push(String(e).slice(0,200)));page.on('response',r=>{if(r.status()>=400&&!r.url().includes('/api/action')&&!(r.status()===401&&r.url().endsWith('/api/state')))failed.push(r.status()+' '+r.url().slice(0,120))});// the first GET /api/state before consent is an expected 401 (no participant cookie yet)
 const shot=n=>page.screenshot({path:`test-results/release-v8/${name}-${n}.png`,fullPage:false});
 const t0=Date.now();const steps=[];const mark=s=>steps.push({step:s,t:Math.round((Date.now()-t0)/1000)});
 const fillBlock=async()=>{for(const fs of await page.locator('form fieldset').all()){const radios=fs.locator('input[type=radio]');if(await radios.count()){await radios.nth(Math.min(3,await radios.count()-1)).check();continue}const range=fs.locator('input[type=range]');if(await range.count()){await range.first().evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))})}}};
 const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,'no horizontal overflow');
 await page.goto(base+'/#entry='+camp.token);await page.locator('#consent').waitFor();await noOverflow();await shot('01-consent');
 const consent=await page.locator('.consent-screen').innerText();assert(consent.includes('1 件の案件')&&!consent.includes('制限時間')&&!/分以内/.test(consent)&&consent.includes('10〜20 分'),'consent wording (no time limit)');mark('consent');
 await page.locator('#consent').check();await page.locator('input[name=gender][value="1"]').check();await page.fill('#age','35');await page.getByRole('button',{name:'次ページ'}).click();
 await page.locator('[data-instruction-step="0"] h2').waitFor();const intro=await page.locator('[data-instruction-step="0"]').innerText();assert(intro.includes('1 件の案件を担当')&&intro.includes('回答は注意深く確認します')&&!/分以内/.test(intro),'intro wording (no time limit)');await shot('02-intro');
 await page.getByRole('button',{name:'次へ'}).click();await fillBlock();await page.getByRole('button',{name:'最初の案件へ'}).click();mark('intro');
 await page.locator('.request-body').waitFor();const req=await page.locator('.request-body').innerText();assert(/　A\./.test(req)&&/　B\./.test(req)&&/　C\./.test(req)&&/　D\./.test(req),'A–D labelled request');await noOverflow();await shot('03-request');
 for(const [i,ans] of [[0,1],[1,1]])await page.locator(`input[name=k${i}][value="${ans}"]`).check();await page.getByRole('button',{name:'報告案を受け取る'}).click();mark('precheck');
 await page.locator('#read-done').waitFor();const st=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(st.casesTotal,1);assert(!('condition'in st)&&!('disclosure'in st)&&!('keyword'in st),'no leak in state');
 const gate=Number(st.readGateSeconds);assert.equal(gate,45,'production read gate is 45 s');assert.equal(await page.locator('#read-done').isDisabled(),true,'gate closed at render');assert((await page.locator('#read-done').innerText()).includes('秒'),'countdown label');
 const disclosed=!!st.disclosureText;const handoffMsg=await page.locator('.handoff-message').innerText();assert(handoffMsg.includes('報告案を作りました')&&handoffMsg.includes(st.sender),'colleague handoff message rendered');assert.equal(handoffMsg.includes('生成AI'),disclosed,'handoff message matches disclosure arm');assert.equal(await page.locator('.disclosure-badge').count(),disclosed?1:0,'badge matches disclosure arm');assert.equal(await page.locator('.notice.disclosure').count(),disclosed?1:0,'notice matches disclosure arm');
 await page.locator('details[data-source="S1"] > summary').click();await page.locator('details[data-source="request"] > summary').click();await noOverflow();await shot('04-read-gate');
 // reload mid-read: same phase, gate restarts client-side, server still counts from phase entry
 await page.reload();await page.locator('#read-done').waitFor();assert.equal((await page.evaluate(()=>fetch('/api/state').then(r=>r.json()))).phase,'read_1','resume after reload');
 await page.waitForFunction(()=>{const b=document.getElementById('read-done');return b&&!b.disabled},null,{timeout:(gate+10)*1000});mark('gate-open');
 await page.locator('#read-done').click();await page.locator('input[name=readcheck]').first().waitFor();mark('cognition');
 assert.equal(await page.locator('.disclosure-badge').count(),disclosed?1:0,'badge on cognition draft');
 await page.locator('input[name=readcheck][value="0"]').check();await fillBlock();await shot('05-cognition');
 // reload mid-questionnaire: answers restored from localStorage
 await page.reload();await page.locator('input[name=readcheck]').first().waitFor();assert.equal(await page.locator('input[name=suff_1]:checked').count(),1,'answers restored after reload');
 await page.getByRole('button',{name:'回答を確定して編集へ'}).click();
 await page.locator('#editor').waitFor();assert.equal(await page.locator('.disclosure-badge').count(),disclosed?1:0,'badge on edit draft');await page.locator('#editor').fill((await page.locator('#editor').inputValue())+'\n動作確認の追記。');await page.waitForTimeout(2000);page.once('dialog',d=>d.accept());await shot('06-edit');await page.locator('#submit-document').click();mark('submitted');
 await page.locator('input[type=range]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('input[name=tr_1]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('input[name=fmc_info]').first().waitFor();const legends=await page.locator('form fieldset legend').allInnerTexts();assert.equal(legends.length,12,'12 perception questions');assert.equal(await page.locator('.disclosure-badge').count(),0,'no badge on the perception re-show');assert.equal(await page.locator('.notice.disclosure').count(),0,'no disclosure notice on perception');await noOverflow();await shot('07-perception');
 await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('input[name=repair_need]').first().waitFor();await fillBlock();await page.locator('input[name=responsibility_influence][value="3"]').check();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('textarea[name=resp_free]').waitFor();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('input[name=memory]').first().waitFor();assert.equal(await page.locator('input[name=memory]').count(),3);await page.locator(`input[name=memory][value="${disclosed?0:1}"]`).check();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
 await page.locator('input[name=aias_1]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'回答を送信して終了する'}).click();
 await page.locator('#completion-keyword').waitFor();const kw=await page.locator('#final-keyword').inputValue();await shot('08-complete');mark('complete');
 await page.waitForTimeout(3000);const sync=await page.locator('#sync').innerText();
 const sessionId=(await page.evaluate(()=>fetch('/api/state').then(r=>r.json()))).sessionId;
 await ctx.close();
 report.runs.push({name,viewport,sessionId,disclosed,keyword:kw,syncStatus:sync,steps,consoleErrors,pageErrors,failedResponses:failed});
 return sessionId;
}
const ids=[];ids.push(await run('desktop',{width:1280,height:900}));ids.push(await run('mobile',{width:390,height:844}));
await browser.close();
// server-side verification of what was recorded
const sessions=(await all('sessions')).filter(s=>ids.includes(s.id));const cases=(await all('session_cases')).filter(c=>ids.includes(c.session_id));const responses=(await all('responses')).filter(r=>ids.includes(r.session_id));const events=(await all('events')).filter(e=>ids.includes(e.session_id));
const server=[];
for(const id of ids){const s=sessions.find(x=>x.id===id);const c=cases.find(x=>x.session_id===id);const resp=ph=>{const r=responses.find(x=>x.session_id===id&&x.phase===ph);return r?JSON.parse(r.value_json):null};const perc=resp('perception_1'),read=resp('read_1'),rec=resp('recall');
 const ok={protocol:s.protocol_version==='recipient-20260925-v8',complete:s.phase==='complete',condition:['baseline','missing_info','off_focus','source_deviation'].includes(s.condition)&&s.condition===c.condition,oneCase:cases.filter(x=>x.session_id===id).length===1,label:String(s.invitation_label||'').includes('動作確認 v8'),submitted:!!c.submitted_text&&c.submitted_text.includes('動作確認の追記'),fmcScored:!!perc&&['fmc_info','fmc_policy','fmc_accuracy'].every(k=>[0,1].includes(perc[k+'_correct'])),readSeconds:!!read&&read.read_seconds>=43,recallSaved:!!rec&&[0,1,2].includes(rec.memory),eventsRecorded:events.filter(e=>e.session_id===id).length>50};
 server.push({sessionId:id,condition:s.condition,disclosure:s.disclosure,case_id:s.case_id,read_seconds:read?.read_seconds,events:events.filter(e=>e.session_id===id).length,checks:ok,allOk:Object.values(ok).every(Boolean)});}
report.server=server;
await adm('campaign',{tokenHash:camp.tokenHash,open:false});report.campaignClosed=true;report.exclude={label:'動作確認 v8 自動',sessionIds:ids};
const clientOk=report.runs.every(r=>r.consoleErrors.length===0&&r.pageErrors.length===0&&r.failedResponses.length===0&&r.keyword);
report.pass=clientOk&&server.every(x=>x.allOk);
await writeFile('test-results/release-v8/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:report.pass,runs:report.runs.map(r=>({name:r.name,disclosed:r.disclosed,keyword:r.keyword,sync:r.syncStatus,consoleErrors:r.consoleErrors.length,pageErrors:r.pageErrors.length,failed:r.failedResponses,secondsToComplete:r.steps.at(-1).t})),server:server.map(x=>({condition:x.condition,disclosure:x.disclosure,case:x.case_id,read_seconds:x.read_seconds,events:x.events,allOk:x.allOk,failed:Object.entries(x.checks).filter(([,v])=>!v).map(([k])=>k)}))},null,1));
