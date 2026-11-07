import fs from 'node:fs';import {chromium} from '../../../apps/workbench/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:320,height:240}});await page.goto('http://127.0.0.1:8791/');
const records=await page.evaluate(async()=>{
 const THREE=await import('/node_modules/.vite/deps/three.js');
 const {geometryBoundaryMaterial,GEOMETRY_BOUNDARY_DEPTH_BIAS_M}=await import('/src/geometry-overlay-material.ts');
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(320,240);renderer.setClearColor('#ffffff');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,4/3,.001,20);camera.lookAt(0,0,-1);
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({color:'#555555'}));scene.add(plane);
 const records=[];
 for(const distance of [.035,.3,2])for(const separationM of [0,.000001,.000003,.0001,.001])for(const mode of ['source-depth','bounded-bias','no-depth']){
   plane.position.z=-distance;
   const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-distance*.1,0,-distance-separationM),new THREE.Vector3(distance*.1,0,-distance-separationM)]);
   let m=new THREE.LineBasicMaterial({color:'#ff0000',depthTest:mode!=='no-depth',depthWrite:false});if(mode==='bounded-bias')m=geometryBoundaryMaterial(m);
   const line=new THREE.Line(g,m);scene.add(line);renderer.render(scene,camera);const gl=renderer.getContext(),rgba=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,rgba);let redPixels=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]>150&&rgba[i]>rgba[i+1]*2&&rgba[i]>rgba[i+2]*2)redPixels++;
   records.push({distanceM:distance,separationM,mode,redPixels,depthTest:m.depthTest,depthWrite:m.depthWrite,declaredBoundM:GEOMETRY_BOUNDARY_DEPTH_BIAS_M,depthBits:gl.getParameter(gl.DEPTH_BITS),depthQuantizationM:distance*distance*(20-.001)/(20*.001*(2**gl.getParameter(gl.DEPTH_BITS)-1))});scene.remove(line);g.dispose();m.dispose();
 }
 renderer.dispose();plane.geometry.dispose();plane.material.dispose();return records;
});await browser.close();
fs.writeFileSync('build/stability-review/geometry/depth-occlusion-check.json',JSON.stringify({records},null,2));
for(const r of records.filter(r=>r.mode==='bounded-bias'&&r.separationM>r.declaredBoundM+r.depthQuantizationM))if(r.redPixels)throw Error('Bias leaked beyond source depth precision: '+JSON.stringify(r));
for(const r of records.filter(r=>r.mode==='no-depth'&&r.separationM>=.0001))if(!r.redPixels)throw Error('The negative control did not expose hidden lines');
for(const r of records.filter(r=>r.mode==='bounded-bias'&&r.separationM<=.000001))if(!r.redPixels)throw Error('Bias did not retain the coplanar boundary');
fs.writeFileSync('build/stability-review/geometry/depth-occlusion-check.json',JSON.stringify({passed:true,records},null,2));console.log(JSON.stringify({passed:true,cases:records.length,noLeakageBeyondSourceDepthPrecision:true}));
