import {chromium,webkit,firefox,expect} from '@playwright/test';
const engine=process.env.BROWSER||'chrome',pfx=engine==='chrome'?'':engine+'-';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:8791',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,await r.clone().text());return r.json()}
async function exported(table){let cursor='0',rows=[];do{const b=await adm(`export?table=${table}&cursor=${cursor}`);rows.push(...b.rows);cursor=b.next}while(cursor);return rows}
await mkdir('test-results',{recursive:true});
const browser=engine==='chrome'?await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):await ({webkit,firefox})[engine].launch({headless:true});
const results=[];let lastPage;const failedResponses=[];
const noOverflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const getState=page=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
async function waitPhase(page,phase){for(let t=0;t<300;t++){const s=await getState(page);if(s.phase===phase&&await page.evaluate(()=>!!document.querySelector('#app form, #app button')&&!document.querySelector('#app button:disabled')))return s;await page.waitForTimeout(150)}throw new Error('timeout waiting for '+phase)}
async function fillBlock(page,overrides={}){let st=await getState(page);for(let t=0;t<20&&!st.block;t++){await page.waitForTimeout(300);st=await getState(page)}assert(st.block,'block missing for '+st.phase+' '+JSON.stringify(st).slice(0,120));for(const q of st.block.questions){const v=overrides[q.id];if(q.type==='text'){await page.locator(`textarea[name="${q.id}"]`).fill(v??(q.required?'テストの回答です。':''));continue}if(q.type==='range'){await page.locator(`input[type=range][name="${q.id}"]`).evaluate((el,val)=>{el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},v??60);continue}await page.locator(`input[name="${q.id}"][value="${v??(q.type==='choice'?0:4)}"]`).check()}return st}
const next=async page=>{await page.getByRole('button',{name:'次へ',exact:true}).click()};
try{
const campaign=await adm('campaigns',{mode:'test',label:'browser campaign v5',keyword:'WORKSLOP',capacity:0});
for(const mobile of [false,true]){
const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});
const page=await context.newPage();lastPage=page;page.on('dialog',d=>d.accept());page.on('response',async r=>{if(r.status()>=400&&r.url().includes('/api/'))failedResponses.push({url:r.url(),status:r.status(),body:await r.text().catch(()=>null)})});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const tag=mobile?'mobile':'desktop';
const entryUrl=mobile?campaign.url:(await adm('invites',{mode:'test',count:1,label:'browser end-to-end '+tag})).invitations[0].url;
await page.goto(entryUrl);await page.locator('#consent').waitFor();await page.screenshot({path:`test-results/${pfx}consent-${tag}.png`,fullPage:true});if(mobile)assert.equal(await page.locator('#code').count(),0);
await page.locator('#consent').check();await page.locator('input[name="gender"][value="1"]').check();await page.locator('#age').fill('41');await page.getByRole('button',{name:'次ページ'}).click();await page.getByRole('heading',{name:'作業の説明'}).waitFor();
const state=await getState(page);assert(!state.condition);assert.equal(state.phase,'intro');assert.equal(state.casesTotal,4);
const second=await context.newPage();await second.goto(base);await second.getByRole('heading',{name:'別のタブで参加中です。'}).waitFor();await second.close();
await page.screenshot({path:`test-results/${pfx}intro-0-${tag}.png`,fullPage:true});await noOverflow(page);await next(page);
for(const [name,v]of [['bg_work',1],['bg_dom_1',0],['bg_dom_2',1],['bg_dom_3',0],['bg_ai',2],['ptt_1',4],['ptt_2',4],['ptt_3',4],['ptt_4',5]])await page.locator(`input[name="${name}"][value="${v}"]`).check();
if(!mobile){await page.getByRole('button',{name:'戻る',exact:true}).click();await next(page);await page.reload();await expect(page.locator('input[name="ptt_4"][value="5"]')).toBeChecked();}
await page.getByRole('button',{name:'最初の案件へ'}).click();
let original='',submitted='';
for(let i=1;i<=4;i++){
 const ms=await waitPhase(page,`materials_${i}`);assert.equal(ms.precheck.length,2);
 if(i===1){await page.screenshot({path:`test-results/${pfx}materials-1-${tag}.png`,fullPage:true});await noOverflow(page);
  for(const [name,v]of [['k0',0],['k1',1]])await page.locator(`input[name="${name}"][value="${v}"]`).check();await page.getByRole('button',{name:'報告案を受け取る'}).click();await page.getByText('答えが説明と合っていません').waitFor();}
 for(let j=0;j<ms.precheck.length;j++)await page.locator(`input[name="k${j}"][value="1"]`).check();
 await page.getByRole('button',{name:'報告案を受け取る'}).click();await page.locator('#read-done').waitFor();assert.equal(await page.locator('#editor').count(),0);
 await page.locator('details[data-source="S1"] > summary').click();if(i===1){await page.screenshot({path:`test-results/${pfx}read-${tag}.png`,fullPage:true});await noOverflow(page)}
 await page.locator('#read-done').click();await waitPhase(page,`cognition_${i}`);
 await fillBlock(page,{suff_2:2,tr_1:2});if(!mobile&&i===1){await page.reload();await expect(page.locator('input[name="suff_2"][value="2"]')).toBeChecked();}if(i===1){await page.screenshot({path:`test-results/${pfx}cognition-${tag}.png`,fullPage:true});await noOverflow(page)}await page.getByRole('button',{name:'回答を確定して編集へ'}).click();
 await page.locator('#editor').waitFor();await expect(page.locator('#editor')).toBeEditable();
 const orig=await page.locator('#editor').inputValue();let sub=orig;
 if(!mobile&&i===1){await page.locator('#editor').focus();await page.locator('#editor').press('ControlOrMeta+End');await page.keyboard.insertText('\n確認記録と訓練の実施体制を確認する。');sub=await page.locator('#editor').inputValue();assert.notEqual(sub,orig);
  await context.setOffline(true);await page.keyboard.insertText('\n費用見積もりも確認する。');sub=await page.locator('#editor').inputValue();await page.waitForTimeout(2300);await context.setOffline(false);await page.reload();await page.locator('#editor').waitFor();await expect(page.locator('#editor')).toBeEditable();assert.equal(await page.locator('#editor').inputValue(),sub);
  await page.locator('#editor').evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{data:''}));el.dispatchEvent(new CompositionEvent('compositionupdate',{data:'へんかん'}));el.dispatchEvent(new CompositionEvent('compositionend',{data:'変換'}))});original=orig;submitted=sub;}
 if(i===1)await page.screenshot({path:`test-results/${pfx}edit-${tag}.png`,fullPage:true});
 await page.locator('#submit-document').click();await waitPhase(page,`post_${i}`);
 if(i===1){await page.locator('input[name="effort_total"][value="3"]').check();await next(page);await expect(page.locator('#error')).toContainText('つまみを動かして');}
 await fillBlock(page,{effort_total:3,tlx_fr:5});if(i===1){await page.screenshot({path:`test-results/${pfx}post-${tag}.png`,fullPage:true});await noOverflow(page)}await next(page);
 await waitPhase(page,`trust_post_${i}`);await fillBlock(page,{tr_1:3});await next(page);
 await waitPhase(page,`perception_${i}`);assert.equal(await page.getByText('この下書きの作成には生成AIを使用しています。').count(),0);await fillBlock(page);await next(page);
 {let st;for(let t=0;t<200;t++){st=await getState(page);if(st.phase!==`perception_${i}`)break;await page.waitForTimeout(150)}assert.equal(st.phase,`responsibility_${i}`);await waitPhase(page,`responsibility_${i}`);await fillBlock(page,{sender_control:3,responsibility_influence:0});if(i===1){await page.screenshot({path:`test-results/${pfx}responsibility-${tag}.png`,fullPage:true});await noOverflow(page)}await next(page)}
}
await waitPhase(page,'reflection');await fillBlock(page,{resp_free:'特にありません。'});await next(page);
await waitPhase(page,'recall');await fillBlock(page,{memory:2,belief:3});await page.screenshot({path:`test-results/${pfx}recall-${tag}.png`,fullPage:true});await page.getByRole('button',{name:'回答を送信して終了する'}).click();await page.getByRole('heading',{name:'ご参加ありがとうございました。'}).waitFor();await page.waitForFunction(()=>document.getElementById('sync').textContent==='保存済み');
await expect(page.locator('#final-keyword')).toHaveValue('21wra0966');await page.locator('#copy-keyword').click();await expect(page.locator('#copy-status')).toContainText('コピー');
await page.locator('#final-keyword').waitFor();assert.equal(await page.locator('#completion-code').count(),0);await page.screenshot({path:`test-results/${pfx}complete-${tag}.png`,fullPage:true});
const session=(await exported('sessions')).find(x=>x.id===state.sessionId);assert.equal(session.phase,'complete');assert.equal(session.attempts,5);
const scases=(await exported('session_cases')).filter(x=>x.session_id===state.sessionId).sort((a,b)=>a.idx-b.idx);assert.equal(scases.length,4);if(!mobile)assert.equal(scases[0].submitted_text,submitted);assert.equal(new Set(scases.map(x=>x.case_id)).size,4);
const logs=(await exported('events')).filter(x=>x.session_id===state.sessionId);for(const t of ['phase_render','instruction_step','source_open','answer_change','click','scroll'])assert(logs.some(e=>e.type===t),t);if(!mobile)for(const t of ['editor_input','editor_snapshot'])assert(logs.some(e=>e.type===t),t);
for(const name of ['suff_1','tlx_md','sender_control','responsibility_influence','perc_5','k0','memory'])assert(logs.some(e=>e.type==='answer_change'&&JSON.parse(e.payload_json).name===name),name);
assert(logs.some(e=>e.phase==='cognition_2'));
if(!mobile){const changes=logs.filter(x=>x.type==='editor_input'&&x.phase==='edit_1').map(x=>JSON.parse(x.payload_json));let text=original;for(const e of changes){const p=e.patch;assert.equal(text.slice(p.start,p.start+p.removed.length),p.removed);text=text.slice(0,p.start)+p.inserted+text.slice(p.start+p.removed.length)}assert.equal(text,submitted)}
assert.equal(new Set(logs.map(e=>e.event_id)).size,logs.length);assert.deepEqual(errors,[]);results.push({engine,viewport:tag,entry:mobile?'campaign':'invite',session:state.sessionId,phase:session.phase,eventCount:logs.length,cases:scases.length,domErrors:errors});
const nextInvite=(await adm('invites',{mode:'test',count:1,label:'same browser restart verification'})).invitations[0];await page.goto(nextInvite.url);await page.locator('#consent').waitFor();await page.locator('#consent').check();await page.locator('input[name="gender"][value="3"]').check();await page.locator('#age').fill('29');await page.getByRole('button',{name:'次ページ'}).click();await page.getByRole('heading',{name:'作業の説明'}).waitFor();await page.locator('#withdraw').click();await page.getByRole('heading',{name:'参加を中止しました。'}).waitFor();await context.close();
}
const ctx=await browser.newContext();const page=await ctx.newPage();await page.goto(base+'/admin');await page.locator('#key').fill(key);await page.getByRole('button',{name:'ログイン',exact:true}).click();await page.getByRole('heading',{name:'参加と記録の管理'}).waitFor();await page.locator('#campaign-list table').waitFor();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'参加者別CSV'}).click();const file=await downloadPromise;await file.saveAs('test-results/participants.csv');const csvText=await readFile('test-results/participants.csv','utf8');for(const col of ['cognition_1.suff_1','cognition_1.readcheck_correct','post_3.tlx_md','trust_post_2.tr_1','responsibility_2.responsibility_influence','perception_3.perc_6','background.ptt_1','reflection.resp_free','recall.memory','case_2','condition_3','sequence'])assert(csvText.includes(col),col);await page.screenshot({path:'test-results/admin.png',fullPage:true});await ctx.close();
await writeFile(`test-results/${pfx}browser-verification.json`,JSON.stringify({testedAt:new Date().toISOString(),base,engine,results,adminCSV:true},null,2));console.log(JSON.stringify(results,null,2));
}catch(e){if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:'test-results/failure.png',fullPage:true});console.error(await lastPage.locator('#error').textContent())}console.error(JSON.stringify(failedResponses));throw e}finally{await browser.close()}
