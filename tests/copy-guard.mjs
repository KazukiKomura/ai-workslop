// Copy guard check: report/source text cannot be copied; small in-editor copies are allowed; whole-editor copies are blocked; events are logged.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8791',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,path+' '+r.status);return r.json()}
async function events(session){let cursor='0',rows=[];do{const b=await adm(`export?table=events&cursor=${cursor}`);rows.push(...b.rows.filter(x=>x.session_id===session));cursor=b.next}while(cursor);return rows}
const inv=await adm('invites',{count:1,mode:'test',label:'copy guard check'});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.grantPermissions(['clipboard-read','clipboard-write']);const page=await ctx.newPage();
const st=()=>page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
const clip=()=>page.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
try{
 await page.goto(inv.invitations[0].url);await page.locator('#consent').waitFor();await page.check('#consent');await page.check('input[name=gender][value="1"]');await page.fill('#age','40');await page.click('button[type=submit]');
 await page.getByRole('button',{name:'次へ',exact:true}).click();
 for(const [n,v] of [['bg_work',1],['bg_dom_1',0],['bg_dom_2',1],['bg_dom_3',0],['bg_ai',2],['ptt_1',4],['ptt_2',4],['ptt_3',4],['ptt_4',5]])await page.locator(`input[name="${n}"][value="${v}"]`).check();
 await page.getByRole('button',{name:'最初の案件へ'}).click();await page.getByRole('button',{name:'報告案を受け取る'}).waitFor();
 const s1=await st();const answers=s1.precheck.length;for(let i=0;i<answers;i++)await page.locator(`input[name="k${i}"][value="1"]`).check();await page.getByRole('button',{name:'報告案を受け取る'}).click();
 await page.locator('#read-done').waitFor();
 // 1. copy from the report view must be blocked
 await page.evaluate(()=>navigator.clipboard.writeText('SENTINEL'));
 await page.evaluate(()=>{const el=document.querySelector('#draft');const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r)});
 await page.keyboard.press('Meta+C');await page.waitForTimeout(300);
 const afterReport=await clip();console.log('report copy → clipboard:',JSON.stringify(afterReport.slice(0,30)),'| selectable text length:',await page.evaluate(()=>getSelection().toString().length));
 assert.equal(afterReport,'SENTINEL','report text must not reach the clipboard');
 // 2. source text: open S1 and try
 await page.locator('details[data-source="S1"] > summary').click();
 await page.evaluate(()=>{const el=document.querySelector('[data-track="S1"]');const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r)});
 await page.keyboard.press('Meta+C');await page.waitForTimeout(300);assert.equal(await clip(),'SENTINEL','source text must not reach the clipboard');
 // go to cognition then edit
 await page.click('#read-done');await page.locator('#app form').waitFor();
 const names=await page.$$eval('#app form input[type=radio]',els=>[...new Set(els.map(e=>e.name))]);for(const n of names)await page.locator(`input[name="${n}"][value="4"]`).check();
 await page.getByRole('button',{name:'回答を確定して編集へ'}).click();await page.locator('#editor').waitFor();
 // 3. small in-editor copy allowed
 await page.evaluate(()=>{const ed=document.querySelector('#editor');ed.focus();ed.setSelectionRange(0,20)});await page.keyboard.press('Meta+C');await page.waitForTimeout(300);
 const small=await clip();assert.equal(small.length,20,'20-char in-editor copy must be allowed');
 // 4. whole-editor copy blocked
 await page.evaluate(()=>navigator.clipboard.writeText('SENTINEL2'));
 await page.evaluate(()=>{const ed=document.querySelector('#editor');ed.focus();ed.select()});await page.keyboard.press('Meta+C');await page.waitForTimeout(300);
 assert.equal(await clip(),'SENTINEL2','whole-editor copy must be blocked');
 const notice=await page.locator('#error').textContent();assert(notice.includes('コピーできません'),'notice shown');
 // 5. paste into editor is logged
 await page.evaluate(()=>navigator.clipboard.writeText('追記テキスト'));await page.evaluate(()=>{const ed=document.querySelector('#editor');ed.focus();ed.setSelectionRange(ed.value.length,ed.value.length)});await page.keyboard.press('Meta+V');await page.waitForTimeout(2500);
 const ev=await events(s1.sessionId);const types=t=>ev.filter(e=>e.type===t);
 console.log(JSON.stringify({copy_blocked:types('copy_blocked').length,editor_copy:types('editor_copy').length,page_paste:types('page_paste').length,paste_chars:types('page_paste').map(e=>JSON.parse(e.payload_json).chars)}));
 assert(types('copy_blocked').length>=3&&types('editor_copy').length>=1&&types('page_paste').length>=1);
 console.log('copy guard: ok');
}finally{await browser.close()}
