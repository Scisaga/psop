import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import * as THREE from 'three';
import {Scissors,Link2} from 'lucide-react';
import {SimulationPresentation} from './SimulationPresentation';
import {placeConnectionAnnotations} from './simulate-annotations';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {loadWorkshopAssets,type WorkshopAssets} from './simulate-environment-assets';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/examples/jsm/postprocessing/GTAOPass.js';
import type {OutlinePass} from 'three/examples/jsm/postprocessing/OutlinePass.js';
import {createSimulationOutline} from './simulate-outline';
import {createConnectionThumbnails} from './simulate-connection-thumbnail';
import {SMAAPass} from 'three/examples/jsm/postprocessing/SMAAPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {prepareSourceDisplayNormals} from './source-display-normals';
import {createWorkshop} from './simulate-environment';
import {projectEnvelope,proximity} from './simulate-proximity';
import type {Part,PrototypeData,Vec3} from './types';
import type {AutomaticAssemblyProgress,ConnectionCandidate,ConnectionPreview,RenderQuality,SimulationInterface,SimulationMetrics,SimulationPose,SimulationSession,SimulationTool,SimulationPresentationMode} from './simulate-types';

interface Props {data:PrototypeData;session:SimulationSession;selectedId:string|null;showConnectionAnnotations?:boolean;hiddenIds:Set<string>;targetIds?:string[];candidates:ConnectionCandidate[];interfaces:SimulationInterface[];preview:ConnectionPreview|null;previewCandidate:ConnectionCandidate|null;quality:RenderQuality;tool:SimulationTool;disabled:boolean;transition:string;onSelect:(id:string,inspect?:boolean)=>void;onMove:(id:string,pose:SimulationPose)=>void;onNear:(id:string|null,point?:{x:number;y:number})=>void;onManipulate:(active:boolean)=>void;onMetrics:(metrics:SimulationMetrics)=>void;onReady:()=>void;onDisconnect:(id:string)=>void;onShowConnections:()=>void;onPresentation:(mode:SimulationPresentationMode)=>void;onAutomaticProgress:(progress:AutomaticAssemblyProgress|null)=>void}
export interface SimulationCanvasHandle {focus:(ids?:string[])=>void;setView:(view:'iso'|'top'|'front'|'right'|'workshop')=>void;cancel:()=>void;restore:()=>void;prepareConnection:()=>void;getConnectionThumbnail:(candidate:ConnectionCandidate)=>Promise<string|null>;getPose:(id:string)=>SimulationPose|null;suspendProximity:()=>void;toggleAutomaticPause:()=>void;setAutomaticSpeed:(speed:number)=>void;setAutomaticCameraFollow:(enabled:boolean)=>void}
type PartMesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
type RecordPart={part:Part;mesh:PartMesh};
type Drag={id:string;pointerId:number;point:THREE.Vector3;plane:THREE.Plane;x:number;y:number;moved:boolean;poses:Map<string,THREE.Matrix4>};
type GizmoDrag={id:string;start:THREE.Matrix4;poses:Map<string,THREE.Matrix4>};
type Runtime={renderer:THREE.WebGLRenderer;scene:THREE.Scene;camera:THREE.PerspectiveCamera;orbit:OrbitControls;gizmo:TransformControls;pivot:THREE.Object3D;records:Map<string,RecordPart>;thumbnails:ReturnType<typeof createConnectionThumbnails>;composer:EffectComposer;ao:GTAOPass;outline:OutlinePass;compatibleOutline:OutlinePass;light:THREE.DirectionalLight;dirty:boolean;projectionDirty:boolean;disposed:boolean;ready:boolean;drag:Drag|null;gizmoDrag:GizmoDrag|null;presentation:SimulationPresentation;ghost:THREE.Group;markers:THREE.Group;nearTargets:{id:string;ids:string[]}[];selectionKey:string|null;proximityArmed:boolean;quality:Exclude<RenderQuality,'auto'>;near:string|null;pointed:string|null;pendingNear:string|null;nearSince:number;interaction:boolean;frames:number[];lastFrame:number;sampleAt:number;renders:number;autoAt:number;flight:{start:number;fromP:THREE.Vector3;fromT:THREE.Vector3;toP:THREE.Vector3;toT:THREE.Vector3}|null;environment:ReturnType<typeof createWorkshop>|null};
const directions={iso:new THREE.Vector3(.45,-1.8,.92).normalize(),top:new THREE.Vector3(.001,-.001,1).normalize(),front:new THREE.Vector3(.001,-1,.14).normalize(),right:new THREE.Vector3(1,.001,.14).normalize()};
const pose=(mesh:THREE.Object3D):SimulationPose=>({position:mesh.position.toArray() as Vec3,quaternion:mesh.quaternion.toArray()});
const groupIds=(p:Props,id:string)=>p.session.groups.find(g=>g.instance_ids.includes(id))?.instance_ids??[id];
function boxFor(r:Runtime,ids?:string[]){const b=new THREE.Box3();for(const [id,record] of r.records)if(record.mesh.visible&&(!ids||ids.includes(id))){record.mesh.updateMatrixWorld();b.union(record.mesh.geometry.boundingBox!.clone().applyMatrix4(record.mesh.matrixWorld));}return b;}
function focus(r:Runtime,ids?:string[],direction?:THREE.Vector3){
 r.camera.fov=34;r.camera.updateProjectionMatrix();
 const b=boxFor(r,ids);if(b.isEmpty())return;if(!ids&&r.environment)b.union(r.environment.overviewBounds);const t=b.getCenter(new THREE.Vector3()),size=b.getSize(new THREE.Vector3()),d=direction??r.camera.position.clone().sub(r.orbit.target).normalize();
 const right=new THREE.Vector3().crossVectors(r.camera.up,d).normalize(),up=new THREE.Vector3().crossVectors(d,right).normalize(),ty=Math.tan(THREE.MathUtils.degToRad(r.camera.fov*.5)),tx=ty*r.camera.aspect,margin=ids?1.4:1.18;let distance=.08;
 for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const v=new THREE.Vector3(x,y,z).sub(t);distance=Math.max(distance,v.dot(d)+Math.abs(v.dot(right))*margin/tx,v.dot(d)+Math.abs(v.dot(up))*margin/ty);}
 distance=Math.max(distance,size.length()*.9);const p=t.clone().addScaledVector(d,distance);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){r.camera.position.copy(p);r.orbit.target.copy(t);r.orbit.update();}else r.flight={start:performance.now(),fromP:r.camera.position.clone(),fromT:r.orbit.target.clone(),toP:p,toT:t};r.dirty=true;
}
function clearGroup(group:THREE.Group){for(const child of [...group.children]){group.remove(child);if(child instanceof THREE.Mesh||child instanceof THREE.Line){if(child.userData.ownGeometry)child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const m of materials)m.dispose();}}}
function configureQuality(r:Runtime,quality:Exclude<RenderQuality,'auto'>,host:HTMLDivElement){
 r.quality=quality;const scale={high:2,balanced:1.5,performance:1}[quality],shadow={high:4096,balanced:2048,performance:1024}[quality];
 r.renderer.setPixelRatio(Math.min(devicePixelRatio||1,scale));r.composer.setPixelRatio(Math.min(devicePixelRatio||1,scale));r.renderer.setSize(host.clientWidth,host.clientHeight,false);r.composer.setSize(host.clientWidth,host.clientHeight);
 r.ao.enabled=quality!=='performance';r.ao.updateGtaoMaterial({radius:.007,distanceExponent:1,thickness:.0015,distanceFallOff:.6,samples:quality==='high'?12:6,screenSpaceRadius:false});
 if(quality==='balanced')r.ao.setSize(Math.max(1,host.clientWidth/2),Math.max(1,host.clientHeight/2));
 if(r.light.shadow.mapSize.x!==shadow){r.light.shadow.map?.dispose();r.light.shadow.map=null;r.light.shadow.mapSize.set(shadow,shadow);}r.renderer.shadowMap.needsUpdate=true;r.dirty=true;
 r.environment?.setQuality(quality);r.projectionDirty=true;
}
function updateSelection(r:Runtime,p:Props){
 if(r.selectionKey!==p.selectedId){r.selectionKey=p.selectedId;r.proximityArmed=false;r.near=null;r.pendingNear=null;}
 const selected=new Set(p.selectedId?groupIds(p,p.selectedId):[]),compatible=new Set(p.targetIds??p.candidates.map(c=>c.target_instance_id));
 for(const g of p.session.groups)if(g.instance_ids.some(id=>compatible.has(id)))for(const id of g.instance_ids)compatible.add(id);
 for(const [id,rec] of r.records){rec.mesh.visible=!p.hiddenIds.has(id);rec.mesh.material.emissive.set(selected.has(id)?'#234d66':'#000000');rec.mesh.material.emissiveIntensity=selected.has(id)?.1:0;}
 const byInstance=new Map(p.session.groups.flatMap(g=>g.instance_ids.map(id=>[id,g] as const))),targets=new Map<string,{id:string;ids:string[]}>();for(const targetId of p.targetIds??p.candidates.map(c=>c.target_instance_id)){if(selected.has(targetId))continue;const group=byInstance.get(targetId);if(group&&!targets.has(group.id))targets.set(group.id,{id:targetId,ids:group.instance_ids});}r.nearTargets=[...targets.values()];
  r.compatibleOutline.selectedObjects=[...compatible].filter(id=>!selected.has(id)).map(id=>r.records.get(id)?.mesh).filter((m):m is PartMesh=>!!m&&m.visible);r.compatibleOutline.enabled=r.compatibleOutline.selectedObjects.length>0;
 r.outline.selectedObjects=[...selected].map(id=>r.records.get(id)?.mesh).filter((m):m is PartMesh=>!!m&&m.visible);r.outline.enabled=r.outline.selectedObjects.length>0;
 if(p.selectedId&&p.tool!=='select'&&!p.disabled&&!r.presentation.active&&!r.drag&&!r.gizmoDrag){const b=boxFor(r,[...selected]);if(!b.isEmpty()){r.pivot.position.copy(b.getCenter(new THREE.Vector3()));r.pivot.quaternion.identity();r.pivot.updateMatrixWorld();r.gizmo.setMode(p.tool);r.gizmo.attach(r.pivot);r.gizmo.enabled=true;}}
 else if(!r.gizmoDrag)r.gizmo.detach();r.dirty=true;r.projectionDirty=true;
}
function snapshot(r:Runtime,p:Props){
 r.flight=null;r.presentation.accept(p.session,p.transition,r.ready);
 if(p.transition==='move')r.proximityArmed=true;
 r.renderer.shadowMap.needsUpdate=true;updateSelection(r,p);
}
function preview(r:Runtime,p:Props){
 clearGroup(r.ghost);clearGroup(r.markers);r.dirty=true;if(!p.preview||p.preview.status!=='ready')return;
 for(const instance of p.preview.poses){const source=r.records.get(instance.id);if(!source)continue;const m=new THREE.MeshStandardMaterial({color:'#70c7bb',roughness:.5,metalness:.12,transparent:true,opacity:.25,depthWrite:false});const mesh=new THREE.Mesh(source.mesh.geometry,m);mesh.position.fromArray(instance.position);mesh.quaternion.fromArray(instance.quaternion);mesh.scale.copy(source.mesh.scale);mesh.renderOrder=3;r.ghost.add(mesh);}
 const c=p.previewCandidate;if(c){const moving=p.preview.poses.find(i=>i.id===c.moving_instance_id),target=p.preview.poses.find(i=>i.id===c.target_instance_id)??p.session.instances.find(i=>i.id===c.target_instance_id),movingMesh=r.records.get(c.moving_instance_id)?.mesh,targetMesh=r.records.get(c.target_instance_id)?.mesh;if(moving&&target&&movingMesh&&targetMesh){const matrixA=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(moving.position),new THREE.Quaternion().fromArray(moving.quaternion),movingMesh.scale),matrixB=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(target.position),new THREE.Quaternion().fromArray(target.quaternion),targetMesh.scale),points:number[]=[];
  for(let i=0;i<c.marker_points[0].length;i++){const a=new THREE.Vector3().fromArray(c.marker_points[0][i]).applyMatrix4(matrixA),b=new THREE.Vector3().fromArray(c.marker_points[1][i]).applyMatrix4(matrixB);points.push(...a.toArray(),...b.toArray());}
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),line=new THREE.LineSegments(geometry,new THREE.LineDashedMaterial({color:'#39a38f',dashSize:.002,gapSize:.001,depthTest:false}));line.computeLineDistances();line.userData.ownGeometry=true;r.markers.add(line);}}
 r.dirty=true;
}

export default forwardRef<SimulationCanvasHandle,Props>(function SimulationCanvas(props,ref){
 const annotationLayer=useRef<HTMLDivElement>(null),labelRefs=useRef(new Map<string,HTMLButtonElement>()),lineRefs=useRef(new Map<string,SVGPathElement>()),annotationSides=useRef(new Map<string,number>());
 const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef(props);latest.current=props;const [load,setLoad]=useState({done:0,total:props.data.parts.length}),[error,setError]=useState(''),[environmentReady,setEnvironmentReady]=useState(false);
 useImperativeHandle(ref,()=>({
  focus(ids){const r=runtime.current;if(r){if(r.presentation.mode==='auto')r.presentation.setAutomaticCameraFollow(false);else r.presentation.finish();focus(r,ids);}},
  setView(view){const r=runtime.current;if(r){if(r.presentation.mode==='auto')r.presentation.setAutomaticCameraFollow(false);else r.presentation.finish();if(view==='workshop'){
   const toP=new THREE.Vector3(1,-2.5,1.12),toT=new THREE.Vector3(0,.6,.25);r.camera.fov=55;r.camera.updateProjectionMatrix();
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){r.camera.position.copy(toP);r.orbit.target.copy(toT);r.orbit.update();r.flight=null;}else r.flight={start:performance.now(),fromP:r.camera.position.clone(),fromT:r.orbit.target.clone(),toP,toT};
   r.dirty=true;
  }else focus(r,latest.current.selectedId?groupIds(latest.current,latest.current.selectedId):undefined,directions[view]);}},
  suspendProximity(){const r=runtime.current;if(r){r.proximityArmed=false;r.near=null;r.pendingNear=null;}},
  prepareConnection(){const r=runtime.current;if(r){r.presentation.prepare(r.flight?{position:r.flight.toP.clone(),target:r.flight.toT.clone()}:undefined);r.flight=null;}},
  getPose(id){const rec=runtime.current?.records.get(id);return rec?pose(rec.mesh):null;},
  getConnectionThumbnail(candidate){const r=runtime.current,moving=r?.records.get(candidate.moving_instance_id),target=r?.records.get(candidate.target_instance_id);return r?.ready&&!r.disposed&&moving&&target?r.thumbnails.render(candidate,moving,target):Promise.resolve(null);},
  toggleAutomaticPause(){runtime.current?.presentation.toggleAutomaticPause();},
  setAutomaticSpeed(speed){runtime.current?.presentation.setAutomaticSpeed(speed);},
  setAutomaticCameraFollow(enabled){runtime.current?.presentation.setAutomaticCameraFollow(enabled);},
  restore(){const r=runtime.current;if(r){r.presentation.finish();snapshot(r,{...latest.current,transition:''});}},
  cancel(){const r=runtime.current;if(!r)return;r.presentation.finish();const d=r.drag??r.gizmoDrag;
   if(d)for(const [id,m]of d.poses){const rec=r.records.get(id);if(rec)m.decompose(rec.mesh.position,rec.mesh.quaternion,rec.mesh.scale);}
   r.drag=null;r.gizmoDrag=null;r.proximityArmed=false;r.near=null;r.pendingNear=null;r.orbit.enabled=true;latest.current.onManipulate(false);r.dirty=true;r.renderer.shadowMap.needsUpdate=true;
  }
 }),[]);
 useEffect(()=>{
  const element=host.current!;setEnvironmentReady(false);setError('');setLoad({done:0,total:props.session.instances.length});element.dataset.simReady='false';element.dataset.simBackgroundReady='false';let frameId=0,alive=true;const controller=new AbortController(),owned=new Set<THREE.BufferGeometry>(),materials:THREE.Material[]=[];let environmentMap:THREE.WebGLRenderTarget|null=null,environmentAssets:WorkshopAssets|null=null;
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});}catch(e){setError('无法启动三维工作台，请开启浏览器硬件加速后重试。');return;}
  renderer.domElement.className='simulation-webgl';renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.info.autoReset=false;element.prepend(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#293c45');const camera=new THREE.PerspectiveCamera(34,1,.001,100);camera.up.set(0,0,1);camera.position.set(.7,-.95,.85);
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.minDistance=.035;orbit.maxDistance=3.6;orbit.maxPolarAngle=Math.PI*.49;orbit.target.set(0,0,.025);
  scene.add(new THREE.HemisphereLight('#e5e3d8','#35352d',.65));const light=new THREE.DirectionalLight('#fff0df',2.5);light.position.set(-.65,-.5,1.4);light.target.position.set(0,0,-.12);light.castShadow=true;light.shadow.mapSize.set(4096,4096);light.shadow.camera.left=light.shadow.camera.bottom=-1.12;light.shadow.camera.right=light.shadow.camera.top=1.12;light.shadow.camera.near=.1;light.shadow.camera.far=4.8;light.shadow.normalBias=.00008;light.shadow.bias=-.000012;light.shadow.radius=2;scene.add(light,light.target);
  const fill=new THREE.DirectionalLight('#c9d7e4',.55);fill.position.set(.8,-.3,.75);scene.add(fill);const rim=new THREE.DirectionalLight('#c6d2dc',.7);rim.position.set(-.1,.8,.7);scene.add(rim);
  scene.environmentIntensity=.52;scene.environmentRotation.set(Math.PI/2,0,0);scene.backgroundRotation.copy(scene.environmentRotation);
  const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1);ao.blendIntensity=.8;const outline=createSimulationOutline(scene,camera,'selected'),compatibleOutline=createSimulationOutline(scene,camera,'compatible');
  const aa=new SMAAPass(),output=new OutputPass();composer.addPass(renderPass);composer.addPass(ao);composer.addPass(compatibleOutline);composer.addPass(outline);composer.addPass(aa);composer.addPass(output);
  const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.8);const pivot=new THREE.Object3D();scene.add(pivot,gizmo.getHelper());const ghost=new THREE.Group(),markers=new THREE.Group();scene.add(ghost,markers);
  const dotCanvas=document.createElement('canvas');dotCanvas.width=dotCanvas.height=32;const dot=dotCanvas.getContext('2d')!;dot.strokeStyle='#ffffff';dot.lineWidth=3;dot.beginPath();dot.arc(16,16,11,0,Math.PI*2);dot.stroke();dot.fillStyle='#a4e2ca';dot.beginPath();dot.arc(16,16,7,0,Math.PI*2);dot.fill();const dotTexture=new THREE.CanvasTexture(dotCanvas);
  const records=new Map<string,RecordPart>();
  const presentation=new SimulationPresentation({scene,camera,orbit,records,dotTexture,source:()=>({session:latest.current.session,interfaces:latest.current.interfaces}),invalidate:()=>{r.dirty=true;renderer.shadowMap.needsUpdate=true;},onAutoProgress:progress=>latest.current.onAutomaticProgress(progress),onChange:mode=>{latest.current.onPresentation(mode);if(!mode){r.proximityArmed=false;r.near=null;r.pendingNear=null;updateSelection(r,latest.current);}}});
  const r:Runtime={renderer,scene,camera,orbit,gizmo,pivot,records,thumbnails:createConnectionThumbnails(renderer,()=>scene.environment),composer,ao,outline,compatibleOutline,light,dirty:true,projectionDirty:true,disposed:false,ready:false,drag:null,gizmoDrag:null,presentation,ghost,markers,nearTargets:[],selectionKey:null,proximityArmed:false,quality:'high',near:null,pointed:null,pendingNear:null,nearSince:0,interaction:false,frames:[],lastFrame:0,sampleAt:0,renders:0,autoAt:0,flight:null,environment:null};runtime.current=r;
  element.dataset.simEnvironment='stark-research-workshop';element.dataset.simWorkshop='stark-research-workshop';element.dataset.simEnvironmentMapping='world-laboratory-3d';
  const assetsReady=loadWorkshopAssets(controller.signal).then(assets=>{if(!alive){assets.dispose();throw new DOMException('Scene disposed','AbortError');}environmentAssets=assets;return assets;});
  // Readiness is awaited below together with the part geometry; never leave a rejected asset promise unobserved.
  assetsReady.catch(()=>{});
  const resize=()=>{if(!element.clientWidth||!element.clientHeight)return;camera.aspect=element.clientWidth/element.clientHeight;camera.updateProjectionMatrix();configureQuality(r,latest.current.quality==='auto'?r.quality:latest.current.quality,element);};const observer=new ResizeObserver(resize);observer.observe(element);resize();
  orbit.addEventListener('change',()=>{r.dirty=true;});orbit.addEventListener('start',()=>{r.presentation.setAutomaticCameraFollow(false);r.flight=null;r.interaction=true;r.frames=[];r.lastFrame=0;});orbit.addEventListener('end',()=>{r.interaction=false;r.sampleAt=0;r.dirty=true;});gizmo.addEventListener('change',()=>{r.dirty=true;});
  function savePoses(id:string){const ids=groupIds(latest.current,id);return new Map(ids.map(id=>{const mesh=r.records.get(id)!.mesh;mesh.updateMatrixWorld();return [id,mesh.matrixWorld.clone()];}));}
  function apply(delta:THREE.Matrix4,poses:Map<string,THREE.Matrix4>){for(const [id,m] of poses){const rec=r.records.get(id);if(rec){delta.clone().multiply(m).decompose(rec.mesh.position,rec.mesh.quaternion,rec.mesh.scale);rec.mesh.updateMatrixWorld();}}r.renderer.shadowMap.needsUpdate=true;r.dirty=true;}
  function finish(id:string){const ids=groupIds(latest.current,id),b=boxFor(r,ids);if(b.min.z<0){for(const key of ids)r.records.get(key)!.mesh.position.z-=b.min.z;r.dirty=true;}const p=pose(r.records.get(id)!.mesh);latest.current.onMove(id,p);latest.current.onManipulate(false);r.orbit.enabled=true;}
  gizmo.addEventListener('mouseDown',()=>{const id=latest.current.selectedId;if(!id)return;pivot.updateMatrixWorld();r.proximityArmed=true;r.near=null;r.pendingNear=null;r.gizmoDrag={id,start:pivot.matrixWorld.clone(),poses:savePoses(id)};orbit.enabled=false;latest.current.onManipulate(true);});
  gizmo.addEventListener('objectChange',()=>{if(!r.gizmoDrag)return;pivot.updateMatrixWorld();apply(pivot.matrixWorld.clone().multiply(r.gizmoDrag.start.clone().invert()),r.gizmoDrag.poses);});
  gizmo.addEventListener('mouseUp',()=>{const d=r.gizmoDrag;r.gizmoDrag=null;r.sampleAt=0;if(d)finish(d.id);});
  const pointer=new THREE.Vector2(),ray=new THREE.Raycaster();
  const rayFor=(e:PointerEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);return ray;};
  const down=(e:PointerEvent)=>{if(e.button!==0||!r.ready||latest.current.disabled||r.presentation.active||r.gizmo.axis)return;const hit=rayFor(e).intersectObjects([...r.records.values()].filter(r=>r.mesh.visible).map(r=>r.mesh),false)[0];if(!hit)return;const id=hit.object.userData.instanceId as string;latest.current.onSelect(id,e.altKey);e.stopImmediatePropagation();e.preventDefault();if(e.altKey)return;orbit.enabled=false;r.flight=null;r.near=null;r.pendingNear=null;r.pointed=null;r.proximityArmed=false;r.drag={id,pointerId:e.pointerId,point:hit.point.clone(),plane:new THREE.Plane(new THREE.Vector3(0,0,1),-hit.point.z),x:e.clientX,y:e.clientY,moved:false,poses:savePoses(id)};renderer.domElement.setPointerCapture(e.pointerId);};
  const move=(e:PointerEvent)=>{const d=r.drag;if(!d||e.pointerId!==d.pointerId)return;e.stopImmediatePropagation();if(!d.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<=4)return;if(!d.moved){d.moved=true;r.proximityArmed=true;gizmo.detach();latest.current.onManipulate(true);}const cast=rayFor(e);let pointed:string|null=null,hitDistance=Infinity;const members=groupIds(latest.current,d.id);for(const [id,rec] of r.records){if(members.includes(id)||!rec.mesh.visible)continue;rec.mesh.updateMatrixWorld();const hit=cast.ray.intersectBox(rec.mesh.geometry.boundingBox!.clone().applyMatrix4(rec.mesh.matrixWorld),new THREE.Vector3());if(hit&&hit.distanceTo(cast.ray.origin)<hitDistance){hitDistance=hit.distanceTo(cast.ray.origin);pointed=id;}}r.pointed=pointed;const hit=cast.ray.intersectPlane(d.plane,new THREE.Vector3());if(hit)apply(new THREE.Matrix4().makeTranslation(hit.x-d.point.x,hit.y-d.point.y,0),d.poses);};
  const up=(e:PointerEvent)=>{const d=r.drag;if(!d||e.pointerId!==d.pointerId)return;e.stopImmediatePropagation();r.drag=null;r.sampleAt=0;orbit.enabled=true;if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);if(d.moved)finish(d.id);else updateSelection(r,latest.current);};
  const cancel=()=>{if(r.presentation.mode==='auto'){r.presentation.pauseAutomatic();return;}r.presentation.finish();const d=r.drag??r.gizmoDrag;if(d)for(const [id,m] of d.poses)m.decompose(r.records.get(id)!.mesh.position,r.records.get(id)!.mesh.quaternion,r.records.get(id)!.mesh.scale);r.drag=null;r.gizmoDrag=null;r.proximityArmed=false;r.near=null;r.pendingNear=null;orbit.enabled=true;latest.current.onManipulate(false);r.dirty=true;r.renderer.shadowMap.needsUpdate=true;};
  const double=(e:MouseEvent)=>{e.preventDefault();if(latest.current.selectedId)focus(r,groupIds(latest.current,latest.current.selectedId));};
  renderer.domElement.addEventListener('pointerdown',down,true);renderer.domElement.addEventListener('pointermove',move,true);renderer.domElement.addEventListener('pointerup',up,true);renderer.domElement.addEventListener('pointercancel',cancel);renderer.domElement.addEventListener('dblclick',double);window.addEventListener('blur',cancel);
  const sourceCache=new Map<string,Promise<THREE.BufferGeometry>>(),loader=new STLLoader();let done=0;
  const source=(part:Part)=>{if(!sourceCache.has(part.geometryUrl))sourceCache.set(part.geometryUrl,fetch(part.geometryUrl,{signal:controller.signal}).then(async res=>{if(!res.ok)throw Error('部件模型读取失败。');const bytes=await res.arrayBuffer();if(!alive)throw new DOMException('Scene disposed','AbortError');const g=loader.parse(bytes);g.computeBoundingBox();prepareSourceDisplayNormals(g);owned.add(g);return g;}));return sourceCache.get(part.geometryUrl)!;};
  const loadAll=async()=>{const items=[...latest.current.session.instances];let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<items.length){const instance=items[cursor++],part=latest.current.data.parts.find(p=>p.id===instance.part_ref)!;const geometry=await source(part);if(!alive)return;const rgba=part.rgba??[.7,.75,.73,1],material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(rgba[0],rgba[1],rgba[2],THREE.SRGBColorSpace),roughness:part.kind==='shell'?.38:part.kind==='bearing'?.24:.46,metalness:part.kind==='bearing'?.8:part.kind==='structure'?.3:part.kind==='actuator'?.35:.05});materials.push(material);const mesh=new THREE.Mesh(geometry,material);mesh.position.fromArray(instance.position);mesh.quaternion.fromArray(instance.quaternion);mesh.scale.fromArray(part.scale);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.instanceId=instance.id;scene.add(mesh);r.records.set(instance.id,{part,mesh});setLoad({done:++done,total:items.length});}}));
    const assets=await assetsReady;if(!alive)return;const pmrem=new THREE.PMREMGenerator(renderer),reflectionRoom=new RoomEnvironment();try{environmentMap=pmrem.fromScene(reflectionRoom,.035);scene.environment=environmentMap.texture;}finally{reflectionRoom.dispose();pmrem.dispose();}scene.background=new THREE.Color('#4e504d');
    const all=boxFor(r),size=all.getSize(new THREE.Vector3());r.environment=createWorkshop(latest.current.session.table?.width??Math.max(1.0,size.x+.26),latest.current.session.table?.height??Math.max(.65,size.y+.23),assets);r.environment.setQuality(r.quality);scene.add(r.environment.group);element.dataset.simBackgroundReady='true';element.dataset.simBackgroundResolution='native-3d';element.dataset.simArchitecture='rectangular-private-workshop';element.dataset.simMaterials='4k-color/2k-normal-arm';element.dataset.simFloorZ=String(r.environment.floorZ);snapshot(r,latest.current);r.ready=true;setEnvironmentReady(true);focus(r,undefined,directions.iso);r.dirty=true;renderer.shadowMap.needsUpdate=true;latest.current.onReady();};
  loadAll().catch(e=>{if(alive&&e.name!=='AbortError')setError(e.message);});
  function nearest(now:number){
    if(!r.ready||!latest.current.selectedId||!r.proximityArmed||r.presentation.active||!r.dirty&&r.pendingNear===r.near)return;
    const p=latest.current,selected=groupIds(p,p.selectedId!);camera.updateMatrixWorld();
    const cache=new Map<string,{bounds:THREE.Box3;screen:ReturnType<typeof projectEnvelope>}>();
    const member=(id:string)=>{if(cache.has(id))return cache.get(id)!;const mesh=r.records.get(id)?.mesh;if(!mesh?.visible)return null;mesh.updateMatrixWorld();const bounds=mesh.geometry.boundingBox!,value={bounds:bounds.clone().applyMatrix4(mesh.matrixWorld),screen:projectEnvelope([{bounds,matrix:mesh.matrixWorld}],camera,element.clientWidth,element.clientHeight)};cache.set(id,value);return value;};
    const selectedMembers=selected.map(member).filter((m):m is NonNullable<typeof m>=>!!m);
    const eligible=r.nearTargets.flatMap(target=>{
      const retained=target.ids.includes(r.near??'');let closest:ReturnType<typeof proximity>|null=null,anchor:{x:number;y:number}|undefined;
      for(const id of target.ids){const b=member(id);if(!b)continue;for(const a of selectedMembers){const distance=proximity(a.bounds,b.bounds,a.screen,b.screen,retained);if(distance.near&&(!closest||distance.score<closest.score)){closest=distance;anchor=b.screen?.center;}}}
      return closest?[{...target,retained,pointed:target.ids.includes(r.pointed??''),score:closest.score,anchor}]:[];
    }).sort((a,b)=>Number(b.pointed)-Number(a.pointed)||a.score-b.score);
    const retained=eligible.find(t=>t.retained),pointed=eligible.find(t=>t.pointed),best=retained&&(!pointed||pointed.id===retained.id)?retained:pointed??eligible[0],id=best?.id??null;
    if(id!==r.pendingNear){r.pendingNear=id;r.nearSince=now;}
    // Explicit browsing pauses discovery; the next movement always restores distance-based dismissal.
    if(!id){r.near=null;p.onNear(null);return;}
    if(id!==r.near&&now-r.nearSince>=(retained?360:180)){r.near=id;p.onNear(id,best?.anchor);}
  }
  function updateAnnotations(){
    const layer=annotationLayer.current;if(!layer)return;
    layer.style.visibility=r.presentation.active||r.drag?.moved||r.gizmoDrag?'hidden':'visible';
    const p=latest.current,ids=p.selectedId?groupIds(p,p.selectedId):[],connections=p.session.connections.filter(c=>c.endpoints.some(e=>ids.includes(e.instance_id))).slice(0,12),anchors=[];
    camera.updateMatrixWorld();
    for(const c of connections){
      const button=labelRefs.current.get(c.id),line=lineRefs.current.get(c.id);if(!button)continue;
      const a=r.presentation.endpoint(c,0),b=r.presentation.endpoint(c,1),point=a.add(b).multiplyScalar(.5).project(camera),visible=c.endpoints.some(e=>r.records.get(e.instance_id)?.mesh.visible)&&point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1;
      button.hidden=!visible;if(line)line.style.display=visible?'':'none';
      if(visible)anchors.push({id:c.id,x:(point.x+1)*element.clientWidth/2,y:(1-point.y)*element.clientHeight/2,width:button.offsetWidth||76,height:button.offsetHeight||26});
    }
    const positions=placeConnectionAnnotations(anchors,{width:element.clientWidth,height:element.clientHeight},annotationSides.current);
    for(const position of positions){annotationSides.current.set(position.id,position.side);const button=labelRefs.current.get(position.id)!,line=lineRefs.current.get(position.id),anchor=anchors.find(a=>a.id===position.id)!;button.style.transform=`translate3d(${position.left}px,${position.top}px,0)`;
      if(line){const x=Math.max(position.left,Math.min(position.left+anchor.width,anchor.x)),y=Math.max(position.top,Math.min(position.top+anchor.height,anchor.y));line.setAttribute('d',`M${anchor.x},${anchor.y} L${x},${y}`);}
    }
  }
  // OrbitControls' metre-scale change epsilon skips fine motion on millimetre parts.
  // Observe the actual camera independently while retaining on-demand drawing at rest.
  const renderedPosition=new THREE.Vector3(),renderedQuaternion=new THREE.Quaternion();
  function tick(now:number){
    if(!alive)return;frameId=requestAnimationFrame(tick);orbit.update();if(camera.position.distanceToSquared(renderedPosition)>1e-14||8*(1-Math.abs(renderedQuaternion.dot(camera.quaternion)))>1e-12)r.dirty=true;if(r.flight){const f=r.flight,t=Math.min(1,(now-f.start)/260),v=1-Math.pow(1-t,3);camera.position.lerpVectors(f.fromP,f.toP,v);orbit.target.lerpVectors(f.fromT,f.toT,v);orbit.update();r.dirty=true;if(t===1)r.flight=null;}
    r.presentation.tick(now);
    nearest(now);if(!r.dirty)return;
    const interacting=r.interaction||!!r.drag?.moved||!!r.gizmoDrag,interval=now-r.lastFrame;if(!interacting||interval>=100)r.frames=[];else if(interval>0)r.frames.push(interval);if(r.frames.length>180)r.frames.shift();r.lastFrame=now;camera.near=THREE.MathUtils.clamp(camera.position.distanceTo(orbit.target)*.01,.0003,.02);camera.updateProjectionMatrix();scene.updateMatrixWorld(true);updateAnnotations();renderer.info.reset();const renderStart=performance.now();composer.render();renderedPosition.copy(camera.position);renderedQuaternion.copy(camera.quaternion);element.dataset.simRenderMs=String(performance.now()-renderStart);element.dataset.simDrawCalls=String(renderer.info.render.calls);r.dirty=false;r.renders++;
    element.dataset.simReady=String(r.ready);element.dataset.simRevision=String(latest.current.session.revision);element.dataset.simSelected=latest.current.selectedId??'';element.dataset.simDragging=String(!!r.drag?.moved||!!r.gizmoDrag);element.dataset.simCompatibleOutlines=JSON.stringify(r.compatibleOutline.selectedObjects.map(mesh=>mesh.userData.instanceId));element.dataset.simSelectionOutlines=JSON.stringify(r.outline.selectedObjects.map(mesh=>mesh.userData.instanceId));element.dataset.simCompatibilityMarkers='none';element.dataset.simNear=r.near??'';element.dataset.simRenders=String(r.renders);element.dataset.simAnimating=String(r.presentation.active);element.dataset.simPresentation=r.presentation.mode??'';element.dataset.simCameraTarget=orbit.target.toArray().join(',');element.dataset.simCamera=camera.position.toArray().join(',');element.dataset.simQuality=r.quality;element.dataset.simFov=String(camera.fov);
    if(now-r.sampleAt>250||r.projectionDirty){r.sampleAt=now;r.projectionDirty=false;const projections:Record<string,number[]>={};for(const [id,rec] of r.records)if(rec.mesh.visible){const point=rec.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(rec.mesh.matrixWorld).project(camera);projections[id]=[(point.x+1)*element.clientWidth/2,(1-point.y)*element.clientHeight/2];}element.dataset.simProjections=JSON.stringify(projections);const sorted=[...r.frames].sort((a,b)=>a-b),avg=r.frames.reduce((a,b)=>a+b,0)/r.frames.length,metrics={sample_frames:interacting?r.frames.length:0,fps:avg?1000/avg:0,p95:sorted[Math.floor(sorted.length*.95)]??0,renders:r.renders,triangles:latest.current.data.parts.reduce((sum,part)=>sum+(r.records.get('instance:'+part.id)?.mesh.geometry.getAttribute('position').count??0)/3,0),geometries:renderer.info.memory.geometries,quality:r.quality};element.dataset.simMetrics=JSON.stringify(metrics);latest.current.onMetrics(metrics);
      if(latest.current.quality==='auto'&&r.frames.length>=90&&now-r.autoAt>5000){const next=avg>24?(r.quality==='high'?'balanced':'performance'):avg<18&&now-r.autoAt>15000?(r.quality==='performance'?'balanced':'high'):r.quality;if(next!==r.quality){configureQuality(r,next,element);r.autoAt=now;r.frames=[];}}
    }
  }
  frameId=requestAnimationFrame(tick);
  return()=>{alive=false;r.disposed=true;controller.abort();cancelAnimationFrame(frameId);observer.disconnect();window.removeEventListener('blur',cancel);renderer.domElement.removeEventListener('pointerdown',down,true);renderer.domElement.removeEventListener('pointermove',move,true);renderer.domElement.removeEventListener('pointerup',up,true);renderer.domElement.removeEventListener('pointercancel',cancel);renderer.domElement.removeEventListener('dblclick',double);r.thumbnails.dispose();presentation.dispose();gizmo.dispose();orbit.dispose();dotTexture.dispose();clearGroup(ghost);clearGroup(markers);r.environment?.dispose();for(const g of owned)g.dispose();for(const m of materials)m.dispose();for(const pass of composer.passes)pass.dispose();composer.dispose();environmentMap?.dispose();environmentAssets?.dispose();light.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();if(runtime.current===r)runtime.current=null;};
 },[props.data.meta.packageDigest,props.session.id]);
 useEffect(()=>{const r=runtime.current;if(r?.ready)snapshot(r,props);},[props.session.revision]);
 const targetSelectionKey=(props.targetIds??props.candidates.map(c=>c.target_instance_id)).join('|');
 useEffect(()=>{const r=runtime.current;if(r?.ready)updateSelection(r,props);},[props.selectedId,props.hiddenIds,targetSelectionKey,props.tool,props.disabled]);
 useEffect(()=>{const r=runtime.current;if(r?.ready)preview(r,props);},[props.preview,props.previewCandidate]);
 useEffect(()=>{const r=runtime.current;if(r&&host.current)configureQuality(r,props.quality==='auto'?'high':props.quality,host.current);},[props.quality]);
 const selectedMembers=props.selectedId?groupIds(props,props.selectedId):[],labels=props.showConnectionAnnotations===false?[]:props.session.connections.filter(c=>c.endpoints.some(e=>selectedMembers.includes(e.instance_id)));
 return <div ref={host} className="simulation-canvas" aria-label="交互装配三维工作台">
  <div ref={annotationLayer} className="simulation-annotations" aria-label="模型连接标注">
   <svg className="simulation-annotation-leaders" aria-hidden="true">{labels.slice(0,12).map(c=><path key={c.id} ref={node=>{if(node)lineRefs.current.set(c.id,node);else lineRefs.current.delete(c.id);}}/>)}</svg>
   {labels.slice(0,12).map((c,n)=><button key={c.id} ref={node=>{if(node)labelRefs.current.set(c.id,node);else labelRefs.current.delete(c.id);}} className="simulation-connection-tag" data-sim-connection-label={c.id} aria-label={`拆分连接 ${n+1}：${c.name}`} title={c.endpoints.map(e=>e.interface_name).join(' ↔ ')} disabled={props.disabled} onClick={()=>props.onDisconnect(c.id)}><span className="simulation-annotation-dot"/><Scissors size={11}/><span>拆分 {n+1}</span></button>)}
   {labels.length>12&&<button className="simulation-more-connections" onClick={props.onShowConnections}><Link2 size={12}/>查看全部 {labels.length} 条连接</button>}
  </div>
  {error?<div className="simulation-load-error" role="alert"><strong>模型载入失败</strong><p>{error}</p><button className="bp-button" onClick={()=>location.reload()}>重新加载</button></div>:(load.done<load.total||!environmentReady)&&<div className="simulation-loading"><span className="simulation-loading-ring"/><strong>正在布置工作台</strong><span>{load.done<load.total?`${load.done} / ${load.total} 个部件`:'正在准备高清环境…'}</span></div>}
 </div>;
});
