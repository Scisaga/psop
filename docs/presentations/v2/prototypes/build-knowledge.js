/* PSOP Microduck object decomposition and links to fixed official source facts. */
(async () => {
  const host = document.querySelector('.stage3d[data-mode="build"]');
  if (!host) return;
  await window.psopMicroduckModel.ready;
  const T = window.THREE;
  const source = 'https://github.com/pollen-robotics/microduck/blob/4861141fdc7c7acd253671acf5abdd55b77b779e/';
  const features = {
    'MD-01': {name:'Microduck 整机',short:'设备 MD-01',detail:'alpha 配置 / 任务对象',position:[35,60],
      params:[['设备类型','小型双足机器人'],['计算平台','Radxa Zero 3W'],['电池','NP-F550'],['任务版本','Rev.A']],
      relations:[['包含','头部、躯干与双腿'],['使用','官方 alpha 软件配置']],
      evidence:'官方设备资料',source:source+'docs/design/robotd-design.md',review:'设备版本需与具体实机核对',anchor:[0,102,25]},
    'HEAD-01': {name:'头部与相机观察',short:'头部 / 观察',detail:'图像只提供定位线索',position:[35,27],
      params:[['外形','头部、镜头与喙'],['图像用途','关联设备与目标关节'],['来源范围','官方外观参考'],['视觉结论','不能证明通信恢复']],
      relations:[['提供','目标定位与观察上下文'],['需结合','软件状态与复检记录']],
      evidence:'官方外观与设备资料',source:'https://pollen-robotics.com/microduck/press-kit/',review:'来源模型参考不能确认内部硬件或检测结果',anchor:[-12,180,40]},
    'J01': {name:'目标关节：左髋偏航',short:'目标关节 J01',detail:'left_hip_yaw / ID 20',position:[65,45],
      params:[['任务局部标识','J01'],['官方关节名称','left_hip_yaw'],['舵机总线 ID','20'],['软件数组索引','0']],
      relations:[['对应于','官方 alpha 关节配置'],['要求','身份识别与复检证据']],
      evidence:'官方 model.rs / 固定提交',source:source+'duck-control/src/model.rs',review:'J01 为教学标识；walk 的 left_hip_yaw 区域不证明 alpha 实机与 ID 20 已对应',anchor:[-24,76,19]},
    'JOINTS-01': {name:'关节系统与通信',short:'关节 / 通信',detail:'15 个 XL330 系列舵机',position:[65,79],
      params:[['物理关节','15 个（包含喙）'],['舵机系列','Dynamixel XL330'],['通信接口','/dev/ttyS2'],['总线速率','1 Mbps']],
      relations:[['使用','官方 alpha 总线配置'],['需核验','固件兼容性与通信反馈']],
      evidence:'官方 bus.rs / robotd.toml',source:source+'duck-control/src/bus.rs',review:'软件识别或默认姿态不等于机械零位标定',anchor:[24,41,29]}
  };
  const knowledge = [
    {id:'appearance',owner:'HEAD-01',name:'官方外观参考',detail:'头部 / 镜头 / 喙',position:[13,26],relation:'参考'},
    {id:'observation',owner:'HEAD-01',name:'观察与验证',detail:'图像不能替代复检',position:[13,43],relation:'需结合',review:true},
    {id:'platform',owner:'MD-01',name:'alpha 硬件配置',detail:'主控 / 电池 / 总线',position:[13,64],relation:'采用'},
    {id:'version',owner:'MD-01',name:'版本与实机核对',detail:'来源记录 → 设备对象',position:[13,81],relation:'需核对',review:true},
    {id:'identity',owner:'J01',name:'left_hip_yaw / ID 20',detail:'官方软件关节表',position:[87,27],relation:'对应'},
    {id:'recheck',owner:'J01',name:'识别与复检记录',detail:'S03 / 证据仍待补齐',position:[87,44],relation:'要求',review:true},
    {id:'bus',owner:'JOINTS-01',name:'15 个 XL330 系列',detail:'官方 alpha 总线实现',position:[87,65],relation:'使用'},
    {id:'calibration',owner:'JOINTS-01',name:'实机零位与限位',detail:'软件初始化不能证明',position:[87,82],relation:'另需验证',review:true}
  ];
  const state = { selected: 'MD-01', exploded: true, section: false, revision: 0 };
  const events = [];
  const scene = new T.Scene();
  scene.background = new T.Color('#eef3f7');
  const camera = new T.PerspectiveCamera(32, 1, 1, 2500);
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.prepend(renderer.domElement);
  scene.add(new T.HemisphereLight('#ffffff', '#8094a5', 1.3));
  const light = new T.DirectionalLight('#fffaf0', 2.1);
  light.position.set(90, 240, 130); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240 });
  light.shadow.normalBias = .5; scene.add(light);
  const fill = new T.DirectionalLight('#c8eaff', 1.05); fill.position.set(-110, 150, -80); scene.add(fill);
  const ground = new T.Mesh(new T.PlaneGeometry(1400, 1400), new T.MeshStandardMaterial({ color: '#eef3f7', roughness: .95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2; ground.receiveShadow = true; scene.add(ground);
  const grid = new T.GridHelper(350, 14, '#b1c8d6', '#cedbe4');
  grid.position.y = -1.9; grid.material.transparent = true; grid.material.opacity = .36; scene.add(grid);
  const assembly = new T.Group(); scene.add(assembly);
  let selectable = [];
  const initialView = { az: .34, el: .19, distance: 770 };
  let view = { ...initialView };
  const featureNodes = new Map();
  const knowledgeNodes = new Map();
  const links = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  links.classList.add('knowledge-links'); links.setAttribute('aria-hidden', 'true'); host.append(links);
  function node(name, detail, position, owner, kind, review = false) {
    const el = document.createElement('button');
    el.className = 'knowledge-node ' + kind + (review ? ' needs-review' : '');
    el.style.left = position[0] + '%'; el.style.top = position[1] + '%';
    el.dataset.owner = owner; el.dataset.select = owner;
    el.innerHTML = '<i></i><div><b>' + name + '</b><small>' + detail + '</small></div>';
    el.setAttribute('aria-label', name + '，查看' + features[owner].name + '的关联知识');
    host.append(el); return el;
  }
  Object.entries(features).forEach(([id, f]) => featureNodes.set(id, node(f.short, f.detail, f.position, id, 'feature-node')));
  knowledge.forEach(k => knowledgeNodes.set(k.id, node(k.name, k.detail, k.position, k.owner, 'context-node', k.review)));
  function rebuild() {
    assembly.children.slice().forEach(child => {
      child.traverse(o => { if(o.geometry&&!o.geometry.userData.shared)o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
      assembly.remove(child);
    });
    const model = window.psopMicroduckModel.createModel({selected:state.selected,exploded:state.exploded});
    assembly.add(model.group);selectable=model.selectable;
    Object.entries(model.anchors).forEach(([id,anchor])=>features[id].anchor=anchor);
    renderer.localClippingEnabled=state.section;
    if(state.section)selectable.forEach(mesh=>{mesh.material.clippingPlanes=[new T.Plane(new T.Vector3(1,0,0),0)];mesh.material.clipShadows=true;});
    sync();render();
  }
  function sync() {
    const f = features[state.selected];
    document.querySelectorAll('[data-select]').forEach(el => {
      el.classList.toggle('selected', el.dataset.select === state.selected);
      if (el.classList.contains('knowledge-node')) el.setAttribute('aria-pressed', String(el.dataset.select === state.selected));
    });
    document.querySelector('#selected-feature').textContent = state.selected;
    document.querySelector('#feature-title').textContent = f.name;
    f.params.forEach(([label, value], i) => {
      document.querySelector('[data-feature-label="' + i + '"]').textContent = label;
      document.querySelector('[data-feature-value="' + i + '"]').textContent = value;
    });
    document.querySelector('#feature-relations').innerHTML = f.relations.map(([r, target]) => '<div><span>' + r + '</span><b>' + target + '</b></div>').join('');
    document.querySelector('#feature-review').textContent = f.review;
    document.querySelector('#feature-evidence').innerHTML = '<a href="'+f.source+'" target="_blank" rel="noreferrer">'+f.evidence+'</a><small>官方固定版本 / 本地知识包整理</small>';
    document.querySelector('#knowledge-object').textContent = f.name;
    document.querySelector('#knowledge-relations').textContent = f.relations.map(r => r[0]).join(' · ');
    document.querySelector('#knowledge-evidence').textContent = f.evidence;
    document.querySelector('[data-act="explode"]').classList.toggle('active', state.exploded);
    document.querySelector('[data-act="section"]').classList.toggle('active', state.section);
    host.dataset.ready = 'true';
  }
  function localRect(el) {
    const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    return { x: r.x - h.x, y: r.y - h.y, w: r.width, h: r.height, cx: r.x - h.x + r.width / 2, cy: r.y - h.y + r.height / 2 };
  }
  function graph(w, h) {
    links.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    let svg = '<defs>' + [['blue', '#208aaa'], ['amber', '#b7893b'], ['purple', '#aaa5c7']].map(([id, color]) =>
      '<marker id="knowledge-arrow-' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L7 4L1 7" fill="none" stroke="' + color + '" stroke-width="1.3"/></marker>').join('') + '</defs>';
    Object.entries(features).forEach(([id, f]) => {
      const p = new T.Vector3(...f.anchor);
      p.project(camera);
      const x = (p.x * .5 + .5) * w, y = (-p.y * .5 + .5) * h, r = localRect(featureNodes.get(id));
      const endX = r.cx + (x < r.cx ? -r.w / 2 : r.w / 2);
      const active = id === state.selected, color = active ? '#208aaa' : '#6f9aae';
      svg += '<path class="geometry-link" d="M' + x + ' ' + y + 'L' + endX + ' ' + r.cy + '" stroke="' + color + '" opacity="' + (active ? .95 : .52) + '"/>';
      svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (active ? 4 : 2.5) + '" fill="' + color + '" stroke="#f4f9fc" stroke-width="1.5"/>';
    });
    knowledge.forEach(k => {
      const a = localRect(featureNodes.get(k.owner)), b = localRect(knowledgeNodes.get(k.id));
      const direction = b.cx < a.cx ? -1 : 1;
      const ax = a.cx + direction * a.w / 2, bx = b.cx - direction * b.w / 2, mx = (ax + bx) / 2;
      const active = k.owner === state.selected, color = active ? (k.review ? '#b7893b' : '#208aaa') : '#aaa5c7';
      svg += '<path class="semantic-link" d="M' + ax + ' ' + a.cy + 'C' + mx + ' ' + a.cy + ' ' + mx + ' ' + b.cy + ' ' + bx + ' ' + b.cy + '" stroke="' + color + '" opacity="' + (active ? .95 : .7) + '" marker-end="url(#knowledge-arrow-' + (active ? (k.review ? 'amber' : 'blue') : 'purple') + ')"/>';
      const labelY = (a.cy + b.cy) / 2, labelW = k.relation.length * 10.5 + 10;
      svg += '<rect x="' + (mx - labelW / 2) + '" y="' + (labelY - 8) + '" width="' + labelW + '" height="16" rx="4" fill="#eef3f7"/>';
      svg += '<text x="' + mx + '" y="' + (labelY + 3.5) + '" text-anchor="middle" fill="' + (active ? color : '#8e8ba8') + '">' + k.relation + '</text>';
    });
    links.innerHTML = svg;
  }
  function render() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.position.set(Math.sin(view.az) * Math.cos(view.el) * view.distance, 153 + Math.sin(view.el) * view.distance, Math.cos(view.az) * Math.cos(view.el) * view.distance);
    camera.lookAt(0, 153, 0); camera.updateProjectionMatrix(); renderer.render(scene, camera); graph(w, h);
  }
  function log(action) { events.push({ seq: ++state.revision, action, feature: state.selected, exploded: state.exploded }); }
  function selectFeature(id) { if (!features[id]) return; state.selected = id; log('选择 ' + id); rebuild(); }
  function action(name) {
    if (name === 'explode') state.exploded = !state.exploded;
    else if (name === 'section') state.section = !state.section;
    else if (name === 'orbit') view.az += .3;
    else if (name === 'reset') { state.exploded = true; state.section = false; state.selected = 'MD-01'; view = { ...initialView }; }
    log(name); rebuild();
  }
  document.querySelectorAll('[data-select]').forEach(el => el.addEventListener('click', () => selectFeature(el.dataset.select)));
  document.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => action(el.dataset.act)));
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: view.az, el: view.el }; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (!drag) return; view.az = drag.az - (e.clientX - drag.x) * .005; view.el = Math.max(.2, Math.min(1.2, drag.el + (e.clientY - drag.y) * .004)); render(); });
  renderer.domElement.addEventListener('pointerup', e => {
    if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) {
      const r = renderer.domElement.getBoundingClientRect(), ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2((e.clientX - r.x) / r.width * 2 - 1, -(e.clientY - r.y) / r.height * 2 + 1), camera);
      const hits = ray.intersectObjects(selectable); if (hits[0]) selectFeature(hits[0].object.userData.id);
    }
    drag = null;
  });
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); view.distance = Math.max(400, Math.min(780, view.distance + e.deltaY * .15)); render(); }, { passive: false });
  window.psopSandbox = { state, events, action, selectFeature, render, scene, renderer };
  window.addEventListener('resize', render); rebuild(); window.psop3DReady = true;
})();
