import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Quaternion,Vector3} from 'three';
import {layoutInstances,transformedBounds} from './simulate-core.mjs';
import {stlBounds} from './simulate-geometry.mjs';
import {restingQuaternion,stlSupportAreas} from './simulate-resting-pose.mjs';

function boxTriangles(lo,hi){
  const v=[[lo[0],lo[1],lo[2]],[hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],[lo[0],hi[1],lo[2]],[lo[0],lo[1],hi[2]],[hi[0],lo[1],hi[2]],[hi[0],hi[1],hi[2]],[lo[0],hi[1],hi[2]]];
  return [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(face=>face.map(i=>v[i]));
}
function stl(triangles){
  const bytes=Buffer.alloc(84+triangles.length*50);bytes.writeUInt32LE(triangles.length,80);
  triangles.forEach((face,n)=>face.forEach((v,j)=>v.forEach((value,k)=>bytes.writeFloatLE(value,84+n*50+12+j*12+k*4))));return bytes;
}
const part=(id,quaternion=new Quaternion().setFromEuler(new Euler(.7,.9,.4)).toArray())=>({id,position:[.1,.2,.3],quaternion,scale:[1,1,1]});

test('thin plates are laid on their broad face regardless of their assembled rotation; packing stays clear',()=>{
  const parts=[part('plate'),part('strip'),part('plate-copy')],before=structuredClone(parts);
  const bounds={plate:[[-.03,-.02,-.0005],[.03,.02,.0005]],strip:[[-.001,-.01,-.006],[.001,.01,.006]],'plate-copy':[[-.03,-.02,-.0005],[.03,.02,.0005]]};
  const instances=layoutInstances(parts,bounds),boxes=instances.map(p=>transformedBounds(bounds[p.part_ref],p));
  assert.deepEqual(parts,before);
  for(let i=0;i<parts.length;i++){
    assert.ok(Math.abs(boxes[i].min.z-.0002)<1e-10);
    assert.ok(Math.abs(boxes[i].getSize(new Vector3()).z-(i===1?.002:.001))<1e-10);
    assert.ok(Math.abs(new Quaternion().fromArray(instances[i].quaternion).length()-1)<1e-12);
    for(let j=0;j<i;j++)assert.equal(boxes[i].clone().expandByScalar(.0089).intersectsBox(boxes[j]),false);
  }
});

test('a hollow bearing rests with its opening facing upward instead of balancing on its rim',()=>{
  const triangles=[],radii=[.011,.008],z=[-.002,.002],count=32;
  const at=(r,n,h)=>[r*Math.cos(n*2*Math.PI/count),r*Math.sin(n*2*Math.PI/count),h];
  for(let n=0;n<count;n++)for(const quad of [
    [at(radii[0],n,z[0]),at(radii[0],n+1,z[0]),at(radii[0],n+1,z[1]),at(radii[0],n,z[1])],
    [at(radii[1],n,z[0]),at(radii[1],n,z[1]),at(radii[1],n+1,z[1]),at(radii[1],n+1,z[0])],
    ...z.map(h=>[at(radii[0],n,h),at(radii[1],n,h),at(radii[1],n+1,h),at(radii[0],n+1,h)]),
  ])triangles.push([quad[0],quad[1],quad[2]],[quad[0],quad[2],quad[3]]);
  const bytes=stl(triangles),bounds=stlBounds(bytes),p=part('bearing',new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2).toArray()),q=restingQuaternion(p,bounds,stlSupportAreas(bytes,bounds));
  const size=transformedBounds(bounds,{position:[0,0,0],quaternion:q}).getSize(new Vector3());
  assert.ok(Math.abs(size.z-.004)<1e-8);assert.ok(Math.abs(new Vector3(0,0,1).applyQuaternion(new Quaternion().fromArray(q)).z)>.999999);
});

test('the broad source bottom faces downward and raised details face upward, even from an upside-down assembly pose',()=>{
  const bytes=stl([...boxTriangles([0,0,0],[.04,.03,.002]),...boxTriangles([0,0,.002],[.003,.003,.004])]);
  const bounds=stlBounds(bytes),areas=stlSupportAreas(bytes,bounds),p=part('bracket',new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI).toArray());
  assert.ok(areas[4]>areas[5]*100);
  const quaternion=restingQuaternion(p,bounds,areas);
  assert.ok(new Vector3(0,0,1).applyQuaternion(new Quaternion().fromArray(quaternion)).z>.999999);
  const [instance]=layoutInstances([p],{bracket:bounds},{bracket:quaternion});
  assert.ok(Math.abs(transformedBounds(bounds,instance).min.z-.0002)<1e-9);
});

test('physical scale is included and cubes retain their existing upright pose',()=>{
  const p={...part('scaled'),scale:[10,1,.1]},bounds=[[-.001,-.01,-.02],[.001,.01,.02]];
  const quaternion=restingQuaternion(p,bounds),height=transformedBounds(bounds,{position:[0,0,0],quaternion},p.scale).getSize(new Vector3()).z;
  assert.ok(Math.abs(height-.004)<1e-10);
  const cube=part('cube',[0,0,0,1]);assert.deepEqual(restingQuaternion(cube,[[-.01,-.01,-.01],[.01,.01,.01]]),cube.quaternion);
});
