import {Color,Mesh,MeshPhysicalMaterial} from 'three';
import {prepareSourceDisplayNormals} from './source-display-normals';

const colors={paint:new Color('#748187'),panel:new Color('#39484f'),steel:new Color('#b7c1c6'),socket:new Color('#172329')};
const finishFunctions=`
uniform float robotBaseLink;
uniform float robotFlange;
uniform vec3 robotPaint;
uniform vec3 robotPanel;
uniform vec3 robotSteel;
uniform vec3 robotSocket;
varying vec3 vRobotPosition;
float robotDisc(vec2 p,vec2 center,float radius){
 float d=length(p-center)-radius,aa=max(fwidth(d),0.000015);
 return 1.0-smoothstep(-aa,aa,d);
}
float robotRect(vec2 p,vec2 center,vec2 extent,float radius){
 vec2 q=abs(p-center)-extent+radius;
 float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius,aa=max(fwidth(d),0.000015);
 return 1.0-smoothstep(-aa,aa,d);
}
void robotFinish(vec3 p,out vec3 color,out float roughness,out float metalness){
 color=robotPaint;roughness=0.43;metalness=0.12;
 if(robotFlange>0.5){color=robotSteel*0.45;roughness=0.3;metalness=0.84;}
 if(robotBaseLink>0.5&&p.x< -0.17){
  float panel=robotRect(p.yz,vec2(0.0,0.07),vec2(0.062,0.065),0.008)*(1.0-smoothstep(-0.188,-0.186,p.x));
  color=mix(color,robotPanel,panel);roughness=mix(roughness,0.48,panel);
  float screws=max(max(robotDisc(p.yz,vec2(-0.028,0.112),0.007),robotDisc(p.yz,vec2(-0.0093,0.112),0.007)),max(robotDisc(p.yz,vec2(0.0093,0.112),0.007),robotDisc(p.yz,vec2(0.028,0.112),0.007)));
  float roundRims=max(robotDisc(p.yz,vec2(-0.027,0.075),0.020),robotDisc(p.yz,vec2(-0.027,0.034),0.016));
  float signalRim=robotRect(p.yz,vec2(0.025,0.0545),vec2(0.023,0.032),0.007);
  float steel=max(screws,max(roundRims,signalRim));
  color=mix(color,robotSteel,steel);roughness=mix(roughness,0.27,steel);metalness=mix(metalness,0.88,steel);
  float roundSockets=max(robotDisc(p.yz,vec2(-0.027,0.075),0.014),robotDisc(p.yz,vec2(-0.027,0.034),0.011));
  float signalSocket=robotRect(p.yz,vec2(0.025,0.0545),vec2(0.0145,0.012),0.003);
  float sockets=max(roundSockets,signalSocket);
  color=mix(color,robotSocket,sockets);roughness=mix(roughness,0.62,sockets);metalness=mix(metalness,0.02,sockets);
  float pins=signalSocket*(1.0-smoothstep(0.00015,0.00045,abs(p.x+0.1967)));
  color=mix(color,robotSteel,pins);roughness=mix(roughness,0.28,pins);metalness=mix(metalness,0.85,pins);
 }
}
`;

/** Continuous object-space PBR finishes over unchanged CAD geometry, with no UV or facet-color seams. */
export function prepareWorkshopRobotSurface(mesh:Mesh){
 const base=mesh.name.startsWith('base_link'),flange=mesh.name.startsWith('link_6'),geometry=mesh.geometry;
 prepareSourceDisplayNormals(geometry,base?25:35);
 geometry.setAttribute('robotSourcePosition',geometry.getAttribute('position').clone());
 geometry.userData.robotSurface={policy:'continuous-source-cad-finishes/2',regions:base?['paint','panel','steel','socket','pins']:[flange?'flange':'paint'],positions:'unchanged',facetOrder:'identity'};
 const material=new MeshPhysicalMaterial({color:'#ffffff',roughness:1,metalness:1,clearcoat:.2,clearcoatRoughness:.35,specularIntensity:.8});
 material.name='CAD robot · satin paint / machined rims / recessed sockets';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{robotBaseLink:{value:Number(base)},robotFlange:{value:Number(flange)},robotPaint:{value:colors.paint},robotPanel:{value:colors.panel},robotSteel:{value:colors.steel},robotSocket:{value:colors.socket}});
  shader.vertexShader='attribute vec3 robotSourcePosition;\nvarying vec3 vRobotPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vRobotPosition=robotSourcePosition;');
  shader.fragmentShader=finishFunctions+shader.fragmentShader
   .replace('#include <map_fragment>','#include <map_fragment>\n vec3 robotFinishColor;float robotFinishRoughness,robotFinishMetalness;robotFinish(vRobotPosition,robotFinishColor,robotFinishRoughness,robotFinishMetalness);diffuseColor.rgb*=robotFinishColor;')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n vec3 grainPosition=vRobotPosition*2600.0;\n float grainResolved=1.0-smoothstep(0.25,1.4,length(fwidth(grainPosition)));\n float castGrain=sin(grainPosition.x*1.71+grainPosition.z)*sin(grainPosition.y*1.37-grainPosition.z*0.93);\n roughnessFactor=clamp(robotFinishRoughness+castGrain*grainResolved*0.022*(1.0-robotFinishMetalness),0.15,0.85);')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\n metalnessFactor=robotFinishMetalness;');
 };
 material.customProgramCacheKey=()=> 'workshop-robot-continuous-finishes-v2';
 mesh.material=material;return material;
}
