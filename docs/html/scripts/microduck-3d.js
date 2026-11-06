/* PSOP · exact Microduck walk-reference assembly, offline 3D inspection.
 * Geometry / source colours / qpos0 matrices are preserved. Only display offsets animate.
 * Asset attribution, licensing and checks: ../assets/3d/sources.json
 */
(() => {
  'use strict';
  const ownScript = document.currentScript;
  const assetBase = new URL('../assets/3d/', ownScript ? ownScript.src : location.href);
  const loads = new Map();
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const ease = t => t * t * (3 - 2 * t);
  function dependency(file, present) {
    if (present()) return Promise.resolve();
    if (loads.has(file)) return loads.get(file);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(file, assetBase).href;
      script.onload = () => present() ? resolve() : reject(new Error(`Missing local ${file}`));
      script.onerror = () => reject(new Error(`Cannot load local ${file}`));
      document.head.appendChild(script);
    });
    loads.set(file, promise);
    return promise;
  }

  // Distances use the original metre-based, +Z-up source coordinate system.
  // Separation is deliberately body-based: a coherent mechanical reference, not random scatter.
  function separation(item) {
    const body = item.body_path, name = item.mesh_name;
    if (body.includes('/jaw_soft')) {
      if (name === 'top_head_shell') return [0, 0, .126];
      if (name === 'bottom_head_shell') return [0, 0, .060];
      if (['lens', 'face_part', 'm12_lens_holder', 'noenoeil'].includes(name)) return [.043, 0, .092];
      return [0, 0, .092];
    }
    if (body.startsWith('trunk_base/neck')) return [0, 0, .032];
    if (body.startsWith('trunk_base/yaw2roll')) {
      return [0, .076, body.includes('/ankle_left') ? -.072 : -.025];
    }
    if (body.startsWith('trunk_base/bearing_roll')) {
      return [0, -.076, body.includes('/ankle_right') ? -.072 : -.025];
    }
    if (name === 'left_shell') return [0, .082, .009];
    if (name === 'right_shell') return [0, -.082, .009];
    return [0, 0, 0];
  }

  function init(options = {}) {
    const canvas = options.canvas || document.getElementById('microduck-canvas');
    const container = options.container || document.getElementById('microduck-viewer');
    if (!canvas || !container) return null;
    if (container._psop3d) return container._psop3d;
    const range = options.range || document.getElementById('explode-range');
    const toggle = options.toggle || document.getElementById('explode-toggle');
    const reset = options.reset || document.getElementById('model-reset');
    const loading = options.loading || document.getElementById('model-loading');
    const fallback = container.querySelector('[data-model-fallback], .model-fallback');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const small = matchMedia('(max-width: 760px)').matches;
    const state = {
      ready: false, fallback: false, visible: false, explosion: 0, target: 0,
      azimuth: .57, elevation: .13, drag: false, frames: 0, meshCount: 0,
      triangleCount: 0, sourceMatricesPreserved: false, active: false,
      reducedMotion: media.matches, manual: false, error: null,
      activeTime: 0, projectedBounds: null, renderedTriangles: 0, drawCalls: 0,
      renderer: null, softwareRenderer: false, pixelRatio: 1, antialias: !small
    };
    let T, renderer, scene, camera, models = [], guides, guidePositions;
    let initialized = false, starting = false, frame = 0, lastFrame = 0;
    let previousTime = 0, clock = 0, dirty = true, settleFrames = 0, autoPhase = 0;
    let viewHeight = .34, viewCenter = null, resizeObserver, intersectionObserver;
    const centerTarget = [0, 0, .16];
    const displacements = [];
    const listeners = [];
    function on(element, event, callback, settings) {
      if (!element) return;
      element.addEventListener(event, callback, settings);
      listeners.push(() => element.removeEventListener(event, callback, settings));
    }
    function notify() {
      container.dataset.explode = state.explosion.toFixed(3);
      if (range && document.activeElement !== range) range.value = String(Math.round(state.explosion * 100));
      if (toggle) {
        toggle.setAttribute('aria-pressed', state.target >= .5 ? 'true' : 'false');
        const label = toggle.querySelector('[data-explode-label]');
        if (label) label.textContent = state.target >= .5 ? '归位装配' : '拆解结构';
      }
      container.dispatchEvent(new CustomEvent('psop:3d-update', { detail: { amount: state.explosion, ready: state.ready } }));
    }
    function setAmount(amount, manual = true) {
      state.target = clamp(Number(amount) || 0, 0, 1);
      if (manual) { state.manual = true; autoPhase = -1; }
      dirty = true; settleFrames = state.reducedMotion ? 1 : 30;
      if (state.reducedMotion) state.explosion = state.target;
      if (state.fallback) {
        state.explosion = state.target;
        if (fallback && fallback.tagName === 'IMG') {
          const imageBase = new URL('../assets/', ownScript ? ownScript.src : location.href);
          fallback.src = new URL(state.explosion >= .5 ? 'microduck-exploded.webp' : 'microduck-assembled.webp', imageBase).href;
        }
      }
      notify(); wake();
    }
    function fail(error) {
      state.fallback = true; state.error = error ? String(error.message || error) : 'WebGL unavailable';
      canvas.hidden = true;
      container.classList.remove('is-loading'); container.classList.add('is-3d-fallback');
      container.setAttribute('aria-busy', 'false');
      if (fallback) { fallback.hidden = false; fallback.style.opacity = '1'; }
      if (loading) { loading.textContent = '滑动查看结构拆解'; loading.hidden = true; }
      container.dispatchEvent(new CustomEvent('psop:3d-fallback', { detail: { reason: state.error } }));
    }
    const api = {
      setExplode: amount => setAmount(amount, true),
      reset: () => {
        state.azimuth = .57; state.elevation = .13; state.drag = false;
        setAmount(0, true); dirty = true; wake();
      },
      getState: () => ({ ...state, source: window.psopMicroduckSource && window.psopMicroduckSource.meta }),
      destroy: () => {
        cancelAnimationFrame(frame); frame = 0;
        if (resizeObserver) resizeObserver.disconnect();
        if (intersectionObserver) intersectionObserver.disconnect();
        listeners.splice(0).forEach(remove => remove());
        if (renderer) renderer.dispose();
        if (scene) scene.traverse(object => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) object.material.dispose();
        });
        delete container._psop3d;
      }
    };
    container._psop3d = api;
    if (range) {
      range.min = '0'; range.max = '100'; range.step = '1';
      on(range, 'input', () => setAmount(Number(range.value) / 100, true));
    }
    on(toggle, 'click', () => setAmount(state.target >= .5 ? 0 : 1, true));
    on(reset, 'click', api.reset);
    on(canvas, 'dblclick', api.reset);
    on(document, 'visibilitychange', () => {
      previousTime = 0;
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; state.active = false; }
      else wake();
    });
    const motionChange = event => {
      state.reducedMotion = event.matches; clock = 0;
      if (event.matches) { state.target = 0; state.explosion = 0; autoPhase = -1; }
      dirty = true; wake();
    };
    if (media.addEventListener) on(media, 'change', motionChange);

    let pointer = null;
    canvas.style.touchAction = 'pan-y';
    on(canvas, 'pointerdown', event => {
      if (!state.ready || (event.pointerType === 'mouse' && event.button !== 0)) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      if (event.pointerType === 'mouse') canvas.setPointerCapture(event.pointerId);
    });
    on(canvas, 'pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.abs(dx) + Math.abs(dy) < 2 && !pointer.moved) return;
      if (event.pointerType !== 'mouse' && !pointer.moved && Math.abs(dy) > Math.abs(dx) * 1.3) { pointer = null; return; }
      pointer.moved = true; state.drag = true; state.manual = true; autoPhase = -1;
      state.azimuth -= dx * .006; state.elevation = clamp(state.elevation + dy * .004, -.13, .58);
      pointer.x = event.clientX; pointer.y = event.clientY;
      dirty = true; settleFrames = 10; wake();
    });
    const stopDrag = () => { pointer = null; state.drag = false; };
    on(canvas, 'pointerup', stopDrag); on(canvas, 'pointercancel', stopDrag); on(canvas, 'lostpointercapture', stopDrag);
    on(canvas, 'keydown', event => {
      if (event.key === 'Home') { event.preventDefault(); api.reset(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !state.ready) return;
      event.preventDefault(); state.manual = true; autoPhase = -1;
      if (event.key === 'ArrowLeft') state.azimuth -= .075;
      if (event.key === 'ArrowRight') state.azimuth += .075;
      if (event.key === 'ArrowUp') state.elevation = clamp(state.elevation + .04, -.13, .58);
      if (event.key === 'ArrowDown') state.elevation = clamp(state.elevation - .04, -.13, .58);
      dirty = true; settleFrames = state.reducedMotion ? 1 : 10; wake();
    });

    function wake() {
      if (!state.ready || !state.visible || document.hidden || frame) return;
      state.active = true;
      frame = requestAnimationFrame(renderFrame);
    }
    function resize() {
      if (!renderer) return;
      const box = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(box.width || container.clientWidth));
      const height = Math.max(1, Math.round(box.height || width));
      renderer.setSize(width, height, false);
      camera.userData.aspect = width / height;
      dirty = true; settleFrames = state.reducedMotion ? 1 : 20; wake();
    }
    function frameCamera(dt) {
      const bounds = new T.Box3();
      for (const mesh of models) {
        const itemBounds = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);
        bounds.union(itemBounds);
      }
      const center = bounds.getCenter(new T.Vector3());
      if (!viewCenter) viewCenter = center.clone();
      viewCenter.lerp(center, state.reducedMotion || state.frames === 0 ? 1 : 1 - Math.exp(-dt * 7));
      const azimuth = state.azimuth + (!state.manual && !state.reducedMotion ? Math.sin(clock * .28) * .025 : 0);
      const radius = 1.6, cosEl = Math.cos(state.elevation);
      camera.position.set(viewCenter.x + Math.cos(azimuth) * cosEl * radius,
        viewCenter.y + Math.sin(azimuth) * cosEl * radius,
        viewCenter.z + Math.sin(state.elevation) * radius);
      camera.lookAt(viewCenter); camera.updateMatrixWorld(true);
      const corners = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new T.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
      const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
      const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
      const aspect = camera.userData.aspect || 1;
      const goal = Math.max(height, width / aspect) * (small ? 1.22 : 1.18);
      // Expand immediately when needed; ease the inward movement to keep a generous, unclipped frame.
      viewHeight = state.reducedMotion || goal > viewHeight ? goal : viewHeight + (goal - viewHeight) * (1 - Math.exp(-dt * 7));
      camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
      camera.userData.modelBounds = bounds;
      state.projectedBounds = [Math.min(...xs) * 2 / (viewHeight * aspect), Math.min(...ys) * 2 / viewHeight,
        Math.max(...xs) * 2 / (viewHeight * aspect), Math.max(...ys) * 2 / viewHeight];
    }
    function animate(now) {
      if (state.reducedMotion || state.manual) return;
      // Let the complete robot establish its identity before a restrained demonstration.
      // The automatic view uses 88%; the manual range still reveals the complete 100% separation.
      if (clock < 4.2) state.target = 0;
      else {
        const cycle = (clock - 4.2) % 18.0;
        if (cycle < 4.7) { autoPhase = 1; state.target = .88 * ease(cycle / 4.7); }
        else if (cycle < 7.1) { autoPhase = 2; state.target = .88; }
        else if (cycle < 11.8) { autoPhase = 3; state.target = .88 * (1 - ease((cycle - 7.1) / 4.7)); }
        else { autoPhase = 0; state.target = 0; }
      }
    }
    function renderFrame(now) {
      frame = 0;
      if (!state.visible || document.hidden) { state.active = false; previousTime = 0; return; }
      const interval = small ? 1000 / 30 : 1000 / 50;
      if (now - lastFrame < interval) { frame = requestAnimationFrame(renderFrame); return; }
      lastFrame = now;
      const dt = previousTime ? Math.min((now - previousTime) / 1000, .065) : 1 / 30;
      previousTime = now; clock += dt; state.activeTime = clock;
      animate(now);
      const oldAmount = state.explosion;
      state.explosion += (state.target - state.explosion) * (state.reducedMotion ? 1 : 1 - Math.exp(-dt * 7.5));
      if (Math.abs(state.target - state.explosion) < .0005) state.explosion = state.target;
      const moving = Math.abs(oldAmount - state.explosion) > .000005;
      if (dirty || moving || (!state.manual && !state.reducedMotion) || settleFrames > 0) {
        for (let i = 0; i < models.length; i++) {
          const mesh = models[i], base = mesh.userData.sourceMatrix, offset = displacements[i];
          // Different parts start fractionally later; every part still reaches its exact defined offset.
          const rank = mesh.userData.separationRank;
          const progress = ease(clamp((state.explosion - rank * .075) / (1 - rank * .075), 0, 1));
          mesh.matrix.copy(base);
          mesh.matrix.elements[12] += offset[0] * progress;
          mesh.matrix.elements[13] += offset[1] * progress;
          mesh.matrix.elements[14] += offset[2] * progress;
          mesh.matrixWorldNeedsUpdate = true;
        }
        if (guides) {
          let at = 0;
          for (const mesh of models) {
            if (!mesh.userData.guide) continue;
            const origin = mesh.userData.sourceCenter;
            const moved = origin.clone().add(new T.Vector3(
              mesh.matrix.elements[12] - mesh.userData.sourceMatrix.elements[12],
              mesh.matrix.elements[13] - mesh.userData.sourceMatrix.elements[13],
              mesh.matrix.elements[14] - mesh.userData.sourceMatrix.elements[14]));
            guidePositions.set(origin.toArray(), at); at += 3; guidePositions.set(moved.toArray(), at); at += 3;
          }
          guides.geometry.attributes.position.needsUpdate = true;
          guides.material.opacity = Math.max(0, state.explosion - .15) * .13;
          guides.visible = state.explosion > .15;
        }
        frameCamera(dt); renderer.render(scene, camera); state.frames++;
        state.renderedTriangles = renderer.info.render.triangles; state.drawCalls = renderer.info.render.calls;
        dirty = false; settleFrames = Math.max(0, settleFrames - 1); notify();
      }
      if ((!state.manual && !state.reducedMotion) || moving || dirty || settleFrames > 0 || state.drag) wake();
      else state.active = false;
    }

    async function start() {
      if (initialized || starting) return;
      starting = true;
      container.setAttribute('aria-busy', 'true');
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) throw new Error('WebGL unavailable');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        state.renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
        state.softwareRenderer = /swiftshader|llvmpipe|softpipe|software|basic render|gdi generic/i.test(state.renderer);
        // The exact source geometry remains intact. Software rasterization trades only pixel density
        // and MSAA for responsiveness; real GPUs keep the full quality profile.
        state.pixelRatio = state.softwareRenderer ? (small ? .80 : .72) : Math.min(devicePixelRatio || 1, small ? 1.25 : 1.75);
        state.antialias = !small && !state.softwareRenderer;
        const extension = gl.getExtension('WEBGL_lose_context'); if (extension) extension.loseContext();
        await Promise.all([
          dependency('three.min.js', () => !!window.THREE),
          dependency('microduck-source.js', () => !!window.psopMicroduckSource)
        ]);
        T = window.THREE;
        const source = window.psopMicroduckSource;
        if (source.items.length !== 70 || Object.keys(source.meshes).length !== 38) throw new Error('Source assembly count mismatch');
        renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: state.antialias, powerPreference: 'low-power' });
        renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(state.pixelRatio);
        renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.14;
        scene = new T.Scene();
        scene.add(new T.HemisphereLight(0xf6f7f3, 0x64766d, 1.9));
        const key = new T.DirectionalLight(0xffedda, 2.75); key.position.set(1.0, -.3, 1.4); scene.add(key);
        const fill = new T.DirectionalLight(0xd2eaf1, 1.1); fill.position.set(.3, 1, .45); scene.add(fill);
        const rim = new T.DirectionalLight(0xc9eadf, 1.6); rim.position.set(-1, -.2, .6); scene.add(rim);
        camera = new T.OrthographicCamera(-.3, .3, .3, -.3, .02, 8); camera.up.set(0, 0, 1);
        const geometries = new Map();
        const entries = Object.entries(source.meshes);
        // Sequential decode yields between meshes so loading never locks the page for all 38 assets.
        for (let at = 0; at < entries.length; at++) {
          const [name, data] = entries[at];
          const packed = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
          const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
          const bytes = await new Response(stream).arrayBuffer(), n = data.vertexCount;
          const q = new Uint16Array(bytes, 0, n * 3), normalsQ = new Int16Array(bytes, n * 6, n * 3);
          const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
          for (let i = 0; i < n * 3; i++) {
            positions[i] = data.min[i % 3] + q[i] * data.step[i % 3]; normals[i] = normalsQ[i] / 32767;
          }
          const indices = data.indexBytes === 2 ? new Uint16Array(bytes, n * 12) : new Uint32Array(bytes, n * 12);
          const geometry = new T.BufferGeometry();
          geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
          geometry.setAttribute('normal', new T.BufferAttribute(normals, 3));
          geometry.setIndex(new T.BufferAttribute(indices, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          geometries.set(name, geometry);
          if (loading) loading.textContent = `正在展开设备结构 ${Math.round((at + 1) / entries.length * 100)}%`;
          if (at % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        for (const item of source.items) {
          const rgba = item.rgba;
          const material = new T.MeshStandardMaterial({
            color: new T.Color().setRGB(rgba[0], rgba[1], rgba[2], T.SRGBColorSpace),
            metalness: item.mesh_name.startsWith('seeed_bearing') ? .48 : item.mesh_name === 'lens' ? .25 : .08,
            roughness: item.mesh_name === 'lens' ? .20 : .41,
            transparent: rgba[3] < 1, opacity: rgba[3], side: T.DoubleSide
          });
          const mesh = new T.Mesh(geometries.get(item.mesh_name), material);
          const base = new T.Matrix4().set(...item.assembled_transform);
          mesh.matrixAutoUpdate = false; mesh.matrix.copy(base);
          const offset = separation(item), rank = item.body_path.includes('/jaw_soft') ? 0 : item.body_path.includes('/ankle') ? 2 : 1;
          const sourceCenter = mesh.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(base);
          mesh.userData = {
            sourceMatrix: base.clone(), sourceAssembledTransform: item.assembled_transform.slice(),
            sourceInstance: item.instance_id, sourceMesh: item.mesh_name, sourceBody: item.body_path,
            sourceDigest: item.source_digest, sourceCenter, separationRank: rank,
            guide: ['top_head_shell', 'left_shell', 'right_shell', 'foot_left', 'foot_right'].includes(item.mesh_name)
          };
          scene.add(mesh); models.push(mesh); displacements.push(offset);
          state.triangleCount += source.meshes[item.mesh_name].triangleCount;
        }
        const guideCount = models.filter(mesh => mesh.userData.guide).length;
        guidePositions = new Float32Array(guideCount * 6);
        const guideGeometry = new T.BufferGeometry(); guideGeometry.setAttribute('position', new T.BufferAttribute(guidePositions, 3));
        guides = new T.LineSegments(guideGeometry, new T.LineBasicMaterial({ color: 0x9cddc8, transparent: true, opacity: 0, depthWrite: false }));
        guides.frustumCulled = false; scene.add(guides);
        state.meshCount = models.length;
        state.sourceMatricesPreserved = models.every((mesh, i) => {
          const expected = new T.Matrix4().set(...source.items[i].assembled_transform);
          return mesh.matrix.elements.every((v, j) => v === expected.elements[j])
            && source.items[i].assembled_transform.every((v, j) => v === mesh.userData.sourceAssembledTransform[j]);
        });
        state.ready = true; initialized = true; canvas.hidden = false;
        container.classList.remove('is-loading'); container.classList.add('is-3d-ready'); container.setAttribute('aria-busy', 'false');
        if (fallback) { fallback.style.opacity = '0'; fallback.hidden = true; }
        if (loading) loading.hidden = true;
        if ('ResizeObserver' in window) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); }
        else on(window, 'resize', resize);
        resize(); dirty = true; wake();
        container.dispatchEvent(new CustomEvent('psop:3d-ready', { detail: { meshCount: models.length, sourceMatricesPreserved: state.sourceMatricesPreserved } }));
      } catch (error) { fail(error); }
    }
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          state.visible = entry.isIntersecting;
          if (state.visible) { start(); previousTime = 0; wake(); }
          else { cancelAnimationFrame(frame); frame = 0; previousTime = 0; state.active = false; }
        }
      }, { threshold: .04, rootMargin: '80px' });
      intersectionObserver.observe(container);
    } else { state.visible = true; start(); }
    return api;
  }
  window.PSOP3D = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
})();
