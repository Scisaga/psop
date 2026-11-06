/* Clean transparent renders of the locked official STL reference; no annotations or invented parts. */
(async()=>{
 await window.psopMicroduckModel.ready;
 const T=window.THREE,scene=new T.Scene();
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setClearColor(0x000000,0);renderer.setPixelRatio(devicePixelRatio);renderer.outputEncoding=T.sRGBEncoding;
 renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement);
 scene.add(new T.HemisphereLight('#ffffff','#73879a',1.55));
 const key=new T.DirectionalLight('#fff5e8',2.25);key.position.set(150,350,280);scene.add(key);
 const fill=new T.DirectionalLight('#d2eaff',.9);fill.position.set(-250,150,-100);scene.add(fill);
 const camera=new T.OrthographicCamera(-200,200,200,-200,1,2500);
 let model=null;
 function corners(box){const list=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])list.push(new T.Vector3(x,y,z));return list;}
 function imageBounds(box){const pts=corners(box).map(p=>p.project(camera)),w=innerWidth,h=innerHeight;
  return [Math.min(...pts.map(p=>(p.x*.5+.5)*w)),Math.min(...pts.map(p=>(-.5*p.y+.5)*h)),Math.max(...pts.map(p=>(p.x*.5+.5)*w)),Math.max(...pts.map(p=>(-.5*p.y+.5)*h))];}
 function imageAnchor(anchor){if(!anchor)return null;const p=new T.Vector3(...anchor).project(camera);
  return[(p.x*.5+.5)*innerWidth,(-p.y*.5+.5)*innerHeight];}
 function coverExplodeOffset(mesh){
  const body=mesh.userData.sourceBody,name=mesh.userData.sourceMesh;
  if(body.includes('/jaw_soft')){
   if(name==='top_head_shell')return[0,132,0];
   if(name==='bottom_head_shell')return[0,70,0];
   if(['lens','face_part','m12_lens_holder','noenoeil'].includes(name))return[0,94,38];
   return[0,94,0];
  }
  if(body.startsWith('trunk_base/neck'))return[0,40,0];
  if(body.startsWith('trunk_base/yaw2roll'))return[64,body.includes('/ankle_left')?-72:-20,0];
  if(body.startsWith('trunk_base/bearing_roll'))return[-64,body.includes('/ankle_right')?-72:-20,0];
  if(name==='left_shell')return[74,4,0];
  if(name==='right_shell')return[-74,4,0];
  return[0,0,0];
 }
 function render(options={}){
  if(model){scene.remove(model.group);model.group.traverse(o=>{if(o.material)o.material.dispose()});}
  model=window.psopMicroduckModel.createModel(options);
  const displayOffsets={};
  if(options.installationStage){
   model.group.traverse(object=>{
    if(object.userData.id==='INSTALL-SOCKET' && object.material){
     object.material.transparent=true;object.material.opacity=.42;object.material.depthWrite=false;
    }
   });
  }
  if(options.coverExploded){
   for(const mesh of model.selectable){const offset=coverExplodeOffset(mesh);mesh.position.add(new T.Vector3(...offset));displayOffsets[mesh.userData.sourceInstance]=offset;}
  }
  scene.add(model.group);model.group.updateMatrixWorld(true);
  const all=new T.Box3().setFromObject(model.group),focus=options.detail?model.regions.J01:all;
  const center=focus.getCenter(new T.Vector3());
  const az=options.detail?.65:(options.component?.7:.6),el=options.detail?.19:.1;
  camera.position.copy(center).add(new T.Vector3(Math.sin(az)*Math.cos(el)*1000,Math.sin(el)*1000,Math.cos(az)*Math.cos(el)*1000));
  camera.lookAt(center);camera.updateMatrixWorld(true);
  const points=corners(focus).map(p=>p.applyMatrix4(camera.matrixWorldInverse)),aspect=innerWidth/innerHeight;
  let width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  const pad=options.detail?1.7:1.12;height=Math.max(height,width/aspect)*pad;width=height*aspect;
  camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight,false);renderer.render(scene,camera);
  const metadata={source:window.psopMicroduckModel.source,imageSize:[innerWidth,innerHeight],options,
   assemblyBounds:imageBounds(all),jointRegionBounds:model.regions.J01?imageBounds(model.regions.J01):null,
   jointRegionAnchor:imageAnchor(model.anchors.J01),
   jointRegionSourceBody:'trunk_base/yaw2roll',jointRegionMeaning:'walk reference left_hip_yaw body; alpha ID 20 correspondence is not verified',
   instanceCount:model.selectable.length,displayOffsets,
   sourceMatricesPreserved:model.selectable.every(mesh=>{
    const item=window.psopMicroduckSource.items.find(item=>item.instance_id===mesh.userData.sourceInstance);
    return item.assembled_transform.every((value,index)=>value===mesh.userData.sourceAssembledTransform[index]);
   })};
  if(options.installationStage){
   const moving=model.selectable.filter(mesh=>mesh.userData.installationGroup),movingAssembly=new T.Box3();
   for(const mesh of moving)movingAssembly.union(new T.Box3().setFromObject(mesh));
   Object.assign(metadata,{
    installationStage:model.installationStage,installationMeaning:'display-only stage 2 alignment of the walk reference left hip/leg chain; no physical installation acceptance',
    sourceTargetAnchor:imageAnchor(model.targetAnchor),sourceTargetBounds:imageBounds(model.sourceRegions.J01),
    movingJointAnchor:imageAnchor(model.anchors.J01),movingJointBounds:imageBounds(model.regions.J01),
    movingAssemblyBounds:imageBounds(movingAssembly),movingInstanceCount:moving.length,
    fixedInstanceCount:model.selectable.length-moving.length,
    movingSourceBodies:[...new Set(moving.map(mesh=>mesh.userData.sourceBody))],
    projectionCoordinates:'image pixels, origin top-left, x right, y down'
   });
  }
  window.psopModelRenderMetadata=metadata;return metadata;
 }
 window.psopRenderModel=render;render();window.psopModelRenderReady=true;
})();
