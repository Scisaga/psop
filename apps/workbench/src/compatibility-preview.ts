import * as THREE from 'three';
import type {AssemblyFeature,CompatibilityInterfaceMatch,Part} from './types';
import {createSourceSelection} from './source-selection.ts';
import {prepareSourceDisplayNormals} from './source-display-normals.ts';

export interface CompatibilityPreviewRequest {
  key:string;
  candidateId:string;
  mechanism:string;
  title:string;
  features:[AssemblyFeature,AssemblyFeature];
  featureGroups?:[AssemblyFeature[],AssemblyFeature[]];
  interfaceMatch?:CompatibilityInterfaceMatch;
}

function featureEnd(part:Part,feature:AssemblyFeature,bounds:THREE.Box3){
  const g=feature.geometry,origin=new THREE.Vector3().fromArray(g.origin);
  const normal=new THREE.Vector3().fromArray('axis' in g?g.axis:g.normal);
  if(![...origin.toArray(),...normal.toArray(),...part.scale,...part.quaternion].every(Number.isFinite)||normal.lengthSq()<1e-12||part.scale.some(n=>n<=0))throw new Error('所选结构缺少可用的对位方向。');
  normal.normalize();
  const ends=g.type==='cylinder'?g.axial_range_m:g.type==='conical_frustum'?[0,g.length_m]:[0,0];
  if(!ends.every(Number.isFinite))throw new Error('所选结构缺少有限范围。');
  const middle=origin.clone().addScaledVector(normal,(ends[0]+ends[1])/2);
  // Pick the end facing away from the part's centre. This is a display choice,
  // not a claim about an installation entrance or a collision-free path.
  const sign=middle.sub(bounds.getCenter(new THREE.Vector3())).dot(normal)>=0?1:-1;
  origin.addScaledVector(normal,sign>0?Math.max(...ends):Math.min(...ends));
  normal.multiplyScalar(sign);
  const rotation=new THREE.Quaternion().fromArray(part.quaternion).normalize(),scale=new THREE.Vector3().fromArray(part.scale);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(),rotation,scale);
  const directionMatrix='axis' in g?new THREE.Matrix3().setFromMatrix4(matrix):new THREE.Matrix3().getNormalMatrix(matrix);
  return {point:origin.applyMatrix4(matrix),normal:normal.applyMatrix3(directionMatrix).normalize(),rotation,scale};
}

/** A two-part illustration of one published correspondence. Source placements
 * and meshes remain untouched; no common rigid-motion or interference solve is
 * implied. A visible gap is kept even at the final alignment. */
export function planCompatibilityAlignment(a:Part,fa:AssemblyFeature,ba:THREE.Box3,b:Part,fb:AssemblyFeature,bb:THREE.Box3){
  if(a.id===b.id||fa.owner_ref!==a.id||fb.owner_ref!==b.id)throw new Error('装配示意需要两个不同部件的对应结构。');
  const ea=featureEnd(a,fa,ba),eb=featureEnd(b,fb,bb),axis=ea.normal;
  const turn=new THREE.Quaternion().setFromUnitVectors(eb.normal,axis.clone().negate());
  const rotationB=turn.clone().multiply(eb.rotation),offsetB=eb.point.clone().applyQuaternion(turn);
  const size=Math.max(ba.getSize(new THREE.Vector3()).multiply(ea.scale).length(),bb.getSize(new THREE.Vector3()).multiply(eb.scale).length(),.01);
  const gap=Math.max(.0015,size*.025),travel=size*.95;
  const positionA=ea.point.clone().negate(),endB=axis.clone().multiplyScalar(gap).sub(offsetB),startB=endB.clone().addScaledVector(axis,travel);
  const matrixA=new THREE.Matrix4().compose(positionA,ea.rotation,ea.scale);
  const endMatrix=new THREE.Matrix4().compose(endB,rotationB,eb.scale),startMatrix=new THREE.Matrix4().compose(startB,rotationB,eb.scale);
  const swept=ba.clone().applyMatrix4(matrixA).union(bb.clone().applyMatrix4(endMatrix)).union(bb.clone().applyMatrix4(startMatrix));
  const center=swept.getCenter(new THREE.Vector3()),shift=new THREE.Vector3(-center.x,-center.y,-swept.min.z+.004);
  const side=new THREE.Vector3(1.15,-1.7,.82).addScaledVector(axis,-new THREE.Vector3(1.15,-1.7,.82).dot(axis));
  if(side.lengthSq()<.01)side.crossVectors(axis,new THREE.Vector3(0,0,1));
  const direction=axis.clone().multiplyScalar(.65).add(side.normalize()).normalize();
  return {positionA:positionA.add(shift),rotationA:ea.rotation,scaleA:ea.scale,rotationB,scaleB:eb.scale,startB:startB.add(shift),endB:endB.add(shift),anchorA:shift,anchorB:shift.clone().addScaledVector(axis,gap),axis,travel,bounds:swept.translate(shift),direction};
}

/** Replay the exact fixed pose checked against both complete source solids.
 * Presentation may move the pair together, never move B relative to A. */
export function planCheckedInterfaceAlignment(request:CompatibilityPreviewRequest,a:Part,ba:THREE.Box3,b:Part,bb:THREE.Box3){
  const match=request.interfaceMatch!,groups=request.featureGroups??[[request.features[0]],[request.features[1]]];
  if(a.id===b.id||request.features[0].owner_ref!==a.id||request.features[1].owner_ref!==b.id)throw new Error('装配示意缺少正确的双方部件。');
  if(![...a.scale,...b.scale].every(v=>Math.abs(v-1)<1e-10))throw new Error('当前缩放与已检查的装配姿态不符。');
  const qa=new THREE.Quaternion().fromArray(a.quaternion).normalize(),qb=new THREE.Quaternion().fromArray(b.quaternion).normalize();
  const options=match.alignment_options.filter(o=>(o.assembly_assessment?o.assembly_assessment.decision!=='block':o.interference?.status==='clear')&&o.registration.whole_part_collision_evaluated&&o.seating).map(option=>{
    const r=option.registration.rotation_b_to_a,t=option.registration.translation_b_to_a;
    if(r.length!==3||r.some(row=>row.length!==3)||![...r.flat(),...t].every(Number.isFinite))throw new Error('装配姿态数据不完整。');
    const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(r[0][0],r[0][1],r[0][2],0,r[1][0],r[1][1],r[1][2],0,r[2][0],r[2][1],r[2][2],0,0,0,0,1)).normalize();
    return {option,rotation,turn:qa.clone().multiply(rotation).angleTo(qb)};
  }).sort((x,y)=>x.turn-y.turn);
  if(!options.length)throw new Error('该接口没有可采用的已发布固定姿态。');
  const chosen=options[0],option=chosen.option,byA=new Map(groups[0].map(f=>[f.id,f])),byB=new Map(groups[1].map(f=>[f.id,f]));
  const points=option.member_pairs.map(pair=>{
    if(!byA.has(pair.feature_a_ref)||!byB.has(pair.feature_b_ref)||!pair.contact_a||!pair.contact_b)throw new Error('已检查姿态的接口成员尚未读全。');
    return {a:new THREE.Vector3().fromArray(pair.contact_a).applyQuaternion(qa),b:new THREE.Vector3().fromArray(pair.contact_b).applyQuaternion(chosen.rotation).applyQuaternion(qa)};
  });
  if(points.length!==match.member_count||!points.length)throw new Error('已检查姿态的成员对应不完整。');
  const axis=new THREE.Vector3().fromArray(option.seating!.separation_axis_a).applyQuaternion(qa).normalize();
  const rotationB=qa.clone().multiply(chosen.rotation),scaleA=new THREE.Vector3().fromArray(a.scale),scaleB=new THREE.Vector3().fromArray(b.scale);
  const size=Math.max(ba.getSize(new THREE.Vector3()).length(),bb.getSize(new THREE.Vector3()).length(),.01),travel=size*.95;
  const centerA=points.reduce((sum,p)=>sum.add(p.a),new THREE.Vector3()).divideScalar(points.length),positionA=centerA.clone().negate();
  const endB=new THREE.Vector3().fromArray(option.registration.translation_b_to_a).applyQuaternion(qa).add(positionA),startB=endB.clone().addScaledVector(axis,travel);
  const swept=ba.clone().applyMatrix4(new THREE.Matrix4().compose(positionA,qa,scaleA))
    .union(bb.clone().applyMatrix4(new THREE.Matrix4().compose(endB,rotationB,scaleB)))
    .union(bb.clone().applyMatrix4(new THREE.Matrix4().compose(startB,rotationB,scaleB)));
  const center=swept.getCenter(new THREE.Vector3()),shift=new THREE.Vector3(-center.x,-center.y,-swept.min.z+.004);
  const memberAnchors=points.map(p=>({a:p.a.clone().add(positionA).add(shift),b:p.b.clone().add(endB).add(shift)}));
  const side=new THREE.Vector3(1.15,-1.7,.82);side.addScaledVector(axis,-side.dot(axis));
  if(side.lengthSq()<.01)side.crossVectors(axis,new THREE.Vector3(0,0,1));
  return {positionA:positionA.add(shift),rotationA:qa,scaleA,rotationB,scaleB,startB:startB.add(shift),endB:endB.add(shift),anchorA:memberAnchors[0].a,anchorB:memberAnchors[0].b,axis,travel,bounds:swept.translate(shift),direction:axis.clone().multiplyScalar(.65).add(side.normalize()).normalize(),memberAnchors};
}

/** Replay a published complete-member registration. Twist is fixed by the
 * entire pattern instead of independently pointing two single hole axes. */
export function planCompleteInterfaceAlignment(request:CompatibilityPreviewRequest,a:Part,ba:THREE.Box3,b:Part,bb:THREE.Box3){
  if(request.interfaceMatch!.registration.whole_part_collision_evaluated||request.interfaceMatch!.alignment_options.some(o=>o.interference))return planCheckedInterfaceAlignment(request,a,ba,b,bb);
  const match=request.interfaceMatch!,groups=request.featureGroups??[[request.features[0]],[request.features[1]]];
  const base=planCompatibilityAlignment(a,request.features[0],ba,b,request.features[1],bb);
  if(![...a.scale,...b.scale].every(value=>Math.abs(value-a.scale[0])<1e-10))throw new Error('当前缩放不支持完整孔组对位示意。');
  const qa=new THREE.Quaternion().fromArray(a.quaternion).normalize(),qb=new THREE.Quaternion().fromArray(b.quaternion).normalize();
  const outwardA=base.axis.clone().applyQuaternion(qa.clone().invert()),outwardB=featureEnd(b,request.features[1],bb).normal.applyQuaternion(qb.clone().invert());
  const options=(match.alignment_options.length?match.alignment_options:[match]).map(option=>{
    const r=option.registration.rotation_b_to_a;
    const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(r[0][0],r[0][1],r[0][2],0,r[1][0],r[1][1],r[1][2],0,r[2][0],r[2][1],r[2][2],0,0,0,0,1));
    const score=outwardB.clone().applyQuaternion(rotation).dot(outwardA.clone().negate());
    return {option,rotation,score,turn:qa.clone().multiply(rotation).angleTo(qb)};
  }).sort((x,y)=>Math.abs(y.score-x.score)>1e-8?y.score-x.score:x.turn-y.turn);
  const chosen=options[0],rotationB=qa.clone().multiply(chosen.rotation),byA=new Map(groups[0].map(f=>[f.id,f])),byB=new Map(groups[1].map(f=>[f.id,f]));
  const points=chosen.option.member_pairs.map(pair=>{
    const fa=byA.get(pair.feature_a_ref),fb=byB.get(pair.feature_b_ref);
    if(!fa||!fb)throw new Error('完整接口的成员几何尚未读全。');
    return {a:featureEnd(a,fa,ba).point,b:featureEnd(b,fb,bb).point.applyQuaternion(qb.clone().invert()).applyQuaternion(rotationB)};
  });
  if(points.length!==match.member_count||!points.length)throw new Error('完整接口的成员对应不完整。');
  const ca=points.reduce((sum,p)=>sum.add(p.a),new THREE.Vector3()).divideScalar(points.length),cb=points.reduce((sum,p)=>sum.add(p.b),new THREE.Vector3()).divideScalar(points.length);
  const gap=base.anchorA.distanceTo(base.anchorB),positionA=ca.clone().negate(),endB=base.axis.clone().multiplyScalar(gap).sub(cb),startB=endB.clone().addScaledVector(base.axis,base.travel);
  const swept=ba.clone().applyMatrix4(new THREE.Matrix4().compose(positionA,qa,base.scaleA))
    .union(bb.clone().applyMatrix4(new THREE.Matrix4().compose(endB,rotationB,base.scaleB)))
    .union(bb.clone().applyMatrix4(new THREE.Matrix4().compose(startB,rotationB,base.scaleB)));
  const center=swept.getCenter(new THREE.Vector3()),shift=new THREE.Vector3(-center.x,-center.y,-swept.min.z+.004);
  const memberAnchors=points.map(p=>({a:p.a.clone().add(positionA).add(shift),b:p.b.clone().add(endB).add(shift)}));
  return {...base,positionA:positionA.add(shift),rotationB,endB:endB.add(shift),startB:startB.add(shift),anchorA:shift,anchorB:shift.clone().addScaledVector(base.axis,gap),bounds:swept.translate(shift),memberAnchors};
}

export function makeCompatibilityPreview(request:CompatibilityPreviewRequest,sourceFor:(owner:string)=>{part:Part;sourceGeometry:THREE.BufferGeometry}|undefined){
  const sources=request.features.map(f=>sourceFor(f.owner_ref));
  if(!sources[0]||!sources[1])throw new Error('双方模型尚未载入，请稍后重试。');
  const [a,b]=sources as [NonNullable<typeof sources[0]>,NonNullable<typeof sources[1]>];
  const plan:ReturnType<typeof planCompatibilityAlignment>&{memberAnchors?:{a:THREE.Vector3;b:THREE.Vector3}[]}=request.interfaceMatch?planCompleteInterfaceAlignment(request,a.part,a.sourceGeometry.boundingBox!,b.part,b.sourceGeometry.boundingBox!):planCompatibilityAlignment(a.part,request.features[0],a.sourceGeometry.boundingBox!,b.part,request.features[1],b.sourceGeometry.boundingBox!);
  const group=new THREE.Group();group.name='局部装配示意';
  const displays:ReturnType<typeof createSourceSelection>[]=[],materials:THREE.MeshStandardMaterial[]=[];
  const meshes:THREE.Mesh[]=[];
  try{
    for(const [i,source] of [a,b].entries()){
      prepareSourceDisplayNormals(source.sourceGeometry);
      const display=createSourceSelection(source.sourceGeometry,request.featureGroups?.[i]??[request.features[i]],{baseColor:i?'#7babb4':'#d7e4dd',highlightColor:i?'#efb44f':'#24a79d'});displays.push(display);
      const material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.55,metalness:.12,side:THREE.DoubleSide});materials.push(material);
      const mesh=new THREE.Mesh(display.geometry,material);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.partId=`preview-${i}`;group.add(mesh);meshes.push(mesh);
    }
  }catch(error){for(const display of displays)display.dispose();for(const material of materials)material.dispose();throw error;}
  meshes[0].position.copy(plan.positionA);meshes[0].quaternion.copy(plan.rotationA);meshes[0].scale.copy(plan.scaleA);
  meshes[1].quaternion.copy(plan.rotationB);meshes[1].scale.copy(plan.scaleB);
  const anchors=plan.memberAnchors??[{a:plan.anchorA,b:plan.anchorB}];
  const pathGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(anchors.length*6),3));
  const pathMaterial=new THREE.LineDashedMaterial({color:'#53798b',dashSize:.002,gapSize:.0012,depthTest:false,transparent:true,opacity:.85});
  const path=new THREE.LineSegments(pathGeometry,pathMaterial);path.renderOrder=4;group.add(path);
  const markerGeometry=new THREE.SphereGeometry(Math.max(.00045,plan.travel*.009),12,8);
  const markerMaterials=['#159b92','#d99922'].map(color=>new THREE.MeshBasicMaterial({color,depthTest:false}));
  const markers=anchors.map(()=>markerMaterials.map(material=>{const mesh=new THREE.Mesh(markerGeometry,material);mesh.renderOrder=5;group.add(mesh);return mesh;}));
  function update(value:number){
    const progress=Number.isFinite(value)?THREE.MathUtils.clamp(value,0,1):0;
    meshes[1].position.lerpVectors(plan.startB,plan.endB,progress);
    const attr=pathGeometry.getAttribute('position');
    for(const [i,anchor] of anchors.entries()){
      const end=anchor.b.clone().addScaledVector(plan.axis,plan.travel*(1-progress));markers[i][0].position.copy(anchor.a);markers[i][1].position.copy(end);
      attr.setXYZ(i*2,...anchor.a.toArray());attr.setXYZ(i*2+1,...end.toArray());
    }
    attr.needsUpdate=true;pathGeometry.computeBoundingSphere();path.computeLineDistances();group.updateMatrixWorld(true);
  }
  update(0);
  return {group,meshes,plan,update,setTransparent(value:boolean){for(const [i,material] of materials.entries()){material.transparent=value;material.opacity=value?.38:1;material.depthWrite=!value;material.needsUpdate=true;meshes[i].renderOrder=value?2:0;}},dispose(){group.removeFromParent();for(const display of displays)display.dispose();for(const material of materials)material.dispose();pathGeometry.dispose();pathMaterial.dispose();markerGeometry.dispose();for(const material of markerMaterials)material.dispose();}};
}

export type CompatibilityPreviewModel=ReturnType<typeof makeCompatibilityPreview>;
