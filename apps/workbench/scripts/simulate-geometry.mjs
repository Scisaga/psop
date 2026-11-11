import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createObservationCache} from './simulate-observation-cache.mjs';

const worker=fileURLToPath(new URL('../../../skills/psop-build/scripts/interface_contact_worker.mjs',import.meta.url));
export const defaultGeometryCacheDirectory=fileURLToPath(new URL('../.runtime/simulate-geometry/',import.meta.url));
export function stlBounds(raw){
  if(raw.length<84)throw Error('源模型 STL 格式无效。');const count=raw.readUInt32LE(80);if(!count||raw.length!==84+count*50||count>2000000)throw Error('源模型 STL 格式无效。');
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++){const v=raw.readFloatLE(84+i*50+12+j*12+k*4);if(!Number.isFinite(v))throw Error('源模型包含无效坐标。');low[k]=Math.min(low[k],v);high[k]=Math.max(high[k],v);}
  return [low,high];
}
/** Independent processes keep synchronous WASM and stale/slow checks off HTTP/UI threads. */
export function createSimulationGeometry({timeout=15000,workerPath=worker,workers=2,cacheDirectory=null}={}){
  if(!Number.isInteger(workers)||workers<1||workers>4)throw Error('Geometry workers must be between 1 and 4.');
  const algorithmFiles=workerPath===worker?['interface_contact_worker.mjs','interface-contact-diagnostics.mjs','interface-contact.mjs','finite-source-surface.mjs','assembly-judgment.mjs','vendor/manifold-3d/SOURCE.json'].map(name=>fileURLToPath(new URL('../../../skills/psop-build/scripts/'+name,import.meta.url))):[workerPath];
  const observations=cacheDirectory?createObservationCache(cacheDirectory,algorithmFiles):null,lanes=Array.from({length:workers},()=>({})),queue=[],cache=new Map();let closed=false,diskHits=0;
  function stop(lane){lane.child?.kill();lane.child=null;lane.buffer='';}
  function run(lane,job){
    lane.busy=true;
    if(!lane.child){
      const child=spawn(process.execPath,[workerPath],{stdio:['pipe','pipe','pipe'],windowsHide:true});lane.child=child;lane.buffer='';lane.errors='';
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{lane.errors=(lane.errors+s).slice(-2000);});
      child.stdout.on('data',chunk=>{if(lane.child!==child)return;lane.buffer+=chunk;const end=lane.buffer.indexOf('\n');if(end<0)return;const line=lane.buffer.slice(0,end);lane.buffer=lane.buffer.slice(end+1);try{const value=JSON.parse(line);lane.finish?.(value.error?Error(value.error):null,value);}catch(error){lane.finish?.(error);}});
      child.on('error',e=>{if(lane.child===child)lane.finish?.(e);});child.on('exit',()=>{if(lane.child===child){lane.child=null;lane.finish?.(Error('几何检查进程已退出。'+lane.errors));}});
    }
    const timer=setTimeout(()=>{stop(lane);lane.finish?.(Error('几何检查超时，请重试或选择其他方式。'));},timeout);
    lane.finish=(error,value)=>{clearTimeout(timer);lane.finish=null;lane.busy=false;if(error){stop(lane);job.resolve({status:'unresolved',reason:error.message,method:'closed-source-solid-interference/2'});cache.delete(job.key);}else{if(value.status==='clear'||value.status==='interference'){cache.set(job.key,Promise.resolve(value));observations?.write(job.diskKey,value);}else cache.delete(job.key);job.resolve(value);}pump();};
    const finish=lane.finish;lane.child.stdin.write(JSON.stringify(job.input)+'\n',error=>{if(error&&lane.finish===finish)finish(error);});
  }
  function pump(){if(closed)return;for(const lane of lanes)if(!lane.busy&&queue.length)run(lane,queue.shift());}
  return {
    evaluate(input){
      if(closed)return Promise.resolve({status:'unresolved',reason:'几何服务已关闭。'});
      const key=createHash('sha256').update(JSON.stringify([input.a.sha256,input.b.sha256,input.r.map(r=>r.map(n=>Math.round(n*1e12)/1e12)),input.t.map(n=>Math.round(n*1e12)/1e12),'closed-source-solid-interference/2',!!input.diagnostics,input.interface_contact??null,input.source_observation??null])).digest('hex');
      if(cache.has(key))return cache.get(key);
      const enqueue=diskKey=>new Promise(resolve=>{if(closed){resolve({status:'unresolved',reason:'几何服务已关闭。'});return;}queue.push({input,key,diskKey,resolve});pump();});
      const result=observations?(async()=>{const diskKey=await observations.key(key),previous=await observations.read(diskKey);if(previous){diskHits++;return previous;}return enqueue(diskKey);})():enqueue(null);
      cache.set(key,result);if(cache.size>8192)cache.delete(cache.keys().next().value);return result;
    },
    async close(){closed=true;const pending=[...cache.values()];for(const lane of lanes){lane.finish?.(Error('几何服务已关闭。'));stop(lane);}for(const job of queue.splice(0))job.resolve({status:'unresolved',reason:'几何服务已关闭。'});cache.clear();await Promise.allSettled(pending);await observations?.flush();},
    stats(){return {workers:lanes.filter(l=>l.child).length,pending:queue.length,cached:cache.size,disk_hits:diskHits};}
  };
}
