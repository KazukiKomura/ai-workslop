import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const key=readFileSync(new URL('../.private/admin-key.txt',import.meta.url),'utf8').trim();
const env={...process.env,ADMIN_KEY:key,TEST_URL:'https://handoff-research.research-public.workers.dev'};
for(const args of (process.argv[2]==='browser'?[['tests/browser.mjs']]:[['--test','tests/api.test.mjs'],['tests/browser.mjs']])){const r=spawnSync(process.execPath,args,{cwd:new URL('..',import.meta.url),env,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
