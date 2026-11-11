import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildInterfaceAdaptations} from '../../../skills/psop-build/scripts/interface-adaptations.mjs';
const scripts=new URL('../../../skills/psop-build/scripts/',import.meta.url),hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const cacheDirectory=fileURLToPath(new URL('../.runtime/interface-adaptations/',import.meta.url));
/** The index is built once per captured package, outside HTTP's event loop. Selection reads adjacency only. */
export async function simulationInterfaceAdaptations({scene,bundle,read,customRead,meshes}){
 const published=scene.assembly?.capability_index?.interface_adaptations;if(published?.path)return JSON.parse((await read(bundle,published.path)).toString('utf8'));
 if(customRead){const details=await Promise.all(scene.parts.map(p=>customRead(p.id)));return buildInterfaceAdaptations({parts:scene.parts,interfaces:details.flatMap(d=>d.interfaces),features:details.flatMap(d=>d.features),connections:[...new Map(details.flatMap(d=>(d.reference_connections??[]).map(c=>[c.id,c]))).values()],meshes:new Map(scene.parts.map(p=>[p.id,meshes.get(p.geometryUrl).bytes]))});}
 const names=['interface-adaptations.mjs','bounded-interface-fit.mjs','finite-source-surface.mjs','interface-adaptation-source.mjs','interface_adaptations_worker.mjs'],version=hash(await Promise.all(names.map(async name=>hash(await readFile(new URL(name,scripts)))))),key=hash([bundle.manifest.package_digest,version]),file=path.join(cacheDirectory,key+'.json');
 try{const record=JSON.parse(await readFile(file,'utf8'));if(record.key===key&&record.digest===hash(record.result)&&record.result.schema==='psop.interface-adaptations/1')return record.result;}catch{}
 const result=await new Promise((resolve,reject)=>{const worker=new Worker(new URL('interface_adaptations_worker.mjs',scripts),{workerData:{scene,root:bundle.root}}),timer=setTimeout(()=>{void worker.terminate();reject(Error('接口适配索引生成超时，请重试。'));},120000);worker.once('message',message=>{clearTimeout(timer);void worker.terminate();if(message.error)reject(Error(message.error));else resolve(message.result);});worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(Error('接口适配分析已中断，请重试。'));}});});
 const temp=file+'.'+randomUUID()+'.tmp';try{await mkdir(cacheDirectory,{recursive:true});await writeFile(temp,JSON.stringify({key,digest:hash(result),result}));await rename(temp,file);}catch{}finally{await unlink(temp).catch(()=>{});}return result;
}
