import {useCallback,useEffect,useRef,useState} from 'react';
import type {ReferenceDecisionInput,ReferenceDecisionLedger,ReferenceReviewController} from './reference-decisions';

export function useReferenceDecisions(workspace:string,snapshot:string,digest:string|undefined):ReferenceReviewController{
  const [ledger,setLedger]=useState<ReferenceDecisionLedger|null>(null),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const generation=useRef(0),currentLedger=useRef(ledger);currentLedger.current=ledger;
  const endpoint=`/api/workspaces/${encodeURIComponent(workspace)}/snapshots/${encodeURIComponent(snapshot)}/reference-decisions`;
  useEffect(()=>{
    const controller=new AbortController();generation.current++;setLedger(null);setError('');setSaving(false);
    if(!workspace||!snapshot||!digest){setLoading(false);return()=>controller.abort();}
    setLoading(true);
    fetch(endpoint,{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error??'人工记录读取失败');return result as ReferenceDecisionLedger;}).then(result=>{
      if(controller.signal.aborted)return;
      if(result.schema!=='psop.workspace-reference-decisions/1'||result.package_digest!==digest||result.workspace_id!==workspace||!Array.isArray(result.events))throw new Error('人工记录与当前知识版本不一致。');
      setLedger(result);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[workspace,snapshot,digest,endpoint,retry]);
  const refresh=useCallback(()=>setRetry(v=>v+1),[]);
  const save=useCallback(async(input:ReferenceDecisionInput)=>{
    if(!currentLedger.current||loading||saving)throw new Error('请等待人工记录读取完成。');
    const token=generation.current;setSaving(true);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,expected_revision:currentLedger.current.revision})});
      const result=await response.json();
      if(!response.ok){if(response.status===409&&token===generation.current)refresh();throw new Error(result.error??'人工判断保存失败。');}
      if(token===generation.current){currentLedger.current=result;setLedger(result);setError('');}
    }finally{if(token===generation.current)setSaving(false);}
  },[endpoint,loading,saving,refresh]);
  return {ledger,loading,saving,error,save,refresh,exportUrl:endpoint+'/export'};
}
