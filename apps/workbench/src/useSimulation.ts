import {useCallback,useEffect,useRef,useState} from 'react';
import type {CandidateResult,ConnectionCandidate,ConnectionPreview,SceneSummary,SceneProgress,SimulationSession} from './simulate-types';

class SimulationError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}}
async function request<T>(url:string,body?:unknown,signal?:AbortSignal):Promise<T>{const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:signal??AbortSignal.timeout(45000)});const value=await response.json();if(!response.ok)throw new SimulationError(value.error??'装配操作失败，请重试。',response.status);return value;}
type Draft={id:string;body:Record<string,unknown>};
const draftKey=(base:string,id:string)=>'psop.simulate.draft:'+base+'/'+id;
function readDraft(base:string,id:string):Draft|null{
  try{const draft=JSON.parse(localStorage.getItem(draftKey(base,id))??'null');return draft?.id===id&&typeof draft.body?.request_id==='string'&&Number.isSafeInteger(draft.body?.expected_revision)?draft:null;}catch{return null;}
}
function saveDraft(base:string,draft:Draft){try{localStorage.setItem(draftKey(base,draft.id),JSON.stringify(draft));}catch{ /* The current tab retains its pending command. */ }}
function clearDraft(base:string,id:string){try{localStorage.removeItem(draftKey(base,id));}catch{ /* Storage unavailability does not prevent saving. */ }}
const starting=new Map<string,Promise<SimulationSession>>();
function routeSession(){return new URLSearchParams(location.hash.split('?')[1]??'').get('session');}
export function useSimulation(workspace:string,snapshot:string){
  const base=`/api/workspaces/${encodeURIComponent(workspace)}/snapshots/${encodeURIComponent(snapshot)}/simulate/sessions`;
  const [session,setSession]=useState<SimulationSession|null>(null),[scenes,setScenes]=useState<SceneSummary[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[transition,setTransition]=useState('');
  const current=useRef<SimulationSession|null>(null),pending=useRef<Promise<unknown>|null>(null),retryRef=useRef<{id:string;body:Record<string,unknown>}|null>(null),generation=useRef(0);
  const accept=useCallback((s:SimulationSession)=>{const merged={...s,bounds:s.bounds??current.current?.bounds,table:s.table??current.current?.table};current.current=merged;setSession(merged);setScenes(v=>[{id:s.id,name:s.name,revision:s.revision,updated_at:s.updated_at,part_count:s.instances.length,connection_count:s.connections.length},...v.filter(x=>x.id!==s.id)]);const params=new URLSearchParams(location.hash.split('?')[1]??'');params.set('workspace',workspace);params.set('snapshot',snapshot);params.set('session',s.id);history.replaceState(null,'',location.pathname+location.search+'#simulate?'+params);},[workspace,snapshot]);
  const recoverDraft=useCallback((id:string)=>{retryRef.current=readDraft(base,id);if(retryRef.current)setError('上次操作的保存结果尚未确认。重试可核对并恢复该操作。');},[base]);
  const refreshList=useCallback(async()=>{const r=await request<{sessions:SceneSummary[]}>(base);setScenes(r.sessions);return r.sessions;},[base]);
  useEffect(()=>{const epoch=++generation.current;setLoading(true);setError('');current.current=null;retryRef.current=null;setSession(null);const open=async()=>{const list=await request<{sessions:SceneSummary[]}>(base);if(epoch!==generation.current)return;setScenes(list.sessions);const preferred=routeSession(),id=list.sessions.find(s=>s.id===preferred)?.id??list.sessions[0]?.id;
    if(id)return request<SimulationSession>(base+'/'+id);
    if(!starting.has(base))starting.set(base,request<SimulationSession>(base,{request_id:crypto.randomUUID(),name:'装配方案 1'}).then(s=>request<SimulationSession>(base+'/'+s.id)).finally(()=>starting.delete(base)));return starting.get(base);
  };open().then(s=>{if(s&&epoch===generation.current){accept(s);recoverDraft(s.id);}}).catch(e=>{if(epoch===generation.current)setError(e.message);}).finally(()=>{if(epoch===generation.current)setLoading(false);});return()=>{generation.current++;};},[base,accept,recoverDraft]);
  const choose=useCallback(async(id:string)=>{while(pending.current)await pending.current.catch(()=>{});const epoch=++generation.current;setLoading(true);setError('');retryRef.current=null;try{const s=await request<SimulationSession>(base+'/'+id);if(epoch===generation.current){setTransition('');accept(s);recoverDraft(s.id);}}catch(e){setError((e as Error).message);}finally{if(epoch===generation.current)setLoading(false);}},[base,accept,recoverDraft]);
  const create=useCallback(async(copy=false,name?:string)=>{while(pending.current)await pending.current.catch(()=>{});setSaving(true);setError('');try{const s=await request<SimulationSession>(base,{request_id:crypto.randomUUID(),name:name??(copy?current.current?.name+' · 副本':'装配方案 '+(scenes.length+1)),...(copy?{copy_from:current.current?.id}:{})});await choose(s.id);await refreshList();}catch(e){setError((e as Error).message);}finally{setSaving(false);}},[base,choose,refreshList,scenes.length]);
  const send=useCallback(async(body:Record<string,unknown>,isRetry=false):Promise<SimulationSession|null>=>{
    while(pending.current)await pending.current.catch(()=>{});const s=current.current;if(!s)return null;const epoch=generation.current;
    const operation=async()=>{setSaving(true);setError('');const input=isRetry&&retryRef.current?retryRef.current.body:{...body,expected_revision:s.revision,request_id:crypto.randomUUID()};
      try{
        if(['auto_assemble','set_reference_configuration','set_assembly_policy'].includes(String(input.type))){
          const health=await request<{simulate?:{commands?:string[]}}>('/health');
          if(!health.simulate?.commands?.includes(String(input.type)))throw new SimulationError('当前装配服务版本尚未支持此操作，请重新启动工作台后重试。',426);
        }
        retryRef.current={id:s.id,body:input};saveDraft(base,retryRef.current);
        const next=await request<SimulationSession>(base+'/'+s.id+'/commands',input,input.type==='auto_assemble'?AbortSignal.timeout(190000):undefined);clearDraft(base,s.id);
        if(epoch===generation.current){setTransition(String(input.type));if(next.revision<current.current!.revision)accept(await request<SimulationSession>(base+'/'+s.id));else accept(next);retryRef.current=null;}return next;
      }catch(e){if(epoch===generation.current){setError((e as Error).message);if(e instanceof SimulationError&&e.status===409){setTransition('');accept(await request<SimulationSession>(base+'/'+s.id));clearDraft(base,s.id);retryRef.current=null;}else if(e instanceof SimulationError&&e.status<500){clearDraft(base,s.id);retryRef.current=null;}}return null;}finally{if(epoch===generation.current)setSaving(false);}};
    const promise=operation();pending.current=promise;try{return await promise;}finally{if(pending.current===promise)pending.current=null;}
  },[base,accept]);
  const syncRead=useCallback(async<T,>(operation:Promise<T>,s:SimulationSession):Promise<T>=>{const epoch=generation.current;try{return await operation;}catch(e){if(e instanceof SimulationError&&e.status===409&&epoch===generation.current&&current.current?.id===s.id&&current.current.revision===s.revision&&!pending.current&&!retryRef.current)await choose(s.id);throw e;}},[choose]);
  const query=useCallback((instanceId:string,signal?:AbortSignal)=>{const s=current.current;if(!s)throw Error('场景尚未就绪。');return syncRead(request<CandidateResult>(base+'/'+s.id+'/candidates',{instance_id:instanceId,expected_revision:s.revision},signal),s);},[base,syncRead]);
  const summary=useCallback((signal?:AbortSignal)=>{const s=current.current;if(!s)throw Error('场景尚未就绪。');return syncRead(request<SceneProgress>(base+'/'+s.id+'/candidates',{scope:'scene',expected_revision:s.revision},signal),s);},[base,syncRead]);
  const preview=useCallback((candidate:ConnectionCandidate,signal?:AbortSignal,diagnostics=false)=>{const s=current.current;if(!s)throw Error('场景尚未就绪。');return syncRead(request<ConnectionPreview>(base+'/'+s.id+'/preview',{candidate_id:candidate.id,moving_instance_id:candidate.moving_instance_id,target_instance_id:candidate.target_instance_id,expected_revision:s.revision,diagnostics},signal),s);},[base,syncRead]);
  const retry=useCallback(()=>retryRef.current?send({},true):choose(current.current!.id),[send,choose]);
  const discard=useCallback(()=>{const s=current.current;if(s){clearDraft(base,s.id);retryRef.current=null;return choose(s.id);}},[base,choose]);
  return {session,scenes,error,loading,saving,unsaved:!!retryRef.current,hasDraft:()=>!!retryRef.current,transition,choose,create,send,query,summary,preview,retry,discard,flush:()=>pending.current??Promise.resolve()};
}
