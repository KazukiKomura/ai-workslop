// v8 walkthrough in a real browser against a local dev server: consent -> intro -> precheck -> read (gate) -> cognition -> edit -> post -> trust -> perception (factual MCs) -> responsibility -> reflection -> recall -> attitude -> complete.
// Usage: TEST_URL=http://localhost:8795 node tests/browser-v8.mjs   (set READ_GATE_SECONDS in .dev.vars to a small value for a quick run)
import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const base=process.env.TEST_URL||'http://localhost:8795',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,await r.clone().text());return r.json()}
await mkdir('test-results',{recursive:true});
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=existsSync(chrome)?await chromium.launch({headless:true,executablePath:chrome}):await webkit.launch({headless:true});
const camp=await adm('campaigns',{label:'v8 browser walkthrough',keyword:'V8TEST'});
const page=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const fillBlock=async()=>{for(const fs of await page.locator('form fieldset').all()){const radios=fs.locator('input[type=radio]');if(await radios.count()){await radios.nth(Math.min(3,await radios.count()-1)).check();continue}const range=fs.locator('input[type=range]');if(await range.count()){await range.first().evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))});continue}}};
const phase=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()).then(s=>s.phase));
await page.goto(base+'/#entry='+camp.token);await page.locator('#consent').waitFor();
const consentText=await page.locator('.consent-screen').innerText();assert(consentText.includes('1 件の案件'),'consent mentions one case');assert(!consentText.includes('制限時間')&&!/分以内/.test(consentText),'no time-limit wording');assert(consentText.includes('10〜20 分'),'duration text');
await page.locator('#consent').check();await page.locator('input[name=gender][value="1"]').check();await page.fill('#age','35');await page.getByRole('button',{name:'次ページ'}).click();
await page.locator('[data-instruction-step="0"] h2').waitFor();const intro=await page.locator('[data-instruction-step="0"]').innerText();assert(intro.includes('1 件の案件を担当'),'intro one case');assert(intro.includes('回答は注意深く確認します'),'audit notice');assert(!/分以内/.test(intro),'no time-limit wording in intro');
await page.getByRole('button',{name:'次へ'}).click();await fillBlock();await page.getByRole('button',{name:'最初の案件へ'}).click();
await page.locator('.request-body').waitFor();const req=await page.locator('.request-body').innerText();assert(/　A\./.test(req)&&/　D\./.test(req),'A–D labelled request');
for(const [i,ans] of [[0,1],[1,1]])await page.locator(`input[name=k${i}][value="${ans}"]`).check();await page.getByRole('button',{name:'報告案を受け取る'}).click();
await page.locator('#read-done').waitFor();const gate=await page.evaluate(()=>fetch('/api/config').then(r=>r.json()).then(c=>c.readGateSeconds));
if(gate>0){assert.equal(await page.locator('#read-done').isDisabled(),true,'gate closed at render');assert((await page.locator('#read-done').innerText()).includes('秒'),'countdown label');}
const readText=await page.locator('.task-instruction').innerText();assert(readText.includes('何が書かれていたかを尋ね'),'forewarning');const stRead=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));const msg=await page.locator('.handoff-message').innerText();assert(msg.includes('報告案を作りました')&&msg.includes(stRead.sender),'colleague handoff message rendered');assert.equal(msg.includes('生成AI'),!!stRead.disclosureText,'handoff message matches disclosure arm');assert.equal(await page.locator('.disclosure-badge').count(),stRead.disclosureText?1:0,'badge matches arm');
await page.screenshot({path:'test-results/v8-read-gate.png'});
await page.waitForFunction(()=>{const b=document.getElementById('read-done');return b&&!b.disabled},null,{timeout:(gate+5)*1000});assert.equal(await page.locator('#read-done').innerText(),'読み終わったので質問に進む');
await page.locator('#read-done').click();await page.locator('input[name=readcheck]').first().waitFor();assert.equal(await phase(),'cognition_1');
await page.locator('input[name=readcheck][value="0"]').check();await fillBlock();await page.getByRole('button',{name:'回答を確定して編集へ'}).click();
await page.locator('#editor').waitFor();assert.equal(await page.locator('.disclosure-badge').count(),stRead.disclosureText?1:0,'badge on edit screen');await page.locator('#editor').fill((await page.locator('#editor').inputValue())+'\n追記。');page.once('dialog',d=>d.accept());await page.locator('#submit-document').click();
await page.locator('input[type=range]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
await page.locator('input[name=tr_1]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
await page.locator('input[name=fmc_info]').first().waitFor();assert.equal(await phase(),'perception_1');const percForm=await page.locator('form').innerText();assert(percForm.includes('届いたときの報告案についてです。次の3つは'),'fmc instruction follows the block instruction');assert(percForm.indexOf('fmc')<0);
const legends=await page.locator('form fieldset legend').allInnerTexts();assert(legends[0].includes('報告案')&&legends.length===12,'12 perception questions, factual first: '+legends.length);
await page.screenshot({path:'test-results/v8-perception-fmc.png',fullPage:false});
await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
await page.locator('input[name=repair_need]').first().waitFor();await fillBlock();await page.locator('input[name=responsibility_influence][value="3"]').check();await page.getByRole('button',{name:'次へ'}).click();
await page.locator('textarea[name=resp_free]').waitFor();const refl=await page.locator('form').innerText();assert(refl.includes('今回の案件を通して'),'reflection wording');await page.getByRole('button',{name:'次へ'}).click();
await page.locator('input[name=memory]').first().waitFor();assert.equal(await page.locator('input[name=memory]').count(),3,'recall memory has 3 options');await page.locator('input[name=memory][value="2"]').check();await fillBlock();await page.getByRole('button',{name:'次へ'}).click();
await page.locator('input[name=aias_1]').first().waitFor();await fillBlock();await page.getByRole('button',{name:'回答を送信して終了する'}).click();
await page.locator('#completion-keyword').waitFor();const kw=await page.locator('#final-keyword').inputValue();const cfgKw=(await adm('status')).config.finalKeyword||'';assert.equal(kw,cfgKw||'V8TEST','study-wide keyword takes precedence over the campaign keyword');await page.screenshot({path:'test-results/v8-complete.png'});
assert.deepEqual(errors,[]);
await adm('campaign',{tokenHash:camp.tokenHash,open:false});
await browser.close();console.log(JSON.stringify({ok:true,gate,engine:existsSync(chrome)?'chrome':'webkit'}));
