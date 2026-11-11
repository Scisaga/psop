import * as THREE from 'three';
import {Reflector} from 'three/examples/jsm/objects/Reflector.js';

/** A restrained, rough reflection over the opaque PBR slab; never a transparent ground. */
export function createFloorReflection(width:number,height:number,z:number,roughness:THREE.Texture){
 const geometry=new THREE.PlaneGeometry(width,height);
 const reflector=new Reflector(geometry,{clipBias:.0001,textureWidth:1024,textureHeight:1024,multisample:0,shader:{
  name:'Workshop sealed concrete reflection',
  uniforms:{color:{value:new THREE.Color('#9ca6a8')},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},floorArm:{value:roughness},texel:{value:new THREE.Vector2(1/1024,1/1024)}},
  vertexShader:`uniform mat4 textureMatrix;varying vec4 reflectionUv;varying vec3 floorWorld;
   void main(){reflectionUv=textureMatrix*vec4(position,1.0);floorWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tDiffuse;uniform sampler2D floorArm;uniform vec2 texel;varying vec4 reflectionUv;varying vec3 floorWorld;
   void main(){
    vec2 uv=reflectionUv.xy/reflectionUv.w;float rough=texture2D(floorArm,floorWorld.xy/2.0).g;
    vec2 d=texel*(2.0+rough*8.0);vec3 reflected=texture2D(tDiffuse,uv).rgb*.2;
    reflected+=(texture2D(tDiffuse,uv+vec2(d.x,0)).rgb+texture2D(tDiffuse,uv-vec2(d.x,0)).rgb+texture2D(tDiffuse,uv+vec2(0,d.y)).rgb+texture2D(tDiffuse,uv-vec2(0,d.y)).rgb)*.1;
    reflected+=(texture2D(tDiffuse,uv+d).rgb+texture2D(tDiffuse,uv-d).rgb+texture2D(tDiffuse,uv+vec2(d.x,-d.y)).rgb+texture2D(tDiffuse,uv+vec2(-d.x,d.y)).rgb)*.1;
    float fresnel=pow(1.0-clamp(normalize(cameraPosition-floorWorld).z,0.0,1.0),5.0);
    gl_FragColor=vec4(reflected,.09+.23*fresnel);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`
 }});
 reflector.position.z=z+.00006;reflector.name='封闭地坪的低强度粗糙反射';
 const material=reflector.material as THREE.ShaderMaterial;material.transparent=true;material.depthWrite=false;material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;
 const update=reflector.onBeforeRender;
 reflector.onBeforeRender=function(renderer,scene,camera,geometry,material,group){if(!scene.overrideMaterial)update.call(this,renderer,scene,camera,geometry,material,group);};
 return {object:reflector,setQuality(quality:'high'|'balanced'|'performance'){reflector.visible=quality!=='performance';const size=quality==='high'?1024:512;const target=reflector.getRenderTarget();if(target.width!==size)target.setSize(size,size);material.uniforms.texel.value.set(1/size,1/size);},dispose(){reflector.removeFromParent();reflector.dispose();geometry.dispose();}};
}
