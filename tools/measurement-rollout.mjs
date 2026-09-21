import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base='https://handoff-research.research-public.workers.dev';
const key=(await readFile(new URL('../.private/admin-key.txt',import.meta.url),'utf8')).trim();
async function admin(path,body){
  const r=await fetch(base+'/api/admin/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw new Error('Admin request failed: '+r.status);
  return r.json();
}
const backup=new URL('../.private/responsibility-rollout.json',import.meta.url);
const mode=process.argv[2]||'status';
if(mode==='restore'){
  const saved=JSON.parse(await readFile(backup,'utf8'));
  await admin('config',{enrollmentOpen:saved.enrollmentOpen});
  console.log(JSON.stringify({restoredEnrollment:saved.enrollmentOpen}));
}else{
  const s=await admin('status');
  const live=s.counts.filter(x=>x.mode==='live').reduce((n,x)=>n+x.n,0);
  console.log(JSON.stringify({liveSessions:live,enrollmentOpen:s.config.enrollmentOpen,counts:s.counts}));
  if(mode==='pause'){
    if(live)throw new Error('Live records exist; do not change a collecting study automatically.');
    await mkdir(new URL('../.private/',import.meta.url),{recursive:true});
    await writeFile(backup,JSON.stringify({at:new Date().toISOString(),enrollmentOpen:s.config.enrollmentOpen},null,2));
    await admin('config',{enrollmentOpen:false});
    const after=await admin('status');
    if(after.counts.some(x=>x.mode==='live'&&x.n>0)){
      await admin('config',{enrollmentOpen:s.config.enrollmentOpen});
      throw new Error('A live participant started during the check; rollout cancelled.');
    }
    console.log('Enrollment paused; zero live sessions confirmed.');
  }
}
