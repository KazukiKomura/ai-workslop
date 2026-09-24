import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const sql=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const r=spawnSync('npx',['--yes','wrangler','d1','execute',process.env.D1_NAME||'handoff-experiment','--remote',...(process.env.WRANGLER_ENV?['--env',process.env.WRANGLER_ENV]:[]),'--command',sql],{stdio:'inherit',cwd:new URL('..',import.meta.url)});process.exit(r.status??1);
