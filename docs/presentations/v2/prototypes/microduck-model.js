/* Official walk-model-reference STL assembly, qpos0. Alpha software identity remains separate. */
(() => {
  const T=window.THREE,source=window.psopMicroduckSource,geometries=new Map();
  const sourceMin=source.meta.sourceBounds[0],sourceMax=source.meta.sourceBounds[1];
  const centerX=(sourceMin[0]+sourceMax[0])/2;
  // Source +Z up, +X forward -> display +Y up, +Z forward. Millimetres for framing only.
  const conversion=new T.Matrix4().set(0,1000,0,0,0,0,1000,-sourceMin[2]*1000,1000,0,0,-centerX*1000,0,0,0,1);
  const ready=Promise.all(Object.entries(source.meshes).map(async([name,data])=>{
    const packed=Uint8Array.from(atob(data.data),c=>c.charCodeAt(0));
    const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bytes=await new Response(stream).arrayBuffer(),n=data.vertexCount;
    const q=new Uint16Array(bytes,0,n*3),normal=new Int16Array(bytes,n*6,n*3);
    const position=new Float32Array(n*3),normals=new Float32Array(n*3);
    for(let i=0;i<n*3;i++){position[i]=data.min[i%3]+q[i]*data.step[i%3];normals[i]=normal[i]/32767;}
    const index=data.indexBytes===2?new Uint16Array(bytes,n*12):new Uint32Array(bytes,n*12);
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(position,3));
    geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setIndex(new T.BufferAttribute(index,1));
    geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.sourceMesh=name;geometry.userData.shared=true;
    geometries.set(name,geometry);
  }));
  function feature(item){
    if(item.body_path==='trunk_base/yaw2roll')return 'J01';
    if(item.body_path.startsWith('trunk_base/neck'))return 'HEAD-01';
    if(item.body_path==='trunk_base')return 'MD-01';
    return 'JOINTS-01';
  }
  function explodeOffset(item,exploded){
    if(!exploded)return [0,0,0];
    if(item.body_path.includes('/jaw_soft'))return [0,58,14];
    if(item.body_path.startsWith('trunk_base/neck'))return [0,23,0];
    if(item.body_path.startsWith('trunk_base/yaw2roll'))return [35,-4,0];
    if(item.body_path.startsWith('trunk_base/bearing_roll'))return [-35,-4,0];
    if(item.mesh_name==='left_shell')return [28,0,0];
    if(item.mesh_name==='right_shell')return [-28,0,0];
    return [0,0,0];
  }
  function installationMatrix(stage,branch){
    const pivot=new T.Vector3(17.5,89,-14),delta=new T.Matrix4();
    if(stage===1){
      delta.makeTranslation(118,-77,35).multiply(new T.Matrix4().makeTranslation(...pivot.toArray()))
        .multiply(new T.Matrix4().makeRotationZ(Math.PI/2)).multiply(new T.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z));
    }else if(stage===2)delta.makeTranslation(125,28,10);
    else if(stage===3)delta.makeTranslation(61,11,0);
    if(branch==='alignment_retry'&&(stage===2||stage===3)){
      delta.premultiply(new T.Matrix4().makeTranslation(14,13,25));
    }
    return delta;
  }
  function createModel(options={}){
    if(geometries.size!==38)throw new Error('Official Microduck geometry is not ready');
    const group=new T.Group(),selectable=[],regions={},sourceRegions={};
    const installStage=Number(options.installationStage||0),delta=installationMatrix(installStage,options.branch);
    for(const item of source.items){
      if(options.component && item.mesh_name!==options.component)continue;
      const id=feature(item),rgba=item.rgba;
      const material=new T.MeshStandardMaterial({color:new T.Color(rgba[0],rgba[1],rgba[2]),
        metalness:item.mesh_name.startsWith('seeed_bearing')?.42:.06,roughness:.46,
        transparent:rgba[3]<1,opacity:rgba[3],side:T.DoubleSide});
      material.color.convertSRGBToLinear();
      // Keep original source colours; selection adds only a restrained local glow.
      if(options.highlight && id==='J01'){material.emissive.set('#775112');material.emissiveIntensity=.32;}
      const mesh=new T.Mesh(geometries.get(item.mesh_name),material);
      mesh.userData={id,sourceInstance:item.instance_id,sourceMesh:item.mesh_name,sourceBody:item.body_path,sourceId:item.source_id,
        sourceDigest:item.source_digest,referenceConfiguration:'walk-model-reference',alphaIdentityVerified:false,
        sourceAssembledTransform:item.assembled_transform.slice(),installationGroup:item.body_path.startsWith('trunk_base/yaw2roll')};
      const transform=conversion.clone().multiply(new T.Matrix4().set(...item.assembled_transform));
      mesh.userData.sourceDisplayMatrix=transform.elements.slice();
      const baseBounds=geometries.get(item.mesh_name).boundingBox.clone().applyMatrix4(transform);
      (sourceRegions[id]||(sourceRegions[id]=new T.Box3())).union(baseBounds);
      const displayTransform=installStage && mesh.userData.installationGroup?delta.clone().multiply(transform):transform;
      mesh.applyMatrix4(displayTransform);const offset=explodeOffset(item,!!options.exploded);mesh.position.add(new T.Vector3(...offset));
      mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);selectable.push(mesh);
      mesh.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(mesh);
      (regions[id]||(regions[id]=new T.Box3())).union(bounds);
      if(options.component)break;
    }
    const anchors={};for(const[id,bounds]of Object.entries(regions))anchors[id]=bounds.getCenter(new T.Vector3()).toArray();
    if(options.branch==='recheck_candidate' && regions.J01){
      const outline=new T.Box3Helper(regions.J01,'#65cbb4');outline.userData.id='RECHECK-CANDIDATE';group.add(outline);
    }
    if(options.highlight && regions.J01){const outline=new T.Box3Helper(regions.J01,'#f0c66d');outline.userData.id='J01-REGION';group.add(outline);}
    if(installStage>0 && installStage<4 && options.installationGuides!==false){
      for(const item of source.items.filter(i=>i.body_path==='trunk_base/yaw2roll')){
        const ghost=new T.Mesh(geometries.get(item.mesh_name),new T.MeshBasicMaterial({color:'#62c6d8',transparent:true,opacity:.08,wireframe:true,depthWrite:false}));
        ghost.applyMatrix4(conversion.clone().multiply(new T.Matrix4().set(...item.assembled_transform)));
        ghost.userData={id:'INSTALL-TARGET',guide:true};group.add(ghost);
      }
      const socket=new T.Box3Helper(sourceRegions.J01,'#62c6d8');socket.userData.id='INSTALL-SOCKET';group.add(socket);
    }
    if(installStage===4 && options.installationGuides!==false){
      const fixing=new T.Box3Helper(regions.J01,'#f0c66d');fixing.userData.id='FIXING-OPERATION';group.add(fixing);
    }
    group.userData.source=source.meta;
    const targetAnchor=sourceRegions.J01?sourceRegions.J01.getCenter(new T.Vector3()).toArray():null;
    return{group,selectable,anchors,regions,sourceRegions,targetAnchor,installationStage:installStage};
  }
  window.psopMicroduckModel={ready,createModel,source:source.meta,feature,conversion,installationMatrix};
})();
