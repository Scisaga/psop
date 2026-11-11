import {parentPort} from 'node:worker_threads';
import {groupsFor} from './simulate-core.mjs';
import {createMotionGeometry} from './simulate-path-geometry.mjs';
import {planAssemblyProcess} from './simulate-assembly-process.mjs';
import {optimizeAssemblyPresentation} from './simulate-process-optimize.mjs';
import {auditSimulationProcess} from './simulate-process-audit.mjs';

const contexts=new Map();
parentPort.on('message',async({id,input})=>{
 try{
  const started=performance.now();let context=contexts.get(input.package_digest+'|'+input.planned.reference_assembly.configuration_ref);
  if(!context){if(contexts.size>=2){const oldest=contexts.keys().next().value;contexts.get(oldest).geometry.close();contexts.delete(oldest);}context={geometry:await createMotionGeometry({parts:input.scene.parts,geometries:input.geometries,reference_instances:input.planned.instances}),processes:new Map()};contexts.set(input.package_digest+'|'+input.planned.reference_assembly.configuration_ref,context);}
  const details=new Map(input.details),retained=input.session.connections.filter(c=>input.planned.connections.some(p=>p.id===c.id)),units=groupsFor(input.planned.instances,retained).map(g=>g.instance_ids),key=JSON.stringify(units.map(u=>[...u].sort()).sort((a,b)=>a[0].localeCompare(b[0])));
  let process=context.processes.get(key);if(!process){process=planAssemblyProcess({scene:input.scene,instances:input.planned.instances,details,geometry:context.geometry,initialUnits:units});context.processes.set(key,process);if(context.processes.size>8)context.processes.delete(context.processes.keys().next().value);}
  const result=optimizeAssemblyPresentation({...input,details,geometry:context.geometry,process}),audit=auditSimulationProcess({scene:input.scene,initial:input.session.instances,operation:result.operation,geometry:context.geometry,sampleWaypoints:true});
  // An observed new intrusion never silently receives a clear-path label.
  if(audit.issues.length)throw Object.assign(Error('装配转运复核发现未避开的实体或台面；场景保持原状，请调整后重试。'),{issues:audit.issues.slice(0,8)});
  const check=result.reference_assembly.process_check;check.audit={method:audit.method,snapshot_count:audit.snapshot_count,pair_checks:audit.pair_checks,new_intrusion_observations:0,reference_handoff_count:audit.reference_handoff_count,continuous_rigid_path_status:audit.continuous_rigid_path_status};check.planning_ms=performance.now()-started;
  parentPort.postMessage({id,result});
 }catch(error){parentPort.postMessage({id,error:{message:error.message,issues:error.issues}});}
});
