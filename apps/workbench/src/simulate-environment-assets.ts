import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {prepareWorkshopRobotSurface} from './simulate-robot-surface';

/** Local assets only. A mounted scene owns textures, model geometry and decoded bitmaps. */
export async function loadWorkshopAssets(signal:AbortSignal){
  const textures=new Set<THREE.Texture>(),bitmaps=new Set<ImageBitmap>(),geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  const dispose=()=>{for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const b of bitmaps)b.close();geometries.clear();materials.clear();textures.clear();bitmaps.clear();};
  async function bytes(url:URL){const response=await fetch(url,{signal});if(!response.ok)throw Error('工作台环境资源读取失败。');return response;}
  async function image(url:URL,color=false){
    const blob=await(await bytes(url)).blob(),bitmap=await createImageBitmap(blob,{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
    if(signal.aborted){bitmap.close();signal.throwIfAborted();}
    bitmaps.add(bitmap);const t=new THREE.Texture(bitmap);t.flipY=false;t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;textures.add(t);return t;
  }
  async function model(url:URL,smooth=false){
    const data=await(await bytes(url)).arrayBuffer(),gltf=await new GLTFLoader().parseAsync(data,'');
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){
      geometries.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture){textures.add(value);value.anisotropy=12;if(value.image instanceof ImageBitmap)bitmaps.add(value.image);}
      }
      if(smooth)materials.add(prepareWorkshopRobotSurface(o));
    }});
    signal.throwIfAborted();return gltf.scene;
  }
  // allSettled also collects late decoder results before disposing a failed or superseded scene.
  const result=await Promise.allSettled([
    image(new URL('./assets/workshop/smooth-floor-color-4k.jpg',import.meta.url),true),
    image(new URL('./assets/workshop/smooth-floor-normal-2k.jpg',import.meta.url)),
    image(new URL('./assets/workshop/smooth-floor-arm-2k.jpg',import.meta.url)),
    image(new URL('./assets/workshop/concrete-color-4k.jpg',import.meta.url),true),
    image(new URL('./assets/workshop/concrete-normal-2k.jpg',import.meta.url)),
    image(new URL('./assets/workshop/concrete-arm-2k.jpg',import.meta.url)),
    model(new URL('./assets/workshop/models/desk_lamp_arm_01.glb',import.meta.url)),
    model(new URL('./assets/workshop/models/precision-assistant.glb',import.meta.url),true),
    image(new URL('./assets/private-workshop-campus-window.png',import.meta.url),true),
    image(new URL('./assets/private-workshop-bay-window.png',import.meta.url),true)
  ]);
  const failed=result.find(r=>r.status==='rejected');if(failed?.status==='rejected'||signal.aborted){dispose();if(failed?.status==='rejected')throw failed.reason;signal.throwIfAborted();}
  const [floorColor,floorNormal,floorArm,wallColor,wallNormal,wallArm]=result.slice(0,6).map(r=>(r as PromiseFulfilledResult<THREE.Texture>).value);
  const [deskLamp,robot]=result.slice(6,8).map(r=>(r as PromiseFulfilledResult<THREE.Group>).value);
  const [campusWindow,bayWindow]=result.slice(8,10).map(r=>(r as PromiseFulfilledResult<THREE.Texture>).value);
  return {floorColor,floorNormal,floorArm,wallColor,wallNormal,wallArm,deskLamp,robot,campusWindow,bayWindow,dispose};
}
export type WorkshopAssets=Awaited<ReturnType<typeof loadWorkshopAssets>>;
