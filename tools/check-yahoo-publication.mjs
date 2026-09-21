import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),base='https://handoff-research.research-public.workers.dev';
const key=(await readFile(new URL('.private/admin-key.txt',root),'utf8')).trim();
async function get(path,admin=false){const r=await fetch(base+path,{headers:admin?{authorization:'Bearer '+key}:{}});if(!r.ok)throw Error(path+' HTTP '+r.status);return r.json()}
const [status,config,campaigns]=await Promise.all([get('/api/admin/status',true),get('/api/config'),get('/api/admin/campaigns',true)]);
const campaign=campaigns.campaigns.find(c=>c.token_hash===config.defaultCampaign);
const page=await fetch(base+'/');const js=await fetch(base+'/app.js').then(r=>r.text());
const evidence={checkedAt:new Date().toISOString(),url:base+'/',rootStatus:page.status,protocol:status.version,casesPerParticipant:status.casesPerParticipant,enrollmentOpen:config.enrollmentOpen,defaultEntryExists:!!campaign,defaultEntryOpen:campaign?.open===1,completionKeywordMatches:String(status.config.finalKeyword||campaign?.keyword||'').trim()==='21wra0966',keywordHiddenFromPublicConfig:!('finalKeyword'in config),consentConfigPresent:Object.fromEntries(['affiliation','operator','contact','retention'].map(k=>[k,!!String(status.config[k]||'').trim()])),contactFieldsRenderedInPublicScript:['affiliation','operator','contact','retention'].filter(k=>js.includes('cfg.'+k)),noticeDuration:js.match(/おおよそ\s*[0-9０-９]+[〜～–-][0-9０-９]+\s*分程度/gu),ageMinimum18:js.includes('min:18')};
await mkdir(new URL('.private/publication-check/',root),{recursive:true});await writeFile(new URL('.private/publication-check/yahoo.json',root),JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence,null,2));
