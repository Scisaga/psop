import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BoxGeometry, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, PerspectiveCamera, Plane, Vector3} from 'three';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {createSourceSelection, createWitnessMarkers, updateWitnessVisibility, SOURCE_WITNESS_VISIBILITY_TOLERANCE_M} from '../src/source-selection.ts';
import {prepareSourceDisplayNormals} from '../src/source-display-normals.ts';

const sourceGeometry=()=>{
  const source=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([
    0,0,0, .002,0,0, 0,.002,0,
    .002,0,0, .002,.002,.0002, 0,.002,0,
    .01,0,0, .012,0,0, .01,.002,0,
  ],3));
  return prepareSourceDisplayNormals(source);
};
const feature=(id,type,indices,origin=[0,0,0])=>({id,owner_ref:'part-a',kind:type==='source_region'?'surface_region':'planar_patch',geometry_source_ref:'source-a',geometry_digest:'a'.repeat(64),geometry:{type,origin,normal:[0,0,1],triangle_indices:indices}});
const bytes=attribute=>Buffer.from(attribute.array.buffer).toString('hex');
const vector=(attribute,index)=>[attribute.getX(index),attribute.getY(index),attribute.getZ(index)];
function colorClose(actual,color){const expected=new Color(color);for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-[expected.r,expected.g,expected.b][i])<1e-7);}

test('finite selection draws one source mesh and preserves positions, facet order and prepared normals',()=>{
  const source=sourceGeometry(),position=source.getAttribute('position'),normal=source.getAttribute('normal');
  const positionBytes=bytes(position),normalBytes=bytes(normal);
  const display=createSourceSelection(source,[feature('face','plane',[1])]);
  assert.equal(display.geometry.index,null);
  assert.equal(bytes(display.geometry.getAttribute('position')),positionBytes);
  assert.equal(bytes(display.geometry.getAttribute('normal')),normalBytes);
  assert.equal(bytes(position),positionBytes);assert.equal(bytes(normal),normalBytes);
  assert.notStrictEqual(display.geometry.getAttribute('position'),position);
  assert.equal(source.getAttribute('color'),undefined);
  assert.equal(display.fillTriangleCount,1);assert.equal(display.geometry.getAttribute('position').count,position.count);
  for(let i=0;i<position.count;i++)colorClose(vector(display.geometry.getAttribute('color'),i),i>=3&&i<6?'#d99922':'#6ebbb5');
  assert.deepEqual(display.witnesses,[]);
  display.dispose();
});

test('two instances sharing one STL keep independent selection color buffers',()=>{
  const source=sourceGeometry();
  const left=createSourceSelection(source,[feature('left','plane',[0])]);
  const right=createSourceSelection(source,[feature('right','plane',[2])]);
  assert.notStrictEqual(left.geometry.getAttribute('color'),right.geometry.getAttribute('color'));
  const rightBefore=bytes(right.geometry.getAttribute('color'));
  left.geometry.getAttribute('color').setX(0,.9);
  assert.equal(bytes(right.geometry.getAttribute('color')),rightBefore);
  assert.equal(source.getAttribute('color'),undefined);
  let sourceDisposed=false;source.addEventListener('dispose',()=>sourceDisposed=true);
  left.dispose();right.dispose();assert.equal(sourceDisposed,false);
});

test('sparse source regions produce a true source-facet witness and zero triangle fill',()=>{
  const source=sourceGeometry();
  const display=createSourceSelection(source,[feature('witness','source_region',[0,2],[.011,.001,0])]);
  assert.equal(display.fillTriangleCount,0);assert.equal(display.witnesses.length,1);
  const witness=display.witnesses[0];assert.equal(witness.featureRef,'witness');assert.equal(witness.triangleIndex,2);
  const positions=source.getAttribute('position');
  for(let axis=0;axis<3;axis++){
    const expected=[0,1,2].reduce((sum,corner)=>sum+positions.array[(witness.triangleIndex*3+corner)*3+axis],0)/3;
    assert.equal(witness.position[axis],expected);
  }
  assert.deepEqual(witness.normal,[0,0,1]);
  for(let i=0;i<positions.count;i++)colorClose(vector(display.geometry.getAttribute('color'),i),'#6ebbb5');
  assert.equal(display.bounds.max.x,positions.getX(7));
  const markers=createWitnessMarkers(display.witnesses);
  assert.equal(markers.group.children.length,1);assert.equal(markers.group.children[0].isSprite,true);
  let copiedFaces=0;markers.group.traverse(object=>{if(object instanceof Mesh)copiedFaces++;});assert.equal(copiedFaces,0);
  assert.equal(markers.group.children[0].userData.triangleIndex,2);
  markers.dispose();display.dispose();
});

test('duplicate feature references do not double-fill or duplicate witness markers',()=>{
  const source=sourceGeometry(),wall=feature('wall','cylinder',[0,0,1]),region=feature('region','source_region',[2]);
  const display=createSourceSelection(source,[wall,wall,region,region]);
  assert.equal(display.fillTriangleCount,2);assert.equal(display.witnesses.length,1);display.dispose();
});

test('out-of-range source facets fail rather than highlighting a different structure',()=>{
  const source=sourceGeometry();
  assert.throws(()=>createSourceSelection(source,[feature('bad','plane',[3])]),/out of range/);
});

test('published jaw-cover witnesses no longer produce the pointed gold triangle overlay',()=>{
  const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));
  assert.equal(manifest.profile,'psop.hardware.source-model/1.15');
  const scene=JSON.parse(fs.readFileSync(new URL(manifest.entrypoints.scene,root),'utf8'));
  const site=scene.assembly.interfaces.find(item=>item.owner_ref==='part:microduck:328011951ac11ee7'&&item.key==='soft_cover_support');
  const refs=new Set(site.members.flatMap(member=>member.feature_refs));
  const features=scene.assembly.features.filter(item=>refs.has(item.id));
  const source=scene.sources.find(item=>item.id===features[0].geometry_source_ref);
  const raw=fs.readFileSync(new URL(source.url,root));
  assert.equal(createHash('sha256').update(raw).digest('hex'),source.digest);
  const geometry=new STLLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));prepareSourceDisplayNormals(geometry);
  const original=bytes(geometry.getAttribute('position'));
  const display=createSourceSelection(geometry,features);
  assert.equal(display.fillTriangleCount,0);assert.equal(display.witnesses.length,1);
  assert.ok(features[0].geometry.triangle_indices.length>100);
  assert.equal(bytes(geometry.getAttribute('position')),original);assert.equal(geometry.getAttribute('color'),undefined);
  display.dispose();geometry.dispose();
});

function visibilityFixture(){
  const source=sourceGeometry();
  const display=createSourceSelection(source,[feature('region','source_region',[0])]);
  const mesh=new Mesh(source,new MeshBasicMaterial({side:DoubleSide}));
  const markers=createWitnessMarkers(display.witnesses);mesh.add(markers.group);
  const anchor=new Vector3().fromArray(display.witnesses[0].position);
  const camera=new PerspectiveCamera(34,1,.0001,1);camera.position.copy(anchor).add(new Vector3(0,0,.05));camera.lookAt(anchor);camera.updateProjectionMatrix();
  return {source,display,mesh,markers,anchor,camera,dispose(){markers.dispose();display.dispose();source.dispose();mesh.material.dispose();}};
}

test('visible anchor shows the complete screen glyph without source-face depth clipping',()=>{
  const f=visibilityFixture();
  assert.equal(f.markers.markers[0].sprite.visible,false);
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera),1);
  const sprite=f.markers.markers[0].sprite;
  assert.equal(sprite.visible,true);assert.equal(sprite.material.depthTest,false);assert.equal(sprite.material.depthWrite,false);
  assert.equal(sprite.scale.x,.013);assert.deepEqual(sprite.position.toArray(),f.display.witnesses[0].position);
  assert.equal(sprite.userData.anchorVisibility,'visible');
  f.dispose();
});

test('a foreground source part hides the glyph, including otherwise visible geometry',()=>{
  const f=visibilityFixture();
  const blocker=new Mesh(new BoxGeometry(.01,.01,.001),new MeshBasicMaterial());blocker.position.copy(f.anchor).add(new Vector3(0,0,.01));
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera,[f.mesh,blocker]),0);
  assert.equal(f.markers.markers[0].sprite.visible,false);assert.equal(f.markers.markers[0].sprite.userData.anchorVisibility,'occluded');
  blocker.visible=false;
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera,[f.mesh,blocker]),1);
  blocker.geometry.dispose();blocker.material.dispose();f.dispose();
});

test('back-facing or hidden source witnesses do not show through the source part',()=>{
  const f=visibilityFixture();
  f.camera.position.copy(f.anchor).add(new Vector3(0,0,-.05));f.camera.lookAt(f.anchor);
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera),0);assert.equal(f.markers.markers[0].sprite.userData.anchorVisibility,'back_facing');
  f.camera.position.copy(f.anchor).add(new Vector3(0,0,.05));f.camera.lookAt(f.anchor);f.mesh.visible=false;
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera),0);assert.equal(f.markers.markers[0].sprite.userData.anchorVisibility,'source_hidden');
  f.dispose();
});

test('anchor visibility uses a bounded 20 micrometer source-distance tolerance',()=>{
  const f=visibilityFixture();assert.equal(SOURCE_WITNESS_VISIBILITY_TOLERANCE_M,.00002);
  const blocker=new Mesh(new BoxGeometry(.01,.01,.000001),new MeshBasicMaterial());blocker.position.copy(f.anchor).add(new Vector3(0,0,.00001));
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera,[f.mesh,blocker]),1);
  blocker.position.z=.00005;
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera,[f.mesh,blocker]),0);
  blocker.geometry.dispose();blocker.material.dispose();f.dispose();
});

test('transformed sources and clipping still use the actual anchor and original facet mapping',()=>{
  const f=visibilityFixture();
  f.mesh.rotation.set(.3,.5,.1);f.mesh.position.set(.2,.1,.3);f.mesh.updateMatrixWorld(true);
  const world=f.anchor.clone().applyMatrix4(f.mesh.matrixWorld);
  const normal=new Vector3(0,0,1).transformDirection(f.mesh.matrixWorld);
  f.camera.position.copy(world).addScaledVector(normal,.05);f.camera.lookAt(world);
  const original=bytes(f.source.getAttribute('position'));
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera),1);
  assert.equal(bytes(f.source.getAttribute('position')),original);assert.equal(f.source.index,null);
  f.mesh.material.clippingPlanes=[new Plane(normal.clone(),-normal.dot(world)-.001)];
  assert.equal(updateWitnessVisibility(f.markers,f.mesh,f.camera),0);assert.equal(f.markers.markers[0].sprite.userData.anchorVisibility,'clipped');
  f.dispose();
});
