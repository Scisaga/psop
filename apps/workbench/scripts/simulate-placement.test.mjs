import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Matrix4,Quaternion,Vector3} from 'three';
import {nearestTablePosition,settleDisconnected,tableFor,tableReservations} from './simulate-placement.mjs';
import {matrix,transformedBounds} from './simulate-core.mjs';

const box=(x,y,sx=.04,sy=.04,z=.01)=>new Box3(new Vector3(x-sx/2,y-sy/2,z-.01),new Vector3(x+sx/2,y+sy/2,z+.01));
const part=(id,x=0,y=0,z=.01)=>({id,part_ref:id,position:[x,y,z],quaternion:[0,0,0,1]});
const edge=(id,a,b)=>({id,endpoints:[{instance_id:a},{instance_id:b}]});
function context(instances,table={width:1,height:.65}){return {table,bounds:Object.fromEntries(instances.map(p=>[p.part_ref,[[-.02,-.02,-.01],[.02,.02,.01]]])),partMap:new Map(instances.map(p=>[p.part_ref,{scale:[1,1,1]}]))};}

test('nearest desktop slot keeps clearance, stays in bounds and finds narrow free strips',()=>{
 const moving=box(0,0),obstacles=[box(0,0)],table={width:.4,height:.3},p=nearestTablePosition(moving,obstacles,table);
 assert.ok(p);assert.ok(Math.abs(Math.hypot(p.x,p.y)-.052)<1e-9);assert.equal(p.z,.0002);
 const barriers=[new Box3(new Vector3(-1,-1,-1),new Vector3(-.022,-.002,1)),new Box3(new Vector3(.022,-1,-1),new Vector3(1,1,1))];
 const narrow=nearestTablePosition(box(.1,0,.02,.02),barriers,{width:.2,height:.2},.005);assert.ok(narrow);assert.ok(Math.abs(narrow.x)<=.00700001);
 const impossible=nearestTablePosition(moving,[box(0,0,.5,.5)],table);assert.equal(impossible,null);
 assert.equal(nearestTablePosition(box(0,0,2,2),[],table),null);
});

test('detach keeps the larger group and moves the smaller rigid group to the nearest clear desktop area',()=>{
 const instances=[part('a'),part('b',.025),part('c',.05,.004,.08),part('d',.075,.004,.08),part('e',-.03)],connection=edge('bridge','c','b'),session={instances,connections:[edge('ab','a','b'),edge('ae','a','e'),edge('cd','c','d')]},ctx=context(instances);
 const before=matrix(instances[2]).invert().multiply(matrix(instances[3])),result=settleDisconnected(session,connection,ctx),after=matrix(result.instances[2]).invert().multiply(matrix(result.instances[3]));
 assert.equal(result.operation.status,'placed');assert.deepEqual(result.operation.moving_instance_ids,['c','d']);
 for(const id of ['a','b','e'])assert.deepEqual(result.instances.find(p=>p.id===id),instances.find(p=>p.id===id));
 assert.ok(before.elements.every((n,i)=>Math.abs(n-after.elements[i])<1e-12));
 const movedBox=new Box3();for(const p of result.instances.filter(p=>['c','d'].includes(p.id)))movedBox.union(transformedBounds(ctx.bounds[p.part_ref],p));
 assert.ok(Math.abs(movedBox.min.z-.0002)<1e-9);
 for(const p of result.instances.filter(p=>!['c','d'].includes(p.id))){const obstacle=transformedBounds(ctx.bounds[p.part_ref],p);assert.equal(movedBox.clone().expandByScalar(.011999).intersectsBox(obstacle),false);}
 for(const obstacle of tableReservations(ctx.table))assert.ok(movedBox.max.x+.012<=obstacle.min.x+1e-9||movedBox.min.x-.012>=obstacle.max.x-1e-9||movedBox.max.y+.012<=obstacle.min.y+1e-9||movedBox.min.y-.012>=obstacle.max.y-1e-9);
});

test('equal-sized splits keep the fixed target, while a remaining graph path never moves either endpoint',()=>{
 const instances=[part('a'),part('b',.02),part('c',.04)],connection=edge('ab','a','b'),ctx=context(instances);
 const split=settleDisconnected({instances,connections:[]},connection,ctx);assert.deepEqual(split.operation.stationary_instance_ids,['b']);assert.deepEqual(split.instances[1],instances[1]);assert.notDeepEqual(split.instances[0],instances[0]);
 const cycle=settleDisconnected({instances,connections:[edge('ac','a','c'),edge('cb','c','b')]},connection,ctx);assert.equal(cycle.operation.status,'still_connected');assert.deepEqual(cycle.instances,instances);assert.deepEqual(cycle.operation.moving_instance_ids,[]);
 const full=settleDisconnected({instances:[part('a'),part('b')],connections:[]},connection,context([part('a'),part('b')],{width:.05,height:.05}));assert.equal(full.operation.status,'no_space');assert.deepEqual(full.instances,[part('a'),part('b')]);
});

test('table dimensions depend on original inventory rather than edited positions',()=>{
 const instances=[part('a'),{...part('b'),quaternion:new Quaternion().setFromRotationMatrix(new Matrix4().makeRotationY(.7)).toArray()}],ctx=context(instances),parts=instances.map(p=>({...p,scale:[1,1,1]})),table=tableFor(parts,ctx.bounds);
 parts[0].position=[2,2,2];assert.deepEqual(tableFor(parts,ctx.bounds),table);assert.ok(table.width>=1&&table.height>=.65);
 const formerLamp=box(-table.width*.4,table.height*.42),free=nearestTablePosition(formerLamp,tableReservations(table),table);
 assert.ok(free);assert.ok(Math.abs(free.x+table.width*.4)<1e-12&&Math.abs(free.y-table.height*.42)<1e-12,'the removed task light must not reserve an invisible obstacle');
});
