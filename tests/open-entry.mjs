// Open entry check: the top URL (no #invite/#entry) must start a session in the default campaign.
// Temporarily points the default campaign at a fresh test campaign and restores the previous value.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.TEST_URL||'http://localhost:8791',key=process.env.ADMIN_KEY||'local-test-admin-key';
async function adm(path,body){const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});assert(r.ok,path+' '+r.status+' '+await r.clone().text());return r.json()}
const before=(await adm('status')).config.defaultCampaign||'';
const camp=await adm('campaigns',{mode:'test',label:'open-entry check',capacity:0});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 await adm('config',{defaultCampaign:camp.tokenHash});
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();const failed=[];page.on('requestfailed',r=>failed.push(r.url()+' '+r.failure()?.errorText));
 await page.goto(base+'/');await page.locator('#consent').waitFor();
 assert.equal(await page.locator('#code').count(),0,'code field must be hidden for open entry');
 await page.check('#consent');await page.check('input[name=gender][value="2"]');await page.fill('#age','45');await page.click('button[type=submit]');
 await page.getByRole('button',{name:'次へ',exact:true}).waitFor({timeout:20000});
 const st=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));assert.equal(st.phase,'intro');assert.equal(st.casesTotal,4);
 await page.getByRole('button',{name:'次へ',exact:true}).click();
 for(const [name,v] of [['bg_work',1],['bg_dom_1',0],['bg_dom_2',1],['bg_dom_3',0],['bg_ai',2],['ptt_1',4],['ptt_2',4],['ptt_3',4],['ptt_4',5]])await page.locator(`input[name="${name}"][value="${v}"]`).check();
 await page.getByRole('button',{name:'最初の案件へ'}).click();
 let s2;for(let t=0;t<60;t++){s2=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));if(s2.phase==='materials_1')break;await page.waitForTimeout(250)}
 assert.equal(s2.phase,'materials_1');assert.deepEqual(failed,[]);
 const camps=(await adm('campaigns')).campaigns.find(c=>c.token_hash===camp.tokenHash);assert.equal(camps.started,1);
 console.log(JSON.stringify({openEntry:'ok',base,session:st.sessionId,phase:s2.phase,mode:camps.mode}));
}finally{await adm('config',{defaultCampaign:before});await adm('campaign',{tokenHash:camp.tokenHash,open:false});await browser.close();console.log('default campaign restored to',before?before.slice(0,8)+'…':'(none)')}
