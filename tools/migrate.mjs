// Apply migrations/2026-09-21-v4.sql to the local or remote D1 database, skipping columns that already exist.
// Usage: node tools/migrate.mjs local | node tools/migrate.mjs remote
// Pretest environment: D1_NAME=handoff-experiment-pretest WRANGLER_ENV=pretest node tools/migrate.mjs remote
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const target=process.argv[2]==='remote'?'--remote':'--local';
const cwd=new URL('..',import.meta.url);
function d1(command){const r=spawnSync('npx',['--no-install','wrangler','d1','execute',process.env.D1_NAME||'handoff-experiment',target,...(process.env.WRANGLER_ENV?['--env',process.env.WRANGLER_ENV]:[]),'--json','--command',command],{cwd,encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr||r.stdout);process.exit(r.status||1)}const text=r.stdout.slice(r.stdout.indexOf('['));return JSON.parse(text)}
for(const l of readFileSync(new URL('../schema.sql',import.meta.url),'utf8').split('\n').filter(l=>l.startsWith('CREATE TABLE IF NOT EXISTS')))d1(l.replace(/;$/,''));
const statements=['2026-09-21-v4.sql','2026-09-21-completion-target.sql'].flatMap(file=>readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').split('\n').filter(l=>l.startsWith('ALTER TABLE')));
for(const s of statements){const [,table,col]=s.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);const columns=new Set(d1(`PRAGMA table_info(${table})`)[0].results.map(x=>x.name));if(columns.has(col)){console.log('skip existing column',table,col);continue}d1(s.replace(/;$/,''));console.log('added column',table,col)}
console.log('migration complete for',target);
