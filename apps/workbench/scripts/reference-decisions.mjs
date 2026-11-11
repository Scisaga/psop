import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {findSnapshot,readPackageEntry} from './dkp.mjs';

export const DECISION_SCHEMA='psop.workspace-reference-decisions/1';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const decode=bytes=>JSON.parse((bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes).toString('utf8'));
const canonicalEnds=ends=>ends.map(e=>({owner_ref:e.owner_ref,interface_ref:e.interface_ref,member_refs:[...new Set(e.member_refs)].sort()})).sort((a,b)=>a.interface_ref.localeCompare(b.interface_ref));

export function activeDecisions(ledger){
  const active=new Map();
  for(const event of ledger.events){if(event.action==='undo')active.delete(event.target_key);else active.set(event.target_key,event);}
  return [...active.values()];
}

/** Workspace assertions are append-only, package/configuration scoped and outside DKP. */
export function createReferenceDecisionStore({registryFile,load=findSnapshot,read=readPackageEntry}){
  const queues=new Map(),contexts=new Map();
  async function context(workspace,snapshot){
    const bundle=await load(workspace,snapshot,registryFile);
    const identity=bundle.manifest.package_digest;
    let pending=contexts.get(identity);
    if(!pending){pending=(async()=>{
      const scene=decode(await read(bundle,bundle.manifest.entrypoints.scene));
      return {bundle,scene,interfaces:new Map((scene.assembly?.interfaces??[]).map(i=>[i.id,i])),connections:new Map((scene.assembly?.connections??[]).map(c=>[c.id,c]))};
    })();contexts.set(identity,pending);pending.catch(()=>contexts.delete(identity));}
    return pending;
  }
  function location(workspace,sha){return path.join(path.dirname(registryFile),'state',digest(workspace),'reference-decisions',sha+'.json');}
  async function ledgerAt(file,workspace,sha){
    let value;
    try{value=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return {schema:DECISION_SCHEMA,workspace_id:workspace,package_digest:sha,revision:0,events:[]};throw error;}
    if(value.schema!==DECISION_SCHEMA||value.workspace_id!==workspace||value.package_digest!==sha||!Array.isArray(value.events)||value.revision!==value.events.length)fail('人工记录格式或知识版本不一致。');
    for(const [index,event] of value.events.entries()){
      if(event.revision!==index+1||!['confirm','reject','undo'].includes(event.action)||typeof event.target_key!=='string'||!event.target?.endpoints||event.basis!=='user_statement')fail('人工记录历史不完整。');
    }
    return value;
  }
  async function targetFor(ctx,input){
    if(!input||typeof input!=='object'||!Array.isArray(input.endpoints)||input.endpoints.length!==2)fail('请选择两个部件的具体接口。');
    const configurations=new Set(['source',ctx.scene.reference_alignment?.source_configuration_ref,ctx.scene.reference_alignment?.configuration_ref,...[...ctx.connections.values()].map(c=>c.configuration_ref)].filter(Boolean));
    if(!configurations.has(input.configuration_ref))fail('人工判断所用参考配置无效。');
    const ends=[];
    for(const raw of input.endpoints){
      if(!raw||!ctx.scene.parts.some(p=>p.id===raw.owner_ref)||typeof raw.interface_ref!=='string'||!Array.isArray(raw.member_refs)||raw.member_refs.some(m=>typeof m!=='string'))fail('接口或成员引用无效。');
      let item=ctx.interfaces.get(raw.interface_ref);
      if(!item){
        const entry=ctx.scene.assembly?.capability_index?.parts[raw.owner_ref];
        if(entry){const detail=decode(await read(ctx.bundle,entry.path));for(const i of detail.interfaces)ctx.interfaces.set(i.id,i);item=ctx.interfaces.get(raw.interface_ref);}
      }
      if(!item||item.owner_ref!==raw.owner_ref||raw.member_refs.some(ref=>!item.members.some(m=>m.id===ref)))fail('所选成员不属于该部件接口。');
      ends.push({owner_ref:raw.owner_ref,interface_ref:item.id,member_refs:raw.member_refs});
    }
    if(ends[0].owner_ref===ends[1].owner_ref)fail('原装配关系需要两个不同部件实例。');
    const endpoints=canonicalEnds(ends);
    let connection;
    if(input.connection_ref){
      connection=ctx.connections.get(input.connection_ref);
      if(!connection)fail('原参考连接不存在。');
      const expected=canonicalEnds(connection.endpoints.map(e=>({...e,owner_ref:ctx.interfaces.get(e.interface_ref)?.owner_ref})));
      if(JSON.stringify(expected)!==JSON.stringify(endpoints))fail('确认的成员对应与原连接不一致，请重新选择。');
    }
    return {configuration_ref:input.configuration_ref,connection_ref:connection?.id??null,endpoints,
      name:connection?.name??endpoints.map(e=>ctx.interfaces.get(e.interface_ref).name).join(' ↔ '),
      mechanism:connection?.mechanism??'人工记录的原装配接口关系'};
  }
  async function get(workspace,snapshot){const ctx=await context(workspace,snapshot);return ledgerAt(location(workspace,ctx.bundle.manifest.package_digest),workspace,ctx.bundle.manifest.package_digest);}
  async function update(workspace,snapshot,input){
    if(!input||!['confirm','reject','undo'].includes(input.action)||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0)fail('操作或记录版本无效。');
    if(input.note!==undefined&&(typeof input.note!=='string'||input.note.length>2000))fail('说明最多 2000 字。');
    const note=(input.note??'').trim();if(input.action==='reject'&&!note)fail('请填写排除此对应的理由。');
    const ctx=await context(workspace,snapshot),sha=ctx.bundle.manifest.package_digest,file=location(workspace,sha);
    const previous=queues.get(file)??Promise.resolve();
    const operation=previous.catch(()=>{}).then(async()=>{
      const ledger=await ledgerAt(file,workspace,sha);
      if(ledger.revision!==input.expected_revision)fail('人工记录已更新，请刷新记录后重试。',409);
      let target,undo;
      if(input.action==='undo'){
        undo=activeDecisions(ledger).find(e=>e.id===input.decision_ref);
        if(!undo)fail('该判断已撤销或被后续判断替代。',409);
        target=undo.target;
      }else target=await targetFor(ctx,input.target);
      const target_key=undo?.target_key??digest({configuration_ref:target.configuration_ref,connection_ref:target.connection_ref,endpoints:target.endpoints});
      const event={id:randomUUID(),revision:ledger.revision+1,action:input.action,target_key,target,basis:'user_statement',note,created_at:new Date().toISOString(),...(undo?{decision_ref:undo.id}:{})};
      const next={...ledger,revision:ledger.revision+1,events:[...ledger.events,event]};
      await mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify(next,null,2)+'\n',{encoding:'utf8',flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
      return next;
    });
    queues.set(file,operation);try{return await operation;}finally{if(queues.get(file)===operation)queues.delete(file);}
  }
  return {get,update};
}

export async function readDecisionRequest(request){
  if(request.headers.origin&&new URL(request.headers.origin).host!==request.headers.host)fail('请求来源与当前工作台不一致。',403);
  if(request.headers['sec-fetch-site']==='cross-site')fail('请求来源与当前工作台不一致。',403);
  if(!String(request.headers['content-type']??'').startsWith('application/json'))fail('请使用 JSON 提交人工判断。',415);
  let size=0,chunks=[];
  for await(const chunk of request){size+=chunk.length;if(size>65536)fail('人工判断内容过长。',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('人工判断不是有效 JSON。',400);}
}
