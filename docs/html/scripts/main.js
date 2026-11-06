/* Buildless, local-first interactions. Product demos own their own state. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const root = document.documentElement;
  const header = document.querySelector('#site-header');
  const progress = document.querySelector('#reading-progress');
  const menu = document.querySelector('#mobile-nav');
  const menuButton = document.querySelector('#menu-toggle');

  // Progressive enhancement: all copy is visible if JavaScript is unavailable.
  if (!reduced.matches) root.classList.add('js-motion');
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      reveal.unobserve(entry.target);
      entry.target.querySelectorAll('[data-counter]').forEach(animateCounter);
    });
  }, { threshold: .08, rootMargin: '0px 0px -25px 0px' });
  document.querySelectorAll('.reveal').forEach(el => reveal.observe(el));

  function animateCounter(el) {
    if (reduced.matches || el.dataset.counted) return;
    el.dataset.counted = 'true';
    const total = Number(el.dataset.counter);
    const start = performance.now();
    el.setAttribute('aria-label', `${total}`);
    function tick(now) {
      const t = Math.min(1, (now - start) / 1400);
      el.textContent = Math.round(total * (1 - Math.pow(1 - t, 4)));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // A single frame combines progress and sticky-header updates.
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    const distance = root.scrollHeight - innerHeight;
    progress.style.width = `${distance > 0 ? Math.min(100, scrollY / distance * 100) : 0}%`;
    header.classList.toggle('is-scrolled', scrollY > 30);
  }
  addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, { passive: true });
  addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  const sectionLinks = [...document.querySelectorAll('.desktop-nav a')];
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach(link => link.classList.toggle('is-active', link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: '-18% 0px -64% 0px', threshold: 0 });
  sectionLinks.forEach(link => {
    const section = document.querySelector(link.hash);
    if (section) sectionObserver.observe(section);
  });

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', '打开导航');
    if (restoreFocus) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? '关闭导航' : '打开导航');
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) closeMenu(true);
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !header.contains(event.target)) closeMenu();
  });
  matchMedia('(min-width: 761px)').addEventListener('change', event => {
    if (event.matches) closeMenu();
  });

  // A proper tab interface: click, arrow keys, Home / End, and focus follow selection.
  const tabs = [...document.querySelectorAll('[data-workspace]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  function selectWorkspace(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== tab.dataset.workspace; });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectWorkspace(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectWorkspace(tabs[next], true);
    });
  });

  // Workbench imagery stays legible on a phone through a local detail viewer.
  const imageDialog = document.querySelector('#image-modal');
  const imagePreview = document.querySelector('#image-preview');
  const imageViewport = imageDialog.querySelector('.image-viewport');
  const fitButton = document.querySelector('#image-fit');
  const detailButton = document.querySelector('#image-detail');
  let imageOpener = null;
  function setImageSize(detail) {
    imagePreview.style.width = detail ? `${Math.max(imageViewport.clientWidth, 1320)}px` : '100%';
    fitButton.classList.toggle('is-active', !detail);
    detailButton.classList.toggle('is-active', detail);
    fitButton.setAttribute('aria-pressed', String(!detail));
    detailButton.setAttribute('aria-pressed', String(detail));
  }
  document.querySelectorAll('.workbench-window > img').forEach(image => {
    const button = document.createElement('button');
    button.className = 'workbench-zoom';
    button.setAttribute('aria-label', `放大查看 ${image.closest('[data-panel]').dataset.panel} 工作台界面`);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'image-modal');
    image.parentNode.insertBefore(button, image);
    button.append(image);
    const label = document.createElement('span');
    label.className = 'image-zoom-label';
    label.textContent = '查看界面 ↗';
    button.append(label);
    button.addEventListener('click', () => {
      imageOpener = button;
      imagePreview.src = image.src;
      imagePreview.alt = image.alt;
      document.querySelector('#image-title').textContent = `${image.closest('[data-panel]').dataset.panel} / 产品工作台`;
      imageDialog.showModal();
      setImageSize(true);
      imageViewport.scrollTo({left: Math.max(0, (imageViewport.scrollWidth - imageViewport.clientWidth) / 2), top: 0, behavior: 'instant'});
    });
  });
  fitButton.addEventListener('click', () => setImageSize(false));
  detailButton.addEventListener('click', () => setImageSize(true));
  document.querySelector('#close-image').addEventListener('click', () => imageDialog.close());
  imageDialog.addEventListener('close', () => imageOpener?.focus());

  const sourceDialog = document.querySelector('#sources-modal');
  const sourceButton = document.querySelector('#open-sources');
  sourceButton.addEventListener('click', () => sourceDialog.showModal());
  document.querySelector('#close-sources').addEventListener('click', () => sourceDialog.close());
  sourceDialog.addEventListener('close', () => sourceButton.focus());
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const b = dialog.getBoundingClientRect();
      if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close();
    });
  });

  // Subtle magnetic movement only where a mouse is available; no touch hijacking.
  document.querySelectorAll('.magnetic').forEach(button => {
    button.addEventListener('pointermove', event => {
      if (!finePointer.matches || reduced.matches) return;
      const b = button.getBoundingClientRect();
      const x = (event.clientX - b.left - b.width / 2) * .035;
      const y = (event.clientY - b.top - b.height / 2) * .07;
      button.style.transform = `translate(${x}px,${y}px)`;
    });
    button.addEventListener('pointerleave', () => { button.style.transform = ''; });
  });

  // Low-frequency light traces share the hero scene with the real 3D equipment.
  const canvas = document.querySelector('#ambient-canvas');
  const hero = document.querySelector('.hero');
  const ctx = canvas.getContext('2d', { alpha: true });
  let width = 0, height = 0, animation = 0, lastDraw = 0, visible = true;
  const sparks = Array.from({ length: 17 }, (_, index) => ({
    phase: index * .381,
    speed: .035 + (index % 4) * .012,
    radius: .17 + (index % 6) * .031,
    lift: ((index * 37) % 100) / 100,
    size: index % 4 === 0 ? 1.4 : .75
  }));
  function resizeCanvas() {
    width = hero.clientWidth;
    height = hero.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function draw(now) {
    animation = 0;
    if (!ctx || !visible || document.hidden || reduced.matches) return;
    if (now - lastDraw > 50) {
      lastDraw = now;
      ctx.clearRect(0, 0, width, height);
      const seconds = now * .001;
      sparks.forEach((spark, index) => {
        const a = seconds * spark.speed + spark.phase;
        const x = width * .76 + Math.cos(a) * width * spark.radius;
        const y = height * (.25 + spark.lift * .57) + Math.sin(a * 1.7) * 20;
        const opacity = .18 + Math.sin(a * 2 + index) * .14;
        ctx.fillStyle = `rgba(${index % 3 ? '171,210,166' : '255,166,105'},${opacity})`;
        ctx.beginPath();
        ctx.arc(x, y, spark.size, 0, Math.PI * 2);
        ctx.fill();
        if (index % 4 === 0) {
          ctx.strokeStyle = `rgba(170,214,165,${opacity * .24})`;
          ctx.lineWidth = .5;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 37, y - 17); ctx.stroke();
        }
      });
    }
    animation = requestAnimationFrame(draw);
  }
  function syncAmbient() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    if (!ctx || !visible || document.hidden || reduced.matches) return;
    animation = requestAnimationFrame(draw);
  }
  new ResizeObserver(resizeCanvas).observe(hero);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    syncAmbient();
  }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', syncAmbient);
  reduced.addEventListener('change', () => {
    root.classList.toggle('js-motion', !reduced.matches);
    if (reduced.matches) document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-revealed'));
    syncAmbient();
  });
  resizeCanvas();
  syncAmbient();
})();
