import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

const digest=value=>createHash('sha256').update(value).digest('hex');
/** Only stable source observations are persisted; scene eligibility is checked separately. */
export function createObservationCache(directory,algorithmFiles){
 const writes=new Set();let version;
 const filename=key=>path.join(directory,key+'.json');
 return {
  async key(requestKey){
   try{version??=Promise.all(algorithmFiles.map(f=>readFile(f).then(digest))).then(records=>digest(JSON.stringify(records)));return digest(JSON.stringify(['psop.simulate-observation/1',await version,requestKey]));}catch{return null;}
  },
  async read(key){
   if(!key)return null;
   try{const record=JSON.parse(await readFile(filename(key),'utf8')),raw=JSON.stringify(record.observation);return record.key===key&&['clear','interference'].includes(record.observation?.status)&&record.observation_sha256===digest(raw)?record.observation:null;}catch{return null;}
  },
  write(key,observation){
   if(!key)return;
   const pending=(async()=>{const temporary=filename(key)+'.'+randomUUID()+'.tmp';try{await mkdir(directory,{recursive:true});await writeFile(temporary,JSON.stringify({key,observation,observation_sha256:digest(JSON.stringify(observation))}),{flag:'wx'});await rename(temporary,filename(key));}catch{}finally{await unlink(temporary).catch(()=>{});}})();
   writes.add(pending);pending.finally(()=>writes.delete(pending));
  },
  async flush(){await Promise.allSettled([...writes]);}
 };
}
