import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {createFloorReflection} from './simulate-floor-reflection';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {WorkshopAssets} from './simulate-environment-assets';
import {addWorkbenchTools} from './simulate-workbench-tools';
import {addWritingDesk} from './simulate-writing-desk';

export const WORKSHOP_FLOOR_Z=-.76;

/** Display-only workshop. The assembly datum stays at the top of the mat (Z=0). */
export function createWorkshop(width:number,height:number,assets:WorkshopAssets){
  const group=new THREE.Group();group.name="Tony Stark's Workshop · 私人研发与装配工坊";
  const textures=new Set<THREE.Texture>(),materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();
  function material(p:THREE.MeshStandardMaterialParameters){const m=new THREE.MeshStandardMaterial(p);materials.add(m);return m;}
  function unlit(p:THREE.MeshBasicMaterialParameters){const m=new THREE.MeshBasicMaterial(p);materials.add(m);return m;}
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,name=''){
    geometries.add(g);const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;o.layers.enable(2);o.name=name;group.add(o);return o;
  }
  function block(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number,r=.002){return mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m,x,y,z);}
  function rod(a:THREE.Vector3,b:THREE.Vector3,r:number,m:THREE.Material){const o=mesh(new THREE.CylinderGeometry(r,r,a.distanceTo(b),12),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return o;}
  function texture(canvas:HTMLCanvasElement,color=true){const t=new THREE.CanvasTexture(canvas);if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;textures.add(t);return t;}
  const metal=material({color:'#929ca5',metalness:.82,roughness:.3}),edge=material({color:'#56616b',metalness:.7,roughness:.43}),graphite=material({color:'#202a33',metalness:.65,roughness:.4}),shelfMaterial=material({color:'#28313b',metalness:.6,roughness:.46}),rubber=material({color:'#1c292d',metalness:.02,roughness:.9}),plastic=material({color:'#3a474e',roughness:.62});
  // Opaque, world-aligned concrete floor. All surrounding architecture is native geometry.
  const bayWidth=12,bayHeight=10;
  for(const t of [assets.floorColor,assets.floorNormal,assets.floorArm]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(bayWidth/2,bayHeight/2);t.anisotropy=12;}
  const floorMaterial=new THREE.MeshPhysicalMaterial({map:assets.floorColor,normalMap:assets.floorNormal,normalScale:new THREE.Vector2(.1,.1),roughnessMap:assets.floorArm,aoMap:assets.floorArm,aoMapIntensity:.25,roughness:.53,metalness:.03,specularIntensity:.6,envMapIntensity:.75,clearcoat:.22,clearcoatRoughness:.3,color:'#939a99'});materials.add(floorMaterial);
  // Derivative-filtered material seams stay continuous at grazing angles, without coplanar overlays.
  floorMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 workshopFloorXY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n workshopFloorXY=position.xy;');
    shader.fragmentShader='varying vec2 workshopFloorXY;\n'+shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n float floorTone=dot(texture2D(map,vMapUv).rgb,vec3(0.2126,0.7152,0.0722)); diffuseColor.rgb=diffuse*mix(vec3(0.6),vec3(floorTone),0.76);\n vec2 seamAA=max(fwidth(workshopFloorXY/2.4),vec2(0.0001));\n vec2 seamDistance=abs(fract(workshopFloorXY/2.4+0.5)-0.5);\n vec2 seamLine=1.0-smoothstep(vec2(0.0005),vec2(0.0005)+seamAA,seamDistance);\n diffuseColor.rgb*=1.0-0.16*max(seamLine.x,seamLine.y);');
  };
  floorMaterial.customProgramCacheKey=()=> 'research-workshop-floor-seams-v3';
  const floor=mesh(new THREE.PlaneGeometry(bayWidth,bayHeight),floorMaterial,0,0,WORKSHOP_FLOOR_Z,'实体混凝土地面');floor.castShadow=false;
  const floorReflection=createFloorReflection(bayWidth,bayHeight,WORKSHOP_FLOOR_Z,assets.floorArm);group.add(floorReflection.object);
  const marking=material({color:'#518980',roughness:.8,metalness:0});
  for(const x of [-1,1])for(const y of [-1,1]){
    const a=mesh(new THREE.PlaneGeometry(.22,.012),marking,x*1.42,y*1.12,WORKSHOP_FLOOR_Z+.0001,'精密装配区定位标线');a.castShadow=false;
    const b=mesh(new THREE.PlaneGeometry(.012,.19),marking,x*1.53,y*1.025,WORKSHOP_FLOOR_Z+.0001);b.castShadow=false;
  }
  let seed=31;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
  // Z=0 remains the physical top of the working mat.
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1536;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#213b3e';ctx.fillRect(0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);seed=31;
  for(let i=0;i<pixels.data.length;i+=4){const n=(random()-.5)*5;pixels.data[i]+=n;pixels.data[i+1]+=n;pixels.data[i+2]+=n;}ctx.putImageData(pixels,0,0);
  const sx=canvas.width/width,sy=canvas.height/height;
  for(let mm=0;mm<=width*1000;mm+=10){const x=mm*.001*sx;ctx.strokeStyle=mm%50===0?'#496165':'#304b4e';ctx.lineWidth=mm%50===0?1:.6;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
  for(let mm=0;mm<=height*1000;mm+=10){const y=mm*.001*sy;ctx.strokeStyle=mm%50===0?'#496165':'#304b4e';ctx.lineWidth=mm%50===0?1:.6;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
  ctx.fillStyle='#8eaaac';ctx.font='16px Segoe UI';for(let mm=0;mm<=width*1000;mm+=50)ctx.fillText(String(mm),mm*.001*sx+4,canvas.height-9);for(let mm=50;mm<height*1000;mm+=50)ctx.fillText(String(mm),7,canvas.height-mm*.001*sy-4);
  const mat=material({map:texture(canvas),roughness:.95,metalness:.015});
  block(width+.12,height+.12,.028,metal,0,0,-.023,.003);mesh(new THREE.BoxGeometry(width,height,.009),mat,0,0,-.0045);
  for(const x of [-1,1])block(.014,height+.12,.028,edge,x*(width/2+.054),0,-.017,.002);
  // Welded square-tube frame. Every rail terminates at a leg face.
  const legSize=.042,legX=width/2-.027,legY=height/2-.022,legBottom=WORKSHOP_FLOOR_Z+.033,legTop=-.037;
  const railX=2*legX-legSize,railY=2*legY-legSize,upperZ=legTop-.023,lowerZ=WORKSHOP_FLOOR_Z+.175;
  const legGeometry=new RoundedBoxGeometry(legSize,legSize,legTop-legBottom,2,.002),footGeometry=new THREE.CylinderGeometry(.026,.029,.009,24),stemGeometry=new THREE.CylinderGeometry(.007,.007,.024,14);
  for(const x of [-legX,legX])for(const y of [-legY,legY]){
    mesh(legGeometry,graphite,x,y,(legTop+legBottom)/2,'连续方管桌腿');
    const foot=mesh(footGeometry,rubber,x,y,WORKSHOP_FLOOR_Z+.0045,'落地调节脚');foot.rotation.x=Math.PI/2;
    const stem=mesh(stemGeometry,edge,x,y,WORKSHOP_FLOOR_Z+.021);stem.rotation.x=Math.PI/2;
    for(const z of [upperZ,lowerZ]){const bolt=mesh(new THREE.CylinderGeometry(.0035,.0035,.002,6),metal,x,y-Math.sign(y)*(legSize/2+.0005),z);bolt.rotation.x=Math.PI/2;}
  }
  for(const y of [-legY,legY]){block(railX,legSize,.046,graphite,0,y,upperZ,.0015);block(railX,.028,.032,graphite,0,y,lowerZ,.0015);}
  for(const x of [-legX,legX]){block(legSize,railY,.046,graphite,x,0,upperZ,.0015);block(.028,railY,.032,graphite,x,0,lowerZ,.0015);}
  // The shelf sits on the lower frame, with its edge inside the legs.
  const shelfZ=lowerZ+.016+.006;
  const ix=legX-legSize/2-.001,iy=legY-legSize/2-.001,shelfShape=new THREE.Shape();
  const edgePoints=[[-ix,-legY],[ix,-legY],[ix,-iy],[legX,-iy],[legX,iy],[ix,iy],[ix,legY],[-ix,legY],[-ix,iy],[-legX,iy],[-legX,-iy],[-ix,-iy]];
  edgePoints.forEach(([x,y],i)=>i?shelfShape.lineTo(x,y):shelfShape.moveTo(x,y));shelfShape.closePath();
  mesh(new THREE.ExtrudeGeometry(shelfShape,{depth:.012,bevelEnabled:false}),shelfMaterial,0,0,shelfZ-.006,'四角避让桌腿的置物板');
  // A single understated equipment case rests on the lower shelf.
  const caseMaterial=material({color:'#40535c',metalness:.15,roughness:.72});
  block(.23,.15,.085,caseMaterial,-width*.2,height*.07,shelfZ+.006+.0425,.008);block(.236,.156,.014,graphite,-width*.2,height*.07,shelfZ+.006+.085+.007,.004);
  for(const x of [-.27,-.13].map(x=>x*width))block(.014,.007,.018,edge,x,height*.07-.077,shelfZ+.006+.075,.002);
  addWorkbenchTools(width,height,{mesh,material,texture});


  // A rectangular room and a small set of carefully finished working objects.
  const titanium=material({color:'#717c80',metalness:.8,roughness:.31}),cabinet=material({color:'#263039',metalness:.35,roughness:.42}),joint=material({color:'#1e262b',metalness:.65,roughness:.33});
  const neutralLight=material({color:'#edf1e9',emissive:'#f0e9d9',emissiveIntensity:1.35,roughness:.35,side:THREE.DoubleSide}),cyan=material({color:'#91b8b9',emissive:'#6a9e9f',emissiveIntensity:.35,roughness:.4});
  const context=(o:THREE.Mesh)=>o;
  function cylinder(radius:number,depth:number,m:THREE.Material,x:number,y:number,z:number){const o=mesh(new THREE.CylinderGeometry(radius,radius,depth,48),m,x,y,z);o.rotation.x=Math.PI/2;return o;}
  function localLayout(x:number,y:number,yaw:number,build:()=>void,z=WORKSHOP_FLOOR_Z){
    const first=group.children.length;build();const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),yaw),translation=new THREE.Vector3(x,y,z);
    for(const o of group.children.slice(first)){o.position.applyQuaternion(rotation).add(translation);o.quaternion.premultiply(rotation);}
  }
  const brushed=document.createElement('canvas');brushed.width=1024;brushed.height=256;const bc=brushed.getContext('2d')!;
  bc.fillStyle='#c5c7c8';bc.fillRect(0,0,1024,256);
  for(let y=0;y<256;y++){const n=202+Math.round(random()*8);bc.strokeStyle='rgb('+n+','+(n+2)+','+(n+3)+')';bc.beginPath();bc.moveTo(0,y+.5);bc.lineTo(1024,y+.5);bc.stroke();}
  metal.map=texture(brushed);metal.needsUpdate=true;
  const labelMaterials=new Map<string,THREE.MeshStandardMaterial>();
  function equipmentLabel(text:string,w:number,h:number,x:number,y:number,z:number,yaw=0){
    let m=labelMaterials.get(text);
    if(!m){const c=document.createElement('canvas');c.width=1024;c.height=192;const d=c.getContext('2d')!;d.fillStyle='#c6c7bd';d.fillRect(0,0,1024,192);d.fillStyle='#344249';d.fillRect(0,0,18,192);d.font='600 68px Segoe UI';d.fillText(text,54,106);d.font='26px Consolas';d.fillStyle='#647078';d.fillText('RESEARCH / ASSEMBLY',57,156);m=material({map:texture(c),roughness:.86,metalness:0});labelMaterials.set(text,m);}
    const label=context(mesh(new THREE.PlaneGeometry(w,h),m,x,y,z,'设备标识'));label.quaternion.setFromEuler(new THREE.Euler(Math.PI/2,0,yaw,'ZXY'));return label;
  }

  for(const x of [-1,1])block(.035,.0015,.001,cyan,x*(width/2-.025),-height/2-.012,-.007,.0003);
  function surfaceMap(source:THREE.Texture,x:number,y:number){const t=source.clone();t.repeat.set(x,y);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=12;t.needsUpdate=true;textures.add(t);return t;}
  const wall=material({color:'#a39b88',map:surfaceMap(assets.wallColor,.5,.5),normalMap:surfaceMap(assets.wallNormal,.5,.5),normalScale:new THREE.Vector2(.1,.1),roughnessMap:surfaceMap(assets.wallArm,.5,.5),metalness:0,roughness:.92});
  wall.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb=diffuse*mix(vec3(0.62),texture2D(map,vMapUv).rgb,0.5);');};wall.customProgramCacheKey=()=> 'rectangular-workshop-precast-v1';
  const reveal=material({color:'#424a49',roughness:.92}),windowFrame=material({color:'#7c898c',metalness:.8,roughness:.27}),gasket=material({color:'#263336',roughness:.9}),ceilingMaterial=material({color:'#858780',roughness:.92});
  const roomHalfX=3.8,roomHalfY=4.2,wallHeight=3.4,ceilingZ=WORKSHOP_FLOOR_Z+wallHeight;
  const wallX=(h:number)=>roomHalfX-.45*THREE.MathUtils.clamp((h-.85)/1.2,0,1);
  const wallPoint=(side:number,y:number,h:number)=>new THREE.Vector3(side*wallX(h),y,WORKSHOP_FLOOR_Z+h);
  // Separate precast slabs have physical thickness, bevels, recessed joints and form-tie plugs.
  function wallSlab(points:THREE.Vector3[],name:string,plugs=true){
    let u=points[1].clone().sub(points[0]).normalize(),v=points[3].clone().sub(points[0]).normalize(),w=points[0].distanceTo(points[1]),h=points[0].distanceTo(points[3]);
    const normal=new THREE.Vector3().crossVectors(u,v).normalize(),center=points[0].clone().addScaledVector(u,w/2).addScaledVector(v,h/2);
    if(normal.dot(new THREE.Vector3(center.x,center.y,0))<0){[u,v]=[v,u];[w,h]=[h,w];normal.negate();}
    const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,v,normal)),p=center.clone().addScaledVector(normal,.066);
    const back=mesh(new THREE.BoxGeometry(w,h,.11),reveal,p.x,p.y,p.z);back.quaternion.copy(q);
    const panel=block(w-.012,h-.012,.105,wall,center.x,center.y,center.z,.004);panel.quaternion.copy(q);panel.name=name;
    if(plugs&&w>.65&&h>.6)for(const a of [-1,1])for(const b of [-1,1]){
      const p=center.clone().addScaledVector(u,a*(w/2-.19)).addScaledVector(v,b*(h/2-.18)).addScaledVector(normal,-.054);
      const plug=mesh(new THREE.CircleGeometry(.008,20),reveal,p.x,p.y,p.z,'混凝土模板孔封堵');plug.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI));plug.castShadow=false;
    }
  }
  // Rectangular plan; a short straight incline is confined to the window band.
  for(const side of [-1,1])for(let n=0;n<4;n++){
    const y0=-roomHalfY+n*2.1,y1=y0+2.1;
    for(const [a,b]of [[0,.85],[2.05,wallHeight]])wallSlab([wallPoint(side,y0,a),wallPoint(side,y1,a),wallPoint(side,y1,b),wallPoint(side,y0,b)],'混凝土墙板');
    if(n===0||n===3){const a=n===0?y0:y1-.3,b=a+.3;wallSlab([wallPoint(side,a,.85),wallPoint(side,b,.85),wallPoint(side,b,2.05),wallPoint(side,a,2.05)],'窗带端部混凝土收边',false);}
  }
  for(const side of [-1,1])for(let n=0;n<3;n++){
    const x0=-3.35+n*2.233333,x1=x0+2.233333,y=side*roomHalfY;
    wallSlab([new THREE.Vector3(x0,y,WORKSHOP_FLOOR_Z),new THREE.Vector3(x1,y,WORKSHOP_FLOOR_Z),new THREE.Vector3(x1,y,ceilingZ),new THREE.Vector3(x0,y,ceilingZ)],'矩形研发空间端墙');
  }
  for(const side of [-1,1])for(const end of [-1,1])block(.47,.2,wallHeight,wall,side*3.575,end*4.16,WORKSHOP_FLOOR_Z+wallHeight/2,.006);
  // Matched views of one location; each long window band shares an exterior plane at the source aspect ratio.
  for(const side of [-1,1]){
    const map=side<0?assets.campusWindow:assets.bayWindow;map.anisotropy=12;
    const exteriorMaterial=new THREE.MeshBasicMaterial({map,color:'#e0e6e7',toneMapped:false});materials.add(exteriorMaterial);
    const image=map.image as ImageBitmap,exterior=mesh(new THREE.PlaneGeometry(9.2,9.2*image.height/image.width),exteriorMaterial,side*4.4,0,.75,side<0?'科研园区连续窗外景观':'海湾连续窗外景观');
    exterior.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,-side,0),new THREE.Vector3(0,0,1),new THREE.Vector3(-side,0,0)));exterior.castShadow=exterior.receiveShadow=false;
  }
  const daylight=new THREE.MeshPhysicalMaterial({color:'#d6e4e7',transparent:true,opacity:.12,depthWrite:false,metalness:0,roughness:.16,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.65,side:THREE.DoubleSide});daylight.forceSinglePass=true;materials.add(daylight);
  function windowMember(a:THREE.Vector3,b:THREE.Vector3,depth:number,m:THREE.Material){
    const o=block(depth,depth,a.distanceTo(b),m,0,0,0,depth*.12);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),b.clone().sub(a).normalize());return o;
  }
  for(const side of [-1,1])for(let n=0;n<4;n++){
    const y0=-3.88+n*1.94,y1=y0+1.90,a=wallPoint(side,y0,.9),b=wallPoint(side,y1,.9),d=wallPoint(side,y0,2.0),c=wallPoint(side,y1,2.0),u=b.clone().sub(a).normalize(),v=d.clone().sub(a).normalize(),normal=new THREE.Vector3().crossVectors(u,v).normalize(),q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u,v,normal));
    const center=a.clone().add(c).multiplyScalar(.5),pane=mesh(new THREE.PlaneGeometry(a.distanceTo(b),a.distanceTo(d)),daylight,center.x,center.y,center.z,'带收边的倾斜采光玻璃');pane.quaternion.copy(q);pane.castShadow=false;
    const points=[a,b,c,d];for(let k=0;k<4;k++){windowMember(points[k],points[(k+1)%4],.046,windowFrame);windowMember(points[k].clone().addScaledVector(normal,-.026),points[(k+1)%4].clone().addScaledVector(normal,-.026),.012,gasket);}
    windowMember(a.clone().add(new THREE.Vector3(-side*.018,0,-.015)),b.clone().add(new THREE.Vector3(-side*.018,0,-.015)),.072,windowFrame);
  }
  for(const side of [-1,1])block(.035,8.4,.105,graphite,side*(roomHalfX-.02),0,WORKSHOP_FLOOR_Z+.0525,.003);
  for(const y of [-4.15,4.15])block(7.6,.035,.105,graphite,0,y,WORKSHOP_FLOOR_Z+.0525,.003);
  for(const x of [-1.67,1.67])for(const y of [-2.8,0,2.8])block(3.32,2.78,.1,ceilingMaterial,x,y,ceilingZ+.05,.004);
  // Connected I-beam webs, flanges, end plates, bolts and suspended metal shades.
  for(const y of [-1.65,1.65]){
    for(const z of [ceilingZ-.015,ceilingZ-.185])block(6.72,.18,.018,graphite,0,y,z,.002);
    block(6.72,.014,.17,graphite,0,y,ceilingZ-.1,.001);
    for(const x of [-3.33,3.33]){
      block(.018,.23,.23,titanium,x,y,ceilingZ-.112,.002);
      for(const dy of [-.075,.075])for(const dz of [-.075,.075]){const bolt=mesh(new THREE.CylinderGeometry(.008,.008,.012,6),metal,x-Math.sign(x)*.014,y+dy,ceilingZ-.112+dz);bolt.rotation.z=Math.PI/2;}
    }
    for(const x of [-1.2,1.2]){
      const bottom=ceilingZ-.73;cylinder(.055,.018,graphite,x,y,ceilingZ-.202);
      rod(new THREE.Vector3(x,y,ceilingZ-.211),new THREE.Vector3(x,y,bottom+.21),.006,titanium);
      const profile=[new THREE.Vector2(.145,0),new THREE.Vector2(.15,.014),new THREE.Vector2(.112,.067),new THREE.Vector2(.048,.19),new THREE.Vector2(.035,.21)],shade=mesh(new THREE.LatheGeometry(profile,64),titanium,x,y,bottom,'有翻边与内衬的吊灯');shade.rotation.x=Math.PI/2;
      const inner=mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(p.x-.004,p.y+.003)),64),neutralLight,x,y,bottom+.003);inner.rotation.x=Math.PI/2;
      mesh(new THREE.TorusGeometry(.146,.0035,10,64),metal,x,y,bottom+.003,'吊灯卷边');
    }
  }
  localLayout(2.35,4.13,0,()=>{
    block(.65,.055,.28,windowFrame,0,0,2.72,.007);block(.6,.012,.235,joint,0,-.034,2.72,.003);
    for(let n=0;n<10;n++)block(.565,.025,.006,titanium,0,-.043,2.626+n*.021,.001);
    for(const dx of [-.292,.292])for(const dz of [-.105,.105])mesh(new THREE.CylinderGeometry(.003,.003,.004,6),metal,dx,-.036,2.72+dz,'风口固定螺钉');
  });
  // Transform display models into static batches. Assets owns the imported resources.
  function placeModel(source:THREE.Group,x:number,y:number,z:number,scale=1,yaw=0,anchor:'bounds'|'base'|false='bounds'){
    const root=new THREE.Group();root.add(source);root.scale.setScalar(scale);root.quaternion.setFromEuler(new THREE.Euler(Math.PI/2,0,yaw,'ZXY'));root.updateMatrixWorld(true);
    if(anchor){
      const b=new THREE.Box3().setFromObject(root),center=b.getCenter(new THREE.Vector3());
      if(anchor==='base'){
        const foot=new THREE.Box3(),point=new THREE.Vector3();
        source.traverse(o=>{if(o instanceof THREE.Mesh){const vertices=o.geometry.getAttribute('position');for(let n=0;n<vertices.count;n++){point.fromBufferAttribute(vertices,n).applyMatrix4(o.matrixWorld);if(point.z<=b.min.z+.025*scale)foot.expandByPoint(point);}}});
        if(!foot.isEmpty()){const bottom=foot.getCenter(new THREE.Vector3());center.x=bottom.x;center.y=bottom.y;}
      }
      root.position.set(x-center.x,y-center.y,z-b.min.z);
    }else root.position.set(x,y,z);
    let emitter:THREE.Vector3|undefined;
    root.updateMatrixWorld(true);source.traverse(o=>{if(o instanceof THREE.Mesh){
      const g=o.geometry.clone().applyMatrix4(o.matrixWorld);mesh(g,o.material as THREE.Material,0,0,0,'精细环境设备');
      const importedMaterials=Array.isArray(o.material)?o.material:[o.material];
      if(importedMaterials.some(m=>m.name==='desk_lamp_arm_01_light'))emitter=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    }});source.removeFromParent();return emitter;
  }
  const {lampMount,lampTarget}=addWritingDesk(-.88,1.78,WORKSHOP_FLOOR_Z,{mesh,material,texture,unlit});
  // The imported arm extends along +Y before yaw; turn it inward over the writing area.
  const lampEmitter=placeModel(assets.deskLamp,lampMount.x,lampMount.y,lampMount.z,.7,lampMount.yaw,'base');
  if(lampEmitter){
    const taskLight=new THREE.SpotLight('#ffe2b4',.22,1.4,Math.PI/3.8,.75,2);taskLight.name='书桌台灯 · 朝向书写区';
    taskLight.position.copy(lampEmitter);taskLight.target.position.copy(lampTarget);group.add(taskLight,taskLight.target);
  }
  // One CAD-derived six-axis arm replaces repeated cylinder-and-sphere stand-ins.
  const robotX=1.04,robotY=.27,robotTop=WORKSHOP_FLOOR_Z+.75;
  localLayout(robotX,robotY,0,()=>{
    block(.38,.42,.68,cabinet,0,0,.39,.008);block(.44,.48,.024,metal,0,0,.738,.004);
    for(const x of [-.15,.15])for(const y of [-.17,.17]){cylinder(.026,.012,rubber,x,y,.014);cylinder(.008,.025,metal,x,y,.031);}
    for(let n=0;n<9;n++)block(.205,.007,.004,joint,0,-.214,.25+n*.019,.001);
    block(.21,.012,.08,plastic,0,-.218,.61,.004);equipmentLabel('ROBOT CONTROL',.18,.037,0,-.226,.61);
    for(const x of [-.13,.13])for(const y of [-.12,.12])cylinder(.006,.009,edge,x,y,.754).name='机械臂安装螺栓';
  });
  placeModel(assets.robot,robotX,robotY,robotTop,1,Math.PI,false);
  // Room-scale shadows are cached for static equipment. Layer 2 excludes moving DKP meshes.
  const roomKey=new THREE.DirectionalLight('#f1eee4',1.25);roomKey.position.set(-3,-2,2.45);roomKey.target.position.set(0,1,-.35);roomKey.castShadow=true;
  roomKey.shadow.mapSize.set(4096,4096);roomKey.shadow.camera.left=roomKey.shadow.camera.bottom=-5.3;roomKey.shadow.camera.right=roomKey.shadow.camera.top=5.3;roomKey.shadow.camera.near=.1;roomKey.shadow.camera.far=12;
  roomKey.shadow.camera.layers.set(2);roomKey.shadow.normalBias=.001;roomKey.shadow.bias=-.00003;roomKey.shadow.radius=2;roomKey.shadow.autoUpdate=false;roomKey.shadow.needsUpdate=true;group.add(roomKey,roomKey.target);

  // Bake display-only static meshes by material. Parts and interaction targets stay separate.
  group.updateMatrixWorld(true);
  const batches=new Map<string,THREE.Mesh[]>();
  for(const o of [...group.children])if(o instanceof THREE.Mesh&&!Array.isArray(o.material)&&!o.material.transparent){const key=o.material.uuid+':'+Number(o.castShadow)+':'+Number(o.receiveShadow);if(!batches.has(key))batches.set(key,[]);batches.get(key)!.push(o);}
  for(const entries of batches.values())if(entries.length>1){
    const copies=entries.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();return g.applyMatrix4(o.matrix);});
    const combined=mergeGeometries(copies,false);for(const g of copies)g.dispose();
    if(combined){geometries.add(combined);const batch=new THREE.Mesh(combined,entries[0].material);batch.castShadow=entries[0].castShadow;batch.receiveShadow=entries[0].receiveShadow;batch.layers.enable(2);batch.name='静态研发工坊环境';for(const o of entries)o.removeFromParent();group.add(batch);}
  }

  return {group,overviewBounds:new THREE.Box3(new THREE.Vector3(-width*.52,-height*.45,-.08),new THREE.Vector3(width*.52,height*.8,.28)),floorZ:WORKSHOP_FLOOR_Z,setQuality(quality:'high'|'balanced'|'performance'){floorReflection.setQuality(quality);const size={high:4096,balanced:2048,performance:1024}[quality];if(roomKey.shadow.mapSize.x!==size){roomKey.shadow.map?.dispose();roomKey.shadow.map=null;roomKey.shadow.mapSize.set(size,size);roomKey.shadow.needsUpdate=true;}},dispose(){floorReflection.dispose();roomKey.shadow.map?.dispose();group.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
