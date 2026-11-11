import * as THREE from 'three';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import type {Part} from './types';
import type {ConnectionCandidate} from './simulate-types';

type Source={part:Part;mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>};
const WIDTH=384,HEIGHT=256;

/** Candidate diagrams reuse loaded source meshes and the workbench's WebGL context. */
export function createConnectionThumbnails(renderer:THREE.WebGLRenderer,environment:()=>THREE.Texture|null){
 const cache=new Map<string,string>(),linear=new THREE.WebGLRenderTarget(WIDTH,HEIGHT,{type:THREE.HalfFloatType,samples:4}),output=new THREE.WebGLRenderTarget(WIDTH,HEIGHT,{depthBuffer:false}),outputPass=new OutputPass();
 const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const context=canvas.getContext('2d');
 const dot=document.createElement('canvas');dot.width=dot.height=32;const brush=dot.getContext('2d')!;brush.fillStyle='white';brush.beginPath();brush.arc(16,16,13,0,Math.PI*2);brush.fill();const dotTexture=new THREE.CanvasTexture(dot);
 let disposed=false;
 return {
  async render(candidate:ConnectionCandidate,moving:Source,target:Source):Promise<string|null>{
   if(disposed||!context||renderer.getContext().isContextLost())return null;
   const key=JSON.stringify([candidate.id,moving.part.geometryUrl,target.part.geometryUrl,moving.part.scale,target.part.scale,target.part.quaternion]);const cached=cache.get(key);if(cached)return cached;
   const scene=new THREE.Scene();scene.background=new THREE.Color('#19343e');scene.environment=environment();
   scene.add(new THREE.HemisphereLight('#f2f9ff','#617d82',1.3));const light=new THREE.DirectionalLight('#fff8e6',3);light.position.set(1,-2,3);scene.add(light);const fill=new THREE.DirectionalLight('#d6f4ff',1.5);fill.position.set(-2,1,1);scene.add(fill);
   const base=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(target.part.quaternion).normalize()),movingPose=base.clone().multiply(new THREE.Matrix4().fromArray(candidate.relative_transform)),poses=[movingPose,base],sources=[moving,target],colors=['#8ce0c8','#dbbd83'],ownedGeometries:THREE.BufferGeometry[]=[],materials:(THREE.Material)[]=[],box=new THREE.Box3();
   for(let side=0;side<2;side++){
    const source=sources[side],material=new THREE.MeshStandardMaterial({color:colors[side],roughness:.48,metalness:.15,transparent:true,opacity:side===0?.86:.6,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:.3});materials.push(material);
    const mesh=new THREE.Mesh(source.mesh.geometry,material);mesh.matrixAutoUpdate=false;mesh.matrix.copy(poses[side]).scale(new THREE.Vector3().fromArray(source.part.scale));mesh.updateMatrixWorld(true);scene.add(mesh);
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    const points=candidate.marker_points[side].map(p=>new THREE.Vector3().fromArray(p).applyMatrix4(mesh.matrixWorld)),geometry=new THREE.BufferGeometry().setFromPoints(points),markerMaterial=new THREE.PointsMaterial({color:colors[side],map:dotTexture,size:side===0?7:13,sizeAttenuation:false,transparent:true,depthTest:false,depthWrite:false});ownedGeometries.push(geometry);materials.push(markerMaterial);
    const markers=new THREE.Points(geometry,markerMaterial);markers.renderOrder=side===0?11:10;scene.add(markers);
   }
   const extent=box.getSize(new THREE.Vector3()).length();if(box.isEmpty()||!Number.isFinite(extent)||extent<=0){for(const m of materials)m.dispose();for(const g of ownedGeometries)g.dispose();return null;}
   const center=box.getCenter(new THREE.Vector3()),camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,extent*.01,extent*10);camera.up.set(0,0,1);camera.position.copy(center).addScaledVector(new THREE.Vector3(1.15,-1.7,.95).normalize(),extent*3);camera.lookAt(center);camera.updateMatrixWorld(true);
   const projected=box.clone().applyMatrix4(camera.matrixWorldInverse),size=projected.getSize(new THREE.Vector3()),middle=projected.getCenter(new THREE.Vector3()),half=Math.max(size.y,size.x*HEIGHT/WIDTH)*.58;
   camera.left=middle.x-half*WIDTH/HEIGHT;camera.right=middle.x+half*WIDTH/HEIGHT;camera.top=middle.y+half;camera.bottom=middle.y-half;camera.updateProjectionMatrix();
   const previous={target:renderer.getRenderTarget(),face:renderer.getActiveCubeFace(),level:renderer.getActiveMipmapLevel(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),autoClear:renderer.autoClear,shadows:renderer.shadowMap.enabled,clipping:renderer.localClippingEnabled};
   const pixels=new Uint8Array(WIDTH*HEIGHT*4);let readPixels:ReturnType<THREE.WebGLRenderer['readRenderTargetPixelsAsync']>;
   try{
    renderer.autoClear=true;renderer.shadowMap.enabled=false;renderer.localClippingEnabled=false;renderer.setRenderTarget(linear);renderer.setScissorTest(false);renderer.render(scene,camera);outputPass.render(renderer,output,linear,0,false);
    readPixels=renderer.readRenderTargetPixelsAsync(output,0,0,WIDTH,HEIGHT,pixels);
   }finally{
    renderer.setRenderTarget(previous.target,previous.face,previous.level);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.autoClear=previous.autoClear;renderer.shadowMap.enabled=previous.shadows;renderer.localClippingEnabled=previous.clipping;
    for(const m of materials)m.dispose();for(const g of ownedGeometries)g.dispose();
   }
   // Restore the shared renderer before yielding; GPU completion must not block a selection event.
   await readPixels;if(disposed||renderer.getContext().isContextLost())return null;
   const image=context.createImageData(WIDTH,HEIGHT),stride=WIDTH*4;for(let row=0;row<HEIGHT;row++)image.data.set(pixels.subarray((HEIGHT-row-1)*stride,(HEIGHT-row)*stride),row*stride);
   context.putImageData(image,0,0);const url=canvas.toDataURL('image/png');cache.set(key,url);if(cache.size>128)cache.delete(cache.keys().next().value!);return url;
  },
  dispose(){disposed=true;cache.clear();linear.dispose();output.dispose();outputPass.dispose();dotTexture.dispose();canvas.width=canvas.height=dot.width=dot.height=0;},
 };
}
