import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {restingQuaternion} from './simulate-resting-pose.mjs';

export const SIMULATION_SCHEMA='psop.simulation.session/1';
export const CONTACT_EPSILON=3e-7;
export const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
export const clone=value=>structuredClone(value);
export function validPose(value){
  if(!value||!Array.isArray(value.position)||value.position.length!==3||!Array.isArray(value.quaternion)||value.quaternion.length!==4||![...value.position,...value.quaternion].every(Number.isFinite)||value.position.some(x=>Math.abs(x)>10))fail('位置或旋转无效。');
  const q=new Quaternion().fromArray(value.quaternion);if(q.lengthSq()<1e-12)fail('旋转不能为零。');
  return {position:[...value.position],quaternion:q.normalize().toArray()};
}
export function matrix(pose,scale=[1,1,1]){return new Matrix4().compose(new Vector3().fromArray(pose.position),new Quaternion().fromArray(pose.quaternion),new Vector3().fromArray(scale));}
export function matrixPose(value){const p=new Vector3(),q=new Quaternion(),s=new Vector3();value.decompose(p,q,s);return {position:p.toArray(),quaternion:q.normalize().toArray()};}
export function registrationMatrix(registration){const r=registration.rotation_b_to_a,t=registration.translation_b_to_a;return new Matrix4().set(...r[0],t[0],...r[1],t[1],...r[2],t[2],0,0,0,1);}
export function groupsFor(instances,connections){
  const parent=new Map(instances.map(p=>[p.id,p.id]));
  const find=id=>{if(!parent.has(id))fail('连接引用了不存在的部件。');let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  for(const c of connections){const a=find(c.endpoints[0].instance_id),b=find(c.endpoints[1].instance_id);parent.set(a,b);}
  const sets=new Map();for(const p of instances){const root=find(p.id);if(!sets.has(root))sets.set(root,[]);sets.get(root).push(p.id);}
  return [...sets.values()].map(ids=>{ids.sort();return {id:ids[0],instance_ids:ids,connection_ids:connections.filter(c=>ids.includes(c.endpoints[0].instance_id)).map(c=>c.id)};});
}
export function groupFor(session,id){const g=groupsFor(session.instances,session.connections).find(g=>g.instance_ids.includes(id));if(!g)fail('场景对象不存在。',404);return g;}
export function occupancyFor(connections){
  const occupied=new Map();
  for(const c of connections)for(const e of c.endpoints)for(const key of [...(e.interface_ref?[`${e.instance_id}|interface:${e.interface_ref}`]:[]),...e.resource_keys]){
    if(occupied.has(key)&&occupied.get(key)!==c.id)fail('场景中存在重复占用的接口或物理资源。');occupied.set(key,c.id);
  }
  return occupied;
}
export function blockedEndpoint(endpoint,occupied){return [`${endpoint.instance_id}|interface:${endpoint.interface_ref}`,...endpoint.resource_keys].some(k=>occupied.has(k));}
export function transformedBounds(local,pose,scale=[1,1,1]){return new Box3(new Vector3().fromArray(local[0]),new Vector3().fromArray(local[1])).applyMatrix4(matrix(pose,scale));}
export function transformGroup(session,id,delta){const ids=new Set(groupFor(session,id).instance_ids);return session.instances.map(p=>{if(!ids.has(p.id))return p;const next={...p,...matrixPose(delta.clone().multiply(matrix(p)))};validPose(next);return next;});}
export function boundsOverlap(a,b){return [0,1,2].every(k=>Math.min(a.max.getComponent(k),b.max.getComponent(k))-Math.max(a.min.getComponent(k),b.min.getComponent(k))>CONTACT_EPSILON);}
export function layoutInstances(parts,bounds,orientations={}){
  const rectangles=parts.map(part=>{const source=validPose(part),pose=validPose({...source,quaternion:orientations[part.id]??restingQuaternion({...part,...source},bounds[part.id])}),box=transformedBounds(bounds[part.id],{...pose,position:[0,0,0]},part.scale);return {part,pose,box,size:box.getSize(new Vector3())};});
  const width=Math.max(.65,Math.sqrt(rectangles.reduce((n,r)=>n+(r.size.x+.018)*(r.size.y+.018),0))*1.35);
  let x=0,y=0,row=0;const instances=[];
  for(const r of rectangles){if(x+r.size.x>width&&x>0){x=0;y+=row+.018;row=0;}instances.push({id:'instance:'+r.part.id,part_ref:r.part.id,position:[x-r.box.min.x,y-r.box.min.y,-r.box.min.z+.0002],quaternion:r.pose.quaternion});x+=r.size.x+.018;row=Math.max(row,r.size.y);}
  const height=y+row;for(const p of instances){p.position[0]-=width/2;p.position[1]-=height/2;}return instances;
}
export function content(session){return clone({instances:session.instances,connections:session.connections,reference_assembly:session.reference_assembly??null,reference_configuration_ref:session.reference_configuration_ref,assembly_policy:session.assembly_policy});}
export function pushHistory(session,label,before){session.past=[...session.past,{label,state:before}].slice(-100);session.future=[];}
export function restoreHistory(session,redo=false){const source=redo?session.future:session.past,target=redo?session.past:session.future,item=source.pop();if(!item)fail(redo?'没有可重做的操作。':'没有可撤销的操作。',409);target.push({label:item.label,state:content(session)});Object.assign(session,{reference_configuration_ref:undefined,assembly_policy:undefined},clone(item.state));}
