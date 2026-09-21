import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),base='https://handoff-research.research-public.workers.dev';
const id=process.argv[2];if(!/^[0-9a-f-]{36}$/.test(id||''))throw Error('participant UUID required');
const all=JSON.parse(await readFile(new URL('.private/latest-participant/sessions.json',root),'utf8'));const s=all.find(s=>s.id===id);if(!s)throw Error('Unknown participant');
const key=(await readFile(new URL('.private/admin-key.txt',root),'utf8')).trim();
const dir=new URL('.private/participant-review-20260921-'+id.slice(0,8)+'/',root);await mkdir(dir,{recursive:true,mode:0o700});
async function get(path){const r=await fetch(base+'/api/admin/'+path,{headers:{authorization:'Bearer '+key}});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json()}
async function exported(table){const rows=[];let cursor='0';do{const data=await get('export?'+new URLSearchParams({table,from:s.created_at,to:new Date(Date.parse(s.created_at)+1).toISOString(),cursor}));rows.push(...data.rows);cursor=data.next}while(cursor);return rows.filter(r=>table==='versions'?r.version===s.protocol_version:(table==='sessions'?r.id:r.session_id)===id)}
const tables=['sessions','session_cases','responses','actions','events','versions'];
const results=await Promise.allSettled(tables.map(exported));const raw={};for(let i=0;i<tables.length;i++){if(results[i].status!=='fulfilled')throw results[i].reason;raw[tables[i]]=results[i].value}
const current=await get('stimulus');const manifest={sessionId:id,source:base,exportedAt:new Date().toISOString(),kind:'user-performed mock participation',createdAt:s.created_at,completedAt:s.completed_at,counts:Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v.length]))};
await writeFile(new URL('rawdata.json',dir),JSON.stringify({manifest,tables:raw},null,2),{mode:0o600});
await writeFile(new URL('current-protocol.json',dir),JSON.stringify(current,null,2),{mode:0o600});
const decoded=Object.fromEntries(Object.entries(raw).map(([t,rows])=>[t,rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>{if(k.endsWith('_json')&&typeof v==='string'){try{return[k,JSON.parse(v)]}catch{}}return[k,v]})))]));
await writeFile(new URL('readable-data.json',dir),JSON.stringify({manifest,tables:decoded},null,2),{mode:0o600});
console.log(JSON.stringify({directory:dir.pathname,...manifest},null,2));
