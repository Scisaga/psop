import {Raycaster,Vector3,type BufferGeometry,type Mesh} from 'three';
import type {Vec3} from './types';

export interface GeometryFocusPose {position:Vec3;target:Vec3}

/** Presentation only: a fitted axis has no entrance sign. Compare a bounded
 * set of camera poses against actual source facets; do not infer a passage. */
export function chooseSourceGeometryFocus(
  mesh:Mesh,source:BufferGeometry,triangleIndices:number[],preferred:Vector3,
  viewHint:Vector3,poseForDirection:(direction:Vector3)=>GeometryFocusPose,
) {
  mesh.updateWorldMatrix(true,false);
  const positions=source.getAttribute('position'),selected=new Set(triangleIndices);
  const samples:Vector3[]=[];
  const sampleCount=Math.min(16,triangleIndices.length);
  for(let index=0;index<sampleCount;index++){
    const triangle=triangleIndices[Math.floor(index*triangleIndices.length/sampleCount)];
    const point=new Vector3();for(let vertex=0;vertex<3;vertex++)point.add(new Vector3().fromBufferAttribute(positions,triangle*3+vertex));
    samples.push(point.multiplyScalar(1/3).applyMatrix4(mesh.matrixWorld));
  }
  const axis=preferred.clone().normalize();
  const side=viewHint.clone().addScaledVector(axis,-viewHint.dot(axis));
  if(side.lengthSq()<1e-8)side.crossVectors(axis,new Vector3(0,1,0));
  if(side.lengthSq()<1e-8)side.set(1,0,0);side.normalize();
  const across=new Vector3().crossVectors(axis,side).normalize();
  const directions=[axis,axis.clone().negate()];
  for(const sign of [1,-1])for(const tangent of [side,side.clone().negate(),across,across.clone().negate()])directions.push(axis.clone().multiplyScalar(sign).addScaledVector(tangent,.45).normalize());
  directions.push(viewHint.clone().normalize(),viewHint.clone().negate().normalize());
  const ray=new Raycaster();let best:{pose:GeometryFocusPose;visibleSamples:number;sampleCount:number}|null=null;
  for(const direction of directions){
    const next=poseForDirection(direction),camera=new Vector3().fromArray(next.position);let visible=0;
    for(const point of samples){
      const delta=point.clone().sub(camera),distance=delta.length();if(distance<1e-9)continue;
      ray.set(camera,delta.multiplyScalar(1/distance));ray.far=distance+1e-7;
      const hit=ray.intersectObject(mesh,false)[0];
      if(hit?.faceIndex!=null&&selected.has(hit.faceIndex)&&Math.abs(hit.distance-distance)<1e-7)visible++;
    }
    if(!best||visible>best.visibleSamples)best={pose:next,visibleSamples:visible,sampleCount:samples.length};
  }
  return best!;
}
