import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {placePopover,type PopoverPlacement} from './simulate-popover';

export default function SimulationPopover({children}:{children:ReactNode}){
  const card=useRef<HTMLDivElement>(null),[placement,setPlacement]=useState<PopoverPlacement>();
  useLayoutEffect(()=>{
    const viewport=card.current!.parentElement!;
    const update=()=>{
      const rect=viewport.getBoundingClientRect(),visual=window.visualViewport,visibleTop=visual?.offsetTop??0,visibleBottom=visibleTop+(visual?.height??innerHeight);
      const next=placePopover({width:viewport.clientWidth,height:viewport.clientHeight,topInset:Math.max(0,visibleTop-rect.top),bottomInset:Math.max(0,rect.bottom-visibleBottom)},{width:360});
      setPlacement(old=>old&&old.left===next.left&&old.bottom===next.bottom&&old.maxHeight===next.maxHeight&&old.width===next.width?old:next);
    };
    update();const observer=new ResizeObserver(update);observer.observe(viewport);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
    return()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
  },[]);
  return <div ref={card} className="simulation-connection-card" role="region" aria-label="选择连接方式" data-positioned={!!placement} style={placement?{left:placement.left,bottom:placement.bottom,width:placement.width,maxHeight:placement.maxHeight}:undefined}>{children}</div>;
}
