/* PSOP teaching demonstrations. No real equipment state is submitted here. */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const initialized = new WeakSet();
  const buttonLabels = new WeakMap();

  function labelButton(button, label) {
    let span = buttonLabels.get(button);
    if (!span) {
      span = document.createElement('span');
      span.dataset.demoLabel = '';
      const textNodes = Array.from(button.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
      const labelPosition = textNodes.find((node) => node.textContent.trim());
      if (labelPosition) button.insertBefore(span, labelPosition);
      else button.appendChild(span);
      textNodes.forEach((node) => node.remove());
      buttonLabels.set(button, span);
    }
    span.textContent = label;
  }

  function visibilityGate(element, onChange) {
    let inViewport = true;
    const notify = () => onChange(inViewport && !document.hidden);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        inViewport = entries[0].isIntersecting;
        notify();
      }, { threshold: 0 });
      observer.observe(element);
    }
    document.addEventListener('visibilitychange', notify);
    notify();
  }

  function initEG() {
    const container = document.getElementById('eg-demo');
    const svg = document.getElementById('eg-graph');
    if (!container || !svg || initialized.has(container)) return;
    initialized.add(container);

    const playButton = document.getElementById('eg-play');
    const resetButton = document.getElementById('eg-reset');
    const evidenceButton = document.getElementById('eg-evidence');
    const stateText = document.getElementById('eg-state');
    const detailText = document.getElementById('eg-detail');
    const stepText = document.getElementById('eg-step');
    const progress = document.getElementById('eg-progress');
    const nodes = new Map(Array.from(svg.querySelectorAll('[data-eg-node]'),
      (node) => [node.dataset.egNode, node]));
    const edges = new Map(Array.from(svg.querySelectorAll('path[data-eg-source][data-eg-target]'),
      (edge) => [`${edge.dataset.egSource}>${edge.dataset.egTarget}`, edge]));
    const overlay = svg.querySelector('#eg-tokens') || document.createElementNS(SVG_NS, 'g');
    overlay.id = 'eg-tokens';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.pointerEvents = 'none';
    if (!overlay.parentNode) svg.appendChild(overlay);
    if (stateText) {
      stateText.setAttribute('role', 'status');
      stateText.setAttribute('aria-live', 'polite');
      stateText.setAttribute('aria-atomic', 'true');
    }

    let marking = new Set();
    let tokenElements = new Map();
    let phaseIndex = -1;
    let phaseElapsed = 0;
    let phaseStarted = false;
    let movements = [];
    let playing = false;
    let visible = true;
    let hasEvidence = false;
    let state = 'ready';
    let frame = 0;
    let previousTime = 0;

    function pointInSVG(element, point) {
      const coordinate = svg.createSVGPoint();
      coordinate.x = point.x;
      coordinate.y = point.y;
      const local = element.getCTM();
      const root = svg.getCTM();
      return local && root ? coordinate.matrixTransform(root.inverse().multiply(local)) : coordinate;
    }

    function center(id) {
      const node = nodes.get(id);
      if (!node) return { x: 0, y: 0 };
      const circle = node.querySelector('circle');
      if (circle) return pointInSVG(circle, { x: circle.cx.baseVal.value, y: circle.cy.baseVal.value });
      const rect = node.querySelector('rect');
      if (rect) return pointInSVG(rect, {
        x: rect.x.baseVal.value + rect.width.baseVal.value / 2,
        y: rect.y.baseVal.value + rect.height.baseVal.value / 2
      });
      const bounds = node.getBBox();
      return pointInSVG(node, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    }

    function createToken(key, nodeId) {
      let circle = tokenElements.get(key);
      if (!circle) {
        circle = document.createElementNS(SVG_NS, 'circle');
        circle.classList.add('eg-token');
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#e8b374');
        circle.dataset.egToken = key;
        overlay.appendChild(circle);
        tokenElements.set(key, circle);
      }
      placeToken(circle, center(nodeId));
      circle.dataset.egAt = nodeId;
      return circle;
    }

    function placeToken(circle, point) {
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
    }

    function removeToken(key) {
      const circle = tokenElements.get(key);
      if (circle) circle.remove();
      tokenElements.delete(key);
    }

    function syncMarking() {
      container.dataset.egMarking = Array.from(marking).join(' ');
      nodes.forEach((node, id) => {
        node.classList.toggle('has-token', marking.has(id));
        node.dataset.egMarked = marking.has(id) ? 'true' : 'false';
      });
    }

    function setState(next) {
      state = next;
      container.dataset.egState = state;
      container.classList.toggle('is-demo-paused', !visible || state === 'paused');
      if (playButton) {
        playButton.disabled = state === 'waiting';
        playButton.setAttribute('aria-pressed', String(playing));
        labelButton(playButton, state === 'complete' ? '重播流程' : playing ? '暂停演示' : phaseIndex >= 0 ? '继续演示' : '播放流程');
      }
      if (evidenceButton) {
        evidenceButton.disabled = state !== 'waiting' || hasEvidence;
        labelButton(evidenceButton, hasEvidence ? '示例记录已补充' : '补充复检记录');
        evidenceButton.setAttribute('aria-describedby', 'eg-detail');
      }
      syncMarking();
    }

    function describe(title, detail, step, percent) {
      if (stateText && stateText.textContent !== title) stateText.textContent = title;
      if (detailText) detailText.textContent = detail;
      if (stepText) stepText.textContent = step;
      if (progress) {
        progress.style.width = `${percent}%`;
        progress.setAttribute('aria-valuenow', String(percent));
      }
    }

    function highlight(nodeIds, edgeKeys, blockedIds) {
      nodes.forEach((node) => node.classList.remove('is-active', 'is-blocked'));
      edges.forEach((edge) => edge.classList.remove('is-active', 'is-flowing'));
      nodeIds.forEach((id) => nodes.get(id)?.classList.add('is-active'));
      edgeKeys.forEach((key) => edges.get(key)?.classList.add('is-active', 'is-flowing'));
      (blockedIds || []).forEach((id) => nodes.get(id)?.classList.add('is-blocked'));
    }

    function passed(ids, edgeKeys) {
      ids.forEach((id) => nodes.get(id)?.classList.add('is-passed'));
      (edgeKeys || []).forEach((key) => edges.get(key)?.classList.add('is-passed'));
    }

    function move(key, from, to) {
      const circle = tokenElements.get(key) || createToken(key, from);
      const path = edges.get(`${from}>${to}`);
      marking.delete(from);
      circle.dataset.egAt = 'moving';
      circle.dataset.egFrom = from;
      circle.dataset.egTo = to;
      movements.push({ key, circle, from, to, path, length: path ? path.getTotalLength() : 0 });
      syncMarking();
    }

    function motionPosition(movement, amount) {
      const from = center(movement.from);
      const to = center(movement.to);
      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      if (!movement.path) return lerp(from, to, amount);
      // Travel through the actual SVG arc, with short bridges to node centers.
      const beginning = pointInSVG(movement.path, movement.path.getPointAtLength(0));
      const end = pointInSVG(movement.path, movement.path.getPointAtLength(movement.length));
      if (amount < 0.1) return lerp(from, beginning, amount / 0.1);
      if (amount > 0.9) return lerp(end, to, (amount - 0.9) / 0.1);
      return pointInSVG(movement.path, movement.path.getPointAtLength(movement.length * (amount - 0.1) / 0.8));
    }

    function settle(key, id) {
      const circle = tokenElements.get(key);
      if (circle) {
        placeToken(circle, center(id));
        circle.dataset.egAt = id;
        delete circle.dataset.egFrom;
        delete circle.dataset.egTo;
      }
      marking.add(id);
      syncMarking();
    }

    const phases = [
      {
        duration: 1100,
        start() {
          describe('核对设备与任务绑定', '同一教学任务关联 MD-01、J01 与当前任务版本。待对齐 token 保持原位。', '01 / 06', 10);
          highlight(['p_task', 'p_device', 't_bind'], ['p_task>t_bind', 'p_device>t_bind', 't_bind>p_align']);
        },
        end() { passed(['p_task', 'p_device', 't_bind'], ['p_task>t_bind', 'p_device>t_bind', 't_bind>p_align']); }
      },
      {
        duration: 950,
        start() {
          describe('预演对齐与安装', '将髋部组件对齐目标接口。这里展示操作步骤，不据此判定实机验收完成。', '02 / 06', 25);
          highlight(['p_align', 't_install_macro'], ['p_align>t_install_macro']);
          move('identity', 'p_align', 't_install_macro');
        },
        end() { passed(['p_align', 't_install_macro'], ['p_align>t_install_macro']); }
      },
      {
        duration: 1000,
        start() {
          describe('整理身份与复检依据', '教学示例已有身份记录，复检记录仍缺失；两路证据分别处理。', '03 / 06', 37);
          highlight(['t_install_macro', 'p_identity_pending'], ['t_install_macro>p_identity_pending'], ['p_recheck_pending', 't_recheck']);
          move('identity', 't_install_macro', 'p_identity_pending');
        },
        end() { settle('identity', 'p_identity_pending'); }
      },
      {
        duration: 950,
        start() {
          describe('核对身份记录', '检查示例记录的设备、目标关节与任务版本是否一致。', '03 / 06', 45);
          highlight(['p_identity_pending', 't_identity'], ['p_identity_pending>t_identity'], ['p_recheck_pending', 't_recheck']);
          move('identity', 'p_identity_pending', 't_identity');
        },
        end() { passed(['p_identity_pending', 't_identity'], ['p_identity_pending>t_identity']); }
      },
      {
        duration: 950,
        start() {
          highlight(['t_identity', 'p_identity_ok'], ['t_identity>p_identity_ok'], ['p_recheck_pending', 't_recheck', 't_join']);
          move('identity', 't_identity', 'p_identity_ok');
        },
        end() {
          settle('identity', 'p_identity_ok');
          passed(['p_identity_ok'], ['t_identity>p_identity_ok']);
          playing = false;
          highlight(['p_identity_ok'], [], ['p_recheck_pending', 't_recheck', 't_join']);
          describe('复检记录缺失，保持当前步骤', '身份记录已核对。条件汇合仍需复检依据；点击「补充复检记录」继续教学演示。', '04 / 06', 58);
          setState('waiting');
        }
      },
      {
        duration: 1100,
        start() {
          describe('核对补充的复检记录', '教学记录已补充。现在校验复检依据，身份通过 token 继续等待。', '05 / 06', 70);
          highlight(['p_recheck_pending', 't_recheck'], ['p_recheck_pending>t_recheck']);
          move('recheck', 'p_recheck_pending', 't_recheck');
        },
        end() { passed(['p_recheck_pending', 't_recheck'], ['p_recheck_pending>t_recheck']); }
      },
      {
        duration: 950,
        start() {
          highlight(['t_recheck', 'p_recheck_ok'], ['t_recheck>p_recheck_ok']);
          move('recheck', 't_recheck', 'p_recheck_ok');
        },
        end() {
          settle('recheck', 'p_recheck_ok');
          passed(['p_recheck_ok'], ['t_recheck>p_recheck_ok']);
        }
      },
      {
        duration: 1350,
        start() {
          // This AND join cannot fire with only the identity record.
          if (!hasEvidence || !marking.has('p_identity_ok') || !marking.has('p_recheck_ok')) return false;
          describe('两路记录共同满足汇合条件', '身份与复检 token 同时进入条件汇合，并核对同一设备、关节与任务版本。', '06 / 06', 88);
          container.dataset.egJoinFired = 'true';
          highlight(['p_identity_ok', 'p_recheck_ok', 't_join'], ['p_identity_ok>t_join', 'p_recheck_ok>t_join']);
          move('identity', 'p_identity_ok', 't_join');
          move('recheck', 'p_recheck_ok', 't_join');
        },
        end() {
          removeToken('identity');
          removeToken('recheck');
          passed(['t_join'], ['p_identity_ok>t_join', 'p_recheck_ok>t_join']);
          createToken('next', 't_join');
        }
      },
      {
        duration: 1000,
        start() {
          highlight(['t_join', 'p_next'], ['t_join>p_next']);
          move('next', 't_join', 'p_next');
        },
        end() {
          settle('next', 'p_next');
          passed(['p_next'], ['t_join>p_next']);
          playing = false;
          highlight(['p_next'], []);
          describe('示例条件齐备，可进入下一步', '演示说明双路证据如何决定状态推进。真实设备仍以实际工具与验收记录为准。', '06 / 06', 100);
          setState('complete');
        }
      }
    ];

    function advance(milliseconds) {
      if (!playing || phaseIndex < 0 || phaseIndex >= phases.length) return;
      const phase = phases[phaseIndex];
      if (!phaseStarted) {
        phaseStarted = true;
        movements = [];
        if (phase.start() === false) {
          playing = false;
          setState('waiting');
          return;
        }
      }
      phaseElapsed += milliseconds;
      const amount = reducedMotion.matches ? 1 : Math.min(phaseElapsed / phase.duration, 1);
      const eased = amount < 0.5 ? 2 * amount * amount : 1 - Math.pow(-2 * amount + 2, 2) / 2;
      movements.forEach((movement) => placeToken(movement.circle, motionPosition(movement, eased)));
      if (amount >= 1) {
        phase.end();
        phaseIndex += 1;
        phaseElapsed = 0;
        phaseStarted = false;
        movements = [];
      }
    }

    function pump(time) {
      frame = 0;
      if (!playing || !visible) { previousTime = 0; return; }
      if (reducedMotion.matches) {
        for (let count = 0; count < phases.length + 1 && playing; count += 1) advance(0);
      } else {
        const difference = previousTime ? Math.min(time - previousTime, 80) : 0;
        previousTime = time;
        advance(difference);
      }
      if (playing && visible) frame = window.requestAnimationFrame(pump);
    }

    function schedule() {
      if (playing && visible && !frame) frame = window.requestAnimationFrame(pump);
    }

    function reset() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      playing = false;
      hasEvidence = false;
      phaseIndex = -1;
      phaseElapsed = 0;
      phaseStarted = false;
      movements = [];
      marking = new Set(['p_align']);
      tokenElements.forEach((circle) => circle.remove());
      tokenElements = new Map();
      // The overlay owns every marking; do not leave a static success token behind.
      svg.querySelectorAll('[data-static-token], .eg-static-token').forEach((token) => token.remove());
      nodes.forEach((node) => node.classList.remove('is-active', 'is-passed', 'is-blocked'));
      edges.forEach((edge) => edge.classList.remove('is-active', 'is-passed', 'is-flowing'));
      container.dataset.egJoinFired = 'false';
      createToken('identity', 'p_align');
      highlight(['p_align'], []);
      describe('待对齐 · 安装尚在进行', 'Microduck 教学任务。播放流程，观察身份与复检记录如何共同决定下一步。', '01 / 06', 0);
      setState('ready');
    }

    if (playButton) playButton.addEventListener('click', () => {
      if (state === 'waiting') return;
      if (state === 'complete') reset();
      if (playing) {
        playing = false;
        previousTime = 0;
        setState('paused');
      } else {
        if (phaseIndex < 0) phaseIndex = 0;
        playing = true;
        setState('running');
        schedule();
      }
    });
    if (resetButton) resetButton.addEventListener('click', reset);
    if (evidenceButton) evidenceButton.addEventListener('click', () => {
      if (state !== 'waiting' || hasEvidence) return;
      hasEvidence = true;
      createToken('recheck', 'p_recheck_pending');
      marking.add('p_recheck_pending');
      phaseIndex = 5;
      phaseElapsed = 0;
      phaseStarted = false;
      playing = true;
      setState('running');
      schedule();
    });
    visibilityGate(container, (allowed) => {
      visible = allowed;
      container.classList.toggle('is-demo-paused', !allowed || state === 'paused');
      previousTime = 0;
      if (!allowed && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      schedule();
    });
    reducedMotion.addEventListener?.('change', schedule);
    reset();
  }

  function initAR() {
    const container = document.getElementById('ar-demo');
    if (!container || initialized.has(container)) return;
    initialized.add(container);
    const target = document.getElementById('ar-target');
    const scan = document.getElementById('ar-scan');
    const title = document.getElementById('ar-title');
    const description = document.getElementById('ar-description');
    const status = document.getElementById('ar-status');
    const count = document.getElementById('ar-step-count');
    const controls = Array.from(container.querySelectorAll('button[data-ar-step]'));
    const modal = document.getElementById('video-modal');
    const video = document.getElementById('ar-video');
    const openButton = document.getElementById('play-ar-video');
    const closeButton = document.getElementById('close-video');
    const stages = [
      { name: 'recognizing', title: '识别设备，定位当前部件', description: '将画面对准 Microduck。目标标记关联同一设备任务与 J01 安装接口。', status: '对象定位示意 · 安装进行中', targetClass: 'is-recognizing' },
      { name: 'aligning', title: '对齐髋部连接支架', description: '按当前步骤对齐支架并固定连接。画面始终展示操作过程，固定后还需复检。', status: '对齐与固定 · 安装进行中', targetClass: 'is-aligning' },
      { name: 'waiting', title: '等待身份与复检记录', description: '记录未齐备时保持当前步骤，请求补充检查依据。照片中的安装状态与工具结果分别核验。', status: '等待复检 · 保持当前步骤', targetClass: 'is-awaiting' }
    ];
    let stage = 0;
    let visible = true;
    let timer = 0;
    let due = 0;
    let remaining = 4000;
    let modalOpen = false;
    let returnFocus = null;

    if (target) {
      target.style.left = '52.811%';
      target.style.top = '56.0043%';
    }
    if (status) {
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'off');
    }
    function updateMotion() {
      const active = visible && !modalOpen && !reducedMotion.matches;
      container.classList.toggle('is-demo-paused', !active);
      scan?.classList.toggle('is-scanning', active && stage === 0);
    }
    function showStage(index, userInitiated) {
      stage = Math.max(0, Math.min(stages.length - 1, Number(index)));
      const data = stages[stage];
      container.dataset.arStage = String(stage);
      container.dataset.arState = data.name;
      const instructionLive = title?.closest('[aria-live]');
      if (instructionLive) instructionLive.setAttribute('aria-live', userInitiated ? 'polite' : 'off');
      if (title) title.textContent = data.title;
      if (description) description.textContent = data.description;
      if (status) {
        status.setAttribute('aria-live', userInitiated ? 'polite' : 'off');
        status.textContent = data.status;
      }
      if (count) count.textContent = `${String(stage + 1).padStart(2, '0')} / 03`;
      if (target) {
        target.classList.remove('is-recognizing', 'is-aligning', 'is-awaiting');
        target.classList.add(data.targetClass);
      }
      controls.forEach((button) => {
        const selected = Number(button.dataset.arStep) === stage;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      updateMotion();
    }
    function stopTimer() {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
      remaining = Math.max(0, due - performance.now());
    }
    function startTimer() {
      if (timer || !visible || modalOpen || reducedMotion.matches) return;
      due = performance.now() + remaining;
      timer = window.setTimeout(() => {
        timer = 0;
        showStage((stage + 1) % stages.length, false);
        remaining = 4000;
        startTimer();
      }, remaining);
    }
    controls.forEach((button) => button.addEventListener('click', () => {
      stopTimer();
      showStage(button.dataset.arStep, true);
      remaining = 4000;
      startTimer();
    }));

    function finishClose() {
      modalOpen = false;
      if (video) video.pause();
      container.dataset.videoOpen = 'false';
      updateMotion();
      startTimer();
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    }
    function closeVideo() {
      if (!modal) return;
      if (video) video.pause();
      if (typeof modal.close === 'function' && modal.open) modal.close();
      else { modal.removeAttribute('open'); finishClose(); }
    }
    if (openButton && modal && video) openButton.addEventListener('click', () => {
      returnFocus = document.activeElement;
      modalOpen = true;
      stopTimer();
      updateMotion();
      container.dataset.videoOpen = 'true';
      // A media request is allowed only after this explicit user action.
      if (!video.getAttribute('src') && video.dataset.src) {
        video.src = video.dataset.src;
        video.load();
      }
      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else modal.setAttribute('open', '');
      video.controls = true;
      const attempt = video.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    });
    if (closeButton) closeButton.addEventListener('click', closeVideo);
    if (modal) {
      modal.addEventListener('close', finishClose);
      modal.addEventListener('cancel', () => { if (video) video.pause(); });
      modal.addEventListener('click', (event) => { if (event.target === modal) closeVideo(); });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && video) video.pause();
    });
    visibilityGate(container, (allowed) => {
      visible = allowed;
      if (!allowed) stopTimer();
      updateMotion();
      startTimer();
    });
    reducedMotion.addEventListener?.('change', () => {
      stopTimer();
      updateMotion();
      startTimer();
    });
    showStage(0, false);
  }

  function init() {
    initEG();
    initAR();
  }

  window.PSOPDemos = Object.assign(window.PSOPDemos || {}, { init });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
