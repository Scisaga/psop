import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInterfaceAdaptations} from '../../../skills/psop-build/scripts/interface-adaptations.mjs';
import {interfaceContactRegions,distanceFromContactRegions} from '../../../skills/psop-build/scripts/interface-contact.mjs';
function stl(triangles){const bytes=Buffer.alloc(84+50*triangles.length);bytes.writeUInt32LE(triangles.length,80);triangles.forEach((t,i)=>t.forEach((p,j)=>p.forEach((v,k)=>bytes.writeFloatLE(v,84+50*i+12+12*j+4*k))));return bytes;}
function fixture({mirror=false,rotation=.41,width=.003,offsetMember=false,missingSurface=false}={}){
 const parts=['a','b','c'].map(id=>({id,name:'Unrelated name '+id,position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]})),interfaces=[],features=[],meshes=new Map(),centres=[[0,0,0],[.021,0,0],[.004,.017,0]];
 for(const p of parts){const triangles=[],members=[],angle=p.id==='c'?rotation:0,cos=Math.cos(angle),sin=Math.sin(angle),transform=v=>{let [x,y,z]=v;if(p.id==='c'&&mirror)x=-x;return [cos*x-sin*y+(p.id==='c'?.1:0),sin*x+cos*y,z];};
  for(let n=0;n<3;n++){
   const c=centres[n].map((v,k)=>v+(offsetMember&&p.id==='c'&&n===2&&k===0?.001:0)),size=p.id==='c'?width:.003,raw=[[c[0],c[1],0],[c[0]+size,c[1],0],[c[0]+size,c[1]+.002,0],[c[0],c[1]+.002,0]],start=triangles.length,ps=raw.map(transform);triangles.push([ps[0],ps[1],ps[2]],[ps[0],ps[2],ps[3]]);
   const fid=p.id+':surface:'+n;features.push({id:fid,kind:p.id==='b'?'receiver_surface':'source_region',owner_ref:p.id,geometry:{type:'source_region',normal:[0,0,p.id==='b'?-1:1],triangle_indices:missingSurface&&p.id==='c'?[]:[start,start+1]}});members.push({id:p.id+':interface:member-'+n,position:transform(c),direction:[0,0,p.id==='b'?-1:1],feature_refs:[fid]});
  }
  interfaces.push({id:p.id+':interface',owner_ref:p.id,members});meshes.set(p.id,stl(triangles));
 }
 const connections=[{id:'source-fit',basis:'source_fit',name:'Finite composite fit',endpoints:interfaces.slice(0,2).map(i=>({interface_ref:i.id,member_refs:i.members.map(m=>m.id)}))}];return {parts,interfaces,features,meshes,connections};
}
test('actual finite profiles transfer a complete fit across unrelated identities and arbitrary proper rotations',()=>{
 const f=fixture(),before=JSON.stringify([...f.meshes].map(([id,b])=>[id,b.toString('base64')])),result=buildInterfaceAdaptations(f),fit=result.fits.find(f=>f.owner_refs.includes('b')&&f.owner_refs.includes('c'));
 assert.ok(fit);assert.ok(fit.equivalence_refs.length);assert.deepEqual(fit.source_connection_refs,['source-fit']);assert.equal(fit.registration.whole_part_collision_evaluated,false);assert.ok(result.equivalences.some(e=>e.source_interface_ref==='a:interface'&&e.replacement_interface_ref==='c:interface'));assert.equal(fit.endpoints[1].member_refs.length,3);
 const r=fit.registration.rotation_b_to_a;assert.ok(Math.abs(r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0])-1)<1e-12);assert.equal(JSON.stringify([...f.meshes].map(([id,b])=>[id,b.toString('base64')])),before);
 f.parts.forEach(p=>p.name='Identical display name');assert.deepEqual(buildInterfaceAdaptations(f).fits,result.fits);
 f.parts.reverse();f.interfaces.reverse();f.features.reverse();assert.deepEqual(buildInterfaceAdaptations(f),result);
});
test('mirrored handed patterns, changed finite widths, shifted members, missing surfaces and incomplete member sets are not substituted',()=>{
 for(const options of [{mirror:true},{width:.006},{offsetMember:true},{missingSurface:true}]){const result=buildInterfaceAdaptations(fixture(options));assert.ok(!result.fits.some(f=>f.owner_refs.includes('c')),JSON.stringify(options));}
 const f=fixture();f.interfaces[2].members.pop();assert.ok(!buildInterfaceAdaptations(f).fits.some(f=>f.owner_refs.includes('c')));
});
test('ordinary geometric similarity without a captured complementary fit never invents a connection',()=>{
 const f=fixture();f.connections=[];assert.equal(buildInterfaceAdaptations(f).fits.length,0);
});
test('a mismatched cylinder in a composite interface cannot be hidden by the other matching surfaces',()=>{
 const f=fixture();for(const i of f.interfaces){const m=i.members[0],id=i.owner_ref+':bore';m.feature_refs.push(id);f.features.push({id,owner_ref:i.owner_ref,kind:'bore_wall',geometry:{type:'cylinder',axis:[0,0,1],origin:m.position,axial_range_m:[0,.002],radius_m:i.owner_ref==='c'?.002:.001}});}
 assert.ok(!buildInterfaceAdaptations(f).fits.some(f=>f.owner_refs.includes('c')));
});
test('finite triangle contact supports do not extend indefinitely beyond a selected ledge',()=>{
 const triangles=[[[0,0,0],[.01,0,0],[0,.01,0]]],contact={features:[[{type:'triangle_patch',triangles}],[{type:'triangle_patch',triangles}]]},regions=interfaceContactRegions(contact,[1,0,0,0,0,1,0,0,0,0,1,0,20,0,0,1]);
 assert.equal(distanceFromContactRegions([.002,.002,0],regions),0);assert.ok(distanceFromContactRegions([.015,.002,0],regions)>.004);assert.equal(distanceFromContactRegions([.022,.002,0],regions),0);assert.ok(distanceFromContactRegions([.002,.002,.002],regions)>.0019);
});

function enclosureFixture({wrongWidth=false,wrongPhase=false,missingSupport=false,rotation=.41}={}){
 const parts=['a','b','c'].map(id=>({id,name:'Unrelated '+id,position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]})),interfaces=[],features=[],meshes=new Map();
 for(const p of parts){
  const changed=p.id==='c',angle=changed?rotation:0,c=Math.cos(angle),s=Math.sin(angle),rotate=v=>[c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]],transform=v=>rotate(v).map((v,k)=>v+(changed&&k===0?.1:0)),polygons=[],triangles=[],members=[],sign=p.id==='b'?-1:1,w=changed&&wrongWidth?.012:.01,phase=changed&&wrongPhase?.002:0;
  polygons.push([[-w,-.009+phase,-.008],[-w,.021+phase,-.008],[-w,.021+phase,0],[-w,-.009+phase,0]],[[w,-.009+phase,-.008],[w,.021+phase,-.008],[w,.021+phase,0],[w,-.009+phase,0]],[[-.011,-.01,0],[.011,-.01,0],[.011,.02,0],[-.011,.02,0]],[[-.006,-.008,-.008],[.006,-.008,-.008], [.006,.019,changed?-.0068:-.007],[-.006,.019,-.008]]);
  const normals=[[-1,0,0],[1,0,0],[0,0,-1],[0,0,-1]];
  for(let n=0;n<4;n++){
   const ps=polygons[n].map(transform),start=triangles.length,normal=rotate(normals[n].map(v=>v*sign));triangles.push([ps[0],ps[1],ps[2]],[ps[0],ps[2],ps[3]]);const refs=[];
   const partitions=changed&&n===3?[[start],[start+1]]:[[start,start+1]];
   for(const [k,indices]of partitions.entries()){const id=p.id+':feature:'+n+':'+k;refs.push(id);features.push({id,owner_ref:p.id,kind:'finite_surface',geometry:{type:n===3?'source_region':'plane',normal,triangle_indices:missingSupport&&changed&&n===3?[]:indices}});}
   members.push({id:p.id+':interface:member-'+n,direction:normal,position:transform(polygons[n][0]).map((v,k)=>v+(changed&&k===1?.001:0)),feature_refs:refs});
  }
  // A feature above the rim is not part of the enclosure contact volume.
  triangles.push([[0,0,.015],[.001,0,.015],[0,.001,.015]].map(transform));meshes.set(p.id,stl(triangles));interfaces.push({id:p.id+':interface',owner_ref:p.id,members});
 }
 return {parts,interfaces,features,meshes,connections:[{id:'captured-enclosure',basis:'source_fit',name:'Enclosing seat',endpoints:interfaces.slice(0,2).map(i=>({interface_ref:i.id,member_refs:i.members.map(m=>m.id)}))}]};
}

test('finite enclosure seats match all locating members across different curve partitions and sample centroids',()=>{
 const f=enclosureFixture(),before=[...f.meshes].map(([id,b])=>[id,b.toString('base64')]),r=buildInterfaceAdaptations(f),fit=r.fits.find(f=>f.owner_refs.join('|')==='b|c');assert.ok(fit);assert.deepEqual(fit.endpoints.map(e=>e.member_refs.length),[4,4]);assert.equal(fit.member_pairs.length,4);assert.deepEqual(fit.equivalence_refs,[]);assert.ok(fit.interface_fit_hypothesis_refs.length);assert.equal(fit.surface_conformity,'unconfirmed');assert.equal(fit.registration.whole_part_collision_evaluated,false);assert.ok(r.interface_fit_hypotheses.some(h=>h.measurements.sampled_support_surface_gap_m>0));assert.ok(fit.contact_features.every(side=>side.length===1&&side[0].type==='oriented_box'));
 assert.deepEqual([...f.meshes].map(([id,b])=>[id,b.toString('base64')]),before);f.parts.reverse();f.interfaces.reverse();f.features.reverse();f.parts.forEach(p=>p.name='Same name');assert.deepEqual(buildInterfaceAdaptations(f),r);
});

test('enclosure matching rejects wrong locating spans, inconsistent wall/rim phase, incomplete support and unsupported members',()=>{
 for(const options of [{wrongWidth:true},{wrongPhase:true},{missingSupport:true}])assert.ok(!buildInterfaceAdaptations(enclosureFixture(options)).fits.some(f=>f.owner_refs.includes('c')),JSON.stringify(options));
 const partial=enclosureFixture();partial.features.find(f=>f.id==='c:feature:3:1').geometry.triangle_indices=[999];assert.ok(!buildInterfaceAdaptations(partial).fits.some(f=>f.owner_refs.includes('c')));
 const f=enclosureFixture(),m=f.interfaces[2].members[3],id='c:unsupported';m.feature_refs.push(id);f.features.push({id,owner_ref:'c',kind:'bore',geometry:{type:'cylinder',origin:[0,0,0],axis:[0,0,1],radius_m:.001,axial_range_m:[0,.01]}});assert.ok(!buildInterfaceAdaptations(f).fits.some(f=>f.owner_refs.includes('c')));
});

test('enclosure contact is bounded by the locating rim and support side, with placement applied to box axes',()=>{
 const r=buildInterfaceAdaptations(enclosureFixture({rotation:0})),fit=r.fits.find(f=>f.owner_refs.join('|')==='b|c'),contact={features:fit.contact_features},regions=interfaceContactRegions(contact,[0,1,0,0,-1,0,0,0,0,0,1,0,20,0,0,1]);assert.equal(regions.length,2);assert.equal(distanceFromContactRegions([0,0,-.004],regions),0);assert.ok(distanceFromContactRegions([0,0,.015],regions)>.014);assert.ok(distanceFromContactRegions([0,-.03,-.004],regions)>.019);assert.equal(distanceFromContactRegions([.02,.1,-.004],regions),0);assert.ok(distanceFromContactRegions([.02,.1,-.02],regions)>.011);
 const bad=structuredClone(contact);bad.features[0][0].axes[0]=[1,1,0];assert.deepEqual(interfaceContactRegions(bad,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),[]);
});
