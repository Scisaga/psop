import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BoxGeometry,Mesh,Quaternion,Vector3} from 'three';
import {STLExporter} from 'three/examples/jsm/exporters/STLExporter.js';
import {createMotionGeometry} from './simulate-path-geometry.mjs';
import {firstClearExit,processDirections,planAssemblyProcess} from './simulate-assembly-process.mjs';
import {routeAroundBoxes,segmentHitsBox,timedWaypoints} from './simulate-process-routes.mjs';
import {matrix,matrixPose} from './simulate-core.mjs';
import {waypointMotion} from '../src/simulate-motion.ts';
import {auditSimulationProcess} from './simulate-process-audit.mjs';

const pose=(id,position)=>({id:'instance:'+id,part_ref:id,position,quaternion:[0,0,0,1]});
const part=(id,kind='structure',scale=[1,1,1])=>({id,name:id,kind,body:'root',meshKey:id,geometryUrl:'cube.stl',scale});
const box=(min,max)=>new Box3(new Vector3(...min),new Vector3(...max));
async function geometryFor(t,parts,reference_instances=[]){const mesh=new Mesh(new BoxGeometry(.02,.02,.02)),bytes=Buffer.from(new STLExporter().parse(mesh,{binary:true}).buffer);mesh.geometry.dispose();const geometry=await createMotionGeometry({parts,geometries:[{key:'cube.stl',bytes}],reference_instances});t.after(()=>geometry.close());return geometry;}

test('whole-mesh sweep detects a thin wall crossed between clear endpoints',async t=>{
 const geometry=await geometryFor(t,[part('m','structure',[.2,.2,.2]),part('wall','structure',[.1,2,2])]),a=pose('m',[-.04,0,.05]),b=pose('wall',[0,0,.05]);
 assert.deepEqual(geometry.stats.proxy_parts,[]);assert.equal(geometry.overlap(a,b),null);assert.equal(geometry.overlap({...a,position:[.04,0,.05]},b),null);assert.equal(geometry.sweep(a,b,[.08,0,0]).blocked,true);
});

test('source nominal overlap is preserved, while new deeper transit penetration is observed',async t=>{
 const a=pose('a',[.019,0,.05]),b=pose('b',[0,0,.05]),geometry=await geometryFor(t,[part('a'),part('b')],[a,b]);
 const original=structuredClone([a,b]),profile=geometry.referenceProfile(a,b);assert.ok(profile.maximum_depth_m>.0009&&profile.maximum_depth_m<.0011);assert.equal(geometry.overlap(a,b),null);assert.ok(geometry.overlap(a,b,{respectReference:false}));assert.equal(geometry.sweep(a,b,[.03,0,0]).blocked,false);assert.equal(geometry.sweep(a,b,[-.012,0,0]).blocked,true);assert.deepEqual([a,b],original);
});

test('a nearby clear exit stops before the opposite limb rather than sweeping through it',()=>{
 const moving=box([-.005,-.005,0],[.005,.005,.02]),host=box([-.01,-.01,0],[.01,.01,.01]),distant=box([.05,-.01,0],[.08,.01,.02]),offset=firstClearExit(moving,[host,distant],new Vector3(1,0,0));assert.ok(offset.x>.015&&offset.x<.04);
});

test('bearing directions come only from the published bore, including arbitrary source rotation',()=>{
 const p=pose('bearing',[0,0,.1]);p.quaternion=new Quaternion().setFromAxisAngle(new Vector3(1,2,3).normalize(),.73).toArray();const axis=[0,1,0],expected=new Vector3(...axis).applyQuaternion(new Quaternion(...p.quaternion)),directions=processDirections([p.id],{parts:new Map([['bearing',part('bearing','bearing')]]),instances:new Map([[p.id,p]]),details:new Map([['bearing',{interfaces:[{id:'bearing:ring',key:'inner_ring',members:[{id:'bearing:ring:bore',direction:axis}]}]}]]),allowDiagonal:true});
 assert.equal(directions.length,2);for(const direction of directions){assert.ok(Math.abs(direction.vector.dot(expected))>1-1e-10);assert.equal(direction.basis,'published_bearing_axis');assert.deepEqual(direction.refs,['bearing:ring','bearing:ring:bore']);}
});

test('box transport detours around an overhang and stays above the table',()=>{
 const moving=box([-.005,-.005,-.005],[.005,.005,.005]),obstacle=box([-.02,-.02,.035],[.02,.02,.06]),route=routeAroundBoxes([0,0,.02],[0,0,.1],moving,[obstacle]);assert.ok(route.length>2);
 const expanded=box([-.0265,-.0265,.0285],[.0265,.0265,.0665]);for(let n=1;n<route.length;n++){assert.equal(segmentHitsBox(new Vector3(...route[n-1]),new Vector3(...route[n]),expanded),false);assert.ok(route[n][2]+moving.min.z>=.0001);}
 assert.equal(routeAroundBoxes([0,0,.001],[0,0,.1],moving,[]),null);
});

test('authored paths keep rigid subassemblies rigid through rotation and all intermediate waypoints',()=>{
 const a=pose('a',[-.1,0,.02]),b=pose('b',[-.075,.01,.04]),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.9).toArray(),route=timedWaypoints([a,{position:[-.1,0,.2],quaternion:a.quaternion},{position:[-.1,0,.2],quaternion:q},{position:[.1,.1,.2],quaternion:q}]),matrices=new Map([[a.id,matrix(a)],[b.id,matrix(b)]]),relative=matrix(a).invert().multiply(matrix(b));
 const playback=route.map(w=>({at:w.at,pose:w}));for(let t=0;t<=1;t+=.017){const frame=waypointMotion(playback,matrices,t),actual=frame.get(a.id).clone().invert().multiply(frame.get(b.id));assert.ok(relative.elements.every((v,k)=>Math.abs(v-actual.elements[k])<1e-10));}assert.equal(route[0].at,0);assert.equal(route.at(-1).at,1);for(let n=1;n<route.length;n++)assert.ok(route[n].at>route[n-1].at);
});

test('explicit reference handoff is reported separately and never counted as a certified rigid path',async t=>{
 const parts=[part('root'),part('captured','shell')],instances=[pose('root',[0,0,.05]),pose('captured',[.019,0,.05])],geometry=await geometryFor(t,parts,instances),from=pose('captured',[.1,0,.05]),to=instances[1],motion={instance_ids:[from.id],poses:[to],lift_m:0,presentation:'reference_handoff',waypoints:[{at:0,position:from.position,quaternion:from.quaternion},{at:1,position:[.1,0,.1],quaternion:from.quaternion}]},audit=auditSimulationProcess({scene:{parts},initial:[instances[0],from],operation:{steps:[{kind:'join',label:'装入工艺待核',motions:[motion]}]},geometry,sampleWaypoints:true});
 assert.equal(audit.reference_handoff_count,1);assert.equal(audit.continuous_rigid_path_status,'not_certified');assert.equal(audit.issues.length,0);
});

test('a retained source group remains one unit when it needs no opening',async t=>{
 const parts=[part('root'),part('a'),part('b')],instances=[pose('root',[0,0,.05]),pose('a',[.04,0,.05]),pose('b',[.065,0,.05])],geometry=await geometryFor(t,parts,instances),scene={parts,bodies:[{id:'body:root',name:'root',partIds:parts.map(p=>p.id)}]},result=planAssemblyProcess({scene,instances,geometry,details:new Map(),initialUnits:[[instances[0].id],[instances[1].id,instances[2].id]],rootId:instances[0].id});assert.deepEqual(result.tree.removals[0].ids,[instances[1].id,instances[2].id]);assert.deepEqual(result.opened_instance_ids,[]);assert.equal(result.tree.removals[0].path_status,undefined);
});
