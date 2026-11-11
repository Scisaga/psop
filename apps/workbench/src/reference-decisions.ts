import type {AssemblyConnection,PrototypeData} from './types';

export interface ReferenceDecisionTarget {
  configuration_ref:string;connection_ref:string|null;
  endpoints:{owner_ref:string;interface_ref:string;member_refs:string[]}[];
  name?:string;mechanism?:string;
}
export interface ReferenceDecision {
  id:string;revision:number;action:'confirm'|'reject'|'undo';target_key:string;target:ReferenceDecisionTarget;
  basis:'user_statement';note:string;created_at:string;decision_ref?:string;
}
export interface ReferenceDecisionLedger {
  schema:'psop.workspace-reference-decisions/1';workspace_id:string;package_digest:string;revision:number;events:ReferenceDecision[];
}
export type ReferenceDecisionInput={action:'confirm'|'reject';target:ReferenceDecisionTarget;note:string}|{action:'undo';decision_ref:string};
export interface ReferenceReviewController {
  ledger:ReferenceDecisionLedger|null;loading:boolean;saving:boolean;error:string;exportUrl:string;
  save:(input:ReferenceDecisionInput)=>Promise<void>;refresh:()=>void;
}
export function referenceConfiguration(data:PrototypeData){return data.meta.activeReferenceConfiguration??data.reference_alignment?.source_configuration_ref??'source';}
export function activeReferenceDecisions(ledger:ReferenceDecisionLedger|null){
  const result=new Map<string,ReferenceDecision>();
  for(const event of ledger?.events??[]){if(event.action==='undo')result.delete(event.target_key);else result.set(event.target_key,event);}
  return [...result.values()];
}
export function targetForConnection(data:PrototypeData,connection:AssemblyConnection):ReferenceDecisionTarget{
  const interfaces=new Map((data.assembly?.interfaces??[]).map(i=>[i.id,i]));
  return {configuration_ref:referenceConfiguration(data),connection_ref:connection.id,
    endpoints:connection.endpoints.map(e=>({...e,owner_ref:interfaces.get(e.interface_ref)?.owner_ref??''}))};
}
/** Human assertions never change source measurements, fit checks or candidate sets. */
export function referenceDecisionView(data:PrototypeData,ledger:ReferenceDecisionLedger|null):PrototypeData{
  if(!data.assembly||!ledger||ledger.package_digest!==data.meta.packageDigest)return data;
  const decisions=activeReferenceDecisions(ledger).filter(e=>e.target.configuration_ref===referenceConfiguration(data));
  if(!decisions.length)return data;
  const connections=new Map(data.assembly.connections.map(c=>[c.id,c]));
  for(const event of decisions){
    const target=event.target,id=target.connection_ref??'manual:'+event.target_key;
    const original=connections.get(id);
    const connection:AssemblyConnection=original??{id,name:target.name??'人工记录的原装配关系',mechanism:target.mechanism??'人工记录的原装配接口关系',basis:'hypothesis',
      endpoints:target.endpoints.map(e=>({interface_ref:e.interface_ref,member_refs:e.member_refs})),evidence_refs:[]};
    connections.set(id,{...connection,manual_decision:{id:event.id,status:event.action==='confirm'?'confirmed':'rejected',note:event.note,created_at:event.created_at,configuration_ref:target.configuration_ref}});
  }
  return {...data,assembly:{...data.assembly,connections:[...connections.values()]}};
}
