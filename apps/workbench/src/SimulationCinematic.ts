import * as THREE from 'three';
import type {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {axialRoute,ease,rigidMotion,waypointMotion,type MotionWaypoint} from './simulate-motion.ts';
import {blendAssemblyView,chooseAssemblyShot,frameAssemblyShot,type AssemblyCameraView} from './simulate-cinematic-camera.ts';
import type {AutomaticAssemblyMotion,AutomaticAssemblyOperation,AutomaticAssemblyProgress,AutomaticAssemblyStep,SimulationPose,SimulationSession} from './simulate-types';

type Mesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
type Context={scene:THREE.Scene;camera:THREE.PerspectiveCamera;orbit:OrbitControls;records:Map<string,{mesh:Mesh}>;invalidate:()=>void;onProgress:(progress:AutomaticAssemblyProgress|null)=>void;onChange:(active:boolean)=>void};
type Motion={definition:AutomaticAssemblyMotion;from:SimulationPose;to:SimulationPose;matrices:Map<string,THREE.Matrix4>;approach:SimulationPose;approachMatrices:Map<string,THREE.Matrix4>;route?:MotionWaypoint[]};
type State={session:SimulationSession;operation:AutomaticAssemblyOperation;elapsed:number;last:number;index:number;stepStart:number;motions:Motion[];fromView:AssemblyCameraView;view:AssemblyCameraView;paused:boolean;speed:number;emitted:number;activeIds:Set<string>;cameraFollow:boolean;cameraStart:number;materials:Map<string,{opacity:number;transparent:boolean;depthWrite:boolean;castShadow:boolean}>};
const pose=(mesh:THREE.Object3D):SimulationPose=>({position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray()});
const viewOf=({camera,orbit}:Context):AssemblyCameraView=>({position:camera.position.clone(),target:orbit.target.clone()});

/** One committed result, presented as a continuous sequence. Pause never changes persisted state. */
export class SimulationCinematic {
  private state:State|null=null;
  private context:Context;
  private guides:THREE.LineSegments<THREE.BufferGeometry,THREE.LineBasicMaterial>;
  private path:THREE.Line<THREE.BufferGeometry,THREE.LineBasicMaterial>;
  constructor(context:Context){
    this.context=context;
    this.guides=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#73d8db',transparent:true,opacity:.35,depthWrite:false}));
    this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#b6dfda',transparent:true,opacity:.17,depthWrite:false}));
    this.guides.visible=this.path.visible=false;this.guides.frustumCulled=this.path.frustumCulled=false;context.scene.add(this.guides,this.path);
  }
  get active(){return !!this.state;}
  get paused(){return this.state?.paused??false;}
  private apply(id:string,p:SimulationPose){const mesh=this.context.records.get(id)?.mesh;if(mesh){mesh.position.fromArray(p.position);mesh.quaternion.fromArray(p.quaternion);mesh.updateMatrixWorld();}}
  private box(ids:string[],final=false,overrides?:Map<string,SimulationPose>){
    const box=new THREE.Box3(),targets=new Map(this.state?.session.instances.map(p=>[p.id,p])??[]);
    for(const id of ids){const mesh=this.context.records.get(id)?.mesh;if(!mesh)continue;
      if(final||overrides?.has(id)){const p=overrides?.get(id)??targets.get(id);if(p)box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().fromArray(p.quaternion),mesh.scale)));}
      else{mesh.updateMatrixWorld();box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));}
    }return box;
  }
  start(session:SimulationSession,operation:AutomaticAssemblyOperation){
    this.finish();const {orbit}=this.context,start=viewOf(this.context);orbit.enabled=true;orbit.enableDamping=true;
    this.state={session,operation,elapsed:0,last:performance.now(),index:-1,stepStart:0,motions:[],fromView:start,view:start,paused:false,speed:1,emitted:-Infinity,activeIds:new Set(),cameraFollow:false,cameraStart:0,materials:new Map([...this.context.records].map(([id,{mesh}])=>[id,{opacity:mesh.material.opacity,transparent:mesh.material.transparent,depthWrite:mesh.material.depthWrite,castShadow:mesh.castShadow}]))};
    const all=this.box(session.instances.map(p=>p.id),true),z=all.min.z+.0006,points:number[]=[];
    for(const x of [all.min.x-.018,all.max.x+.018])for(const y of [all.min.y-.018,all.max.y+.018]){const dx=x<all.min.x?.018:-.018,dy=y<all.min.y?.018:-.018;points.push(x+dx,y,z,x,y,z,x,y,z,x,y+dy,z);}
    this.guides.geometry.dispose();this.guides.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.guides.visible=true;
    this.context.onChange(true);this.enter(0);this.emit(true);this.context.invalidate();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)this.finish();
  }
  private enter(index:number){
    const s=this.state!;s.index=index;s.fromView=viewOf(this.context);s.cameraStart=s.elapsed;const step=s.operation.steps[index],{camera,records}=this.context;this.restoreMaterials();
    s.activeIds=new Set(step.motions.flatMap(m=>m.instance_ids));s.motions=step.motions.map(definition=>{
      const anchor=definition.poses[0],from=pose(records.get(anchor.id)!.mesh),to={position:anchor.position,quaternion:anchor.quaternion};
      const matrices=new Map(definition.instance_ids.map(id=>{const mesh=records.get(id)!.mesh;mesh.updateMatrixWorld();return [id,mesh.matrixWorld.clone()];}));
      const direction=new THREE.Vector3().fromArray(from.position).sub(new THREE.Vector3().fromArray(to.position));direction.z=Math.max(.2*direction.length(),direction.z);if(direction.length()<.001)direction.set(.1,-.3,1);direction.normalize();
      const approach:SimulationPose={position:new THREE.Vector3().fromArray(to.position).addScaledVector(direction,.025).toArray(),quaternion:to.quaternion};
      const hostId=definition.insertion?.host_instance_id??definition.approach_host_instance_id,host=hostId?this.box([hostId]):undefined,moving=this.box(definition.instance_ids,false,new Map(definition.poses.map(p=>[p.id,p]))).translate(new THREE.Vector3().fromArray(to.position).negate());
      const route=definition.waypoints?.map(w=>({at:w.at,pose:{position:w.position,quaternion:w.quaternion}}))??(definition.approach_offset_m?axialRoute(from,to,definition.approach_offset_m,Math.max(definition.lift_m,this.box(definition.instance_ids).max.z-from.position[2]+.025),host,moving):undefined);
      return {definition,from,to,matrices,approach,approachMatrices:rigidMotion(from,approach,matrices,1),route};
    });
    const insertion=step.kind==='join'||step.kind==='preassemble',final=step.kind==='join'||step.kind==='reveal',box=this.box(step.focus_ids,final,new Map(step.motions.flatMap(m=>m.poses.map(p=>[p.id,p]))));if(box.isEmpty())return;
    if(insertion){
      if(box.getSize(new THREE.Vector3()).length()<.055)box.expandByScalar(.016);
      const focus=new Set(step.focus_ids),obstacles=[...records].filter(([id])=>!focus.has(id)).map(([id])=>this.box([id]));
      const direction=s.motions[0]?.definition.approach_offset_m?new THREE.Vector3().fromArray(s.motions[0].definition.approach_offset_m):s.motions[0]?new THREE.Vector3().fromArray(s.motions[0].from.position).sub(new THREE.Vector3().fromArray(s.motions[0].to.position)):undefined;
      s.view=chooseAssemblyShot(box,obstacles,camera,s.fromView,direction);
    }else s.view=frameAssemblyShot(box,camera,step.kind==='reveal'?new THREE.Vector3(.9,-1.4,.65):new THREE.Vector3(.45,-1.8,1.25),1.15);
    this.path.visible=false;
    if(insertion&&s.motions.length){
      const m=s.motions[0],a=new THREE.Vector3().fromArray(m.from.position),b=new THREE.Vector3().fromArray(m.to.position),mid=a.clone().lerp(b,.5);mid.z+=.045;
      const points=m.route?m.route.map(p=>new THREE.Vector3().fromArray(p.pose.position)):new THREE.CatmullRomCurve3([a,mid,b]).getPoints(36);this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints(points);this.path.visible=true;
    }
    this.emit(true);
  }
  private applyMotions(step:AutomaticAssemblyStep,progress:number){
    const s=this.state!;
    for(const [n,m]of s.motions.entries()){
      const delay=step.kind==='stage'&&!m.definition.waypoints?n/Math.max(1,s.motions.length)*.2:0,t=THREE.MathUtils.clamp((progress-delay)/(1-delay),0,1);
      const matrices=m.definition.presentation==='reference_handoff'?(t<.75?waypointMotion(m.route!,m.matrices,Math.min(1,t/.6)):rigidMotion(m.from,m.to,m.matrices,1)):m.route?waypointMotion(m.route,m.matrices,t):step.kind==='join'?(t<.72?rigidMotion(m.from,m.approach,m.matrices,t/.72,new THREE.Vector3(),m.definition.lift_m):rigidMotion(m.approach,m.to,m.approachMatrices,(t-.72)/.28)):rigidMotion(m.from,m.to,m.matrices,t,new THREE.Vector3(),m.definition.lift_m);
      for(const [id,matrix]of matrices){const mesh=this.context.records.get(id)!.mesh;matrix.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.updateMatrixWorld();}
      if(m.definition.presentation==='reference_handoff')for(const id of m.definition.instance_ids){const mesh=this.context.records.get(id)!.mesh,opacity=t<.7?1-ease((t-.5)/.2):t<.8?0:ease((t-.8)/.2);mesh.material.transparent=true;mesh.material.opacity=s.materials.get(id)!.opacity*opacity;mesh.material.depthWrite=opacity>.99;mesh.castShadow=opacity>.99;}
    }
    for(const [id,{mesh}]of this.context.records){mesh.material.emissive.set(s.activeIds.has(id)?step.kind==='detach'?'#ba6643':'#397b83':'#000000');mesh.material.emissiveIntensity=s.activeIds.has(id)?.1+Math.sin(progress*Math.PI)*.12:0;}
    this.guides.material.opacity=step.kind==='reveal'?.25*(1-ease(progress)):.12+Math.sin(progress*Math.PI)*.12;
  }
  tick(now:number){
    const s=this.state;if(!s)return;const delta=Math.max(0,Math.min(100,now-s.last));s.last=now;if(s.paused)return;s.elapsed+=delta*s.speed;
    let step=s.operation.steps[s.index];
    while(s.elapsed-s.stepStart>=step.duration_ms){
      for(const m of step.motions)for(const p of m.poses)this.apply(p.id,p);s.stepStart+=step.duration_ms;
      if(s.index+1>=s.operation.steps.length){this.finish();return;}this.enter(s.index+1);step=s.operation.steps[s.index];
    }
    const t=THREE.MathUtils.clamp((s.elapsed-s.stepStart)/step.duration_ms,0,1);this.applyMotions(step,t);
    const {camera,orbit}=this.context;
    if(s.cameraFollow&&step.kind==='reveal'){
      const direction=new THREE.Vector3(.9,-1.4,.65).applyAxisAngle(new THREE.Vector3(0,0,1),(ease(t)-.5)*.72),view=frameAssemblyShot(this.box(step.focus_ids,true),camera,direction,1.15),blend=ease(Math.min(1,t/.28));
      const curved=blendAssemblyView(s.fromView,view,blend);camera.position.copy(curved.position);orbit.target.copy(curved.target);
    }else if(s.cameraFollow){const blend=ease(Math.min(1,(s.elapsed-s.cameraStart)/Math.min(750,step.duration_ms*.68))),curved=blendAssemblyView(s.fromView,s.view,blend);camera.position.copy(curved.position);orbit.target.copy(curved.target);}
    orbit.update();this.emit();this.context.invalidate();
  }
  private emit(force=false){
    const s=this.state;if(!s)return;if(!force&&s.elapsed-s.emitted<100)return;s.emitted=s.elapsed;const step=s.operation.steps[s.index];
    this.context.onProgress({phase:step.kind,chapter:step.chapter,label:step.label,step:s.index+1,step_count:s.operation.steps.length,step_progress:Math.min(1,(s.elapsed-s.stepStart)/step.duration_ms),progress:Math.min(1,s.elapsed/s.operation.total_duration_ms),paused:s.paused,speed:s.speed,reference_count:s.operation.report.reference_connection_count,camera_follow:s.cameraFollow,path_status:step.motions.some(m=>m.presentation==='reference_handoff')?'reference_only':undefined});
  }
  togglePause(){if(this.state){this.state.paused=!this.state.paused;this.state.last=performance.now();this.emit(true);this.context.invalidate();}}
  pause(){if(this.state&&!this.state.paused)this.togglePause();}
  setSpeed(speed:number){if(this.state&&[1,2,4].includes(speed)){this.state.speed=speed;this.emit(true);}}
  setCameraFollow(enabled:boolean){const s=this.state;if(!s||s.cameraFollow===enabled)return;s.cameraFollow=enabled;s.fromView=viewOf(this.context);s.cameraStart=s.elapsed;this.context.orbit.enabled=true;this.emit(true);this.context.invalidate();}
  private restoreMaterials(){if(!this.state)return;for(const [id,original]of this.state.materials){const mesh=this.context.records.get(id)?.mesh;if(!mesh)continue;mesh.material.opacity=original.opacity;mesh.material.transparent=original.transparent;mesh.material.depthWrite=original.depthWrite;mesh.castShadow=original.castShadow;}}
  finish(){
    const s=this.state;if(!s)return;const {camera,orbit,records}=this.context;
    for(const p of s.session.instances)this.apply(p.id,p);
    if(s.cameraFollow){const view=frameAssemblyShot(this.box(s.session.instances.map(p=>p.id),true),camera,new THREE.Vector3(.9,-1.4,.65).applyAxisAngle(new THREE.Vector3(0,0,1),.36),1.15);camera.position.copy(view.position);orbit.target.copy(view.target);}
    for(const {mesh}of records.values()){mesh.material.emissive.set('#000000');mesh.material.emissiveIntensity=0;}
    this.restoreMaterials();this.state=null;this.guides.visible=this.path.visible=false;orbit.enabled=true;orbit.enableDamping=true;orbit.update();this.context.onProgress(null);this.context.onChange(false);this.context.invalidate();
  }
  dispose(){this.state=null;for(const object of [this.guides,this.path]){object.removeFromParent();object.geometry.dispose();object.material.dispose();}}
}
