/* PSOP installation display: official source geometry with separate teaching transforms. */
(async () => {
 const host=document.querySelector('.stage3d[data-mode="simulate"]');if(!host)return;
 await window.psopMicroduckModel.ready;
 const T=window.THREE,scene=new T.Scene();scene.background=new T.Color('#101c29');
 const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;host.prepend(renderer.domElement);
 const camera=new T.PerspectiveCamera(32,1,1,2500),look=new T.Vector3(48,129,0);
 const initialView={az:.27,el:.17,dist:680};let view={...initialView};
 scene.add(new T.HemisphereLight('#edfaff','#5e788e',1.3));
 const key=new T.DirectionalLight('#fff4e5',2.25);key.position.set(100,300,170);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
 Object.assign(key.shadow.camera,{left:-280,right:280,top:280,bottom:-280});key.shadow.normalBias=.5;scene.add(key);
 const fill=new T.DirectionalLight('#c5eaff',1.25);fill.position.set(-140,170,-70);scene.add(fill);
 const ground=new T.Mesh(new T.PlaneGeometry(1500,1500),new T.MeshStandardMaterial({color:'#152638',roughness:.95}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-1;ground.receiveShadow=true;scene.add(ground);
 const grid=new T.GridHelper(660,33,'#32546b','#244153');grid.position.y=-.8;scene.add(grid);
 // A neutral display fixture supports the main body while the source hip/leg chain is separated.
 const support=new T.Mesh(new T.BoxGeometry(48,82,24),new T.MeshStandardMaterial({color:'#263f50',roughness:.95}));
 support.position.set(-12,40,-55);support.castShadow=support.receiveShadow=true;support.userData.id='DISPLAY-FIXTURE';scene.add(support);
 const assembly=new T.Group();scene.add(assembly);
 const steps={
  1:{name:'准备部件',action:'分离髋部与腿部组件',detail:'主体保持支撑，查看待安装的舵机与连接件。',status:'部件准备中'},
  2:{name:'对齐髋部支架',action:'抬升组件，对齐安装面',detail:'将组件移向提示的安装位置，对照连接面方向。',status:'安装面待对齐'},
  3:{name:'安装舵机与连接件',action:'沿安装方向靠拢组件',detail:'保持安装面对应，接近后再检查连接位置。',status:'组件靠拢中'},
  4:{name:'固定与连接',action:'固定后，再核对连接位置',detail:'图中展示靠拢后的固定位置；不代表固定已经验收。',status:'固定位置示意'},
  5:{name:'复检待完成',action:'提交身份与复检记录',detail:'核对部件身份、安装状态和工具反馈后，再推进任务。',status:'复检记录待补充'}
 };
 const state={device:'MD-01',task:'MD-SERVO-CHECK-01',taskRevision:'Rev.A',step:'S03',joint:'J01',stage:2,
  selected:'J01',branch:'baseline',exploded:false,highlight:false,playing:false,revision:0,
  identity:{present:false,reviewed:false,busId:20},recheck:{present:false,reviewed:false},guard:false,success:false};
 const events=[];let playback=null,selectable=[],anchors={},markers=[],model=null;
 const directionGuide=document.createElementNS('http://www.w3.org/2000/svg','svg');directionGuide.classList.add('installation-direction-guide');host.append(directionGuide);
 const previews=[...document.querySelectorAll('[data-preview]')].map(canvas=>{
  const mini=new T.WebGLRenderer({canvas,antialias:true});mini.setPixelRatio(1.5);mini.outputEncoding=T.sRGBEncoding;
  const world=new T.Scene();world.background=new T.Color('#162b3a');world.add(new T.HemisphereLight('#ffffff','#678194',1.4));
  const lamp=new T.DirectionalLight('#fff5e8',2);lamp.position.set(100,300,220);world.add(lamp);
  const cam=new T.OrthographicCamera(-220,220,160,-160,1,1500);cam.position.set(210,210,650);cam.lookAt(48,129,0);
  return{canvas,renderer:mini,scene:world,camera:cam,model:null};
 });
 function dispose(group){group.traverse(o=>{if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())});}
 function updatePreviews(){
  previews.forEach(preview=>{
   if(preview.model){preview.scene.remove(preview.model.group);dispose(preview.model.group);}
   const kind=preview.canvas.dataset.preview;
   const stage=Math.max(1,Math.min(5,state.stage+(kind==='before'?-1:kind==='after'?1:0)));
   preview.model=window.psopMicroduckModel.createModel({installationStage:stage,installationGuides:false,branch:kind==='current'?state.branch:'baseline'});preview.scene.add(preview.model.group);
   const w=preview.canvas.clientWidth,h=preview.canvas.clientHeight,aspect=w/h;
   preview.camera.left=-170*aspect;preview.camera.right=170*aspect;preview.camera.top=170;preview.camera.bottom=-170;preview.camera.updateProjectionMatrix();
   preview.renderer.setSize(w,h,false);preview.renderer.render(preview.scene,preview.camera);
   document.querySelector('[data-preview-label="'+kind+'"]').textContent=(kind==='before'?'前一步':kind==='after'?'下一步':'当前')+' / '+stage;
   preview.canvas.dataset.stage=stage;
  });
 }
 function log(action){events.push({seq:++state.revision,action,device:state.device,task:state.task,step:state.step,joint:state.joint,stage:state.stage,branch:state.branch,guard:state.guard});
  document.querySelector('#event-line').textContent=`#${state.revision}  最近操作：${action} · 步骤 ${state.stage} / ${steps[state.stage].name}`;}
 function marker(id,point,title,sub,kind='',offset=[0,0]){const el=document.createElement('button');el.className='model-marker '+kind;
  el.innerHTML=`<b>${title}</b><small>${sub}</small>`;el.onclick=()=>selectFeature(id);host.append(el);markers.push({el,point:new T.Vector3(...point),offset});}
 function rebuild(){
  assembly.children.slice().forEach(c=>{dispose(c);assembly.remove(c)});markers.forEach(m=>m.el.remove());markers=[];
  model=window.psopMicroduckModel.createModel({...state,installationStage:state.stage});assembly.add(model.group);selectable=model.selectable;anchors=model.anchors;
  if(state.stage<4){
   marker('J01',anchors.J01,steps[state.stage].name+' / 步骤 '+state.stage,steps[state.stage].status,'joint-mark',[35,-15]);
   marker('J01',model.targetAnchor,'安装位置 J01','对照提示方向靠拢','target-mark',[-205,-5]);
  }else marker('J01',anchors.J01,state.stage===4?'固定与连接 / 步骤 4':'复检待完成 / 步骤 5',state.stage===4?'固定位置示意，随后复检':'身份与复检记录仍待补充','joint-mark',[75,-10]);
  sync();render();updatePreviews();
 }
 function sync(){
  state.identity.present=false;state.identity.reviewed=false;state.recheck.present=false;state.recheck.reviewed=false;state.guard=false;state.success=false;
  document.querySelectorAll('[data-stage]').forEach(e=>e.textContent=state.stage);
  document.querySelectorAll('[data-select]').forEach(e=>e.classList.toggle('selected',e.dataset.select===state.selected));
  document.querySelectorAll('[data-stage-select]').forEach(e=>{const step=Number(e.dataset.stageSelect);e.classList.toggle('current',step===state.stage);e.classList.toggle('past',step<state.stage);e.setAttribute('aria-current',step===state.stage?'step':'false');});
  document.querySelector('[data-act="fork"]').disabled=state.stage<2||state.stage>3;
  document.querySelector('#identity-status').textContent='待核对';document.querySelector('#recheck-status').textContent=state.stage===5?'记录缺失，不能确认完成':'安装后提交检查记录';
  document.querySelector('#branch-label').textContent=state.branch==='baseline'?'A / 按安装方向靠拢':'B / 偏离后重新定位';
  document.querySelector('#selected-feature').textContent=state.selected;document.querySelector('#checkpoint-title').textContent='步骤 '+state.stage+' / 5';
  document.querySelector('#operation-title').textContent=steps[state.stage].name;document.querySelector('#operation-instruction').textContent=state.branch==='baseline'?steps[state.stage].action:'先重新定位，再靠拢安装面';
  document.querySelector('#operation-detail').textContent=state.branch==='baseline'?steps[state.stage].detail:'显示偏离安装方向的候选位置；调整后才能继续下一步。';
  document.querySelector('#stage-description').textContent=steps[state.stage].action;
  document.querySelector('#stage-slider').value=state.stage;document.querySelector('#sim-frame').textContent='STEP '+String(state.stage).padStart(2,'0')+' / 05';
  document.querySelector('#baseline-card').classList.toggle('active',state.branch==='baseline');document.querySelector('#candidate-card').classList.toggle('active',state.branch!=='baseline');
  for(const act of ['explode','highlight'])document.querySelector('[data-act="'+act+'"]').classList.toggle('active',state[act==='explode'?'exploded':'highlight']);
  document.querySelector('#view-mode').textContent=state.highlight?'安装面定位':'安装步骤示意';
  document.querySelector('#run-status').innerHTML='<i></i>'+ (state.playing?'PLAYING':'PAUSED');document.querySelector('.play-label').textContent=state.playing?'暂停':'播放步骤';host.dataset.ready='true';
  if(!events.length)document.querySelector('#event-line').textContent='#0  步骤 '+state.stage+' / '+steps[state.stage].name+' · '+steps[state.stage].action;
 }
 function render(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
  camera.position.set(look.x+Math.sin(view.az)*Math.cos(view.el)*view.dist,look.y+Math.sin(view.el)*view.dist,look.z+Math.cos(view.az)*Math.cos(view.el)*view.dist);camera.lookAt(look);camera.updateProjectionMatrix();renderer.render(scene,camera);
  directionGuide.setAttribute('viewBox','0 0 '+w+' '+h);
  if(state.stage<4 && model){
   const start=new T.Vector3(...anchors.J01).project(camera),end=new T.Vector3(...model.targetAnchor).project(camera);
   const a=[(start.x*.5+.5)*w,(-start.y*.5+.5)*h],b=[(end.x*.5+.5)*w,(-end.y*.5+.5)*h];
   directionGuide.innerHTML='<defs><marker id="install-direction-tip" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1L11 6L1 11Z" fill="#f0c269"/></marker></defs><line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="#f0c269" stroke-width="3" marker-end="url(#install-direction-tip)"/><circle cx="'+b[0]+'" cy="'+b[1]+'" r="5" fill="none" stroke="#76d8e8" stroke-width="2"/>';
   directionGuide.dataset.target=JSON.stringify(b);directionGuide.dataset.source=JSON.stringify(a);
  }else{directionGuide.innerHTML='';delete directionGuide.dataset.target;delete directionGuide.dataset.source;}
  markers.forEach(({el,point,offset})=>{const p=point.clone().project(camera),x=(p.x*.5+.5)*w+offset[0],y=(-p.y*.5+.5)*h+offset[1];el.style.left=Math.max(205,Math.min(w-180,x))+'px';el.style.top=Math.max(70,Math.min(h-75,y))+'px'});
 }
 function selectFeature(id){if(!anchors[id])return;state.selected=id;log('选择 '+id);sync();}
 function stopPlayback(){if(playback)clearInterval(playback);playback=null;state.playing=false;}
 function setStage(stage){const next=Math.max(1,Math.min(5,Math.round(Number(stage))));
  if(state.branch==='alignment_retry'&&next>3){stopPlayback();log('先重新定位，保持当前安装步骤');sync();return;}
  state.stage=next;if(next<2||next>3)state.branch='baseline';log('查看 '+steps[next].name);rebuild();}
 function action(name){
  if(name==='play'){if(state.playing){stopPlayback();log('暂停步骤播放');sync();return;}if(state.stage>=5)setStage(1);state.playing=true;log('播放安装步骤');sync();
   playback=setInterval(()=>{setStage(state.stage+1);if(state.stage>=5){stopPlayback();sync();}},1300);return;}
  stopPlayback();
  if(name==='reset'){Object.assign(state,{stage:2,selected:'J01',branch:'baseline',exploded:false,highlight:false});view={...initialView};}
  else if(name==='step'){setStage(state.stage+1);return;}
  else if(name==='replay'){setStage(state.stage-1);return;}
  else if(name==='explode')state.exploded=!state.exploded;
  else if(name==='highlight')state.highlight=!state.highlight;
  else if(name==='orbit')view.az+=.35;
  else if(name==='baseline')state.branch='baseline';
  else if(name==='fork'){if(state.stage<2||state.stage>3)return;state.branch='alignment_retry';}
  log({reset:'重置安装场景',explode:'组件展开',highlight:'定位安装面',orbit:'旋转视角',baseline:'返回安装方向',fork:'查看重新定位分支'}[name]||name);rebuild();
 }
 document.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>action(b.dataset.act));document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectFeature(b.dataset.select));
 document.querySelectorAll('[data-stage-select]').forEach(b=>b.onclick=()=>{stopPlayback();setStage(b.dataset.stageSelect)});
 document.querySelector('#stage-slider').addEventListener('input',e=>{stopPlayback();setStage(e.target.value)});
 let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,...view};renderer.domElement.setPointerCapture(e.pointerId)});
 renderer.domElement.addEventListener('pointermove',e=>{if(drag){view.az=drag.az-(e.clientX-drag.x)*.005;view.el=Math.max(.02,Math.min(1.2,drag.el+(e.clientY-drag.y)*.004));render()}});
 renderer.domElement.addEventListener('pointerup',e=>{if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5){const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(selectable)[0];if(hit)selectFeature(hit.object.userData.id)}drag=null});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();view.dist=Math.max(400,Math.min(850,view.dist+e.deltaY*.15));render()},{passive:false});
 window.psopSandbox={state,events,steps,setStage,action,selectFeature,render,scene,renderer,camera,getModel:()=>model};
 window.addEventListener('resize',()=>{render();updatePreviews()});rebuild();window.psop3DReady=true;
})();
