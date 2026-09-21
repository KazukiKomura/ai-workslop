// Read-only production verification. Never consent or submit responses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const base='https://handoff-research.research-public.workers.dev';
const entry='04c5b0a0-2396-46e0-9b72-c76659b7d0b5cac62f99';
test('deployed shared link: one participant flow, no app-side participant quota',async()=>{
 const key=(await readFile(new URL('../../.private/admin-key.txt',import.meta.url),'utf8')).trim();
 async function get(path,admin=false){const r=await fetch(base+path,{headers:admin?{authorization:'Bearer '+key}:{}});assert.equal(r.status,200,path);return r.json()}
 const campaignHash=createHash('sha256').update(entry).digest('hex');
 const campaigns=await get('/api/admin/campaigns',true),status=await get('/api/admin/status',true),config=await get('/api/config');
 assert.equal(config.defaultCampaign,campaignHash);
 const c=campaigns.campaigns.find(x=>x.token_hash===campaignHash);assert(c);assert.equal(c.mode,'live');assert.equal(c.open,1);assert.equal(config.enrollmentOpen,true);assert(!('completion_target'in c));assert(!('capacity'in c));assert(!('researcher'in config));assert(!('finalKeyword'in config));
 const hashes={};for(const file of ['app.js','admin.js']){const remote=await fetch(base+'/'+file).then(r=>r.text());assert.equal(remote,await readFile(new URL('../../public/'+file,import.meta.url),'utf8'));hashes[file]=createHash('sha256').update(remote).digest('hex')}
 const browser=await chromium.launch({headless:true,channel:'chrome'});try{const page=await browser.newPage();await page.route('**/api/**',async route=>{assert.equal(route.request().method(),'GET','Read-only verification must not submit');await route.continue()});await page.goto(base+'/');await page.locator('#consent').waitFor();assert.equal(await page.locator('#consent').isChecked(),false);assert.equal(await page.locator('#code').count(),0);assert.equal(await page.locator('#restart-any').count(),0);await page.screenshot({path:new URL('public-entry.png',import.meta.url).pathname,fullPage:true});}finally{await browser.close()}
 const evidence={verifiedAt:new Date().toISOString(),url:base+'/',explicitEntryUrl:base+'/#entry='+entry,defaultCampaignMatches:true,protocol:status.version,casesPerParticipant:status.casesPerParticipant,allocation:'independent AI disclosure Bernoulli(0.5); all four content states within participant',appSideParticipantQuota:false,oneParticipantFlow:true,started:c.started,completed:c.completed,assetHashes:hashes,missingConsentFields:['affiliation','operator','contact','retention'].filter(k=>!status.config[k])};
 await writeFile(new URL('deployment.json',import.meta.url),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
});
