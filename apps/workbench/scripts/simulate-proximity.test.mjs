import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Matrix4,PerspectiveCamera,Vector3} from 'three';
import {convexEnvelope,envelopeDistance,projectEnvelope,proximity} from '../src/simulate-proximity.ts';

const rect=(x,y,w,h)=>convexEnvelope([{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]);
const box=(x,y,z)=>new Box3(new Vector3(x-.02,y-.02,z-.02),new Vector3(x+.02,y+.02,z+.02));

test('projected overlap never opens or retains a card across a large physical separation',()=>{
  const a=box(0,0,0),b=box(0,0,.3);
  for(const retained of [false,true]){
    assert.equal(proximity(a,b,rect(40,40,60,40),rect(80,50,60,40),retained).near,false);
    assert.equal(proximity(a,box(.2,0,0),rect(40,40,60,40),rect(40,40,60,40),retained).near,false);
  }
});
test('physical approach also needs a small visible gap, with a narrow exit hysteresis',()=>{
  const a=box(0,0,0),b=box(.049,0,0),screenA=rect(40,40,60,40);
  assert.equal(proximity(a,b,screenA,rect(104,50,60,40)).near,true,'9 mm / 4 px approach');
  assert.equal(proximity(a,b,screenA,rect(107,50,60,40)).near,false,'7 px remains outside');
  assert.equal(proximity(a,b,screenA,rect(107,50,60,40),true).near,true,'8.1 px exit band');
  assert.equal(proximity(a,b,screenA,rect(109,50,60,40),true).near,false,'9 px leaves immediately');
  assert.equal(proximity(a,box(.055,0,0),screenA,rect(100,50,60,40)).near,false);
  assert.equal(proximity(a,box(.055,0,0),screenA,rect(100,50,60,40),true).near,true);
  assert.equal(proximity(a,box(.065,0,0),screenA,rect(100,50,60,40),true).near,false,'moving away closes despite projected overlap');
  assert.equal(proximity(a,b,null,screenA).near,false,'offscreen objects never open cards');
});
test('screen bounding rectangles alone do not mistake disjoint diagonal envelopes for overlap',()=>{
  const a=convexEnvelope([{x:0,y:0},{x:100,y:0},{x:0,y:100}]),b=convexEnvelope([{x:100,y:100},{x:100,y:70},{x:70,y:100}]);
  assert.ok(envelopeDistance(a,b)>28);assert.equal(envelopeDistance(a,rect(10,10,5,5)),0);
});
test('member envelopes respect camera rotations, world transforms and visibility',()=>{
  const camera=new PerspectiveCamera(40,1,.01,10);camera.position.set(0,0,1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const bounds=box(0,0,0),members=[-.12,.12].map(x=>({bounds,matrix:new Matrix4().makeRotationZ(.6).setPosition(x,0,0)}));
  const envelope=projectEnvelope(members,camera,1000,1000);assert.ok(envelope.min.x<400&&envelope.max.x>600);
  assert.ok(envelopeDistance(projectEnvelope([members[0]],camera,1000,1000),rect(490,495,20,10))>6,'empty space between group members is not a member envelope');
  assert.equal(projectEnvelope([{bounds,matrix:new Matrix4().setPosition(0,0,2)}],camera,1000,1000),null);
});
