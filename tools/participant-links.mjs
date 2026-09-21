import {readFile,writeFile} from 'node:fs/promises';
const base='https://handoff-research.research-public.workers.dev';
const key=(await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
const r=await fetch(base+'/api/admin/invites',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({count:1,mode:'test',label:'user walkthrough 2026-09-18'})});
if(!r.ok)throw new Error('Invite creation failed: '+r.status);
const data=await r.json();await writeFile(new URL('../.private/walkthrough-link.json',import.meta.url),JSON.stringify(data,null,2),{mode:0o600});console.log(data.invitations[0].url);
