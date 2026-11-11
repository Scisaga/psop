import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Box3,BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Vector3} from 'three';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {makeCompatibilityPreview,planCompatibilityAlignment} from '../src/compatibility-preview.ts';

const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-10,`${a.toArray()} != ${b.toArray()}`);
const part=(id,axis,angle,scale=[1,1,1])=>({id,position:[.23,-.12,.09],quaternion:new Quaternion().setFromAxisAngle(axis,angle).toArray(),scale});
const cylinder=(id,owner_ref,axis,origin=[0,0,0])=>({id,owner_ref,kind:'bore_wall',geometry:{type:'cylinder',origin,axis,radius_m:.002,axial_range_m:[-.001,.003],triangle_indices:[0]}});
const box=new Box3(new Vector3(-.01,-.02,-.005),new Vector3(.02,.01,.01));

test('nonidentity rotations and nonuniform scales produce coaxial finite ends, with a visible gap and no source-placement mutation',()=>{
  const a=part('a',new Vector3(0,0,1),.7,[2,1,1]),b=part('b',new Vector3(1,0,0),1.1,[1,3,1]);
  const axisA=new Vector3(1,1,0).normalize(),axisB=new Vector3(0,1,1).normalize();
  const fa=cylinder('fa','a',axisA.toArray(),[.02,.02,0]),fb=cylinder('fb','b',axisB.toArray(),[0,.03,.03]);
  const before=JSON.stringify([a,b,fa,fb]),p=planCompatibilityAlignment(a,fa,box,b,fb,box);
  const ma=new Matrix4().compose(p.positionA,p.rotationA,p.scaleA),mb=new Matrix4().compose(p.endB,p.rotationB,p.scaleB);
  const anchorA=new Vector3().fromArray(fa.geometry.origin).addScaledVector(axisA,.003).applyMatrix4(ma);
  const anchorB=new Vector3().fromArray(fb.geometry.origin).addScaledVector(axisB,.003).applyMatrix4(mb);
  near(anchorA,p.anchorA);near(anchorB,p.anchorB);
  const da=axisA.clone().transformDirection(ma),db=axisB.clone().transformDirection(mb);
  near(da,db.negate());near(anchorB.clone().sub(anchorA).normalize(),da);
  assert.ok(anchorA.distanceTo(anchorB)>=.0015);assert.ok(p.startB.distanceTo(p.endB)>.02);
  assert.equal(JSON.stringify([a,b,fa,fb]),before);
  for(const m of [ma,mb,new Matrix4().compose(p.startB,p.rotationB,p.scaleB)])assert.ok(p.bounds.clone().expandByScalar(1e-12).containsBox(box.clone().applyMatrix4(m)));
});

test('opposed plane normals align at the selected plane without treating arbitrary source points as an insertion depth',()=>{
  const a=part('a',new Vector3(1,0,0),.4),b=part('b',new Vector3(0,1,0),-.9);
  const fa={id:'fa',owner_ref:'a',geometry:{type:'plane',origin:[0,0,.01],normal:[0,0,1],triangle_indices:[0]}};
  const fb={id:'fb',owner_ref:'b',geometry:{type:'plane',origin:[0,0,.02],normal:[0,0,1],triangle_indices:[0]}};
  const p=planCompatibilityAlignment(a,fa,box,b,fb,box);
  near(new Vector3(0,0,1).applyQuaternion(p.rotationA),new Vector3(0,0,-1).applyQuaternion(p.rotationB));
  assert.ok(p.anchorA.distanceTo(p.anchorB)>0);
  assert.throws(()=>planCompatibilityAlignment(a,fa,box,a,fa,box),/两个不同部件/);
  assert.throws(()=>planCompatibilityAlignment(a,{...fa,geometry:{...fa.geometry,normal:[0,0,0]}},box,b,fb,box),/对位方向/);
});

test('preview owns its color buffers, keeps source vertices and triangle identities, clamps progress, and disposes only its resources',()=>{
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,.01,0,0,0,.01,0],3));geometry.computeBoundingBox();
  const vertices=Array.from(geometry.getAttribute('position').array),a=part('a',new Vector3(0,0,1),0),b=part('b',new Vector3(0,0,1),0);
  const fa=cylinder('fa','a',[0,0,1]),fb=cylinder('fb','b',[0,0,1]),request={key:'ab',features:[fa,fb]};
  let sourceDisposed=false,cloneDisposed=0;geometry.addEventListener('dispose',()=>{sourceDisposed=true;});
  const model=makeCompatibilityPreview(request,id=>({part:id==='a'?a:b,sourceGeometry:geometry}));
  for(const mesh of model.meshes){assert.notEqual(mesh.geometry,geometry);assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array),vertices);mesh.geometry.addEventListener('dispose',()=>cloneDisposed++);}
  model.update(1);near(model.meshes[1].position,model.plan.endB);model.update(2);near(model.meshes[1].position,model.plan.endB);
  model.update(-1);near(model.meshes[1].position,model.plan.startB);model.update(NaN);near(model.meshes[1].position,model.plan.startB);
  model.setTransparent(true);assert.ok(model.meshes.every(m=>m.renderOrder>0&&m.material.transparent&&!m.material.depthWrite));
  model.setTransparent(false);assert.ok(model.meshes.every(m=>m.renderOrder===0&&!m.material.transparent&&m.material.depthWrite));
  model.dispose();assert.equal(sourceDisposed,false);assert.equal(cloneDisposed,2);assert.deepEqual(Array.from(geometry.getAttribute('position').array),vertices);geometry.dispose();
});

test('the screenshot pair uses its published finite hole correspondence and its two actual STL meshes',async()=>{
  const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
  const read=async rel=>{const raw=await fs.readFile(new URL(rel,root));return JSON.parse((rel.endsWith('.gz')?gunzipSync(raw):raw).toString('utf8'));};
  const scene=await read('indexes/scene.json'),index=await read('indexes/capabilities.json'),pair=await read('details/pairs/84f78027ea6391334d78.json.gz');
  const features=[];for(const owner of pair.owner_refs)features.push(...(await read(index.parts[owner].path)).features);
  const candidate=pair.candidates.find(c=>c.template_ref.includes('through_fastener')),published=candidate.mapping_family.pairs[0];
  const selected=[published.feature_a_ref,published.feature_b_ref].map(ref=>features.find(f=>f.id===ref));
  const sources=new Map();for(const owner of pair.owner_refs){const part=scene.parts.find(p=>p.id===owner),raw=await fs.readFile(new URL(part.geometryUrl,root)),sourceGeometry=new STLLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));sourceGeometry.computeBoundingBox();sources.set(owner,{part,sourceGeometry});}
  const before=JSON.stringify([scene.parts,pair,selected]);
  const model=makeCompatibilityPreview({key:'actual',features:selected},owner=>sources.get(owner));
  for(const progress of [0,.25,.5,.75,1]){model.update(progress);for(const mesh of model.meshes){assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));assert.ok(model.plan.bounds.clone().expandByScalar(1e-10).containsBox(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld)));}}
  assert.equal(JSON.stringify([scene.parts,pair,selected]),before);model.dispose();for(const rec of sources.values())rec.sourceGeometry.dispose();
});

test('a complete interface preview keeps all four published hole axes aligned together and highlights every member',async()=>{
  const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
  const read=async rel=>{const raw=await fs.readFile(new URL(rel,root));return JSON.parse((rel.endsWith('.gz')?gunzipSync(raw):raw).toString('utf8'));};
  const scene=await read('indexes/scene.json'),index=await read('indexes/capabilities.json'),pair=await read('details/pairs/84f78027ea6391334d78.json.gz');
  const features=[];for(const owner of pair.owner_refs)features.push(...(await read(index.parts[owner].path)).features);
  const candidate=pair.candidates.find(c=>c.template_ref.includes('through_fastener')),match=candidate.interface_matches[0],byFeature=new Map(features.map(f=>[f.id,f]));
  const groups=['a','b'].map(side=>[...new Set(match.alignment_options.flatMap(option=>option.member_pairs.map(p=>p[`feature_${side}_ref`])))].map(ref=>byFeature.get(ref)));
  assert.equal(match.member_count,4);assert.deepEqual(groups.map(g=>g.length),[4,4]);
  const sources=new Map();for(const owner of pair.owner_refs){const part=scene.parts.find(p=>p.id===owner),raw=await fs.readFile(new URL(part.geometryUrl,root)),sourceGeometry=new STLLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));sourceGeometry.computeBoundingBox();sources.set(owner,{part,sourceGeometry});}
  const request={key:match.id,features:groups.map(g=>g[0]),featureGroups:groups,interfaceMatch:match};
  const model=makeCompatibilityPreview(request,owner=>sources.get(owner));
  assert.equal(model.plan.memberAnchors.length,4);
  const sourcePartsBefore=JSON.stringify(scene.parts);
  for(const amount of [0,.35,1]){
    model.update(amount);
    const valid=match.alignment_options.filter(option=>option.member_pairs.every(p=>{
      const a=new Vector3().fromArray(p.position_a).applyMatrix4(model.meshes[0].matrixWorld),b=new Vector3().fromArray(p.position_b).applyMatrix4(model.meshes[1].matrixWorld);
      const axis=new Vector3().fromArray(byFeature.get(p.feature_a_ref).geometry.axis).transformDirection(model.meshes[0].matrixWorld),delta=b.sub(a);
      return delta.addScaledVector(axis,-delta.dot(axis)).length()<.00004;
    }));
    assert.ok(valid.length>0,'one common model transform must satisfy all four independently published source axes');
  }
  for(const [i,group] of groups.entries()){
    const colors=model.meshes[i].geometry.getAttribute('color');
    for(const feature of group){const tri=feature.geometry.triangle_indices[0];assert.ok(colors.getX(tri*3)<.95,'each selected source wall carries its own feature highlight');}
  }
  assert.equal(JSON.stringify(scene.parts),sourcePartsBefore);model.dispose();
  assert.throws(()=>makeCompatibilityPreview({...request,featureGroups:[groups[0],groups[1].slice(1)]},owner=>sources.get(owner)),/成员.*尚未读全/);
  for(const rec of sources.values())rec.sourceGeometry.dispose();
});

test('the leg screenshot pair replays an exact checked solid pose and refuses interfering fallbacks',async()=>{
  const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
  const read=async rel=>{const raw=await fs.readFile(new URL(rel,root));return JSON.parse((rel.endsWith('.gz')?gunzipSync(raw):raw).toString('utf8'));};
  const scene=await read('indexes/scene.json'),index=await read('indexes/capabilities.json'),pair=await read('details/pairs/4b913c61038bb4bd5b37.json.gz');
  assert.ok(pair.placement_exclusions.some(e=>e.member_count===2));
  assert.ok(pair.candidates.every(c=>c.interface_matches.every(m=>m.member_count===4)),'the colliding housing double-hole match is excluded');
  const features=[];for(const owner of pair.owner_refs)features.push(...(await read(index.parts[owner].path)).features);
  const candidate=pair.candidates.find(c=>c.template_ref.includes('through_fastener')),match=candidate.interface_matches[0],byFeature=new Map(features.map(f=>[f.id,f]));
  const groups=['a','b'].map(side=>[...new Set(match.alignment_options.flatMap(o=>o.member_pairs.map(p=>p[`feature_${side}_ref`])))].map(ref=>byFeature.get(ref)));
  const sources=new Map();for(const owner of pair.owner_refs){const part=scene.parts.find(p=>p.id===owner),raw=await fs.readFile(new URL(part.geometryUrl,root)),sourceGeometry=new STLLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));sourceGeometry.computeBoundingBox();sources.set(owner,{part,sourceGeometry});}
  const request={key:match.id,features:groups.map(g=>g[0]),featureGroups:groups,interfaceMatch:match},before=JSON.stringify([scene.parts,pair]);
  const model=makeCompatibilityPreview(request,owner=>sources.get(owner));model.update(1);
  const relative=model.meshes[0].matrixWorld.clone().invert().multiply(model.meshes[1].matrixWorld);
  assert.ok(match.alignment_options.some(o=>{
    assert.equal(o.interference.status,'clear');assert.equal(o.seating.display_gap_m,0);
    const r=o.registration.rotation_b_to_a,t=o.registration.translation_b_to_a,expected=new Matrix4().set(...r[0],t[0],...r[1],t[1],...r[2],t[2],0,0,0,1);
    return relative.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-10);
  }),'the actual rendered mesh matrices must equal a published checked R/T, including axial translation');
  for(const anchor of model.plan.memberAnchors)assert.ok(anchor.a.distanceTo(anchor.b)<.00004,'no invented final display gap');
  model.dispose();assert.equal(JSON.stringify([scene.parts,pair]),before);
  const invalid=structuredClone(match);for(const o of invalid.alignment_options)o.interference.status='interference';
  assert.throws(()=>makeCompatibilityPreview({...request,interfaceMatch:invalid},owner=>sources.get(owner)),/没有可采用的已发布固定姿态/);
  for(const rec of sources.values())rec.sourceGeometry.dispose();
});
