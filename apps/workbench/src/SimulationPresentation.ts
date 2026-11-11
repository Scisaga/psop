import * as THREE from 'three';
import type {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {connectionProgress,CONNECTION_DURATION,rigidMotion} from './simulate-motion.ts';
import {SimulationCinematic} from './SimulationCinematic.ts';
import type {AutomaticAssemblyProgress,SimulationConnection,SimulationInterface,SimulationPose,SimulationSession,SimulationPresentationMode} from './simulate-types';
import type {Vec3} from './types';

type Mesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
export type CameraView={position:THREE.Vector3;target:THREE.Vector3};
type State={mode:'connect'|'settle';start:number;duration:number;from:SimulationPose;to:SimulationPose;matrices:Map<string,THREE.Matrix4>;final:Map<string,SimulationPose>;targetLift:Map<string,{from:SimulationPose;to:SimulationPose}>;approach:SimulationPose;approachMatrices:Map<string,THREE.Matrix4>;lift:number;camera?:{bookmark:CameraView;start:CameraView;detail:CameraView};connection?:SimulationConnection};
type Context={scene:THREE.Scene;camera:THREE.PerspectiveCamera;orbit:OrbitControls;records:Map<string,{mesh:Mesh}>;dotTexture:THREE.Texture;source:()=>{session:SimulationSession;interfaces:SimulationInterface[]};invalidate:()=>void;onChange:(mode:SimulationPresentationMode)=>void;onAutoProgress?:(progress:AutomaticAssemblyProgress|null)=>void};
const pose=(mesh:THREE.Object3D):SimulationPose=>({position:mesh.position.toArray() as Vec3,quaternion:mesh.quaternion.toArray()});

/** Presentation follows an already committed result. Skipping always lands at that result. */
export class SimulationPresentation {
  private context:Context;
  private state:State|null=null;
  private known=new Set<string>();
  private bookmark:CameraView|null=null;
  private geometry:THREE.BufferGeometry;
  private points:THREE.Points<THREE.BufferGeometry,THREE.PointsMaterial>;
  private line:THREE.Line<THREE.BufferGeometry,THREE.LineBasicMaterial>;
  private cinematic:SimulationCinematic;
  constructor(context:Context){
    this.context=context;
    this.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
    this.points=new THREE.Points(this.geometry,new THREE.PointsMaterial({size:12,map:context.dotTexture,color:'#58d0b4',transparent:true,depthTest:false,sizeAttenuation:false}));
    this.line=new THREE.Line(this.geometry,new THREE.LineBasicMaterial({color:'#71d6be',transparent:true,opacity:.75,depthTest:false}));
    this.points.frustumCulled=this.line.frustumCulled=false;this.points.visible=this.line.visible=false;this.points.renderOrder=this.line.renderOrder=8;context.scene.add(this.points,this.line);
    this.cinematic=new SimulationCinematic({...context,onProgress:p=>context.onAutoProgress?.(p),onChange:active=>context.onChange(active?'auto':null)});
  }
  get active(){return !!this.state||this.cinematic.active;}
  get mode(){return this.cinematic.active?'auto':this.state?.mode??null;}
  toggleAutomaticPause(){this.cinematic.togglePause();}
  pauseAutomatic(){this.cinematic.pause();}
  setAutomaticSpeed(speed:number){this.cinematic.setSpeed(speed);}
  setAutomaticCameraFollow(enabled:boolean){this.cinematic.setCameraFollow(enabled);}
  prepare(view?:CameraView){const {camera,orbit}=this.context;this.bookmark=view??{position:camera.position.clone(),target:orbit.target.clone()};}
  endpoint(connection:SimulationConnection,index:number,final=false){
    const {records,source}=this.context,{session,interfaces}=source(),endpoint=connection.endpoints[index],mesh=records.get(endpoint.instance_id)?.mesh;
    if(!mesh)return new THREE.Vector3();
    const definition=interfaces.find(i=>i.instance_id===endpoint.instance_id&&i.id===endpoint.interface_ref),local=connection.anchors?.[index]??definition?.position??mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).toArray() as Vec3;
    if(final){const p=session.instances.find(i=>i.id===endpoint.instance_id)!;return new THREE.Vector3().fromArray(local).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().fromArray(p.quaternion),mesh.scale));}
    mesh.updateMatrixWorld();return new THREE.Vector3().fromArray(local).applyMatrix4(mesh.matrixWorld);
  }
  private box(ids:string[]){const box=new THREE.Box3();for(const id of ids){const mesh=this.context.records.get(id)?.mesh;if(mesh){mesh.updateMatrixWorld();box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));}}return box;}
  private framing(box:THREE.Box3):CameraView {
    const {camera,orbit}=this.context,target=box.getCenter(new THREE.Vector3()),direction=camera.position.clone().sub(orbit.target).normalize(),right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right).normalize(),ty=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5)),tx=ty*camera.aspect;let distance=.06;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const v=new THREE.Vector3(x,y,z).sub(target);distance=Math.max(distance,v.dot(direction)+Math.abs(v.dot(right))*1.3/tx,v.dot(direction)+Math.abs(v.dot(up))*1.3/ty);}
    return {position:target.clone().addScaledVector(direction,Math.max(distance,box.getSize(new THREE.Vector3()).length()*.8)),target};
  }
  accept(session:SimulationSession,transition:string,ready:boolean){
    this.finish();
    if(ready&&transition==='auto_assemble'&&session.operation?.type==='auto_assemble'){
      this.known=new Set(session.connections.map(c=>c.id));this.bookmark=null;this.cinematic.start(session,session.operation);return;
    }
    const {records,camera,orbit}=this.context,changed=new Map<string,{from:SimulationPose;to:SimulationPose}>(),fresh=session.connections.find(c=>!this.known.has(c.id));
    for(const instance of session.instances){const mesh=records.get(instance.id)?.mesh;if(!mesh)continue;const to={position:instance.position,quaternion:instance.quaternion};
      if(ready&&['connect','disconnect'].includes(transition)&&(mesh.position.distanceTo(new THREE.Vector3().fromArray(to.position))>1e-7||mesh.quaternion.angleTo(new THREE.Quaternion().fromArray(to.quaternion))>1e-6))changed.set(instance.id,{from:pose(mesh),to});
      else this.apply(instance.id,to);
    }
    this.known=new Set(session.connections.map(c=>c.id));
    const connect=ready&&transition==='connect'&&!!fresh,settle=ready&&transition==='disconnect'&&changed.size>0;
    if((!connect&&!settle)||matchMedia('(prefers-reduced-motion: reduce)').matches){for(const [id,p]of changed)this.apply(id,p.to);this.bookmark=null;return;}
    const id=connect?fresh!.endpoints[0].instance_id:[...changed.keys()][0],mesh=records.get(id)!.mesh,from=pose(mesh),to=changed.get(id)?.to??from;
    const targetIds=new Set(connect&&session.operation?.type==='connect'?session.operation.table_lift.target_instance_ids:[]),targetLift=new Map([...changed].filter(([id])=>targetIds.has(id)));
    const matrices=new Map([...changed.keys()].filter(id=>!targetIds.has(id)).map(id=>{const m=records.get(id)!.mesh;m.updateMatrixWorld();return [id,m.matrixWorld.clone()] as const;})),final=new Map([...changed].map(([id,p])=>[id,p.to])),direction=new THREE.Vector3().fromArray(from.position).sub(new THREE.Vector3().fromArray(to.position));
    if(direction.length()<.002)direction.copy(camera.position).sub(orbit.target);direction.normalize();
    const extent=changed.size?this.box([...changed.keys()]).getSize(new THREE.Vector3()).length():.05,offset=direction.multiplyScalar(THREE.MathUtils.clamp(extent*.3,.015,.04)),approach:SimulationPose={position:new THREE.Vector3().fromArray(to.position).add(offset).toArray() as Vec3,quaternion:to.quaternion},approachMatrices=rigidMotion(from,approach,matrices,1);
    let cameraState:State['camera'];
    if(connect){const center=this.endpoint(fresh!,0,true).add(this.endpoint(fresh!,1,true)).multiplyScalar(.5),pairSize=Math.max(...fresh!.endpoints.map(e=>records.get(e.instance_id)!.mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).length())),radius=THREE.MathUtils.clamp(pairSize*.6,.035,.09),box=new THREE.Box3().setFromCenterAndSize(center,new THREE.Vector3(radius*2,radius*2,radius*1.4));cameraState={bookmark:this.bookmark??{position:camera.position.clone(),target:orbit.target.clone()},start:{position:camera.position.clone(),target:orbit.target.clone()},detail:this.framing(box)};}
    this.state={mode:connect?'connect':'settle',start:performance.now(),duration:connect?CONNECTION_DURATION:850,from,to,matrices,final,targetLift,approach,approachMatrices,lift:THREE.MathUtils.clamp(extent*.35,.025,.09),camera:cameraState,connection:fresh};
    orbit.enabled=false;orbit.enableDamping=false;this.context.onChange(this.state.mode);this.context.invalidate();
  }
  private apply(id:string,p:SimulationPose){const mesh=this.context.records.get(id)?.mesh;if(mesh){mesh.position.fromArray(p.position);mesh.quaternion.fromArray(p.quaternion);mesh.updateMatrixWorld();}}
  tick(now:number){
    if(this.cinematic.active){this.cinematic.tick(now);return;}
    const state=this.state;if(!state)return;const elapsed=now-state.start,{camera,orbit,records}=this.context;let matrices:Map<string,THREE.Matrix4>;
    if(state.mode==='connect'){
      const progress=connectionProgress(elapsed);matrices=progress.phase==='approach'?rigidMotion(state.from,state.approach,state.matrices,Math.min(1,elapsed/320)):rigidMotion(state.approach,state.to,state.approachMatrices,Math.max(0,Math.min(1,(elapsed-320)/760)));
      const view=state.camera!;
      if(progress.phase==='return'){camera.position.lerpVectors(view.detail.position,view.bookmark.position,progress.cameraReturn);orbit.target.lerpVectors(view.detail.target,view.bookmark.target,progress.cameraReturn);}
      else{camera.position.lerpVectors(view.start.position,view.detail.position,progress.approach);orbit.target.lerpVectors(view.start.target,view.detail.target,progress.approach);}
      orbit.update();this.points.visible=this.line.visible=progress.phase!=='return';
    }else matrices=rigidMotion(state.from,state.to,state.matrices,elapsed/state.duration,new THREE.Vector3(),state.lift);
    for(const [id,m]of matrices){const mesh=records.get(id)?.mesh;if(mesh){m.decompose(mesh.position,mesh.quaternion,mesh.scale);mesh.updateMatrixWorld();}}
    for(const [id,p]of state.targetLift)this.apply(id,{position:new THREE.Vector3().fromArray(p.from.position).lerp(new THREE.Vector3().fromArray(p.to.position),THREE.MathUtils.smoothstep(elapsed/320,0,1)).toArray() as Vec3,quaternion:p.to.quaternion});
    if(state.connection&&this.points.visible){const positions=this.geometry.getAttribute('position');for(let i=0;i<2;i++){const p=this.endpoint(state.connection,i);positions.setXYZ(i,p.x,p.y,p.z);}positions.needsUpdate=true;}
    this.context.invalidate();if(elapsed>=state.duration)this.finish();
  }
  finish(){
    if(this.cinematic.active){this.cinematic.finish();return;}
    const state=this.state;if(!state)return;const {camera,orbit}=this.context;
    for(const [id,p]of state.final)this.apply(id,p);
    if(state.camera){camera.position.copy(state.camera.bookmark.position);orbit.target.copy(state.camera.bookmark.target);}
    this.state=null;this.bookmark=null;this.points.visible=this.line.visible=false;orbit.enabled=true;orbit.enableDamping=true;orbit.update();this.context.invalidate();this.context.onChange(null);
  }
  dispose(){this.state=null;this.cinematic.dispose();this.points.removeFromParent();this.line.removeFromParent();this.geometry.dispose();this.points.material.dispose();this.line.material.dispose();}
}
