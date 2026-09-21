import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('local HTML: raw tables and methods render without errors',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.goto(new URL('rawdata-viewer.html',import.meta.url).href);
 assert.equal(await p.locator('#body tr').count(),35);
 for(const [name,count]of [['sessions',1],['session_cases',4],['responses',35],['actions',35],['events',100],['versions',1]]){
 await p.locator('#table').selectOption(name);assert.equal(await p.locator('#body tr').count(),count,name);
 }
 await p.locator('#table').selectOption('events');await p.locator('#search').fill('editor_input');assert.match(await p.locator('#count').textContent(),/^91行/);
 await p.locator('#search').fill('');await p.locator('#next').click();assert.match(await p.locator('#count').textContent(),/101–200/);
 await p.locator('#table').selectOption('responses');await p.locator('#body summary').first().click();
 await p.screenshot({path:new URL('rawdata-list-preview.png',import.meta.url).pathname,fullPage:true});
 await p.goto(new URL('methods-measures.html',import.meta.url).href);assert.equal(await p.locator('section').count(),10);
 await p.screenshot({path:new URL('methods-preview.png',import.meta.url).pathname,fullPage:false});
 assert.deepEqual(errors,[]);await writeFile(new URL('html-check.json',import.meta.url),JSON.stringify({passed:true,errors,checkedAt:new Date().toISOString(),tables:6},null,2));
 }finally{await browser.close()}
});
