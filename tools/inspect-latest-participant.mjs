import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='https://handoff-research.research-public.workers.dev';
const key=(await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
const since=process.argv[2]||'2026-09-21T06:46:14.586Z';
let cursor='0';const rows=[];
do{const res=await fetch(base+'/api/admin/export?'+new URLSearchParams({table:'sessions',from:since,cursor}),{headers:{authorization:'Bearer '+key}});if(!res.ok)throw Error('Export HTTP '+res.status);const data=await res.json();rows.push(...data.rows);cursor=data.next}while(cursor);
await mkdir(new URL('../.private/latest-participant/',import.meta.url),{recursive:true});
await writeFile(new URL('../.private/latest-participant/sessions.json',import.meta.url),JSON.stringify(rows,null,2),{mode:0o600});
console.log(JSON.stringify({total:rows.length,latest:rows.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,12).map(s=>({id:s.id,created_at:s.created_at,updated_at:s.updated_at,completed_at:s.completed_at,phase:s.phase,revision:s.revision,protocol:s.protocol_version,mode:s.mode}))},null,2));
