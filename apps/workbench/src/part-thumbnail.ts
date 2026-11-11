import * as THREE from 'three';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {prepareSourceDisplayNormals} from './source-display-normals';
import type {Part} from './types';

const SIZE=192;

/** Static previews share the scene's WebGL context, source vertices and lighting environment. */
export function createPartThumbnails(renderer:THREE.WebGLRenderer,environment:THREE.Texture|null){
 const cache=new Map<string,string>();
 const linear=new THREE.WebGLRenderTarget(SIZE,SIZE,{type:THREE.HalfFloatType,samples:4});
 const output=new THREE.WebGLRenderTarget(SIZE,SIZE,{depthBuffer:false});
 const outputPass=new OutputPass();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
 const context=canvas.getContext('2d');
 return{
  render(part:Part,source:THREE.BufferGeometry,color:THREE.Color):string|null{
   if(!context||renderer.getContext().isContextLost())return null;
   // Placement and explosion offsets never enter the preview or its cache key.
   const key=JSON.stringify([part.geometryUrl,part.quaternion,part.scale,part.kind,color.getHex()]);
   const cached=cache.get(key);if(cached)return cached;
   prepareSourceDisplayNormals(source);
   const luminance=.2126*color.r+.7152*color.g+.0722*color.b;
   const scene=new THREE.Scene();scene.background=new THREE.Color(luminance>.35?'#42566a':'#dce7eb');scene.environment=environment;
   const material=new THREE.MeshStandardMaterial({color,roughness:part.kind==='bearing'?.3:.55,metalness:part.kind==='bearing'?.6:part.kind==='actuator'?.23:.06,envMapIntensity:.32,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(source,material);
   mesh.quaternion.fromArray(part.quaternion).normalize();mesh.scale.fromArray(part.scale);mesh.updateMatrixWorld(true);
   if(!source.boundingBox)source.computeBoundingBox();
   const box=source.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),size=box.getSize(new THREE.Vector3()).length();
   if(box.isEmpty()||!Number.isFinite(size)||size<=0){material.dispose();return null;}
   mesh.position.copy(box.getCenter(new THREE.Vector3())).negate();mesh.updateMatrixWorld(true);scene.add(mesh);
   scene.add(new THREE.HemisphereLight('#f6faff','#a3b6b4',.85));
   const keyLight=new THREE.DirectionalLight('#fffaf3',2.6);keyLight.position.set(1,-2,3);scene.add(keyLight);
   const fill=new THREE.DirectionalLight('#cfdfec',.35);fill.position.set(-2,1,1);scene.add(fill);
   const rim=new THREE.DirectionalLight('#ffffff',.8);rim.position.set(0,2,2);scene.add(rim);
   const camera=new THREE.OrthographicCamera(-size,size,size,-size,size*.01,size*10);
   camera.up.set(0,0,1);camera.position.copy(new THREE.Vector3(1.15,-1.7,.95).normalize().multiplyScalar(size*3));camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
   // Fit the projected source silhouette, including thin, rotated and mirrored parts.
   const toView=new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);
   const projected=new THREE.Box3(),point=new THREE.Vector3(),positions=source.getAttribute('position');
   for(let i=0;i<positions.count;i++)projected.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(toView));
   const center=projected.getCenter(new THREE.Vector3()),extent=projected.getSize(new THREE.Vector3());
   const half=Math.max(extent.x,extent.y)*.58;
   camera.left=center.x-half;camera.right=center.x+half;camera.top=center.y+half;camera.bottom=center.y-half;camera.updateProjectionMatrix();
   const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,shadows:renderer.shadowMap.enabled,clipping:renderer.localClippingEnabled};
   try{
    renderer.autoClear=true;renderer.shadowMap.enabled=false;renderer.localClippingEnabled=false;
    renderer.setRenderTarget(linear);renderer.setScissorTest(false);renderer.render(scene,camera);
    // The output pass applies the same tone mapping and sRGB conversion as the main view.
    outputPass.render(renderer,output,linear,0,false);
    const pixels=new Uint8Array(SIZE*SIZE*4);renderer.readRenderTargetPixels(output,0,0,SIZE,SIZE,pixels);
    const image=context.createImageData(SIZE,SIZE),stride=SIZE*4;
    for(let row=0;row<SIZE;row++)image.data.set(pixels.subarray((SIZE-row-1)*stride,(SIZE-row)*stride),row*stride);
    context.putImageData(image,0,0);const url=canvas.toDataURL('image/png');cache.set(key,url);return url;
   }finally{
    renderer.setRenderTarget(previous.target,previous.face,previous.level);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);
    renderer.autoClear=previous.autoClear;renderer.shadowMap.enabled=previous.shadows;renderer.localClippingEnabled=previous.clipping;
    material.dispose();
   }
  },
  dispose(){cache.clear();linear.dispose();output.dispose();outputPass.dispose();canvas.width=canvas.height=0;},
 };
}
