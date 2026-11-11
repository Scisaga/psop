import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,BoxGeometry,Matrix4,Mesh,MeshStandardMaterial,PerspectiveCamera,Quaternion,Scene,Texture,Vector3} from 'three';
import {placePopover} from '../src/simulate-popover.ts';
import {placeConnectionAnnotations} from '../src/simulate-annotations.ts';
import {axialRoute,waypointMotion,rigidMotion,connectionProgress,CONNECTION_DURATION} from '../src/simulate-motion.ts';
import {SimulationPresentation} from '../src/SimulationPresentation.ts';
import {SimulationCinematic} from '../src/SimulationCinematic.ts';
import {blendAssemblyView,chooseAssemblyShot,frameAssemblyShot} from '../src/simulate-cinematic-camera.ts';

test('connection cards keep a fixed bottom edge and reserve only the actually visible height',()=>{
 const view={width:690,height:640},p=placePopover(view,{width:360});assert.ok(p.left>=16&&p.left+p.width<=view.width-16);assert.equal(p.bottom,20);assert.equal(p.maxHeight,350);
 assert.deepEqual(placePopover(view,{width:360}),p,'content updates do not participate in placement');
 const small=placePopover({width:360,height:300},{width:360});assert.equal(small.bottom,20);assert.equal(small.maxHeight,208);assert.equal(small.left+small.width,344);
 const obscured=placePopover({width:690,height:640,bottomInset:160,topInset:70},{width:360});assert.equal(obscured.bottom,180);assert.ok(obscured.maxHeight+obscured.bottom+72+70<=640);
 const short=placePopover({width:640,height:190},{width:360});assert.equal(short.maxHeight,98);assert.ok(short.maxHeight+short.bottom<=190);
});

test('nearby model connection labels avoid each other, viewport edges and the tool rail',()=>{
 const anchors=Array.from({length:4},(_,i)=>({id:String(i),x:350,y:300,width:75,height:26})),view={width:700,height:600},placed=placeConnectionAnnotations(anchors,view);
 for(let i=0;i<placed.length;i++){const a=placed[i];assert.ok(a.left>=68&&a.left+75<=688&&a.top>=52&&a.top+26<=560);for(const b of placed.slice(0,i))assert.ok(a.left+75+6<=b.left||a.left>=b.left+75+6||a.top+26+6<=b.top||a.top>=b.top+26+6);}
 const again=placeConnectionAnnotations(anchors,view,new Map(placed.map(p=>[p.id,p.side])));assert.deepEqual(again,placed);
});

test('animated assemblies retain every relative transform through rotations and lift',()=>{
 const from={position:[.1,.1,.1],quaternion:[0,0,0,1]},to={position:[-.1,.2,.04],quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,0,1),2).toArray()},a=new Matrix4().setPosition(...from.position),b=new Matrix4().makeRotationX(.8).setPosition(.15,.13,.12),relative=a.clone().invert().multiply(b),initial=new Map([['a',a],['b',b]]);
 for(const t of [0,.1,.3,.5,.7,.9,1]){const m=rigidMotion(from,to,initial,t,new Vector3(),.06),current=m.get('a').clone().invert().multiply(m.get('b'));assert.ok(relative.elements.every((n,i)=>Math.abs(n-current.elements[i])<1e-12));}
 assert.equal(connectionProgress(200).phase,'approach');assert.equal(connectionProgress(500).phase,'join');assert.equal(connectionProgress(1200).phase,'hold');assert.equal(connectionProgress(1400).phase,'return');assert.equal(connectionProgress(CONNECTION_DURATION).done,true);
});

test('committed connection uses an interface closeup and restores the exact bookmarked camera, including skip',()=>{
 globalThis.matchMedia=()=>({matches:false});const geometry=new BoxGeometry(.02,.02,.02);geometry.computeBoundingBox();const material=new MeshStandardMaterial(),scene=new Scene(),camera=new PerspectiveCamera(34,1.3,.001,10);camera.up.set(0,0,1);camera.position.set(.7,-.8,.8);const orbit={target:new Vector3(0,0,.02),enabled:true,enableDamping:true,update(){camera.lookAt(this.target);}},records=new Map(['a','b'].map((id,n)=>{const mesh=new Mesh(geometry,material);mesh.position.set(n*.1,0,.01);scene.add(mesh);return [id,{mesh}];})),dotTexture=new Texture(),events=[];let session={instances:[{id:'a',position:[0,0,.01],quaternion:[0,0,0,1]},{id:'b',position:[.1,0,.01],quaternion:[0,0,0,1]}],connections:[]};
 const controller=new SimulationPresentation({scene,camera,orbit,records,dotTexture,source:()=>({session,interfaces:[]}),invalidate(){},onChange:mode=>events.push(mode)});controller.accept(session,'',false);const bookmark={position:camera.position.clone(),target:orbit.target.clone()};controller.prepare();
 session={instances:[{...session.instances[0],position:[.08,0,.01]},session.instances[1]],connections:[{id:'ab',anchors:[[.01,0,0],[-.01,0,0]],endpoints:[{instance_id:'a'},{instance_id:'b'}]}]};const start=performance.now();controller.accept(session,'connect',true);assert.equal(controller.mode,'connect');assert.equal(orbit.enabled,false);controller.tick(start+700);assert.ok(camera.position.distanceTo(bookmark.position)>.2);controller.tick(start+2100);assert.equal(controller.active,false);assert.deepEqual(camera.position,bookmark.position);assert.deepEqual(orbit.target,bookmark.target);assert.equal(records.get('a').mesh.position.x,.08);assert.deepEqual(events,['connect',null]);
 controller.prepare();session={...session,connections:[...session.connections,{...session.connections[0],id:'loop'}]};controller.accept(session,'connect',true);controller.tick(performance.now()+500);controller.finish();assert.deepEqual(camera.position,bookmark.position);assert.equal(controller.active,false);assert.equal(session.connections.length,2);
 controller.dispose();dotTexture.dispose();geometry.dispose();material.dispose();
});

test('cinematic shots fit tall products on narrow screens and choose a view around occluding parts',()=>{
 const box=new Box3(new Vector3(-.06,-.045,.0002),new Vector3(.06,.045,.3)),camera=new PerspectiveCamera(36,1,.0003,10);camera.up.set(0,0,1);
 for(const aspect of [.65,1,1.6,2.4]){camera.aspect=aspect;camera.updateProjectionMatrix();const view=frameAssemblyShot(box,camera,new Vector3(.9,-1.4,.65));camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld();for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.8);}}
 const small=new Box3(new Vector3(-.02,-.02,0),new Vector3(.02,.02,.04)),blocked=new Box3(new Vector3(-.2,-.16,0),new Vector3(.2,-.04,.3)),current={position:new Vector3(0,-.3,.2),target:new Vector3(0,0,.02)},view=chooseAssemblyShot(small,[blocked],camera,current);
 assert.ok(view.position.y>-.04||Math.abs(view.position.x)>.2,'camera must move around the foreground obstruction');
 const a={position:new Vector3(.2,0,.1),target:new Vector3()},b={position:new Vector3(-.2,0,.1),target:new Vector3()};
 for(const t of [0,.25,.5,.75,1]){const view=blendAssemblyView(a,b,t);assert.ok(view.position.distanceTo(view.target)>.2,'camera cannot pass through the subject between opposite shots');assert.ok(view.position.z>0);}
});

function movieFixture(reduce=false){
 globalThis.matchMedia=()=>({matches:reduce});const geometry=new BoxGeometry(.02,.02,.02);geometry.computeBoundingBox();const scene=new Scene(),camera=new PerspectiveCamera(34,1.6,.001,10);camera.up.set(0,0,1);camera.position.set(.7,-.8,.8);
 const orbit={target:new Vector3(0,0,.02),enabled:true,enableDamping:true,update(){camera.lookAt(this.target);}},materials=[],records=new Map(['a','b'].map((id,n)=>{const material=new MeshStandardMaterial();materials.push(material);const mesh=new Mesh(geometry,material);mesh.position.set(n*.2-.1,0,.01);scene.add(mesh);return [id,{mesh}];}));
 const instances=['a','b'].map((id,n)=>({id,part_ref:id,position:[n*.02-.01,0,.01],quaternion:[0,0,0,1]})),session={instances,connections:[]},steps=[{kind:'join',chapter:'测试装配',label:'测试移动',duration_ms:2000,focus_ids:['a','b'],motions:instances.map(p=>({instance_ids:[p.id],poses:[p],lift_m:.04}))},{kind:'reveal',chapter:'成品',label:'成品',duration_ms:2000,focus_ids:['a','b'],motions:[]}],operation={type:'auto_assemble',mode:'reference',steps,total_duration_ms:4000,report:{reference_connection_count:1}},events=[],progress=[];
 const controller=new SimulationCinematic({scene,camera,orbit,records,invalidate(){},onChange:value=>events.push(value),onProgress:p=>progress.push(p)});
 return {controller,session,operation,records,camera,orbit,events,progress,dispose(){controller.dispose();geometry.dispose();for(const m of materials)m.dispose();}};
}

test('inline automatic assembly leaves camera controls active, pauses, changes speed and keeps the user view on skip',()=>{
 const f=movieFixture();try{const initialCamera=f.camera.position.clone();f.controller.start(f.session,f.operation);assert.equal(f.controller.active,true);assert.equal(f.orbit.enabled,true);let now=performance.now();for(let n=0;n<5;n++)f.controller.tick(now+=80);assert.deepEqual(f.camera.position,initialCamera);assert.equal(f.progress.at(-1).camera_follow,false);
 f.controller.togglePause();const at=f.records.get('a').mesh.position.clone(),camera=f.camera.position.clone();f.controller.tick(now+=400);assert.deepEqual(f.records.get('a').mesh.position,at);assert.deepEqual(f.camera.position,camera);assert.equal(f.progress.at(-1).paused,true);
 f.controller.setSpeed(4);assert.equal(f.progress.at(-1).speed,4);f.controller.togglePause();f.controller.tick(now+=100);assert.notDeepEqual(f.records.get('a').mesh.position,at);f.controller.finish();
 assert.equal(f.controller.active,false);assert.equal(f.orbit.enabled,true);for(const p of f.session.instances)assert.deepEqual(f.records.get(p.id).mesh.position.toArray(),p.position);assert.deepEqual(f.events,[true,false]);assert.equal(f.progress.at(-1),null);assert.deepEqual(f.camera.position,initialCamera);
 }finally{f.dispose();}
});

test('optional camera following can yield to manual observation without stopping assembly',()=>{
 const f=movieFixture();try{f.controller.start(f.session,f.operation);const initial=f.camera.position.clone();f.controller.setCameraFollow(true);let now=performance.now();for(let n=0;n<6;n++)f.controller.tick(now+=80);assert.ok(f.camera.position.distanceTo(initial)>.01);assert.equal(f.progress.at(-1).camera_follow,true);f.controller.setCameraFollow(false);f.camera.position.set(.8,-1.1,.65);f.orbit.target.set(.1,.1,.05);const position=f.camera.position.clone(),target=f.orbit.target.clone(),before=f.records.get('a').mesh.position.clone();for(let n=0;n<4;n++)f.controller.tick(now+=80);assert.equal(f.controller.active,true);assert.equal(f.orbit.enabled,true);assert.deepEqual(f.camera.position,position);assert.deepEqual(f.orbit.target,target);assert.notDeepEqual(f.records.get('a').mesh.position,before);f.controller.finish();assert.deepEqual(f.camera.position,position);assert.deepEqual(f.orbit.target,target);}finally{f.dispose();}
});

test('reference-only handoff never shows an opaque mesh crossing its unsupported insertion and restores materials',()=>{
 const f=movieFixture();try{const target=f.session.instances[0],mesh=f.records.get('a').mesh,from=mesh.position.toArray();f.operation.steps[0].motions=[{instance_ids:['a'],poses:[target],lift_m:0,presentation:'reference_handoff',waypoints:[{at:0,position:from,quaternion:[0,0,0,1]},{at:1,position:[.15,0,.12],quaternion:[0,0,0,1]}]}];f.controller.start(f.session,f.operation);let now=performance.now();for(let n=0;n<18;n++)f.controller.tick(now+=80);assert.equal(mesh.material.opacity,0);assert.ok(Math.abs(mesh.position.x-.15)<1e-8);f.controller.tick(now+=80);assert.equal(mesh.material.opacity,0);assert.ok(mesh.position.distanceTo(new Vector3().fromArray(target.position))<1e-10);for(let n=0;n<3;n++)f.controller.tick(now+=80);assert.ok(mesh.material.opacity>0);f.controller.finish();assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.depthWrite,true);}finally{f.dispose();}
});

test('reduced-motion presentation immediately reaches the persisted result and releases controls',()=>{
 const f=movieFixture(true);try{f.controller.start(f.session,f.operation);assert.equal(f.controller.active,false);assert.equal(f.orbit.enabled,true);for(const p of f.session.instances)assert.deepEqual(f.records.get(p.id).mesh.position.toArray(),p.position);}finally{f.dispose();globalThis.matchMedia=()=>({matches:false});}
});

test('bearing route aligns before entry and its final travel remains coaxial without rotation or a curved shortcut',()=>{
 const axis=new Vector3(1,2,3).normalize(),from={position:[-.1,.12,.03],quaternion:new Quaternion().setFromAxisAngle(new Vector3(0,1,0),1.2).toArray()},to={position:[.04,.02,.06],quaternion:new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.7).toArray()},offset=axis.clone().multiplyScalar(.06),anchor=new Matrix4().compose(new Vector3().fromArray(from.position),new Quaternion().fromArray(from.quaternion),new Vector3(1,1,1)),neighbor=anchor.clone().multiply(new Matrix4().makeTranslation(.02,.01,.03)),initial=new Map([['bearing',anchor],['attached',neighbor]]),route=axialRoute(from,to,offset.toArray());
 assert.deepEqual(route[3].pose.quaternion,to.quaternion);assert.ok(route[1].pose.position[2]>Math.max(from.position[2],route[3].pose.position[2]));
 let previous=Infinity;
 for(const t of [.7,.75,.8,.9,.99,1]){const transforms=waypointMotion(route,initial,t),p=new Vector3(),q=new Quaternion();transforms.get('bearing').decompose(p,q,new Vector3());const delta=p.sub(new Vector3().fromArray(to.position)),remaining=delta.dot(axis);assert.ok(delta.clone().cross(axis).length()<1e-12);assert.ok(remaining>=-1e-12&&remaining<=previous+1e-12);previous=remaining;assert.ok(q.angleTo(new Quaternion().fromArray(to.quaternion))<1e-7);const relative=transforms.get('bearing').clone().invert().multiply(transforms.get('attached'));assert.ok(relative.elements.every((v,i)=>Math.abs(v-anchor.clone().invert().multiply(neighbor).elements[i])<1e-12));}
 assert.ok(previous<1e-12);
});

test('cinematic bearing preassembly uses the declared axis and leaves the host stationary',()=>{
 const f=movieFixture();try{const moving=f.operation.steps[0].motions[0],host=f.session.instances[1];f.records.get(host.id).mesh.position.fromArray(host.position);f.operation.steps[0]={...f.operation.steps[0],kind:'preassemble',motions:[{...moving,approach_offset_m:[.06,0,0]}]};f.controller.start(f.session,f.operation);let now=performance.now();
 for(let n=0;n<16;n++)f.controller.tick(now+=100);assert.equal(f.progress.at(-1).phase,'preassemble');assert.ok(f.progress.at(-1).step_progress>=.7);const mesh=f.records.get('a').mesh;assert.ok(mesh.position.x>f.session.instances[0].position[0]);assert.ok(Math.abs(mesh.position.y-f.session.instances[0].position[1])<1e-12);assert.ok(Math.abs(mesh.position.z-f.session.instances[0].position[2])<1e-12);assert.deepEqual(f.records.get(host.id).mesh.position.toArray(),host.position);
 }finally{f.dispose();}
});

test('underside bearing entry goes around the raised support before translating underneath and seating upward',()=>{
 const from={position:[.12,0,.002],quaternion:[0,0,0,1]},to={position:[0,0,.03],quaternion:[0,0,0,1]},host=new Box3(new Vector3(-.04,-.04,.022),new Vector3(.04,.04,.042)),bearing=new Box3(new Vector3(-.005,-.005,-.001),new Vector3(.005,.005,.001)),route=axialRoute(from,to,[0,0,-.02],.04,host,bearing),initial=new Map([['bearing',new Matrix4().setPosition(...from.position)]]);
 assert.equal(route.length,6);assert.ok(Math.abs(route[2].pose.position[0])>.04);
 for(let n=0;n<=70;n++){const transforms=waypointMotion(route,initial,n/100),box=bearing.clone().applyMatrix4(transforms.get('bearing'));assert.ok(!box.intersectsBox(host),'pre-entry transfer must not descend through the support');assert.ok(box.min.z>=0);}
 for(const t of [.7,.8,.9,1]){const p=new Vector3().setFromMatrixPosition(waypointMotion(route,initial,t).get('bearing'));assert.ok(Math.abs(p.x)<1e-12&&Math.abs(p.y)<1e-12);assert.ok(p.z<=to.position[2]+1e-12);}
});
