// User-authorized remote Playwright end-to-end test, using the normal root URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base='https://handoff-research.research-public.workers.dev';
const out=new URL('./',import.meta.url);
const key=(await readFile(new URL('../../.private/admin-key.txt',import.meta.url),'utf8')).trim();
async function admin(path){const r=await fetch(base+'/api/admin/'+path,{headers:{authorization:'Bearer '+key}});assert.equal(r.status,200,path);return r.json()}
async function exported(table,from,to){const rows=[];let cursor='0';do{const r=await admin('export?'+new URLSearchParams({table,from,to,cursor}));rows.push(...r.rows);cursor=r.next}while(cursor);return rows}
const jsonFields={sessions:['plan_json','consent_json','meta_json','question_order'],responses:['value_json'],events:['payload_json'],versions:['snapshot_json']};
test('REMOTE browser: consent, four cases, editing, autosave, reload, completion, raw export',{timeout:300000},async()=>{
 const from=new Date().toISOString(),runId='remote-e2e-'+Date.now();const stimulus=await admin('stimulus');
 const manifest={runId,kind:'synthetic Playwright interaction verification, not research observations',from,steps:[],edits:[],screenshots:[],browserErrors:[],failedRequests:[]};let s;
 const browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo'});const page=await context.newPage();
 page.setDefaultTimeout(20000);page.on('dialog',dialog=>dialog.accept());page.on('pageerror',e=>manifest.browserErrors.push(String(e.message)));page.on('requestfailed',r=>manifest.failedRequests.push({url:r.url(),reason:r.failure()?.errorText}));
 async function screenshot(name){await page.screenshot({path:new URL(name,out).pathname,fullPage:true});manifest.screenshots.push(name)}
 async function ready(st){if(st.phase==='intro')await page.getByRole('heading',{name:'作業の説明',exact:true}).waitFor();else if(st.phase.startsWith('materials_'))await page.getByRole('button',{name:'報告案を受け取る',exact:true}).waitFor();else if(st.phase.startsWith('read_'))await page.locator('#read-done').waitFor();else if(st.phase.startsWith('edit_'))await page.locator('#editor').waitFor();else if(st.phase==='complete')await page.getByRole('heading',{name:'ご参加ありがとうございました。',exact:true}).waitFor();else if(st.block)await page.getByRole('heading',{name:st.block.title,exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('#app button:disabled'));}
 async function advance(button){const response=page.waitForResponse(r=>r.url()===base+'/api/action'&&r.request().method()==='POST');await button.click();const r=await response;const next=await r.json();assert.equal(r.status(),200,JSON.stringify(next));manifest.steps.push({from:s.phase,to:next.phase,revision:next.revision,at:new Date().toISOString()});s=next;await ready(s);await writeFile(new URL('e2e-progress.json',out),JSON.stringify({sessionId:s.sessionId,...manifest},null,2));}
 async function answerBlock(st){for(const q of st.block.questions){const selector=`[name="${q.id}"]`;if(q.type==='range'){const el=page.locator(selector);await el.press('Home');await el.press('ArrowRight');}
 else if(q.type==='text')await page.locator(selector).fill(q.required?'動作確認用の自動入力です。':'');
 else{let v=q.type==='choice'?0:Math.min(q.max,Math.max(q.min,4));if(q.id==='readcheck'){const i=q.options.indexOf(st.caseTitle);if(i>=0)v=i}await page.locator(`input[name="${q.id}"][value="${v}"]`).check();}}}
 try{
  await page.goto(base+'/');await page.locator('#consent').waitFor();assert.equal(await page.locator('#code').count(),0);await screenshot('e2e-01-consent.png');
  await page.locator('#consent').check();await page.locator('input[name="gender"][value="3"]').check();await page.locator('#age').fill('30');
  const startResponse=page.waitForResponse(r=>r.url()===base+'/api/start'&&r.request().method()==='POST');await page.getByRole('button',{name:'次ページ',exact:true}).click();const r=await startResponse;s=await r.json();assert.equal(r.status(),200);manifest.sessionId=s.sessionId;await ready(s);
  await page.getByRole('button',{name:'次へ',exact:true}).click();await answerBlock(s);await advance(page.getByRole('button',{name:'最初の案件へ',exact:true}));
  for(let guard=0;s.phase!=='complete'&&guard<60;guard++){
   const phase=s.phase.replace(/_\d+$/,''),idx=Number(s.phase.match(/_(\d+)$/)?.[1]||0);
   if(phase==='materials'){for(let i=0;i<s.precheck.length;i++)await page.locator(`input[name="k${i}"][value="${stimulus.cases.common.precheck[i].answer}"]`).check();await advance(page.getByRole('button',{name:'報告案を受け取る',exact:true}));}
   else if(phase==='read'){
    const summaries=page.locator('details[data-source] > summary');for(let i=0;i<Math.min(2,await summaries.count());i++)await summaries.nth(i).click();
    await page.locator('#draft').hover();await page.mouse.wheel(0,650);if(idx===1)await screenshot('e2e-02-read.png');await advance(page.locator('#read-done'));
   }else if(phase==='edit'){
    const editor=page.locator('#editor'),before=await editor.inputValue();
    if(idx!==3){await editor.click();await editor.press('ControlOrMeta+End');await editor.pressSequentially('\n\n動作確認用の追記です。資料の適用条件を確認します。',{delay:8});
     if(idx===2){await editor.pressSequentially(' TEMP',{delay:10});for(let i=0;i<5;i++)await editor.press('Backspace');}
     const expected=await editor.inputValue();await page.waitForResponse(r=>r.url()===base+'/api/draft'&&r.request().method()==='POST'&&r.status()===200,{timeout:15000});
     const stored=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(stored.draftText,expected);
     if(idx===2){await page.reload();await page.locator('#editor').waitFor();assert.equal(await page.locator('#editor').inputValue(),expected);const afterReload=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(afterReload.sessionId,s.sessionId);manifest.reloadVerified=true;}
    }
    const after=await page.locator('#editor').inputValue();manifest.edits.push({idx,before,after,changed:before!==after});if(idx===2)await screenshot('e2e-03-edit.png');await advance(page.locator('#submit-document'));
   }else if(s.block){await answerBlock(s);await advance(page.locator('#app form button[type="submit"]').first());}
   else throw Error('Unexpected phase '+s.phase);
  }
  assert.equal(s.phase,'complete');assert.equal(manifest.edits.length,4);await page.waitForFunction(()=>document.querySelector('#sync')?.textContent==='保存済み');await screenshot('e2e-04-complete.png');manifest.completed=true;
  // Browser and server must both have all locally queued records flushed.
  const pending=await page.evaluate(()=>new Promise((resolve,reject)=>{const names=indexedDB.databases();names.then(async ds=>{const counts=[];for(const d of ds){const r=indexedDB.open(d.name);await new Promise((ok,err)=>{r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('events')){db.close();ok();return}const req=db.transaction('events').objectStore('events').count();req.onsuccess=()=>{counts.push(req.result);db.close();ok()};req.onerror=err};r.onerror=err})}resolve(counts.reduce((a,b)=>a+b,0))}).catch(reject)}));assert.equal(pending,0);manifest.pendingBrowserEvents=pending;
 }catch(e){manifest.error=String(e.stack||e);try{await screenshot('e2e-error.png')}catch{}throw e}
 finally{
  manifest.to=new Date().toISOString();await browser.close();
  if(manifest.sessionId){const raw={};for(const table of ['sessions','session_cases','responses','actions','events'])raw[table]=(await exported(table,from,manifest.to)).filter(r=>(table==='sessions'?r.id:r.session_id)===manifest.sessionId);
   const versions=await exported('versions',from,manifest.to);raw.versions=versions.filter(r=>r.version===raw.sessions[0]?.protocol_version);
   const decoded=Object.fromEntries(Object.entries(raw).map(([table,rows])=>[table,rows.map(r=>{const copy={...r};for(const f of jsonFields[table]||[])if(typeof copy[f]==='string'){try{copy[f.replace(/_json$/,'')]=JSON.parse(copy[f])}catch{}}return copy})]));
   manifest.savedCounts=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.length]));manifest.uniqueEvents=new Set(raw.events.map(r=>r.page_id+'|'+r.seq)).size;
   manifest.perPageSequences=Object.values(Object.groupBy(raw.events,r=>r.page_id)).map(rows=>{const seq=rows.map(r=>r.seq).sort((a,b)=>a-b);return {pageId:rows[0].page_id,count:seq.length,min:seq[0],max:seq.at(-1),contiguous:seq.every((v,i)=>v===i+1)}});
   manifest.eventTypes=raw.events.reduce((m,e)=>(m[e.type]=(m[e.type]||0)+1,m),{});
   manifest.submissionsMatch=manifest.edits.every(e=>raw.session_cases.find(r=>r.idx===e.idx)?.submitted_text===e.after);
   await writeFile(new URL('rawdata-e2e.json',out),JSON.stringify({manifest,raw,decoded,questionnaire:stimulus.measurement,caseMetadata:stimulus.cases.cases.map(c=>({id:c.id,title:c.title}))},null,2));
   await writeFile(new URL('e2e-results.json',out),JSON.stringify(manifest,null,2));console.log(JSON.stringify({sessionId:manifest.sessionId,completed:manifest.completed,counts:manifest.savedCounts,eventTypes:manifest.eventTypes,submissionsMatch:manifest.submissionsMatch,pendingBrowserEvents:manifest.pendingBrowserEvents,errors:manifest.browserErrors}));
   if(manifest.completed){assert.equal(raw.sessions[0].phase,'complete');assert.equal(raw.session_cases.length,4);assert.equal(manifest.submissionsMatch,true);assert.equal(manifest.uniqueEvents,raw.events.length);assert(manifest.perPageSequences.every(p=>p.contiguous));assert.equal(manifest.browserErrors.length,0);}
  }
 }
});
