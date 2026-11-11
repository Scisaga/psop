import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type DeskResources={
  mesh:(geometry:THREE.BufferGeometry,material:THREE.Material,x?:number,y?:number,z?:number,name?:string)=>THREE.Mesh;
  material:(parameters:THREE.MeshStandardMaterialParameters)=>THREE.MeshStandardMaterial;
  unlit:(parameters:THREE.MeshBasicMaterialParameters)=>THREE.MeshBasicMaterial;
  texture:(canvas:HTMLCanvasElement,color?:boolean)=>THREE.Texture;
};

/** Display furniture in metres. The workshop owns and batches all opaque resources. */
export function addWritingDesk(x:number,y:number,floorZ:number,resources:DeskResources){
  const {material,texture,unlit}=resources,objects:THREE.Mesh[]=[];
  const top=.77,width=2.12,depth=.84;
  const black=material({color:'#20272d',metalness:.46,roughness:.36});
  const inset=material({color:'#10171c',metalness:.12,roughness:.73});
  const aluminium=material({color:'#a6b0b5',metalness:.82,roughness:.29});
  const rubber=material({color:'#20282a',roughness:.94});
  const keycap=material({color:'#404a50',roughness:.6});
  const paper=material({color:'#d4cec0',roughness:.95});
  const indicator=material({color:'#b4d7cc',emissive:'#70a99d',emissiveIntensity:.5,roughness:.4});
  function mesh(g:THREE.BufferGeometry,m:THREE.Material,a=0,b=0,c=0,name=''){
    const o=resources.mesh(g,m,a,b,c,name);objects.push(o);return o;
  }
  function block(w:number,h:number,d:number,m:THREE.Material,a:number,b:number,c:number,r=.0015){
    return mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),m,a,b,c);
  }
  function cylinder(r:number,d:number,m:THREE.Material,a:number,b:number,c:number,axis:'x'|'y'|'z'='z',segments=40){
    const o=mesh(new THREE.CylinderGeometry(r,r,d,segments),m,a,b,c);
    if(axis==='z')o.rotation.x=Math.PI/2;else if(axis==='x')o.rotation.z=-Math.PI/2;
    return o;
  }
  function local(a:number,b:number,c:number,yaw:number,build:()=>void,pitch=0){
    const first=objects.length;build();
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,0,yaw,'ZXY')),p=new THREE.Vector3(a,b,c);
    for(const o of objects.slice(first)){o.position.applyQuaternion(q).add(p);o.quaternion.premultiply(q);}
  }
  function cable(points:number[][],radius=.0026){
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,radius,8,false),rubber,0,0,0,'设备走线');
  }
  function decal(c:HTMLCanvasElement,w:number,h:number,a:number,b:number,z:number){
    const m=material({map:texture(c),transparent:true,depthWrite:false,roughness:.7});
    const o=mesh(new THREE.PlaneGeometry(w,h),m,a,b,z);o.castShadow=false;return o;
  }

  // Continuous, lengthwise walnut grain. Side UVs sample the actual edge of the slab.
  const grain=document.createElement('canvas');grain.width=2048;grain.height=1024;
  const gc=grain.getContext('2d')!,pixels=gc.createImageData(grain.width,grain.height);
  let seed=73;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
  for(let v=0;v<grain.height;v++)for(let u=0;u<grain.width;u++){
    const bend=Math.sin(u*.0023)*8+Math.sin(u*.0061+v*.008)*2.8;
    const phase=v+bend+Math.sin(u*.0012+v*.012)*11;
    const broad=Math.sin(phase*.031)+.48*Math.sin(phase*.071+.5);
    const pore=Math.pow(.5+.5*Math.sin(phase*1.65+Math.sin(u*.012)*.6),14);
    const streak=Math.sin(phase*.36+Math.sin(u*.002)*3)*2.4;
    const tone=broad*7+streak-pore*9+(random()-.5)*3;
    const i=(v*grain.width+u)*4;
    pixels.data[i]=145+tone;pixels.data[i+1]=103+tone*.82;pixels.data[i+2]=67+tone*.63;pixels.data[i+3]=255;
  }
  gc.putImageData(pixels,0,0);
  const grainMap=texture(grain),wood=material({map:grainMap,bumpMap:grainMap,bumpScale:.00024,roughness:.45,metalness:0});
  wood.name='哑光胡桃木 · 顺纹实木桌板';
  const slab=new RoundedBoxGeometry(width,depth,.036,4,.006),positions=slab.getAttribute('position'),normals=slab.getAttribute('normal'),uv=slab.getAttribute('uv');
  for(let i=0;i<positions.count;i++){
    const a=positions.getX(i),b=positions.getY(i),c=positions.getZ(i);
    if(Math.abs(normals.getZ(i))>.65)uv.setXY(i,a/width+.5,b/depth+.5);
    else if(Math.abs(normals.getY(i))>.65)uv.setXY(i,a/width+.5,(Math.sign(b)*depth/2+c)/depth+.5);
    else uv.setXY(i,(Math.sign(a)*width/2+c)/width+.5,b/depth+.5);
  }
  mesh(slab,wood,0,0,top-.018,'36mm 圆角胡桃木书桌');
  // Four feet, two side frames and a rear stretcher leave a clear seated knee space.
  for(const a of [-.94,.94]){
    for(const b of [-.32,.32]){
      block(.036,.036,.702,black,a,b,.389,.003);
      cylinder(.022,.009,rubber,a,b,.0045);cylinder(.007,.033,aluminium,a,b,.0255);
      block(.038,.038,.024,aluminium,a,b,.052,.002);
    }
    block(.036,.676,.036,black,a,0,.718,.002);
    block(.036,.676,.026,black,a,0,.079,.002);
  }
  block(1.844,.032,.062,black,0,.315,.694,.002);
  // Suspended storage is kept to one side, with inset pulls and a wood front.
  block(.385,.54,.365,black,-.775,.02,.54,.005);
  for(let n=0;n<3;n++){
    block(.374,.022,.112,wood,-.775,-.256,.419+n*.119,.003);
    block(.13,.012,.006,inset,-.775,-.271,.45+n*.119,.001);
    block(.123,.012,.002,aluminium,-.775,-.275,.451+n*.119,.0005);
  }
  // Recessed desktop cable outlet, rear tray and a grounded strip below the top.
  cylinder(.024,.0025,aluminium,.73,.307,top+.00125);
  cylinder(.0205,.003,inset,.73,.307,top+.0027);
  block(.029,.003,.0015,rubber,.73,.307,top+.0045,.0004);
  block(.94,.128,.003,black,.19,.277,.659);
  for(const b of [.214,.34])block(.94,.003,.048,black,.19,b,.682);
  block(.48,.045,.024,paper,.2,.273,.674,.003);
  for(let n=0;n<5;n++)for(const a of [-.004,.004])block(.0018,.007,.0008,inset,.026+n*.08+a,.273,.6865,.0003);

  function displayMap(kind:number){
    const c=document.createElement('canvas');c.width=2048;c.height=1152;const d=c.getContext('2d')!;d.scale(2,2);
    const text=(t:string,a:number,b:number,size=12,color='#93a4b3')=>{d.fillStyle=color;d.font=`${size}px Segoe UI`;d.fillText(t,a,b);};
    if(kind===0){
      d.fillStyle='#dce3e8';d.fillRect(0,0,1024,576);d.fillStyle='#f6f8fa';d.fillRect(0,0,1024,44);
      text('PSOP   /   DESIGN WORKSPACE',20,28,15,'#243c4d');text('Assembly     Model     Inspect     View',359,28,12,'#536b7b');
      d.fillStyle='#f3f5f7';d.fillRect(0,45,188,497);text('ASSEMBLY',18,75,11,'#5f7383');
      ['Precision assistant','  Base / foundation','  Shoulder housing','  Upper arm','  Forearm link','  Wrist assembly','  Tool interface'].forEach((t,i)=>{
        if(i===3){d.fillStyle='#d9e8ed';d.fillRect(8,153,170,26);}text((i?'◇  ':'⌄  ')+t,17,105+i*25,11,'#456071');
      });
      d.strokeStyle='#becbd3';d.lineWidth=.65;
      for(let n=0;n<17;n++){d.beginPath();d.moveTo(200+n*62,494);d.lineTo(611+(n-8)*27,111);d.stroke();}
      for(let n=0;n<11;n++){const yy=225+n*n*2.6;d.beginPath();d.moveTo(190,yy);d.lineTo(1024,yy);d.stroke();}
      // Shaded engineering illustration, authored artwork on a physical display.
      const link=(a:number,b:number,e:number,f:number,w:number)=>{
        d.lineCap='round';d.lineWidth=w+7;d.strokeStyle='#6c8190';d.beginPath();d.moveTo(a+6,b+8);d.lineTo(e+6,f+8);d.stroke();
        const gradient=d.createLinearGradient(a,b,e+22,f);gradient.addColorStop(0,'#edf0ec');gradient.addColorStop(.5,'#9aabb2');gradient.addColorStop(1,'#e0e8e9');d.strokeStyle=gradient;d.lineWidth=w;d.beginPath();d.moveTo(a,b);d.lineTo(e,f);d.stroke();
      };
      d.fillStyle='#526b7c';d.beginPath();d.ellipse(565,465,113,24,0,0,Math.PI*2);d.fill();
      link(557,444,557,358,59);link(557,358,473,256,48);link(473,256,653,210,38);link(653,210,706,270,29);
      for(const [a,b,r]of [[557,358,34],[473,256,29],[653,210,25],[706,270,19]]){
        const shade=d.createRadialGradient(a-7,b-8,1,a,b,r);shade.addColorStop(0,'#b4cbd2');shade.addColorStop(1,'#466375');d.fillStyle=shade;d.beginPath();d.arc(a,b,r,0,Math.PI*2);d.fill();d.strokeStyle='#e2ebee';d.lineWidth=2;d.stroke();d.fillStyle='#223e50';d.beginPath();d.arc(a,b,r*.45,0,Math.PI*2);d.fill();
      }
      d.fillStyle='#f7fafb';d.fillRect(810,76,192,119);text('MODEL PROPERTIES',824,99,11,'#405d70');text('Six-axis assistant',824,125,13,'#2d485b');text('Assembly / Perspective',824,148,11,'#6c8291');text('Units   mm',824,176,11,'#6c8291');
      text('PERSPECTIVE',213,77,10,'#6a8293');text('X',949,488,12,'#a96c5c');text('Y',983,469,12,'#6a946d');text('Z',959,446,12,'#567f9f');
      d.fillStyle='#f6f8fa';d.fillRect(0,542,1024,34);text('DESIGN    /    PRECISION ASSISTANT',18,563,11,'#597181');text('LOCAL WORKSPACE     •     PERSPECTIVE',726,563,10,'#597181');
    }else{
      d.fillStyle='#141e28';d.fillRect(0,0,1024,576);d.fillStyle='#21303d';d.fillRect(0,0,1024,35);text('PSOP   /   CONTROL WORKSPACE',18,24,13,'#c6d2d8');
      d.fillStyle='#192632';d.fillRect(0,36,179,540);text('EXPLORER',18,64,10,'#7f97aa');
      ['⌄  precision-assistant','   ⌄  src','      control.ts','      kinematics.ts','      trajectory.ts','   ⌄  config','      workspace.json'].forEach((t,i)=>text(t,16,95+i*24,11,i===2?'#b5d8db':'#8ea5b7'));
      d.fillStyle='#20303c';d.fillRect(180,36,844,34);text('control.ts    ×',199,58,12,'#c1d3dd');text('kinematics.ts',360,58,12,'#7e96a8');
      const code=[['import','#b097cd',' { Robot, Trajectory } from "./kinematics";'],['','',''],['const','#b097cd',' workspace = Robot.create({'],['  frame:','#8fb8c9',' "research-bench",'],['  units:','#8fb8c9',' "millimetres",'],['  joints:','#8fb8c9',' ["J1", "J2", "J3", "J4", "J5", "J6"],'],['});','#a7b9c8',''],['','',''],['function','#b097cd',' previewPath(target: Pose) {'],['  const','#b097cd',' solution = workspace.inverse(target);'],['  return','#b097cd',' Trajectory.from(solution).sample({'],['    interpolation:','#8fb8c9',' "quintic",'],['    reference:','#8fb8c9',' workspace.frame'],['  });','#a7b9c8',''],['}','#a7b9c8','']];
      code.forEach(([prefix,color,suffix],i)=>{text(String(i+1).padStart(2,' '),195,96+i*23,11,'#4c6376');text(prefix,231,96+i*23,12,color);d.font='12px Segoe UI';text(suffix,231+d.measureText(prefix).width,96+i*23,12,'#9fbcad');});
      d.fillStyle='#101a23';d.fillRect(180,459,844,91);text('TERMINAL    OUTPUT    PROBLEMS',199,480,10,'#9ab0c0');text('> workspace ready',204,505,12,'#82b4a1');text('> trajectory preview  /  local development',204,528,12,'#8da5b7');
      d.fillStyle='#2c4c5b';d.fillRect(0,551,1024,25);text('main     TypeScript     UTF-8',16,568,10,'#c1d4dd');text('LOCAL WORKSPACE',889,568,10,'#c1d4dd');
    }
    const m=unlit({map:texture(c),color:'#b9c6ca',toneMapped:false});m.name=kind?'32-inch development display':'32-inch CAD display';return m;
  }
  function monitor(a:number,kind:number,yaw:number){
    local(a,.21,top, yaw,()=>{
      block(.226,.173,.007,aluminium,0,.014,.0075,.004);
      block(.216,.163,.002,rubber,0,.014,.003,.003);
      block(.033,.032,.223,aluminium,0,.043,.124,.005);
      block(.021,.009,.07,inset,0,.06,.14,.002);
      cylinder(.018,.035,aluminium,0,.033,.245,'y');
      local(0,0,.36,0,()=>{
        block(.72,.022,.415,black,0,0,0,.005);
        block(.614,.014,.3,black,0,.016,-.01,.009);
        const screen=mesh(new THREE.PlaneGeometry(.708,.398),displayMap(kind),0,-.0116,.001,'32 英寸窄边框显示器');screen.rotation.x=Math.PI/2;screen.castShadow=false;
        block(.062,.0007,.002,aluminium,0,-.012,-.203,.0003);
        cylinder(.0009,.0007,indicator,.317,-.012,-.201,'y',12);
        for(let n=0;n<30;n++)block(.004,.001,.013,inset,-.2+n*.014,.0235,.137,.0005);
        for(const u of [-.08,-.025,.028])block(.024,.005,.008,inset,u,.026,-.113,.0005);
        for(const u of [-.05,.05])for(const z of [-.05,.05])cylinder(.003,.002,aluminium,u,.025,z,'y',8);
      },-.055);
    });
    cable([[a,.25,top+.259],[a+.025,.28,top+.15],[a+.04,.31,top+.02],[a+.06,.315,top-.06]]);
  }
  monitor(-.25,0,-.055);monitor(.49,1,.055);

  // A full-size workstation: separate panels, visible cooling, GPU, board and wiring.
  local(-.894,-.025,top,0,()=>{
    const w=.238,h=.493,d=.446,side=w/2;
    block(w,d,.006,black,0,0,.019,.003);block(w,d,.009,black,0,0,h-.0045,.003);
    block(.004,d,h-.025,black,-side+.002,0,h/2+.007,.001);
    for(const a of [-side+.008,side-.008])for(const b of [-d/2+.008,d/2-.008])block(.012,.012,h-.026,black,a,b,h/2+.007,.002);
    block(w-.012,d-.014,.094,black,0,0,.069,.003);
    for(const a of [-.083,.083])for(const b of [-.171,.171])block(.036,.044,.014,rubber,a,b,.007,.003);
    const board=material({color:'#233c3b',metalness:.24,roughness:.64}),fin=material({color:'#59646b',metalness:.82,roughness:.38});
    block(.004,.32,.327,board,-.086,.027,.292,.001);
    block(.028,.072,.046,fin,-.067,.149,.397,.0015);
    for(let n=0;n<7;n++)block(.031,.0025,.04,inset,-.064,.121+n*.008,.397,.0004);
    block(.025,.052,.024,fin,-.069,-.052,.422,.001);
    for(let n=0;n<6;n++)cylinder(.003,.007,aluminium,-.073,-.036+n*.013,.277,'x',16);
    block(.014,.058,.041,black,-.075,.105,.178,.001);
    for(let n=0;n<3;n++)block(.012,.047,.003,aluminium,-.068,-.083+n*.027,.302,.0007);
    const fan=(a:number,b:number,z:number,axis:'x'|'y'|'z',radius=.053)=>{
      const ring=mesh(new THREE.TorusGeometry(radius,.0021,8,48),fin,a,b,z,'散热风扇框');
      if(axis==='x')ring.rotation.y=Math.PI/2;else if(axis==='y')ring.rotation.x=Math.PI/2;
      cylinder(radius*.91,.012,inset,a,b,z,axis);
      for(let n=0;n<9;n++){
        const theta=n*Math.PI*2/9,blade=mesh(new THREE.SphereGeometry(1,10,6),black,0,0,0);
        blade.scale.set(radius*.48,radius*.19,.0012);blade.rotation.z=theta+.54;
        const p=new THREE.Vector3(Math.cos(theta)*radius*.53,Math.sin(theta)*radius*.53,.007),q=new THREE.Quaternion();
        if(axis==='x')q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);else if(axis==='y')q.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
        blade.position.copy(p.applyQuaternion(q)).add(new THREE.Vector3(a,b,z));blade.quaternion.premultiply(q);
      }
      cylinder(radius*.2,.017,fin,a,b,z,axis,28);
    };
    for(const z of [.17,.302,.434])fan(0,-.207,z,'y');
    // Slotted front grille; its gaps reveal the three 120mm intake fans.
    for(let n=0;n<33;n++)block(w-.025,.003,.0023,black,0,-.222,.123+n*.0107,.0007);
    for(const a of [-.086,.086])block(.003,.004,.36,aluminium,a,-.224,.299,.0007);
    block(.165,.027,.009,black,0,-.219,.077,.001);
    const badge=document.createElement('canvas');badge.width=512;badge.height=96;const bd=badge.getContext('2d')!;
    bd.fillStyle='#9baeb4';bd.font='500 44px Segoe UI';bd.textAlign='center';bd.fillText('W O R K S T A T I O N',256,63);
    const mark=decal(badge,.152,.028,0,-.223,.074);mark.rotation.x=Math.PI/2;
    cylinder(.007,.002,aluminium,.075,-.16,h+.001,'z',32);cylinder(.004,.0025,indicator,.075,-.16,h+.002);
    for(const a of [-.065,-.022]){block(.021,.009,.001,inset,a,-.16,h+.0005,.001);block(.014,.003,.001,aluminium,a,-.16,h+.001,.0003);}
    cylinder(.003,.001,inset,.022,-.16,h+.001);
    block(.183,.316,.018,fin,.008,.027,.451,.001);
    for(let n=0;n<33;n++)block(.173,.002,.014,inset,.008,-.123+n*.0094,.452,.0003);
    for(const b of [-.09,.064])fan(.013,b,h-.019,'z',.059);
    for(let n=0;n<21;n++)block(.148,.002,.0014,black,.011,-.122+n*.012,h+.0007,.0003);
    block(.139,.295,.047,fin,.008,-.006,.221,.003);
    for(let n=0;n<29;n++)block(.003,.277,.03,inset,-.057+n*.0046,-.006,.223,.0003);
    block(.004,.271,.052,black,.081,-.006,.226,.001);
    block(.004,.215,.0025,indicator,.083,-.006,.242,.0005);
    block(.13,.27,.003,black,.005,-.006,.249,.001);
    cylinder(.028,.038,black,-.06,.047,.359,'x');cylinder(.02,.002,aluminium,-.04,.047,.359,'x');
    const pumpRing=mesh(new THREE.TorusGeometry(.017,.0013,8,40),indicator,-.038,.047,.359);pumpRing.rotation.y=Math.PI/2;
    for(const b of [.102,.12]){block(.019,.008,.102,black,-.063,b,.355,.001);block(.004,.008,.083,aluminium,-.051,b,.355,.0007);}
    cable([[-.035,.058,.381],[.01,.067,.423],[.018,.117,.447],[-.008,.143,.462]],.004);
    cable([[-.035,.036,.381],[.027,.044,.422],[.036,.108,.452],[.008,.143,.462]],.004);
    for(let n=0;n<4;n++)cable([[.065,-.113+n*.006,.233],[.085,-.11+n*.006,.19],[.07,-.06+n*.006,.145],[.01,.05,.112]],.0018);
    block(w-.018,.004,h-.023,black,0,d/2-.002,h/2+.005,.001);
    for(let n=0;n<7;n++)block(.143,.0015,.004,inset,.012,d/2+.0005,.154+n*.013,.0005);
    // The glass remains transparent and outside opaque static batches.
    const glass=material({color:'#a8bfca',transparent:true,opacity:.18,depthWrite:false,roughness:.16,metalness:.08,side:THREE.DoubleSide});glass.name='工作站钢化玻璃侧板';
    const window=mesh(new THREE.PlaneGeometry(d-.026,h-.035),glass,side+.0005,0,h/2+.007,'主机玻璃侧板');window.rotation.set(Math.PI/2,0,Math.PI/2,'ZXY');window.castShadow=false;
    for(const b of [-.201,.201])for(const z of [.046,h-.028])cylinder(.0036,.003,aluminium,side+.002,b,z,'x',8);
  });
  cable([[-.875,.197,top+.07],[-.86,.282,top+.05],[-.57,.32,top+.006],[-.27,.32,top-.074]]);

  // A compact mechanical keyboard and sculpted mouse on a stitched desk pad.
  const pad=material({color:'#29383c',roughness:.91,metalness:0});
  block(.737,.269,.0025,pad,.196,-.218,top+.00125,.008);
  const seamPath=[[-.164,-.333,top+.0028],[-.154,-.343,top+.0028],[.546,-.343,top+.0028],[.556,-.333,top+.0028],[.556,-.103,top+.0028],[.546,-.093,top+.0028],[-.154,-.093,top+.0028],[-.164,-.103,top+.0028]].map(p=>new THREE.Vector3(...p));
  const seam=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPath,true,'catmullrom',.05),128,.00045,5,true),keycap);
  seam.name='桌垫缝线';
  local(.045,-.206,top+.0025,0,()=>{
    block(.338,.121,.014,aluminium,0,0,.007,.004);
    block(.332,.115,.004,inset,0,0,.015,.003);
    for(let row=0;row<5;row++)for(let col=0;col<18;col++){
      if(row===4&&col>=5&&col<=11)continue;
      block(.0157,.0164,.006,row===0?black:keycap,-.155+col*.0182,.043-row*.0196,.0205,.0017);
    }
    block(.125,.0164,.006,keycap,-.0094,-.0354,.0205,.002);
    const legends=document.createElement('canvas');legends.width=1536;legends.height=560;const kd=legends.getContext('2d')!;
    kd.fillStyle='#b5c0c3';kd.font='34px Segoe UI';kd.textAlign='center';kd.textBaseline='middle';
    const rows=['1234567890−=⌫     ','QWERTYUIOP[]    ↑ ','ASDFGHJKL;        ','ZXCVBNM,./      ←↓→','Ctrl                 '];
    rows.forEach((row,i)=>[...row].forEach((ch,j)=>{if(i===4&&j>3)return;kd.fillText(ch,(.169-.155+j*.0182)/.338*1536,(.0605-.043+i*.0196)/.121*560);}));
    decal(legends,.338,.121,0,0,.02365);
    cylinder(.0008,.0007,indicator,.145,.049,.024,'z',12);
  });
  local(.424,-.206,top+.0025,-.08,()=>{
    const body=mesh(new THREE.SphereGeometry(1,36,24),keycap,0,0,.014,'人体工学无线鼠标');body.scale.set(.028,.048,.015);
    block(.0008,.045,.0012,inset,0,.019,.028,.0003);
    block(.038,.001,.0012,inset,0,.005,.028,.0003);
    cylinder(.0045,.008,inset,0,.025,.028,'x',24);
    for(let n=0;n<6;n++)block(.0006,.003,.0007,aluminium,-.003+n*.0012,.025,.032,.0002);
  });
  // A closed notebook and metal pen give the remaining area a writing purpose.
  local(-.429,-.225,top,.08,()=>{
    block(.16,.209,.014,paper,0,0,.008,.002);
    for(const z of [.001,.016])block(.166,.215,.002,black,0,0,z,.002);
    block(.005,.215,.016,black,-.08,0,.008,.001);
    block(.006,.216,.018,rubber,.061,0,.009,.0008);
    const pen=cylinder(.0035,.137,aluminium,.104,0,.004,'y',24);pen.rotation.z=-.07;
    block(.0015,.026,.001,black,.104,.044,.007,.0003);
  });

  // Rear edge C-clamp: upper pad, lower jaw, pressure screw, handle and lamp socket.
  const mount={x:.935,y:depth/2+.017,z:top+.017,yaw:Math.PI-.22};
  block(.036,.014,.086,black,mount.x,depth/2+.024,top-.013,.002);
  block(.036,.078,.01,aluminium,mount.x,depth/2-.007,top+.007,.002);
  block(.034,.049,.002,rubber,mount.x,depth/2-.012,top+.001,.0005);
  block(.036,.075,.01,aluminium,mount.x,depth/2-.007,top-.05,.002);
  cylinder(.004,.062,aluminium,mount.x,depth/2-.029,top-.063);
  cylinder(.012,.004,rubber,mount.x,depth/2-.029,top-.037);
  cylinder(.008,.011,black,mount.x,depth/2-.029,top-.096);
  cylinder(.0025,.044,aluminium,mount.x,depth/2-.029,top-.102,'x',16);
  cylinder(.014,.04,aluminium,mount.x,mount.y,top+.029);

  for(const o of objects)o.position.add(new THREE.Vector3(x,y,floorZ));
  return {lampMount:{x:x+mount.x,y:y+mount.y,z:floorZ+mount.z,yaw:mount.yaw},lampTarget:new THREE.Vector3(x+.78,y-.24,floorZ+top+.003)};
}
