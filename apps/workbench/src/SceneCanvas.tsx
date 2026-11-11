import {forwardRef,useEffect,useImperativeHandle,useMemo,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {GeometrySelection,Part,PrototypeData,Vec3} from './types';
import {featuresFor,resolveGeometry} from './mechanics-model';
import {prepareSourceDisplayNormals} from './source-display-normals';
import {planExplosion} from './explosion-layout';
import {createSourceSelection,createWitnessMarkers,updateWitnessVisibility,type SourceSelection} from './source-selection';
import {fastenerViews,selectionForFastener,type FastenerView} from './fastener-model';
import {chooseSourceGeometryFocus} from './geometry-focus';
import {makeFastenerScene,presentFasteners,disposeFasteners,fastenerBounds,fastenerPickables,fastenerPickMetadata,type FastenerScene} from './fastener-scene';
import {makeCompatibilityPreview,type CompatibilityPreviewModel,type CompatibilityPreviewRequest} from './compatibility-preview';
import {CompatibilityPreviewControls} from './CompatibilityPreviewControls';
import {createPartThumbnails} from './part-thumbnail';
import './scene.css';

export interface CameraPose {position:Vec3;target:Vec3}
type View='iso'|'front'|'right'|'top';
export interface InspectionState {active:boolean;previousCamera:CameraPose|null;camera:CameraPose;visiblePartIds:string[];mode:'local'|'connection'|'inactive';translucentPartIds:string[];referenceFasteners?:{pathRef:string;representation:'schematic';entry:Vec3;head:Vec3;receiver:Vec3;axis:Vec3}[]}
export interface SceneHandle {
 fitAll():void;focusSelected():void;focusGeometry(selection?:GeometrySelection,scope?:'connection'):void;setView(view:View):void;
 getCameraPose():CameraPose|null;setCameraPose(pose:CameraPose):void;restoreInspection():void;getInspectionState():InspectionState;
 getPartThumbnail(partId:string):string|null;
}
interface Props {
 data:PrototypeData;selectedId:string|null;selection:GeometrySelection|null;hiddenIds:string[];isolateId:string|null;
 explosion:number;showLabels:boolean;showGrid:boolean;clipping:boolean;xray:boolean;showFasteners:boolean;
 onSelect:(id:string)=>void;onPickFastener?:(selection:GeometrySelection)=>void;onPickLocalStructure?:(owner:string,triangle:number)=>void;
 onReady:()=>void;onInspectionChange?:(state:InspectionState)=>void;
 compatibilityPreview?:CompatibilityPreviewRequest|null;onCloseCompatibilityPreview?:()=>void;
}
type RecordMesh={sourceGeometry:THREE.BufferGeometry;part:Part;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;base:THREE.Vector3;offset:THREE.Vector3;color:THREE.Color};
interface Runtime {
 scene:THREE.Scene;camera:THREE.PerspectiveCamera;controls:OrbitControls;renderer:THREE.WebGLRenderer;
 records:Map<string,RecordMesh>;ready:boolean;disposed:boolean;dirty:boolean;view:View;
 thumbnails:ReturnType<typeof createPartThumbnails>;
 selectionDisplay:SourceSelection|null;peerDisplay:{ownerRef:string;display:SourceSelection}|null;witnessMarkers:ReturnType<typeof createWitnessMarkers>|null;fasteners:FastenerScene|null;fastenerKey:string;connectionView:FastenerView|null;overlay:THREE.Group|null;overlayOwner:string|null;overlayBounds:THREE.Box3|null;
 localOwner:string|null;previousCamera:CameraPose|null;inspectionExplosion:number|null;flight:CameraPose|null;
 clipping:THREE.Plane;grid:THREE.GridHelper;floor:THREE.Mesh;
 lastExplosion:number;transparencyRanks:Map<string,number>;sortDirty:boolean;controlsActive:boolean;cameraChangedAt:number;renderCount:number;
 focusVisibility?:{visibleSamples:number;sampleCount:number};
 preview?:{model:CompatibilityPreviewModel;cameraBefore:CameraPose;progress:number;playing:boolean;lastTime:number;notifyAt:number};
}
const SCENE_BACKGROUND='#9fbfda',GROUND_COLOR='#b5c9b3';
const PALETTE={structure:'#bdcdc7',shell:'#dce2df',actuator:'#35424a',electronics:'#377e79',bearing:'#a8b3c0',other:'#c7d0d9'};
const VIEWS={iso:new THREE.Vector3(1.15,-1.7,.82).normalize(),front:new THREE.Vector3(1,0,.025).normalize(),right:new THREE.Vector3(0,-1,.025).normalize(),top:new THREE.Vector3(.002,-.002,1).normalize()};
function pose(r:Runtime):CameraPose{return{position:r.camera.position.toArray() as Vec3,target:r.controls.target.toArray() as Vec3};}
function state(r:Runtime|null):InspectionState{
 const referenceFasteners=r?.fasteners?[...r.fasteners.records.values()].filter(rec=>fastenerPickables(r.fasteners!).some(mesh=>mesh.parent===rec.group)).map(rec=>{
  const entry=r.records.get(rec.view.ownerRef)!,receiver=r.records.get(rec.view.receiverOwnerRef)!;
  entry.mesh.updateWorldMatrix(true,false);receiver.mesh.updateWorldMatrix(true,false);rec.group.updateWorldMatrix(true,false);
  return{pathRef:rec.view.id,representation:'schematic' as const,entry:new THREE.Vector3().fromArray(rec.view.entryPosition).applyMatrix4(entry.mesh.matrixWorld).toArray() as Vec3,head:rec.group.children[0].getWorldPosition(new THREE.Vector3()).toArray() as Vec3,receiver:new THREE.Vector3().fromArray(rec.view.receiverPosition).applyMatrix4(receiver.mesh.matrixWorld).toArray() as Vec3,axis:new THREE.Vector3().fromArray(rec.view.inwardAxis).transformDirection(entry.mesh.matrixWorld).toArray() as Vec3};
 }):[];
 return{active:!!r?.localOwner,previousCamera:r?.previousCamera||null,camera:r?pose(r):{position:[0,0,0],target:[0,0,0]},visiblePartIds:[...r?.records.values()||[]].filter(x=>x.mesh.visible).map(x=>x.part.id),mode:r?.connectionView?'connection':r?.localOwner?'local':'inactive',translucentPartIds:[...r?.records.values()||[]].filter(x=>x.mesh.visible&&x.mesh.material.transparent).map(x=>x.part.id),referenceFasteners};
}
function setPose(r:Runtime,next:CameraPose){
 if(![...next.position,...next.target].every(Number.isFinite))return;
 const damping=r.controls.enableDamping;r.controls.enableDamping=false;r.controls.update();r.controls.enableDamping=damping;
 r.flight=null;r.camera.position.fromArray(next.position);r.controls.target.fromArray(next.target);r.controls.update();r.dirty=true;r.sortDirty=true;
}
function bounds(r:Runtime,owner?:string|null){if(r.preview)return r.preview.model.plan.bounds.clone();const result=new THREE.Box3();r.scene.updateMatrixWorld(true);for(const rec of r.records.values())if(rec.mesh.visible&&(!owner||rec.part.id===owner))result.union(rec.mesh.geometry.boundingBox!.clone().applyMatrix4(rec.mesh.matrixWorld));return result;}
function corners(b:THREE.Box3){return[b.min.x,b.max.x].flatMap(x=>[b.min.y,b.max.y].flatMap(y=>[b.min.z,b.max.z].map(z=>new THREE.Vector3(x,y,z))));}
function framePose(r:Runtime,b:THREE.Box3,direction:THREE.Vector3,target=b.getCenter(new THREE.Vector3())):CameraPose{
 const dy=Math.tan(THREE.MathUtils.degToRad(r.camera.fov/2)),dx=dy*Math.max(.1,r.camera.aspect);
 // OrbitControls clamps every update. A flight aimed beyond those limits can
 // never finish, for example when inspecting an opening from below the model.
 const orbitRotation=new THREE.Quaternion().setFromUnitVectors(r.camera.up.clone().normalize(),new THREE.Vector3(0,1,0));
 const orbitDirection=new THREE.Spherical().setFromVector3(direction.clone().normalize().applyQuaternion(orbitRotation));
 orbitDirection.phi=THREE.MathUtils.clamp(orbitDirection.phi,r.controls.minPolarAngle,r.controls.maxPolarAngle);
 orbitDirection.theta=THREE.MathUtils.clamp(orbitDirection.theta,r.controls.minAzimuthAngle,r.controls.maxAzimuthAngle);orbitDirection.makeSafe();
 direction=new THREE.Vector3().setFromSpherical(orbitDirection).applyQuaternion(orbitRotation.invert()).normalize();
 const right=new THREE.Vector3().crossVectors(r.camera.up,direction).normalize();if(right.lengthSq()<1e-8)right.set(0,1,0);
 const up=new THREE.Vector3().crossVectors(direction,right).normalize();let distance=.025;
 for(const p of corners(b)){const v=p.sub(target),z=v.dot(direction);distance=Math.max(distance,z+Math.abs(v.dot(right))*1.35/dx,z+Math.abs(v.dot(up))*1.35/dy);}
 distance=THREE.MathUtils.clamp(distance,r.controls.minDistance,r.controls.maxDistance);
 return {position:target.clone().addScaledVector(direction,distance).toArray() as Vec3,target:target.toArray() as Vec3};
}
function frame(r:Runtime,b:THREE.Box3,direction:THREE.Vector3,target=b.getCenter(new THREE.Vector3())){
 if(b.isEmpty())return;r.flight=framePose(r,b,direction,target);r.dirty=true;
}
function present(r:Runtime,p:Props){
 const hidden=new Set(p.hiddenIds),context=r.connectionView;
 if(context&&p.selectedId&&![context.ownerRef,context.receiverOwnerRef].includes(p.selectedId))r.connectionView=null;
 const activeContext=r.connectionView;
 for(const rec of r.records.values()){
  const selected=rec.part.id===p.selectedId,m=rec.mesh.material,transparent=p.xray&&!selected;
  rec.mesh.visible=activeContext?[activeContext.ownerRef,activeContext.receiverOwnerRef].includes(rec.part.id):r.localOwner?rec.part.id===r.localOwner:!hidden.has(rec.part.id)&&(!p.isolateId||p.isolateId===rec.part.id);
  if(r.preview)rec.mesh.visible=false;
  rec.mesh.position.copy(rec.base).addScaledVector(rec.offset,p.explosion);
  if(activeContext){rec.mesh.position.copy(rec.base);if(rec.part.id===activeContext.ownerRef)rec.mesh.position.addScaledVector(new THREE.Vector3().fromArray(activeContext.worldInwardAxis),-.009*p.explosion);}
  rec.mesh.receiveShadow=!r.localOwner;
  m.color.copy(selected?new THREE.Color('#6ebbb5'):rec.color);m.emissive.set(selected?'#126b70':'#000000');m.emissiveIntensity=selected?.13:0;
  if(m.transparent!==transparent||m.depthWrite===transparent)m.needsUpdate=true;
  m.transparent=transparent;m.opacity=transparent?.22:1;m.depthWrite=!transparent;m.alphaHash=false;m.alphaToCoverage=false;
  // A slope bias pulls edge-on motor caps through the neck plates. Keep only
  // the small constant bias needed by coincident actuator interfaces.
  m.polygonOffset=rec.part.kind==='actuator'&&m.depthWrite;m.polygonOffsetFactor=0;m.polygonOffsetUnits=-2;
  m.clippingPlanes=p.clipping?[r.clipping]:[];rec.mesh.renderOrder=transparent?2:0;
 }
 const selected=p.selectedId?r.records.get(p.selectedId):null;if(selected)prepareSourceDisplayNormals(selected.sourceGeometry);
 r.grid.visible=p.showGrid;const all=bounds(r);if(!all.isEmpty()){r.floor.position.z=all.min.z-.001;r.grid.position.z=all.min.z-.0009;}
 r.renderer.shadowMap.needsUpdate=true;r.sortDirty=true;r.dirty=true;
}
function clearOverlay(r:Runtime,p?:Props){
 if(r.overlayOwner){const rec=r.records.get(r.overlayOwner);if(rec){rec.mesh.geometry=rec.sourceGeometry;rec.mesh.material.vertexColors=false;rec.mesh.material.needsUpdate=true;}}
 if(r.peerDisplay){const peer=r.records.get(r.peerDisplay.ownerRef);if(peer){peer.mesh.geometry=peer.sourceGeometry;peer.mesh.material.vertexColors=false;peer.mesh.material.needsUpdate=true;if(p)peer.mesh.material.color.copy(peer.part.id===p.selectedId?new THREE.Color('#6ebbb5'):peer.color);}r.peerDisplay.display.dispose();r.peerDisplay=null;}
 if(r.overlayOwner&&p){const rec=r.records.get(r.overlayOwner);if(rec)rec.mesh.material.color.copy(rec.part.id===p.selectedId?new THREE.Color('#6ebbb5'):rec.color);}
 r.witnessMarkers?.dispose();r.witnessMarkers=null;r.selectionDisplay?.dispose();r.selectionDisplay=null;
 r.overlay?.removeFromParent();r.overlay=null;r.overlayOwner=null;r.overlayBounds=null;
}
function overlay(r:Runtime,p:Props,selection=p.selection){
 clearOverlay(r,p);const host=r.renderer.domElement.parentElement;
 if(host){host.dataset.interfaceId='';host.dataset.memberRefs='';host.dataset.selectedFeatures='';host.dataset.highlightMode='none';host.dataset.witnessMarkers='0';host.dataset.highlightedSourceFaces='0';}
 const d=resolveGeometry(p.data,selection);if(!d){r.dirty=true;return;}const rec=r.records.get(d.ownerRef);if(!rec)return;
 prepareSourceDisplayNormals(rec.sourceGeometry);
 const display=createSourceSelection(rec.sourceGeometry,featuresFor(p.data,d.featureRefs));
 rec.mesh.geometry=display.geometry;rec.mesh.material.vertexColors=true;rec.mesh.material.color.set('#ffffff');rec.mesh.material.needsUpdate=true;
 const markers=createWitnessMarkers(display.witnesses);rec.mesh.add(markers.group);
 if(r.connectionView){const path=p.data.assembly?.connections.find(c=>c.id===r.connectionView!.connectionRef)?.fastener_paths?.find(path=>path.id===r.connectionView!.id);for(const endpoint of path?[path.entry,path.receiver]:[]){const f=p.data.assembly?.features.find(f=>f.id===endpoint.feature_ref);if(!f||f.owner_ref===d.ownerRef)continue;const peer=r.records.get(f.owner_ref);if(!peer)continue;prepareSourceDisplayNormals(peer.sourceGeometry);const peerDisplay=createSourceSelection(peer.sourceGeometry,[f],{baseColor:peer.part.id===p.selectedId?'#6ebbb5':peer.color});peer.mesh.geometry=peerDisplay.geometry;peer.mesh.material.vertexColors=true;peer.mesh.material.color.set('#ffffff');peer.mesh.material.needsUpdate=true;r.peerDisplay={ownerRef:f.owner_ref,display:peerDisplay};}}
 r.selectionDisplay=display;r.witnessMarkers=markers;r.overlay=markers.group;r.overlayOwner=rec.part.id;r.overlayBounds=display.bounds;r.dirty=true;
 if(host){host.dataset.interfaceId=selection?.kind==='interface'?selection.id:'';host.dataset.memberRefs=(selection?.memberRefs||[selection?.memberRef||'']).filter(Boolean).join(',');host.dataset.selectedFeatures=d.featureRefs.join(',');host.dataset.highlightMode=display.fillTriangleCount?'source_facet_colors':display.witnesses.length?'source_witness':'none';host.dataset.witnessMarkers=String(display.witnesses.length);host.dataset.highlightedSourceFaces=String(display.fillTriangleCount);}
}
function updateFasteners(r:Runtime,p:Props){
 const views=fastenerViews(p.data,p.selection),key=views.map(view=>view.id).join('|');
 if(key!==r.fastenerKey||!r.fasteners){if(r.fasteners)disposeFasteners(r.fasteners);r.fasteners=makeFastenerScene(views,owner=>r.records.get(owner)?.mesh);r.fastenerKey=key;}
 presentFasteners(r.fasteners,{visible:p.showFasteners,explosion:p.explosion,selectedPathRef:p.selection?.fastenerRef,clippingPlanes:p.clipping?[r.clipping]:[]});
 const visible=fastenerPickables(r.fasteners);const host=r.renderer.domElement.parentElement;
 if(host){host.dataset.fastenerPaths=[...r.fasteners.records.values()].filter(rec=>visible.some(mesh=>mesh.parent===rec.group)).map(rec=>rec.view.id).join(',');host.dataset.fastenerCount=String(visible.length/2);host.dataset.fastenerRepresentation='schematic';}
 r.dirty=true;
}
function frameConnection(r:Runtime,p:Props,preserveDirection=false){
 const context=r.connectionView;if(!context)return;const box=new THREE.Box3();
 const connection=p.data.assembly?.connections.find(c=>c.id===context.connectionRef);
 const path=connection?.fastener_paths?.find(path=>path.id===context.id);
 for(const endpoint of path?[path.entry,path.receiver]:[]){const item=p.data.assembly?.interfaces.find(i=>i.id===endpoint.interface_ref);for(const ref of new Set(item?.members.flatMap(member=>member.feature_refs)||[endpoint.feature_ref])){const feature=p.data.assembly?.features.find(f=>f.id===ref);if(!feature)continue;const rec=r.records.get(feature.owner_ref);if(!rec)continue;rec.mesh.updateMatrixWorld(true);const positions=rec.sourceGeometry.getAttribute('position');for(const tri of feature.geometry.triangle_indices)for(let n=0;n<3;n++)box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,tri*3+n).applyMatrix4(rec.mesh.matrixWorld));}}
 if(r.fasteners)box.union(fastenerBounds(r.fasteners));
 const outward=new THREE.Vector3().fromArray(context.worldInwardAxis).negate(),side=VIEWS.iso.clone().addScaledVector(outward,-VIEWS.iso.dot(outward));
 if(side.lengthSq()>.001)outward.addScaledVector(side.normalize(),.85).normalize();frame(r,box,preserveDirection?r.camera.position.clone().sub(r.controls.target).normalize():outward);
}
function focus(r:Runtime,p:Props,selection:GeometrySelection,scope?:'connection'){
 r.focusVisibility=undefined;const host=r.renderer.domElement.parentElement;if(host){host.dataset.focusVisibleSourceSamples='';host.dataset.focusSourceSampleCount='';}
 if(scope==='connection'){const view=fastenerViews(p.data,selection)[0];if(!view)return;if(!r.localOwner){r.previousCamera=pose(r);r.inspectionExplosion=p.explosion;}r.localOwner=selection.ownerRef||view.ownerRef;r.connectionView=view;present(r,p);overlay(r,p,selection);updateFasteners(r,p);frameConnection(r,p);p.onInspectionChange?.(state(r));return;}
 if(!r.ready)return;const d=resolveGeometry(p.data,selection);if(!d||!d.featureRefs.length)return;
 r.connectionView=null;
 if(!r.localOwner){r.previousCamera=pose(r);r.inspectionExplosion=p.explosion;}r.localOwner=d.ownerRef;present(r,p);overlay(r,p,selection);
 const rec=r.records.get(d.ownerRef);if(!rec||!r.overlayBounds)return;rec.mesh.updateMatrixWorld(true);
 const b=r.overlayBounds.clone().applyMatrix4(rec.mesh.matrixWorld),target=new THREE.Vector3().fromArray(d.position).applyMatrix4(rec.mesh.matrixWorld);
 const selectedFeatures=featuresFor(p.data,d.featureRefs),first=selectedFeatures[0];let localDirection=new THREE.Vector3();
 if(first?.kind==='bore_wall')localDirection.fromArray(d.normal).negate();
 else if(first?.kind==='shaft_wall'){
  const axis=new THREE.Vector3().fromArray(d.normal),side=VIEWS.iso.clone().addScaledVector(axis,-VIEWS.iso.dot(axis));
  if(side.lengthSq()<.01)side.crossVectors(axis,new THREE.Vector3(0,1,0));localDirection.copy(axis).add(side.normalize()).normalize();
 }else{
  const positions=rec.mesh.geometry.getAttribute('position'),seen=new Set<number>();
  for(const feature of selectedFeatures)for(const tri of feature.geometry.triangle_indices){if(seen.has(tri))continue;seen.add(tri);const a=new THREE.Vector3().fromBufferAttribute(positions,tri*3),b=new THREE.Vector3().fromBufferAttribute(positions,tri*3+1),c=new THREE.Vector3().fromBufferAttribute(positions,tri*3+2);localDirection.add(b.sub(a).cross(c.sub(a)));}
  if(localDirection.lengthSq()<1e-16)localDirection.copy(VIEWS.iso);else localDirection.normalize();
 }
 const direction=localDirection.transformDirection(rec.mesh.matrixWorld);if(direction.lengthSq()<.5)direction.copy(VIEWS.iso);
 // A member at a curved region's centre describes its unsigned geometric
 // axis. Choose a source-visible side just as for a measured Feature. Explicit
 // entrance members remain framed by their own selected entry direction.
 const centredCurves=selection.kind==='interface'&&selectedFeatures.length>0&&selectedFeatures.every(feature=>feature.geometry.type==='cylinder'||feature.geometry.type==='conical_frustum')
  &&d.entries.every(entry=>{const feature=selectedFeatures.find(feature=>feature.id===entry.featureRef);return feature&&new THREE.Vector3().fromArray(entry.position).distanceTo(new THREE.Vector3().fromArray(feature.geometry.origin))<1e-8;});
 const witnessOnly=selectedFeatures.length>0&&selectedFeatures.every(feature=>feature.geometry.type==='source_region');
 if((selection.kind==='feature'&&first?.basis==='mesh_measurement')||centredCurves||witnessOnly){
  const focusTriangles=witnessOnly?(r.selectionDisplay?.witnesses??[]).map(witness=>witness.triangleIndex):centredCurves?[...new Set(selectedFeatures.flatMap(feature=>feature.geometry.triangle_indices))]:first.geometry.triangle_indices;
  const chosen=chooseSourceGeometryFocus(rec.mesh,rec.sourceGeometry,focusTriangles,direction,VIEWS.iso,candidate=>framePose(r,b,candidate,target));
  r.focusVisibility=chosen;r.flight=chosen.visibleSamples>0?chosen.pose:framePose(r,bounds(r,d.ownerRef),VIEWS.iso);r.dirty=true;
  if(host){host.dataset.focusVisibleSourceSamples=String(chosen.visibleSamples);host.dataset.focusSourceSampleCount=String(chosen.sampleCount);}
 }else frame(r,b,direction,target);p.onInspectionChange?.(state(r));
}
function restore(r:Runtime,p:Props){const previous=r.previousCamera,exploded=r.inspectionExplosion!==null&&r.inspectionExplosion!==p.explosion;r.connectionView=null;r.localOwner=null;r.previousCamera=null;r.inspectionExplosion=null;present(r,p);overlay(r,p);updateFasteners(r,p);if(previous){setPose(r,previous);if(exploded)frame(r,bounds(r),r.camera.position.clone().sub(r.controls.target).normalize());}p.onInspectionChange?.(state(r));}
function labels(data:PrototypeData,selected:string|null){const result:Part[]=[];const own=data.parts.find(p=>p.id===selected);if(own)result.push(own);for(const part of data.parts)if(!result.some(p=>p.group===part.group))result.push(part);return result.slice(0,5);}

export default forwardRef<SceneHandle,Props>(function SceneCanvas(props,ref){
 const host=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null),latest=useRef(props);latest.current=props;
 const labelRefs=useRef(new Map<string,HTMLButtonElement>()),leaders=useRef(new Map<string,SVGLineElement>()),axis=useRef<SVGSVGElement>(null);
 const shown=useMemo(()=>labels(props.data,props.selectedId),[props.data,props.selectedId]),shownRef=useRef(shown);shownRef.current=shown;
 const [load,setLoad]=useState({ready:false,loaded:0,total:0}),[error,setError]=useState(''),[local,setLocal]=useState(false),[fastenerCount,setFastenerCount]=useState(0),[connectionLocal,setConnectionLocal]=useState(false),[witnessCount,setWitnessCount]=useState(0),[focusOccluded,setFocusOccluded]=useState(false);
 const [transport,setTransport]=useState({progress:0,playing:false}),[previewTransparent,setPreviewTransparent]=useState(false),[previewError,setPreviewError]=useState('');
 const seekPreview=(progress:number)=>{const r=runtime.current;if(!r?.preview)return;r.preview.progress=progress;r.preview.playing=false;r.preview.model.update(progress);r.dirty=true;r.renderer.shadowMap.needsUpdate=true;setTransport({progress,playing:false});};
 const playPreview=()=>{const r=runtime.current;if(!r?.preview)return;const p=r.preview;if(!p.playing&&p.progress>=1)p.progress=0;p.playing=!p.playing;p.lastTime=performance.now();p.model.update(p.progress);r.dirty=true;setTransport({progress:p.progress,playing:p.playing});};
 useImperativeHandle(ref,()=>({
  fitAll(){const r=runtime.current;if(r?.ready){if(r.preview){frame(r,bounds(r),r.preview.model.plan.direction);return;}restore(r,latest.current);setLocal(false);setFocusOccluded(false);frame(r,bounds(r),VIEWS[r.view]);}},
  focusSelected(){const r=runtime.current;if(r?.ready){if(r.preview){frame(r,bounds(r),r.preview.model.plan.direction);return;}restore(r,latest.current);setLocal(false);setFocusOccluded(false);frame(r,bounds(r,latest.current.selectedId),VIEWS[r.view]);}},
  focusGeometry(s,scope){const r=runtime.current,selection=s||latest.current.selection;if(r?.preview){frame(r,bounds(r),r.preview.model.plan.direction);return;}if(r&&selection){focus(r,latest.current,selection,scope);setFocusOccluded(r.focusVisibility?.visibleSamples===0);setLocal(!!r.localOwner);setConnectionLocal(!!r.connectionView);setFastenerCount(r.fasteners?fastenerPickables(r.fasteners).length/2:0);setWitnessCount(r.selectionDisplay?.witnesses.length||0);}},
  setView(v){const r=runtime.current;if(r?.ready){r.view=v;frame(r,bounds(r),VIEWS[v]);}},
  getCameraPose(){const r=runtime.current;return r?.ready?r.preview?.cameraBefore??pose(r):null;},setCameraPose(p){const r=runtime.current;if(r?.ready)setPose(r,p);},
  restoreInspection(){const r=runtime.current;if(r){restore(r,latest.current);setLocal(false);setFocusOccluded(false);}},getInspectionState(){return state(runtime.current);},
  getPartThumbnail(id){const r=runtime.current,rec=r?.records.get(id);return r?.ready&&!r.disposed&&rec?r.thumbnails.render(rec.part,rec.sourceGeometry,rec.color):null;},
 }),[]);
 useEffect(()=>{
  const element=host.current;if(!element)return;setError('');setLocal(false);setFocusOccluded(false);
  const urls=[...new Set(props.data.parts.map(p=>p.geometryUrl))];setLoad({ready:false,loaded:0,total:urls.length});
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch{setError('浏览器未能启动 3D；知识与来源仍可查看。');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(SCENE_BACKGROUND);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.localClippingEnabled=true;
  renderer.domElement.className='scene-webgl';renderer.domElement.setAttribute('aria-label','可旋转三维参考装配模型');renderer.domElement.setAttribute('role','img');element.prepend(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color(SCENE_BACKGROUND);const camera=new THREE.PerspectiveCamera(34,1,.001,4);camera.up.set(0,0,1);camera.position.set(.45,-.65,.38);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=.015;controls.maxDistance=2.4;controls.maxPolarAngle=Math.PI*.88;controls.target.set(0,0,.15);controls.update();
  scene.add(new THREE.HemisphereLight('#f6faff','#b7c2bf',1.25));
  const light=new THREE.DirectionalLight('#fffaf3',2.15);light.position.set(.8,-.6,1.2);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=light.shadow.camera.bottom=-.55;light.shadow.camera.right=light.shadow.camera.top=.55;light.shadow.camera.near=.1;light.shadow.camera.far=3;light.shadow.normalBias=.0005;light.shadow.bias=-.00003;light.shadow.radius=4;scene.add(light);
  const fill=new THREE.DirectionalLight('#cfdfec',.75);fill.position.set(-.7,.5,.6);scene.add(fill);const rim=new THREE.DirectionalLight('#fff',1.25);rim.position.set(0,.6,.8);scene.add(rim);
  const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment(),environmentMap=pmrem.fromScene(environment,.04);scene.environment=environmentMap.texture;environment.dispose();pmrem.dispose();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.ShadowMaterial({opacity:.18,depthWrite:false}));floor.receiveShadow=true;scene.add(floor);
  // Keep the ground color independent of model lighting and blend its far edges into the backdrop.
  const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=256;
  const groundContext=groundCanvas.getContext('2d')!,groundFade=groundContext.createRadialGradient(128,128,32,128,128,128);
  groundFade.addColorStop(0,'#fff');groundFade.addColorStop(1,'#ffffff00');groundContext.fillStyle=groundFade;groundContext.fillRect(0,0,256,256);
  const groundMap=new THREE.CanvasTexture(groundCanvas);
  const ground=new THREE.Mesh(floor.geometry,new THREE.MeshBasicMaterial({color:GROUND_COLOR,map:groundMap,transparent:true,depthWrite:false,toneMapped:false}));ground.position.z=-.00001;floor.add(ground);
  const grid=new THREE.GridHelper(1.2,60,'#78957d','#94aa95');grid.rotation.x=Math.PI/2;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.38;scene.add(grid);
  const r:Runtime={lastExplosion:props.explosion,selectionDisplay:null,peerDisplay:null,witnessMarkers:null,fasteners:null,fastenerKey:'',connectionView:null,scene,camera,controls,renderer,records:new Map(),ready:false,disposed:false,dirty:true,view:'iso',thumbnails:createPartThumbnails(renderer,scene.environment),overlay:null,overlayOwner:null,overlayBounds:null,localOwner:null,previousCamera:null,inspectionExplosion:null,flight:null,clipping:new THREE.Plane(new THREE.Vector3(0,-1,0),0),grid,floor,transparencyRanks:new Map(),sortDirty:true,controlsActive:false,cameraChangedAt:0,renderCount:0};runtime.current=r;
  renderer.setTransparentSort((a,b)=>a.groupOrder-b.groupOrder||a.renderOrder-b.renderOrder||((r.transparencyRanks.get(a.object.userData.partId)??0)-(r.transparencyRanks.get(b.object.userData.partId)??0))||b.z-a.z||a.id-b.id);
  const observer=new ResizeObserver(()=>{const rect=element.getBoundingClientRect();renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);camera.aspect=Math.max(1,rect.width)/Math.max(1,rect.height);camera.updateProjectionMatrix();r.dirty=true;});observer.observe(element);
  controls.addEventListener('change',()=>{r.dirty=true;r.sortDirty=true;r.cameraChangedAt=performance.now();});controls.addEventListener('start',()=>{r.flight=null;r.controlsActive=true;if(r.preview?.playing){r.preview.playing=false;setTransport({progress:r.preview.progress,playing:false});}});controls.addEventListener('end',()=>{r.controlsActive=false;});
  const drawLabels=()=>{
   const occupied:{x:number;y:number;w:number;h:number}[]=[],width=element.clientWidth,height=element.clientHeight;
   for(const p of shownRef.current){const button=labelRefs.current.get(p.id),line=leaders.current.get(p.id),rec=r.records.get(p.id);if(!button||!line)continue;
    if(!latest.current.showLabels||!rec?.mesh.visible){button.style.opacity='0';button.style.pointerEvents='none';line.style.opacity='0';continue;}
    const at=rec.mesh.localToWorld(rec.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3())).project(camera);if(Math.abs(at.z)>1){button.style.opacity='0';line.style.opacity='0';continue;}
    const x=(at.x*.5+.5)*width,y=(-at.y*.5+.5)*height,w=button.offsetWidth||150,h=button.offsetHeight||40;let placed=null;
    for(const dy of [-30,30,-70,70]){const bx=THREE.MathUtils.clamp(x+(x>width/2?24:-w-24),16,Math.max(16,width-w-16)),by=THREE.MathUtils.clamp(y+dy,60,Math.max(60,height-h-90));if(!occupied.some(o=>bx<o.x+o.w+8&&bx+w+8>o.x&&by<o.y+o.h+8&&by+h+8>o.y)){placed={x:bx,y:by,w,h};break;}}
    if(!placed){button.style.opacity='0';button.style.pointerEvents='none';line.style.opacity='0';continue;}occupied.push(placed);button.style.transform=`translate3d(${placed.x}px,${placed.y}px,0)`;button.style.opacity='1';button.style.pointerEvents='auto';line.setAttribute('x1',String(x));line.setAttribute('y1',String(y));line.setAttribute('x2',String(placed.x>x?placed.x:placed.x+w));line.setAttribute('y2',String(placed.y+h/2));line.style.opacity='.8';
   }
  };
  let frameId=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate=()=>{if(r.disposed)return;frameId=requestAnimationFrame(animate);
   if(r.flight){camera.position.lerp(new THREE.Vector3().fromArray(r.flight.position),reduced?1:.16);controls.target.lerp(new THREE.Vector3().fromArray(r.flight.target),reduced?1:.16);if(camera.position.distanceToSquared(new THREE.Vector3().fromArray(r.flight.position))<1e-9&&controls.target.distanceToSquared(new THREE.Vector3().fromArray(r.flight.target))<1e-9){camera.position.fromArray(r.flight.position);controls.target.fromArray(r.flight.target);r.flight=null;}r.dirty=true;}
   if(r.preview){const p=r.preview,now=performance.now();if(p.playing&&!r.flight){p.progress=Math.min(1,p.progress+Math.min(80,now-p.lastTime)/3600);p.model.update(p.progress);if(p.progress>=1)p.playing=false;if(now-p.notifyAt>65||!p.playing){setTransport({progress:p.progress,playing:p.playing});p.notifyAt=now;}r.dirty=true;renderer.shadowMap.needsUpdate=true;}p.lastTime=now;}
   controls.update();if(!r.dirty&&!(r.sortDirty&&!r.controlsActive&&performance.now()-r.cameraChangedAt>180))return;
   if(r.sortDirty&&!r.controlsActive&&!r.flight&&performance.now()-r.cameraChangedAt>180){scene.updateMatrixWorld(true);const direction=controls.target.clone().sub(camera.position).normalize();const ordered=[...r.records.values()].filter(rec=>rec.mesh.visible&&rec.mesh.material.transparent).map(rec=>({id:rec.part.id,depth:rec.mesh.localToWorld(rec.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3())).sub(camera.position).dot(direction)})).sort((a,b)=>b.depth-a.depth||a.id.localeCompare(b.id));r.transparencyRanks=new Map(ordered.map((x,i)=>[x.id,i]));r.sortDirty=false;}
   camera.near=THREE.MathUtils.clamp(camera.position.distanceTo(controls.target)*.02,.0001,.01);camera.updateProjectionMatrix();if(r.witnessMarkers?.markers.length&&r.overlayOwner){scene.updateMatrixWorld(true);const rec=r.records.get(r.overlayOwner);if(rec)element.dataset.visibleWitnessMarkers=String(updateWitnessVisibility(r.witnessMarkers,rec.mesh,camera,[...r.records.values()].filter(rec=>rec.mesh.visible).map(rec=>rec.mesh)));}renderer.render(scene,camera);drawLabels();r.dirty=false;r.renderCount++;
   element.dataset.renderCount=String(r.renderCount);element.dataset.cameraFlight=r.flight?'active':'settled';element.dataset.cameraPosition=camera.position.toArray().join(',');element.dataset.cameraTarget=controls.target.toArray().join(',');element.dataset.inspectionActive=String(!!r.localOwner);element.dataset.sourcePlacement=latest.current.explosion?'exploded':'restored';
   element.dataset.compatibilityPreviewActive=String(!!r.preview);element.dataset.compatibilityPreviewProgress=r.preview?.progress.toFixed(4)??'';element.dataset.compatibilityPreviewPlaying=String(!!r.preview?.playing);element.dataset.compatibilityPreviewOwners=r.preview?latest.current.compatibilityPreview?.features.map(f=>f.owner_ref).join('|')??'':'';
   element.dataset.compatibilityPreviewFeatures=r.preview?latest.current.compatibilityPreview?.features.map(f=>f.id).join('|')??'':'';
   element.dataset.compatibilityPreviewMemberCount=r.preview?String(latest.current.compatibilityPreview?.interfaceMatch?.member_count??1):'0';
   if(axis.current){const q=camera.getWorldQuaternion(new THREE.Quaternion()).invert();for(const [key,v]of Object.entries({x:[1,0,0],y:[0,1,0],z:[0,0,1]})){const point=new THREE.Vector3().fromArray(v).applyQuaternion(q),x=25+point.x*17,y=25-point.y*17;const l=axis.current.querySelector(`[data-axis-line="${key}"]`),t=axis.current.querySelector(`[data-axis-text="${key}"]`);l?.setAttribute('x2',String(x));l?.setAttribute('y2',String(y));t?.setAttribute('x',String(x+Math.sign(point.x||1)*5));t?.setAttribute('y',String(y-Math.sign(point.y||1)*5+3));}}
  };animate();
  let down:{x:number;y:number}|null=null;const pointerDown=(e:PointerEvent)=>{if(e.button===0)down={x:e.clientX,y:e.clientY};};
  const pointerUp=(e:PointerEvent)=>{if(r.preview||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=ray.intersectObjects(([...r.records.values()].filter(x=>x.mesh.visible).map(x=>x.mesh) as THREE.Object3D[]).concat(r.fasteners?fastenerPickables(r.fasteners):[]),false).find(x=>!latest.current.clipping||r.clipping.distanceToPoint(x.point)>=0);if(hit){const fastener=fastenerPickMetadata(hit.object);if(fastener&&r.fasteners){const record=r.fasteners.records.get(fastener.pathRef);if(record){latest.current.onPickFastener?.(selectionForFastener(record.view));return;}}const owner=hit.object.userData.partId;if(hit.faceIndex!=null&&latest.current.onPickLocalStructure)latest.current.onPickLocalStructure(owner,hit.faceIndex);else latest.current.onSelect(owner);}};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pointerUp);
  const geometries=new Map<string,THREE.BufferGeometry>(),loader=new STLLoader();let loaded=0;
  void Promise.all(urls.map(async url=>{const g=await loader.loadAsync(url);g.computeBoundingBox();g.computeBoundingSphere();if(r.disposed){g.dispose();return;}geometries.set(url,g);setLoad({ready:false,loaded:++loaded,total:urls.length});})).then(()=>{
   if(r.disposed)return;const all=new THREE.Box3();
   for(const p of props.data.parts){const g=geometries.get(p.geometryUrl);if(!g)continue;const color=new THREE.Color(PALETTE[p.kind]),material=new THREE.MeshStandardMaterial({color,roughness:p.kind==='bearing'?.3:.55,metalness:p.kind==='bearing'?.6:p.kind==='actuator'?.23:.06,envMapIntensity:.46,side:THREE.DoubleSide});const mesh=new THREE.Mesh(g,material);mesh.position.fromArray(p.position);mesh.quaternion.fromArray(p.quaternion).normalize();mesh.scale.fromArray(p.scale);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.partId=p.id;scene.add(mesh);mesh.updateMatrixWorld(true);r.records.set(p.id,{sourceGeometry:g,part:p,mesh,base:new THREE.Vector3().fromArray(p.position),offset:new THREE.Vector3(),color});all.union(g.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));}
   const offsets=planExplosion([...r.records.values()].map(rec=>({part:rec.part,bounds:rec.sourceGeometry.boundingBox!.clone().applyMatrix4(rec.mesh.matrixWorld)})),props.data.bodies,props.data.joints);
   for(const rec of r.records.values())rec.offset.copy(offsets.get(rec.part.id)!);r.clipping.constant=all.getCenter(new THREE.Vector3()).y;r.ready=true;present(r,latest.current);overlay(r,latest.current);updateFasteners(r,latest.current);frame(r,bounds(r),VIEWS.iso);setLoad({ready:true,loaded,total:urls.length});latest.current.onReady();
  }).catch(err=>{if(!r.disposed)setError(err.message||'来源模型载入失败');});
  return()=>{r.disposed=true;r.preview?.model.dispose();r.preview=undefined;cancelAnimationFrame(frameId);observer.disconnect();controls.dispose();clearOverlay(r);if(r.fasteners)disposeFasteners(r.fasteners);r.thumbnails.dispose();for(const rec of r.records.values())rec.mesh.material.dispose();for(const g of geometries.values())g.dispose();floor.geometry.dispose();floor.material.dispose();ground.material.dispose();groundMap.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();environmentMap.dispose();light.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();if(runtime.current===r)runtime.current=null;};
 // Loading a capability asset changes knowledge, while source meshes and their
 // placements stay fixed for this snapshot. Keep its renderer and camera alive.
 },[props.data.parts,props.data.bodies,props.data.meta.packageDigest]);
 useEffect(()=>{
  const r=runtime.current;if(!r?.ready)return;
  const exploded=r.lastExplosion!==props.explosion;r.lastExplosion=props.explosion;
  if(r.connectionView){const next=fastenerViews(props.data,props.selection);if(next.length===1&&next[0].connectionRef===r.connectionView.connectionRef)r.connectionView=next[0];}
  if(r.localOwner&&props.selectedId)r.localOwner=props.selectedId;
  present(r,props);overlay(r,props);updateFasteners(r,props);
  setFastenerCount(r.fasteners?fastenerPickables(r.fasteners).length/2:0);setWitnessCount(r.selectionDisplay?.witnesses.length||0);setConnectionLocal(!!r.connectionView);
  if(exploded){
   if(r.connectionView)frameConnection(r,props,true);
   else{
    const rec=r.overlayOwner?r.records.get(r.overlayOwner):null;
    const box=r.localOwner&&rec&&r.overlayBounds?r.overlayBounds.clone().applyMatrix4(rec.mesh.matrixWorld):bounds(r);
    frame(r,box,r.camera.position.clone().sub(r.controls.target).normalize());
   }
  }
 },[props.data.assembly,props.selectedId,props.selection,props.hiddenIds,props.isolateId,props.explosion,props.showLabels,props.showGrid,props.clipping,props.xray,props.showFasteners]);
 useEffect(()=>{
  const r=runtime.current,request=props.compatibilityPreview;if(!r?.ready||!load.ready||!request)return;
  setPreviewError('');setPreviewTransparent(false);
  try{
   const model=makeCompatibilityPreview(request,owner=>r.records.get(owner)),cameraBefore=pose(r),playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
   r.renderer.domElement.setAttribute('aria-label','所选部件的局部装配对位示意');
   const preview={model,cameraBefore,progress:0,playing,lastTime:performance.now(),notifyAt:0};r.preview=preview;r.scene.add(model.group);r.flight=null;
   present(r,latest.current);frame(r,model.plan.bounds,model.plan.direction);setTransport({progress:0,playing});
   return()=>{if(r.disposed)return;model.dispose();if(r.preview===preview)r.preview=undefined;r.renderer.domElement.setAttribute('aria-label','可旋转三维参考装配模型');present(r,latest.current);setPose(r,cameraBefore);};
  }catch(error){setPreviewError(error instanceof Error?error.message:'装配示意暂时无法生成。');}
 },[props.compatibilityPreview,load.ready]);
 return <div className="scene-canvas" ref={host} data-scene-ready={load.ready&&!error?'true':'false'}><div className="scene-soft-glow"/><svg className="scene-leaders" aria-hidden="true">{shown.map(p=><line key={p.id} ref={e=>{if(e)leaders.current.set(p.id,e);}} className={p.id===props.selectedId?'is-selected':''}/>)}</svg><div className="scene-object-labels">{shown.map(p=><button key={p.id} ref={e=>{if(e)labelRefs.current.set(p.id,e);}} className={`scene-object-label ${p.id===props.selectedId?'is-selected':''}`} onClick={()=>props.onSelect(p.id)}><span className="scene-label-dot"/><span><strong>{p.name}</strong><small>{p.body}</small></span></button>)}</div><svg className="scene-axis" ref={axis} viewBox="0 0 50 50" aria-label="源坐标方向">{['x','y','z'].map(k=><g key={k} className={`scene-axis-${k}`}><line x1="25" y1="25" data-axis-line={k}/><text data-axis-text={k}>{k.toUpperCase()}</text></g>)}</svg>{!load.ready&&!error&&<div className="scene-loading"><strong>载入模型</strong><span>{load.loaded} / {load.total}</span></div>}{error&&<div className="scene-error"><span>模型载入失败</span><p>{error}</p></div>}{local&&!props.compatibilityPreview&&<div className="scene-inspection-notice"><span>{connectionLocal?'沿接口轴查看':'接口局部查看'}{focusOccluded?' · 所选源面仍被遮挡，可旋转或剖切查看':witnessCount?' · 曲面位置标记':''}</span><button onClick={()=>{const r=runtime.current;if(r)restore(r,latest.current);setLocal(false);setFocusOccluded(false);}}>返回装配</button></div>}{fastenerCount>0&&!props.compatibilityPreview&&<div className="scene-fastener-notice">连接件示意 · 当前 {fastenerCount} 条参考路径 · 规格待定</div>}{props.compatibilityPreview&&load.ready&&<CompatibilityPreviewControls request={props.compatibilityPreview} names={props.compatibilityPreview.features.map(f=>props.data.parts.find(p=>p.id===f.owner_ref)?.name??'部件')} progress={transport.progress} playing={transport.playing} transparent={previewTransparent} error={previewError} onPlay={playPreview} onSeek={seekPreview} onTransparent={value=>{setPreviewTransparent(value);const r=runtime.current;if(r?.preview){r.preview.model.setTransparent(value);r.dirty=true;r.renderer.shadowMap.needsUpdate=true;}}} onClose={()=>props.onCloseCompatibilityPreview?.()}/>}</div>;
});
