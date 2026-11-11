/* Static homepage enhancement. No workbench service or external network is needed. */
(() => {
  'use strict';
  const root = document.documentElement;
  const header = document.getElementById('site-header');
  const progress = document.getElementById('reading-progress');
  const menu = document.getElementById('mobile-nav');
  const menuButton = document.getElementById('menu-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    const distance = root.scrollHeight - innerHeight;
    progress.style.width = `${distance > 0 ? Math.max(0, Math.min(100, scrollY / distance * 100)) : 0}%`;
    header.classList.toggle('is-scrolled', scrollY > 20);
  }
  addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }, {passive:true});
  addEventListener('resize', updateScroll, {passive:true});
  updateScroll();

  const links = [...document.querySelectorAll('.desktop-nav a')];
  const sectionObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting)
      links.forEach(link => link.classList.toggle('is-active', link.hash === `#${entry.target.id}`));
  }, {rootMargin:'-15% 0px -65% 0px',threshold:0});
  links.forEach(link => {
    const target = document.getElementById(link.hash.slice(1));
    if (target) sectionObserver.observe(target);
  });

  function closeMenu(restore = false) {
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded','false');
    menuButton.setAttribute('aria-label','打开导航');
    if (restore) menuButton.focus();
  }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded',String(open));
    menuButton.setAttribute('aria-label',open?'关闭导航':'打开导航');
  });
  menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>closeMenu()));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden)closeMenu(true);
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden&&!header.contains(event.target))closeMenu();
  });
  matchMedia('(min-width: 641px)').addEventListener('change',event=>{if(event.matches)closeMenu();});

  const tabs = [...document.querySelectorAll('[data-workspace]')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  function selectWorkspace(tab, focus = false) {
    if(!tab)return;
    tabs.forEach(item=>{
      const selected=item===tab;
      item.classList.toggle('is-active',selected);
      item.setAttribute('aria-selected',String(selected));
      item.tabIndex=selected?0:-1;
    });
    panels.forEach(panel=>{panel.hidden=panel.dataset.panel!==tab.dataset.workspace;});
    if(focus)tab.focus();
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectWorkspace(tab));
    tab.addEventListener('keydown',event=>{
      const next={ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if(next===undefined)return;
      event.preventDefault();selectWorkspace(tabs[next],true);
    });
  });
  document.querySelectorAll('[data-select-workspace]').forEach(link=>link.addEventListener('click',()=>
    selectWorkspace(tabs.find(tab=>tab.dataset.workspace===link.dataset.selectWorkspace))));

  // Opening an old section link also opens the native details that now contains it.
  function revealHash() {
    let id;
    try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const target=document.getElementById(id);
    if(!target)return;
    let details=target.matches('details')?target:target.closest('details');
    let opened=false;
    while(details){details.open=true;opened=true;details=details.parentElement?.closest('details');}
    if(opened)requestAnimationFrame(()=>requestAnimationFrame(()=>target.scrollIntoView({behavior:'instant',block:'start'})));
  }
  addEventListener('hashchange',revealHash);
  revealHash();
  document.querySelectorAll('.research-case').forEach(details=>details.addEventListener('toggle',()=>{
    if(!details.open)details.querySelectorAll('video').forEach(video=>video.pause());
    updateScroll();
  }));

  const imageDialog=document.getElementById('image-modal');
  const preview=document.getElementById('image-preview');
  const viewport=imageDialog.querySelector('.image-viewport');
  const fitButton=document.getElementById('image-fit');
  const detailButton=document.getElementById('image-detail');
  let imageOpener=null;
  function setImageSize(detail){
    preview.style.width=detail?`${Math.max(preview.naturalWidth||1600,viewport.clientWidth)}px`:'100%';
    fitButton.classList.toggle('is-active',!detail);detailButton.classList.toggle('is-active',detail);
    fitButton.setAttribute('aria-pressed',String(!detail));detailButton.setAttribute('aria-pressed',String(detail));
  }
  document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{
    const source=button.querySelector('img');
    if(!source)return;
    imageOpener=button;preview.src=source.currentSrc||source.src;preview.alt=source.alt;
    document.getElementById('image-title').textContent=button.dataset.preview;
    imageDialog.showModal();setImageSize(true);
    preview.decode().then(()=>setImageSize(detailButton.getAttribute('aria-pressed')==='true')).catch(()=>{});
    viewport.scrollTo({left:0,top:0,behavior:'instant'});
  }));
  fitButton.addEventListener('click',()=>setImageSize(false));
  detailButton.addEventListener('click',()=>setImageSize(true));
  document.getElementById('close-image').addEventListener('click',()=>imageDialog.close());
  imageDialog.addEventListener('close',()=>imageOpener?.focus({preventScroll:true}));

  const sources=document.getElementById('sources-modal');
  const sourceButton=document.getElementById('open-sources');
  sourceButton.addEventListener('click',()=>sources.showModal());
  document.getElementById('close-sources').addEventListener('click',()=>sources.close());
  sources.addEventListener('close',()=>sourceButton.focus({preventScroll:true}));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  }));

  const video=document.getElementById('assembly-video');
  const playButton=document.getElementById('play-assembly-video');
  const mediaStatus=document.getElementById('assembly-media-status');
  playButton.addEventListener('click',()=>{
    mediaStatus.hidden=true;
    if(!video.getAttribute('src')){video.src=video.dataset.src;video.load();}
    playButton.hidden=true;
    video.play().catch(()=>{
      mediaStatus.textContent='使用视频控件继续播放；也可以直接打开本地录像。';mediaStatus.hidden=false;
    });
  });
  video.addEventListener('error',()=>{
    mediaStatus.replaceChildren();
    const link=document.createElement('a');link.href=video.dataset.src;link.textContent='直接打开装配录像';
    mediaStatus.append('当前浏览器未能播放嵌入录像，',link,'。');mediaStatus.hidden=false;playButton.hidden=false;
  });
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)video.pause();},{threshold:.05}).observe(video);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)document.querySelectorAll('video').forEach(item=>item.pause());
  });
  reduced.addEventListener('change',updateScroll);
})();
