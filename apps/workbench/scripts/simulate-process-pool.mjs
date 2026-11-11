import {Worker} from 'node:worker_threads';

/** One serial, warm native-geometry worker. HTTP and rendering threads remain responsive. */
export function createAssemblyProcessPool(){
 let worker,sequence=0,chain=Promise.resolve(),closed=false;const pending=new Map();
 function start(){
  if(closed)throw Error('装配路径服务已关闭。');if(worker)return worker;
  const current=new Worker(new URL('./simulate-process-worker.mjs',import.meta.url));worker=current;current.unref();
  current.on('message',({id,result,error})=>{const request=pending.get(id);if(!request)return;pending.delete(id);clearTimeout(request.timer);if(!pending.size)current.unref();if(error)request.reject(Object.assign(Error(error.message),{status:422,issues:error.issues}));else request.resolve(result);});
  const fail=error=>{if(worker!==current)return;worker=undefined;for(const request of pending.values()){clearTimeout(request.timer);request.reject(error);}pending.clear();};current.on('error',fail);current.on('exit',code=>{if(code)fail(Error('装配路径工作进程已退出，请重试。'));});return current;
 }
 return {
  optimize(input){const next=chain.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{let current;try{current=start();}catch(error){reject(error);return;}const id=++sequence;current.ref();const timer=setTimeout(()=>{pending.delete(id);worker=undefined;void current.terminate();reject(Object.assign(Error('装配过程检查超时，未修改场景；请重试。'),{status:503}));},180000);pending.set(id,{resolve,reject,timer});current.postMessage({id,input});}));chain=next;return next;},
  close(){closed=true;for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('装配路径服务已关闭。'));}pending.clear();const current=worker;worker=undefined;return current?.terminate();}
 };
}
