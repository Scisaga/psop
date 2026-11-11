import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type ToolResources={
  mesh:(geometry:THREE.BufferGeometry,material:THREE.Material,x?:number,y?:number,z?:number,name?:string)=>THREE.Mesh;
  material:(parameters:THREE.MeshStandardMaterialParameters)=>THREE.MeshStandardMaterial;
  texture:(canvas:HTMLCanvasElement)=>THREE.Texture;
};

/** Metre-scale display props; resources and static batching belong to the workshop. */
export function addWorkbenchTools(width:number,height:number,resources:ToolResources){
  const {material,texture}=resources,objects:THREE.Mesh[]=[];
  const steel=material({color:'#c0c9cd',metalness:.88,roughness:.25});
  const satin=material({color:'#88989f',metalness:.8,roughness:.39});
  const aluminium=material({color:'#63777e',metalness:.72,roughness:.36});
  const grip=material({color:'#203a3e',metalness:.04,roughness:.72});
  const amber=material({color:'#c3a16a',metalness:.12,roughness:.46});
  const inset=material({color:'#17282d',metalness:.2,roughness:.62});
  const liner=material({color:'#34474a',metalness:.03,roughness:.88});
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,name=''){
    const o=resources.mesh(g,m,x,y,z,name);objects.push(o);return o;
  }
  function block(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number,r=.0004){
    return mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/3,h/3,d/3)),m,x,y,z);
  }
  function cylinder(r:number,d:number,m:THREE.Material,x:number,y:number,z:number,axis:'x'|'z'='z',segments=40){
    const o=mesh(new THREE.CylinderGeometry(r,r,d,segments),m,x,y,z);
    o.rotation[axis==='x'?'z':'x']=axis==='x'?-Math.PI/2:Math.PI/2;return o;
  }
  function local(x:number,y:number,z:number,yaw:number,build:()=>void,pitch=0){
    const first=objects.length;build();
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,pitch,yaw,'ZYX')),p=new THREE.Vector3(x,y,z);
    for(const o of objects.slice(first)){o.position.applyQuaternion(q).add(p);o.quaternion.premultiply(q);}
  }
  function outline(points:number[][],depth:number,m:THREE.Material,z:number,bevel=.0002){
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    return mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel}),m,0,0,z);
  }
  function ring(outer:number,inner:number,depth:number,m:THREE.Material,x:number,y:number,z:number){
    const shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);
    return mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:depth*.15,bevelThickness:depth*.15,bevelSegments:2,curveSegments:32}),m,x,y,z);
  }
  function face(canvas:HTMLCanvasElement,w:number,h:number,x:number,y:number,z:number){
    return mesh(new THREE.PlaneGeometry(w,h),material({map:texture(canvas),metalness:.03,roughness:.74}),x,y,z);
  }
  function label(text:string,w:number,h:number,x:number,y:number,z:number,background='#afbdc0'){
    const c=document.createElement('canvas');c.width=1024;c.height=160;const d=c.getContext('2d')!;
    d.fillStyle=background;d.fillRect(0,0,c.width,c.height);d.fillStyle='#24373d';d.font='500 86px Segoe UI';
    const size=Math.min(86,Math.floor(86*960/d.measureText(text).width));d.font=`500 ${size}px Segoe UI`;d.textAlign='center';d.textBaseline='middle';d.fillText(text,512,83);
    return face(c,w,h,x,y,z);
  }

  // Four precision drivers: turned handles, grip flutes, ferrules and distinct bits.
  local(width*.22,height*.45,0,0,()=>{
    block(.108,.044,.004,inset,0,0,.002,.0015);
    block(.104,.041,.019,aluminium,0,0,.0135,.002);
    block(.098,.036,.0015,inset,0,0,.02375,.001);
    const plate=new THREE.Shape();plate.moveTo(-.05,-.019);plate.lineTo(.05,-.019);plate.lineTo(.05,.019);plate.lineTo(-.05,.019);plate.closePath();
    for(let i=0;i<4;i++){const hole=new THREE.Path();hole.absarc(-.036+i*.024,0,.0028,0,Math.PI*2,true);plate.holes.push(hole);}
    mesh(new THREE.ExtrudeGeometry(plate,{depth:.0012,bevelEnabled:true,bevelSize:.00025,bevelThickness:.00025,bevelSegments:2,curveSegments:32}),satin,0,0,.0245,'开孔铝制精密工具架');
    const name=label('PRECISION  /  01 — 04',.076,.0065,0,-.0207,.013);
    name.rotation.x=Math.PI/2;
    for(let i=0;i<4;i++)local(-.036+i*.024,0,0,0,()=>{
      const bottom=.024,neck=.071+i*.004,body=i===1?amber:grip;
      cylinder(.00275,.0004,inset,0,0,.0247);
      ring(.0035,.00215,.00055,steel,0,0,.0257);
      cylinder(.00135,neck-bottom-.003,steel,0,0,(bottom+neck+.003)/2);
      if(i===0){
        const bit=outline([[-.00165,0],[.00165,0],[.00135,.004],[-.00135,.004]],.0006,satin,0,0);
        bit.rotation.x=Math.PI/2;bit.position.z=bottom;bit.position.y=.0003;bit.name='一字精密批头';
      }else if(i===1){
        const bit=mesh(new THREE.ConeGeometry(.00155,.004,4),satin,0,0,bottom+.002,'十字精密批头');bit.rotation.x=-Math.PI/2;
        cylinder(.001,.003,inset,0,0,bottom+.003);
      }else{
        cylinder(i===2?.0012:.0015,.004,satin,0,0,bottom+.002,'z',6).name='六角精密批头';
      }
      cylinder(.0027,.005,steel,0,0,neck+.001);
      const points=[[.003,0],[.0038,.003],[.0055,.008],[.0063,.016],[.0065,.032],[.0058,.042],[.0045,.047],[.0045,.049]].map(([r,z])=>new THREE.Vector2(r,z));
      const handle=mesh(new THREE.LatheGeometry(points,40),body,0,0,neck+.003,'带防滑纹的精密螺丝刀握柄');handle.rotation.x=Math.PI/2;
      for(let flute=0;flute<10;flute++){
        const angle=flute*Math.PI/5,r=.00625,o=block(.0011,.0011,.023,inset,Math.cos(angle)*r,Math.sin(angle)*r,neck+.028,.00045);o.rotation.z=angle;
      }
      for(const dz of [.008,.012])ring(.0053,.0047,.00065,body,0,0,neck+dz);
      cylinder(.0046,.0014,satin,0,0,neck+.053);
      cylinder(.006,.0045,body,0,0,neck+.056).name='可旋转尾帽';
      cylinder(.0038,.00035,inset,0,0,neck+.0584);
      block(.0032,.00045,.00015,steel,0,0,neck+.05865,.00005);
      if(i===1)block(.00045,.0032,.00015,steel,0,0,neck+.05865,.00005);
    });
  });

  // M3/M4 fasteners use matching head, thread, bore and washer proportions.
  function screw(diameter:number,length:number,x:number,y:number,yaw:number){
    const headRadius=diameter*.92,headDepth=diameter,pitch=diameter===.003?.0005:.0007;
    local(x,y,.00235+headRadius,yaw,()=>{
      const shape=new THREE.Shape();shape.absarc(0,0,headRadius,0,Math.PI*2,false);
      const hole=new THREE.Path();for(let i=0;i<6;i++){const a=-i*Math.PI/3,u=Math.cos(a)*diameter*.49,v=Math.sin(a)*diameter*.49;i?hole.lineTo(u,v):hole.moveTo(u,v);}hole.closePath();shape.holes.push(hole);
      const head=mesh(new THREE.ExtrudeGeometry(shape,{depth:headDepth,bevelEnabled:true,bevelSize:diameter*.07,bevelThickness:diameter*.07,bevelSegments:3,curveSegments:32}),steel,-headDepth/2,0,0,'内六角圆柱螺钉头');head.rotation.y=Math.PI/2;
      cylinder(diameter*.48,.0004,inset,-headDepth/2+.001,0,0,'x',6);
      const start=headDepth/2,end=start+length-.0008,root=diameter*.405;
      cylinder(root,length-.0008,satin,(start+end)/2,0,0,'x');
      const tip=mesh(new THREE.ConeGeometry(root,.0012,24),steel,end+.0003,0,0,'螺钉端部倒角');tip.rotation.z=-Math.PI/2;
      const span=end-start-pitch,count=Math.ceil(span/pitch*20),positions:number[]=[],uv:number[]=[],indices:number[]=[];
      for(let i=0;i<=count;i++){
        const t=i/count,a=t*span/pitch*Math.PI*2;
        for(let j=0;j<3;j++){
          const radius=j===1?diameter/2:root;
          positions.push(start+pitch/2+t*span+(j-1)*pitch*.37,Math.cos(a)*radius,Math.sin(a)*radius);uv.push(t,j/2);
        }
        if(i<count)for(let j=0;j<2;j++){const n=i*3+j;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
      }
      const thread=new THREE.BufferGeometry();thread.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));thread.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));thread.setIndex(indices);thread.computeVertexNormals();
      mesh(thread,steel,0,0,0,'连续螺旋牙型');
    },Math.atan((headRadius-diameter*.4)/(length+headDepth/2)));
  }
  local(width*.43,-height*.31,0,0,()=>{
    block(.112,.085,.0018,aluminium,0,0,.0009,.001);
    block(.105,.078,.0005,liner,0,0,.00205,.001);
    for(const sign of [-1,1]){
      block(.0018,.085,.0054,satin,sign*.0551,0,.0042,.00065);
      block(.108,.0018,.0054,satin,0,sign*.0416,.0042,.00065);
    }
    for(let row=0;row<3;row++){
      const y=-.024+row*.024,d=row===2?.004:.003,length=row===0?.012:.016;
      screw(d,length,-.039,y,.4-row*.09);screw(d,length,.011,y-.002,Math.PI+.24-row*.07);
      for(const x of [.026,.040])ring(d===.003?.0035:.0045,d===.003?.0016:.00215,d===.003?.0005:.0008,steel,x,y,.0024).name='薄型平垫圈，孔径匹配螺钉';
    }
    label('M3 / M4  ·  FASTENERS',.080,.0045,0,.034,.0024,'#829596');
  });

  // A 150 mm vernier caliper replaces the anonymous block. Keep this footprint
  // in sync with tableReservations in simulate-placement.mjs.
  local(-width*.5+.132,-height*.5+.066,.00055,.045,()=>{
    block(.206,.016,.0028,satin,-.001,.003,.0014,.00035).name='150 mm 游标卡尺尺身';
    block(.032,.002,.0012,steel,.118,.003,.0012,.00015).name='伸出的深度尺';
    outline([[-.105,.012],[-.092,.012],[-.092,-.039],[-.095,-.043],[-.101,-.032],[-.105,-.012]],.0032,steel,.0002);
    outline([[-.105,.010],[-.099,.026],[-.094,.030],[-.092,.012]],.0028,steel,.0004);
    const scale=document.createElement('canvas');scale.width=2304;scale.height=176;const d=scale.getContext('2d')!;
    d.fillStyle='#b4c0c4';d.fillRect(0,0,2304,176);d.strokeStyle=d.fillStyle='#17282d';d.textAlign='center';d.font='600 42px Segoe UI';
    for(let mm=0;mm<=150;mm++){
      const x=80+mm*14.2;d.lineWidth=mm%10===0?4:2.6;d.beginPath();d.moveTo(x,176);d.lineTo(x,mm%10===0?78:mm%5===0?108:132);d.stroke();if(mm%10===0)d.fillText(String(mm),x,58);
    }
    face(scale,.16225,.0107,-.0165,.0054,.00286);
    block(.036,.026,.0034,satin,-.046,-.0005,.0045,.00065).name='游标滑块';
    block(.034,.002,.0008,steel,-.046,.0119,.0065,.00015);
    outline([[-.060,.009],[-.044,.009],[-.044,-.010],[-.049,-.034],[-.056,-.043],[-.060,-.043]],.0034,steel,.0004);
    outline([[-.060,.011],[-.059,.028],[-.055,.023],[-.051,.010]],.0028,steel,.0006);
    block(.00065,.017,.0024,inset,-.0916,-.030,.0021,.0001);
    block(.00065,.017,.0024,inset,-.0603,-.030,.0021,.0001);
    const vernier=document.createElement('canvas');vernier.width=1024;vernier.height=320;const v=vernier.getContext('2d')!;
    v.fillStyle='#bdc7cb';v.fillRect(0,0,1024,320);v.fillStyle=v.strokeStyle='#17282d';v.textAlign='center';v.font='600 60px Segoe UI';
    for(let i=0;i<=20;i++){const x=45+i*45;v.lineWidth=i%5===0?5:3;v.beginPath();v.moveTo(x,0);v.lineTo(x,i%5===0?128:80);v.stroke();if(i%5===0)v.fillText(String(i),x,196);}
    v.font='44px Segoe UI';v.fillText('0.05 mm',512,282);face(vernier,.0216,.010,-.0494,-.0073,.00625);
    cylinder(.0015,.0024,steel,-.043,.015,.0063);
    cylinder(.00265,.0017,inset,-.043,.015,.0081, 'z',32).name='滚花锁紧螺钉';
    for(let n=0;n<18;n++){const a=n*Math.PI/9;cylinder(.00022,.0015,steel,-.043+Math.cos(a)*.0026,.015+Math.sin(a)*.0026,.0081,'z',6);}
    cylinder(.003,.0035,satin,-.033,-.017,.0039).name='拇指微调滚轮';
    for(let n=0;n<24;n++){const a=n*Math.PI/12;cylinder(.00017,.0032,steel,-.033+Math.cos(a)*.003,-.017+Math.sin(a)*.003,.0039,'z',6);}
    label('STAINLESS  /  150 mm',.038,.004,.077,.003,.00287);
  });
}
