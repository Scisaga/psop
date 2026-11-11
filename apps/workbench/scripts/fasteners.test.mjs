import test from 'node:test';
import {isDeepStrictEqual} from 'node:util';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Object3D,Vector3,Raycaster} from 'three';
import {fastenerViews,selectionForFastener,fastenerExplodedEntry} from '../src/fastener-model.ts';
import {makeFastenerScene,presentFasteners,fastenerBounds,fastenerPickMetadata,fastenerPickables,disposeFasteners} from '../src/fastener-scene.ts';

function fixture(){
 const parts=['entry','receiver'].map(id=>({id,position:[0,0,0],quaternion:[0,0,0,1],scale:[1,1,1]}));
 const features=[],interfaces=parts.map(part=>({id:part.id+'-interface',owner_ref:part.id,members:[]}));
 const paths=[];
 for(let n=0;n<4;n++){
  for(const index of [0,1]){
   const owner=parts[index].id,id=owner+'-feature-'+n,member=owner+'-member-'+n,y=n%2*.006,z=Math.floor(n/2)*.006;
   features.push({id,owner_ref:owner,kind:'bore_wall',geometry:{type:'cylinder',origin:[index?-.003:0,y,z],axis:[1,0,0],axial_range_m:index?[-.003,.003]:[0,.003],radius_m:index?.0008:.0011,triangle_indices:[0,1]}});
   interfaces[index].members.push({id:member,position:[0,y,z],direction:[1,0,0],feature_refs:[id]});
  }
  paths.push({id:'path-'+n,kind:'screw',representation:'schematic',entry:{interface_ref:'entry-interface',member_ref:'entry-member-'+n,feature_ref:'entry-feature-'+n,side:'high'},receiver:{interface_ref:'receiver-interface',member_ref:'receiver-member-'+n,feature_ref:'receiver-feature-'+n},evidence_refs:['source-proof']});
 }
 return {parts,assembly:{features,interfaces,connections:[{id:'connection',basis:'declared',endpoints:interfaces.map(i=>({interface_ref:i.id,member_refs:[]})),fastener_paths:paths}]}};
}
const select=(extra={})=>({kind:'interface',id:'entry-interface',ownerRef:'entry',memberRef:'entry-member-0',relationRef:'connection',...extra});
const near=(actual,expected)=>{actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-10,`${actual} != ${expected}`));};

test('a four-hole capability creates no screw count; only explicitly selected paths appear',()=>{
 const data=fixture();assert.deepEqual(fastenerViews(data,{kind:'interface',id:'entry-interface'}),[]);
 const views=fastenerViews(data,select());assert.equal(views.length,1);assert.equal(views[0].id,'path-0');assert.equal(views[0].representation,'schematic');assert.match(views[0].label,/规格待定/);
 const pair=fastenerViews(data,select({memberRef:undefined,memberRefs:['entry-member-1','entry-member-2']}));assert.deepEqual(pair.map(v=>v.id),['path-1','path-2']);
 assert.deepEqual(data.assembly.connections[0].endpoints.map(e=>e.member_refs),[[],[]]);
});

test('finite entry side determines entrance and inward axis, not member centre or direction',()=>{
 const data=fixture(),view=fastenerViews(data,select())[0];near(view.entryPosition,[.003,0,0]);near(view.inwardAxis,[-1,0,0]);near(view.receiverPosition,[0,0,0]);assert.ok(Math.abs(view.display.shaftLengthM-.003)<1e-10);
 const low=structuredClone(data);low.assembly.features[0].geometry.origin=[.003,0,0];low.assembly.features[0].geometry.axis=[-1,0,0];low.assembly.connections[0].fastener_paths[0].entry.side='low';
 const other=fastenerViews(low,select())[0];near(other.entryPosition,view.entryPosition);near(other.inwardAxis,view.inwardAxis);
});

test('an excluded reference does not draw fasteners, and human confirmation does not bypass geometric checks',()=>{
 const data=fixture();data.assembly.connections[0].manual_decision={status:'rejected'};assert.deepEqual(fastenerViews(data,select()),[]);
 delete data.assembly.connections[0].manual_decision;assert.equal(fastenerViews(data,select()).length,1);
 data.assembly.connections[0].manual_decision={status:'confirmed'};data.assembly.features[1].geometry.origin[1]=.001;
 assert.deepEqual(fastenerViews(data,select()),[]);
});

test('source placements and rotated axes determine the path without mutating data',()=>{
 const data=fixture(),angle=Math.PI/2;for(const part of data.parts){part.position=[1,2,3];part.quaternion=[0,0,Math.sin(angle/2),Math.cos(angle/2)];}
 const before=JSON.stringify(data),view=fastenerViews(data,select())[0];near(view.worldEntry,[1,2.003,3]);near(view.worldInwardAxis,[0,-1,0]);near(view.worldReceiver,[1,2,3]);assert.equal(JSON.stringify(data),before);
});

test('wrong members, owner, wall references and incompatible finite paths are not drawn',()=>{
 for(const change of [data=>data.assembly.connections[0].fastener_paths[0].entry.feature_ref='entry-feature-1',data=>data.assembly.features[1].geometry.axis=[0,1,0],data=>data.assembly.features[1].geometry.origin[1]=.001,data=>data.assembly.connections[0].basis='incompatible',data=>data.assembly.features[1].geometry.origin[0]=.010]){
  const data=fixture();change(data);assert.deepEqual(fastenerViews(data,select()),[]);
 }
 assert.deepEqual(fastenerViews(fixture(),select({ownerRef:'receiver'})),[]);
 assert.deepEqual(fastenerViews(fixture(),select({relationRef:'unknown'})),[]);
});

test('competing explanations of one hole require an explicit relationship/path',()=>{
 const data=fixture(),alternative=structuredClone(data.assembly.connections[0]);alternative.id='alternative';alternative.fastener_paths[0].id='alternative-path';data.assembly.connections.push(alternative);
 assert.deepEqual(fastenerViews(data,select({relationRef:undefined})),[]);
 assert.equal(fastenerViews(data,select()).length,1);
 assert.equal(fastenerViews(data,select({relationRef:undefined,fastenerRef:'alternative-path'}))[0].connectionRef,'alternative');
});

test('receiving member selects the exact same path and picking returns its entry connection',()=>{
 const view=fastenerViews(fixture(),{kind:'interface',id:'receiver-interface',ownerRef:'receiver',memberRef:'receiver-member-0',relationRef:'connection'})[0];
 assert.deepEqual(selectionForFastener(view),{kind:'interface',id:'entry-interface',ownerRef:'entry',memberRef:'entry-member-0',relationRef:'connection',fastenerRef:'path-0'});
});

test('an explicit path deep link is sufficient, but contradictory member identity is rejected',()=>{
 const data=fixture();assert.equal(fastenerViews(data,{kind:'interface',id:'entry-interface',fastenerRef:'path-0'})[0].id,'path-0');
 assert.deepEqual(fastenerViews(data,select({fastenerRef:'path-1'})),[]);
});

test('real jaw uses its curved outer wall entrance and four optional paths, with no claimed installed subset',()=>{
 const input=JSON.parse(fs.readFileSync(new URL('../../../device-materials/microduck-assembly-interfaces.json',import.meta.url),'utf8'));
 const root=new URL('../../../build/microduck/source-1.15/microduck-capabilities-9.dkp/',import.meta.url);
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));
 assert.equal(manifest.profile,'psop.hardware.source-model/1.15');
 const data=JSON.parse(fs.readFileSync(new URL(manifest.entrypoints.scene,root),'utf8'));
 const {capability_index,...publishedCatalog}=data.assembly;
 assert.ok(isDeepStrictEqual(publishedCatalog,input.catalog),'Published reference catalog must equal the reviewed current input; rebuild the matching package after editing that input.');
 const connection=data.assembly.connections.find(c=>c.id==='connection:assembly:328011951ac11ee7:jaw_drive');
 assert.equal(connection.basis,'declared');assert.equal(connection.fastener_paths.length,4);assert.ok(connection.endpoints.every(e=>e.member_refs.length===0));
 assert.deepEqual(fastenerViews(data,{kind:'interface',id:connection.endpoints[0].interface_ref}),[]);
 const views=connection.fastener_paths.map(path=>fastenerViews(data,{kind:'interface',id:path.entry.interface_ref,memberRef:path.entry.member_ref,relationRef:connection.id,fastenerRef:path.id})[0]);
 assert.ok(views.every(Boolean));assert.ok(views.every(view=>view.ownerRef==='part:microduck:328011951ac11ee7'));
 const first=views.find(view=>view.entryMemberRef.endsWith('hole_x_low_z_low'));
 near(first.entryPosition,[.04369470477104187,0,.001499999995139748]);near(first.inwardAxis,[-1,0,0]);near(first.worldInwardAxis,[0,-1,0]);
 for(const view of views){assert.ok(view.display.shaftLengthM>.0035&&view.display.shaftLengthM<.0045);assert.ok(Math.abs(view.worldEntry[0]-view.worldReceiver[0])<1e-6);assert.ok(Math.abs(view.worldEntry[2]-view.worldReceiver[2])<1e-6);}
});

test('explosion moves out of the verified entrance and restores exactly',()=>{
 const view=fastenerViews(fixture(),select())[0];near(fastenerExplodedEntry(view,0),[.003,0,0]);near(fastenerExplodedEntry(view,1),[.015,0,0]);near(fastenerExplodedEntry(view,2),[.015,0,0]);near(fastenerExplodedEntry(view,NaN),[.003,0,0]);
});

test('simple scene has an exterior head and an inward shaft, follows host transforms and can be picked',()=>{
 const view=fastenerViews(fixture(),select())[0],parent=new Object3D();parent.position.set(.1,.2,.3);parent.rotation.z=Math.PI/2;
 const handle=makeFastenerScene([view],()=>parent),record=handle.records.get(view.id);assert.equal(handle.pickables.length,2);assert.equal(record.group.parent,parent);
 presentFasteners(handle,{visible:true,explosion:0});parent.updateMatrixWorld(true);
 const head=record.group.children[0],shaft=record.group.children[1];
 assert.ok(head.getWorldPosition(new Vector3()).y>.203);assert.ok(shaft.getWorldPosition(new Vector3()).y<.203);
 assert.equal(head.geometry,shaft.geometry);assert.equal(head.geometry,handle.geometry);assert.equal(head.userData.representation,'schematic');
 const metadata=fastenerPickMetadata(shaft);assert.equal(metadata.pathRef,view.id);assert.equal(metadata.connectionRef,'connection');
 const box=fastenerBounds(handle);assert.ok(!box.isEmpty());
 const headAt=head.getWorldPosition(new Vector3()),ray=new Raycaster(headAt.clone().add(new Vector3(.01,0,0)),new Vector3(-1,0,0));assert.ok(ray.intersectObjects(fastenerPickables(handle)).length>0);
 presentFasteners(handle,{visible:true,explosion:1});parent.updateMatrixWorld(true);assert.ok(head.getWorldPosition(new Vector3()).y>.215);
 presentFasteners(handle,{visible:true,explosion:0});parent.updateMatrixWorld(true);near(head.getWorldPosition(new Vector3()).toArray(),headAt.toArray());disposeFasteners(handle);
});

test('hidden hosts cannot contribute pick targets or bounds; shared geometry is disposed once',()=>{
 const data=fixture(),views=fastenerViews(data,select({memberRef:undefined,memberRefs:['entry-member-0','entry-member-1']})),parent=new Object3D();
 const handle=makeFastenerScene(views,()=>parent);assert.equal(handle.records.size,2);let disposed=0;handle.geometry.addEventListener('dispose',()=>disposed++);
 parent.visible=false;assert.equal(fastenerPickables(handle).length,0);assert.ok(fastenerBounds(handle).isEmpty());
 parent.visible=true;presentFasteners(handle,{visible:false,explosion:0});assert.equal(fastenerPickables(handle).length,0);assert.ok(fastenerBounds(handle).isEmpty());
 disposeFasteners(handle);disposeFasteners(handle);assert.equal(disposed,1);assert.equal(parent.children.length,0);assert.equal(handle.records.size,0);assert.equal(handle.pickables.length,0);
});
