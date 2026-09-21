import {chromium,expect} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import CASE from '../src/case.js';
const base='https://handoff-research.research-public.workers.dev';
const key=readFileSync(new URL('../.private/admin-key.txt',import.meta.url),'utf8').trim();
const out=new URL('../../research-analysis-20260919/manuscript/figures/',import.meta.url);mkdirSync(out,{recursive:true});
const r=await fetch(base+'/api/admin/invites',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({mode:'test',count:1,label:'manuscript screenshots 20260919'})});if(!r.ok)throw Error('Cannot create test invitation');
const invitation=(await r.json()).invitations[0];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const ctx=await browser.newContext({viewport:{width:1440,height:1120},deviceScaleFactor:2});const page=await ctx.newPage();const shots=[];
async function shot(name){await page.evaluate(()=>document.fonts.ready);await page.locator(['screen-role','screen-request','screen-effort'].includes(name)?'.narrow':'#app').screenshot({path:new URL(name+'.png',out).pathname});shots.push(name+'.png')}
try{
await page.goto(invitation.url);await page.locator('#consent').check();await page.getByRole('button',{name:'同意して開始する'}).click();await page.getByRole('heading',{name:'作業の説明'}).waitFor();await expect(page.getByRole('button',{name:'次へ',exact:true})).toBeEnabled();await shot('screen-role');
await page.getByRole('button',{name:'次へ',exact:true}).click();await shot('screen-request');await page.getByRole('button',{name:'次へ',exact:true}).click();
for(const [name,v] of [['experience',0],['trust',4]])await page.locator(`input[name="${name}"][value="${v}"]`).check();await page.getByRole('button',{name:'次へ',exact:true}).click();
for(const [name,v]of [['k0',1],['k1',1],['k2',1],['k3',1]])await page.locator(`input[name="${name}"][value="${v}"]`).check();await page.getByRole('button',{name:'下書きを受け取る'}).click();await page.locator('#read-done').waitFor();await expect(page.locator('#read-done')).toBeEnabled();
const state=await page.evaluate(()=>fetch('/api/state').then(r=>r.json()));
await page.locator('details[data-source="S1"] > summary').click();await shot('screen-read');
await page.locator('#read-done').click();await page.getByRole('heading',{name:'最初に読んだときのことを教えてください'}).waitFor();await expect(page.locator('input[name="burden"][value="4"]')).toBeEnabled();await shot('screen-effort');
await page.locator('input[name="burden"][value="4"]').check();await page.getByRole('button',{name:'確認・修正へ進む'}).click();await expect(page.locator('#editor')).toBeEditable();await page.locator('details[data-source="S2"] summary').click();await shot('screen-edit');
await page.setViewportSize({width:390,height:844});await shot('screen-edit-mobile');
page.once('dialog',d=>d.accept());await page.locator('#withdraw').click();await page.getByRole('heading',{name:'参加を中止しました。'}).waitFor();
const condition=Object.entries(CASE.drafts).find(([,v])=>v.paragraphs.join('\n\n')===state.initialText)?.[0]||'not-matched';
writeFileSync(new URL('screenshot-provenance.json',out),JSON.stringify({capturedAt:new Date().toISOString(),base,mode:'test',session:state.sessionId,condition,disclosureText:state.disclosureText||'',viewport:{width:1440,height:1120},deviceScaleFactor:2,uiVersion:'instructions-20260919-v2',note:'Actual deployed UI; automated test session, withdrawn after screenshots. Element captures of app or instruction panel; no screenshot content edited.',files:Object.fromEntries(shots.map(f=>[f,createHash('sha256').update(readFileSync(new URL(f,out))).digest('hex')]))},null,2));console.log(JSON.stringify({screenshots:shots,condition,mode:'test'}));
}finally{await browser.close()}
