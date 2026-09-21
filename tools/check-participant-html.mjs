import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const id=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('UUID required');
const dir=new URL('../.private/participant-review-20260921-'+id.slice(0,8)+'/',import.meta.url);
const raw=JSON.parse(await readFile(new URL('rawdata.json',dir),'utf8')).tables;
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(10000);
try{await page.goto(new URL('rawdata-viewer.html',dir).href);for(const [t,rows]of Object.entries(raw)){await page.locator('#table').selectOption(t);assert.equal(await page.locator('#body tr').count(),Math.min(rows.length,100));}
await page.locator('#table').selectOption('events');await page.locator('#search').fill('editor_input');assert.equal(await page.locator('#body tr').count(),0);await page.locator('#search').fill('');await page.locator('#next').click();assert.match(await page.locator('#count').textContent(),/101–200/);
await page.locator('#table').selectOption('sessions');const metaColumn=Object.keys(raw.sessions[0]).indexOf('meta_json');const cell=page.locator('#body tr').first().locator('td').nth(metaColumn);if(await cell.locator('summary').count())await cell.locator('summary').click();assert.match(await cell.textContent(),/"age"/);await page.screenshot({path:new URL('sessions-preview.png',dir).pathname,fullPage:true});
await page.locator('#table').selectOption('responses');await page.screenshot({path:new URL('rawdata-preview.png',dir).pathname,fullPage:true});assert.deepEqual(errors,[]);
await writeFile(new URL('html-check.json',dir),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),tables:Object.keys(raw),errors},null,2));console.log('PASS: 6 tables, search, pagination, demographic JSON expansion, no browser errors');
}finally{await browser.close()}
