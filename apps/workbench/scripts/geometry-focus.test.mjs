import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry,DoubleSide,Float32BufferAttribute,Mesh,MeshBasicMaterial,Vector3} from 'three';
import {chooseSourceGeometryFocus} from '../src/geometry-focus.ts';

function fixture(){
 const source=new BufferGeometry();
 source.setAttribute('position',new Float32BufferAttribute([
  -.002,-.002,0,.002,-.002,0,0,.002,0,
  -.03,-.03,-.012,.03,-.03,-.012,0,.03,-.012,
 ],3));source.computeBoundingSphere();
 const mesh=new Mesh(source,new MeshBasicMaterial({side:DoubleSide}));
 return {source,mesh};
}

test('chooses a visible source side instead of assigning an entrance sign to the axis',()=>{
 const {source,mesh}=fixture();mesh.position.set(.03,.01,.15);mesh.rotateY(.7);mesh.updateMatrixWorld(true);
 const target=new Vector3().applyMatrix4(mesh.matrixWorld),axis=new Vector3(0,0,-1).transformDirection(mesh.matrixWorld);
 const choose=direction=>({position:target.clone().addScaledVector(direction,.025).toArray(),target:target.toArray()});
 const result=chooseSourceGeometryFocus(mesh,source,[0],axis,new Vector3(1,-1,1),choose);
 assert.equal(result.visibleSamples,1);assert.equal(result.sampleCount,1);
 assert.ok(new Vector3().fromArray(result.pose.position).sub(target).dot(axis)<0);
 assert.deepEqual(result.pose.target,target.toArray());source.dispose();mesh.material.dispose();
});

test('returns an explicit zero witness for an occluded source region without inventing visibility',()=>{
 const {source,mesh}=fixture();
 // Restrict the camera provider to the blocked side to exercise the fallback contract.
 const result=chooseSourceGeometryFocus(mesh,source,[0],new Vector3(0,0,-1),new Vector3(1,0,1),()=>({position:[0,0,-.025],target:[0,0,0]}));
 assert.equal(result.visibleSamples,0);assert.equal(result.sampleCount,1);
 source.dispose();mesh.material.dispose();
});
