// Streaming paginated export. Usage: node tools/export.mjs [output directory]
import {readFile,mkdir,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
const origin=process.env.EXPERIMENT_URL||'https://handoff-research.research-public.workers.dev';
const key=(process.env.ADMIN_KEY||await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
const out=path.resolve(process.argv[2]||'.private/exports/'+new Date().toISOString().replaceAll(':','-'));
await mkdir(out,{recursive:true,mode:0o700});const manifest={exportedAt:new Date().toISOString(),origin,tables:{}};
for(const table of ['sessions','responses','events','actions','versions']){const file=path.join(out,table+'.ndjson');await writeFile(file,'',{mode:0o600});let cursor='0',count=0;do{const r=await fetch(origin+'/api/admin/export?table='+table+'&cursor='+cursor,{headers:{authorization:'Bearer '+key}});if(!r.ok)throw new Error('Export failed: '+r.status);const data=await r.json();await appendFile(file,data.rows.map(row=>JSON.stringify(row)).join('\n')+(data.rows.length?'\n':''));count+=data.rows.length;cursor=data.next;}while(cursor);manifest.tables[table]={rows:count,file:table+'.ndjson'};console.log(table+': '+count+' rows');}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});console.log('Exported to '+out);
