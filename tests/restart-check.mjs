// Withdrawal → restart button → new session from the same browser (open entry).
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8791',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,path+' '+r.status);return r.json()}
const before=(await adm('status')).config;const camp=await adm('campaigns',{mode:'test',label:'restart check',capacity:0});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{await adm('config',{defaultCampaign:camp.tokenHash});
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();page.on('dialog',d=>d.accept());
 const consent=async()=>{await page.locator('#consent').waitFor();await page.check('#consent');await page.check('input[name=gender][value="1"]');await page.fill('#age','40');await page.click('button[type=submit]');await page.getByRole('button',{name:'次へ',exact:true}).waitFor()};
 await page.goto(base+'/');await consent();const s1=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
 await page.click('#withdraw');await page.locator('#restart').waitFor();
 assert.equal(await page.locator('#completion-code').count(),0,'no completion code on withdrawal');assert.equal(await page.getByRole('heading',{name:'課題についての説明'}).count(),0,'no debrief on withdrawal');
 await page.click('#restart');await consent();const s2=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
 assert.notEqual(s1.sessionId,s2.sessionId);assert.equal(s2.phase,'intro');
 console.log(JSON.stringify({restart:'ok',first:s1.sessionId.slice(0,8),second:s2.sessionId.slice(0,8)}));
}finally{await adm('config',{defaultCampaign:before.defaultCampaign||''});await adm('campaign',{tokenHash:camp.tokenHash,open:false});await browser.close()}
